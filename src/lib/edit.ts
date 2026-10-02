import { BlendMode, LineCapStyle, StandardFonts, degrees, type PDFFont } from 'pdf-lib';
import { hexToRgb, loadPdf, newDoc } from './pdf';
import { strokesToPath, type Point } from './signatures';
/** Positions are fractions (0..1) of the page's unrotated crop box, origin top-left. */
export type TextAnn = { id: string; type: 'text'; nx: number; ny: number; text: string; size: number; color: string; bold: boolean };
export type RectAnn = { id: string; type: 'highlight' | 'whiteout'; nx: number; ny: number; nw: number; nh: number; color: string };
export type InkAnn = { id: string; type: 'ink'; points: Point[]; color: string; width: number };
export type Ann = TextAnn | RectAnn | InkAnn;

export type EditPage = {
  key: string;
  /** Index in the source PDF, or null for an inserted blank page. */
  src: number | null;
  /** Rotation already present in the source PDF. */
  base: number;
  /** Extra rotation applied in the editor. */
  rotate: number;
  /** Unrotated crop box size in points. */
  box: { w: number; h: number };
  anns: Ann[];
};
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const LINE = 1.2;
const CHAR_W = 0.56;
export function annBounds(a: Ann, box: { w: number; h: number }) {
  if (a.type === 'text') {
    const lines = a.text.split('\n');
    const longest = Math.max(...lines.map((l) => l.length), 1);
    return { x: a.nx, y: a.ny, w: (longest * a.size * CHAR_W) / box.w, h: (lines.length * a.size * LINE) / box.h };
  }
  if (a.type === 'ink') {
    const xs = a.points.map((p) => p.x);
    const ys = a.points.map((p) => p.y);
    const pad = a.width / box.w + 0.01;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
  }
  return { x: a.nx, y: a.ny, w: a.nw, h: a.nh };
}
export function moveAnn(a: Ann, dx: number, dy: number): Ann {
  if (a.type === 'ink') return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  return { ...a, nx: a.nx + dx, ny: a.ny + dy };
}
export async function applyEdits(uri: string, pages: EditPage[]) {
  const src = await loadPdf(uri);
  const out = await newDoc();
  const fonts: Partial<Record<'regular' | 'bold', PDFFont>> = {};
  const font = async (bold: boolean) => {
    const k = bold ? 'bold' : 'regular';
    fonts[k] ??= await out.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
    return fonts[k]!;
  };

  for (const p of pages) {
    // Copy pages one at a time so duplicates become independent page objects.
    const page = p.src === null ? out.addPage([p.box.w, p.box.h]) : out.addPage((await out.copyPages(src, [p.src]))[0]);
    page.setRotation(degrees((p.base + p.rotate) % 360));
    const cb = page.getCropBox();
    const X = (nx: number) => cb.x + nx * cb.width;
    const Y = (ny: number) => cb.y + cb.height * (1 - ny);

    for (const a of p.anns) {
      if (a.type === 'whiteout' || a.type === 'highlight') {
        page.drawRectangle({
          x: X(a.nx),
          y: Y(a.ny + a.nh),
          width: a.nw * cb.width,
          height: a.nh * cb.height,
          color: hexToRgb(a.type === 'whiteout' ? '#FFFFFF' : a.color),
          opacity: a.type === 'highlight' ? 0.45 : 1,
          blendMode: a.type === 'highlight' ? BlendMode.Multiply : undefined,
        });
      } else if (a.type === 'ink') {
        const d = strokesToPath([a.points.map((pt) => ({ x: pt.x * cb.width, y: pt.y * cb.height }))]);
        page.drawSvgPath(d, {
          x: cb.x,
          y: cb.y + cb.height,
          borderColor: hexToRgb(a.color),
          borderWidth: a.width,
          borderLineCap: LineCapStyle.Round,
        });
      } else if (a.type === 'text') {
        const f = await font(a.bold);
        const lines = a.text.split('\n');
        try {
          lines.forEach((line, i) =>
            page.drawText(line, {
              x: X(a.nx),
              y: Y(a.ny) - a.size * 0.9 - i * a.size * LINE,
              size: a.size,
              font: f,
              color: hexToRgb(a.color),
            }),
          );
        } catch {
          throw new Error(`"${a.text.slice(0, 24)}" contains characters the PDF font can't encode. Use Latin letters, digits and common symbols.`);
        }
      }
    }
  }

  return { bytes: await out.save({ useObjectStreams: true }), pages: pages.length };
}
/** Builds the editor model from a PDF on disk. */
export async function readPages(uri: string): Promise<EditPage[]> {
  const doc = await loadPdf(uri);
  return doc.getPages().map((page, i) => {
    const cb = page.getCropBox();
    return { key: `p${i}-${uid()}`, src: i, base: page.getRotation().angle % 360, rotate: 0, box: { w: cb.width, h: cb.height }, anns: [] };
  });
}
