import { BlendMode, LineCapStyle, StandardFonts, degrees, type PDFFont } from 'pdf-lib';

import { hexToRgb, loadPdf, newDoc } from './pdf';
import { strokesToPath, type Point } from './signatures';

/** Positions are fractions (0..1) of the page's unrotated crop box, origin top-left. */
export type TextAnn = { id: string; type: 'text'; nx: number; ny: number; text: string; size: number; color: string; bold: boolean };
export type RectAnn = { id: string; type: 'highlight' | 'whiteout'; nx: number; ny: number; nw: number; nh: number; color: string };
export type InkAnn = { id: string; type: 'ink'; points: Point[]; color: string; width: number };

export type FontFamily = 'sans' | 'serif' | 'mono';

/** A line of existing text found on the page (see pdf-renderer's textBlocks). */
export type TextBlock = {
  id: string;
  text: string;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  /** Baseline, as a fraction of page height from the top. */
  nbase: number;
  /** Font size in PDF points. */
  size: number;
  family: FontFamily;
  bold: boolean;
  italic: boolean;
  color: string;
  /** Background color sampled around the line. */
  bg: string;
};

/** Replaces an existing line: covers it with its background color and draws new text in place. */
export type ReplaceAnn = Omit<TextBlock, 'id'> & { id: string; type: 'replace'; block: string; original: string };

export type Ann = TextAnn | RectAnn | InkAnn | ReplaceAnn;

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
  if (a.type === 'replace') {
    return { x: a.nx, y: a.ny, w: Math.max(a.nw, (a.text.length * a.size * CHAR_W) / box.w), h: a.nh };
  }
  return { x: a.nx, y: a.ny, w: a.nw, h: a.nh };
}

export function moveAnn(a: Ann, dx: number, dy: number): Ann {
  if (a.type === 'ink') return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  // Replacements stay anchored over the text they cover.
  if (a.type === 'replace') return a;
  return { ...a, nx: a.nx + dx, ny: a.ny + dy };
}

const STANDARD: Record<FontFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  // regular, bold, italic, bold-italic
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

const encodingError = (text: string) =>
  new Error(`"${text.slice(0, 24)}" contains characters the PDF font can't encode. Use Latin letters, digits and common symbols.`);

export async function applyEdits(uri: string, pages: EditPage[]) {
  const src = await loadPdf(uri);
  const out = await newDoc();
  const fonts = new Map<StandardFonts, PDFFont>();
  const font = async (family: FontFamily, bold: boolean, italic = false) => {
    const name = STANDARD[family][(bold ? 1 : 0) + (italic ? 2 : 0)];
    if (!fonts.has(name)) fonts.set(name, await out.embedFont(name));
    return fonts.get(name)!;
  };

  for (const p of pages) {
    // Copy pages one at a time so duplicates become independent page objects.
    const page = p.src === null ? out.addPage([p.box.w, p.box.h]) : out.addPage((await out.copyPages(src, [p.src]))[0]);
    page.setRotation(degrees((p.base + p.rotate) % 360));

    const cb = page.getCropBox();
    const X = (nx: number) => cb.x + nx * cb.width;
    const Y = (ny: number) => cb.y + cb.height * (1 - ny);

    // Replacements first, so other annotations can sit on top of them.
    const ordered = [...p.anns.filter((a) => a.type === 'replace'), ...p.anns.filter((a) => a.type !== 'replace')];

    for (const a of ordered) {
      if (a.type === 'replace') {
        const pad = a.size * 0.08;
        page.drawRectangle({
          x: X(a.nx) - pad,
          y: Y(a.ny + a.nh) - pad,
          width: a.nw * cb.width + pad * 2,
          height: a.nh * cb.height + pad * 2,
          color: hexToRgb(a.bg),
        });
        if (a.text) {
          try {
            page.drawText(a.text, { x: X(a.nx), y: Y(a.nbase), size: a.size, font: await font(a.family, a.bold, a.italic), color: hexToRgb(a.color) });
          } catch {
            throw encodingError(a.text);
          }
        }
      } else if (a.type === 'whiteout' || a.type === 'highlight') {
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
        const f = await font('sans', a.bold);
        try {
          a.text.split('\n').forEach((line, i) =>
            page.drawText(line, {
              x: X(a.nx),
              y: Y(a.ny) - a.size * 0.9 - i * a.size * LINE,
              size: a.size,
              font: f,
              color: hexToRgb(a.color),
            }),
          );
        } catch {
          throw encodingError(a.text);
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
