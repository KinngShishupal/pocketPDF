import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  LineCapStyle,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  StandardFonts,
  rgb,
} from 'pdf-lib';

import { readBytes, tempFile, writeFile } from './fs';

export type Progress = (done: number, total: number) => void;

/** Yields to the UI thread so progress updates can paint between heavy steps. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;

export type PageSize = 'fit' | keyof typeof PAGE_SIZES;

export function newDoc() {
  return PDFDocument.create().then((doc) => {
    doc.setCreator('1TapPDF');
    doc.setProducer('1TapPDF');
    return doc;
  });
}

export async function loadPdf(uri: string) {
  const bytes = await readBytes(uri);
  try {
    return await PDFDocument.load(bytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/encrypt/i.test(msg)) {
      throw new Error('This PDF is password-protected. Unlock it first, then try again.');
    }
    throw new Error("This file couldn't be read as a PDF.");
  }
}

export async function getPdfInfo(uri: string) {
  const doc = await loadPdf(uri);
  return { pages: doc.getPageCount(), sizes: doc.getPages().map((p) => p.getCropBox()) };
}

/** Normalizes any picked image (HEIC, PNG, huge camera shots…) into a sized JPEG. */
export async function toJpeg(
  uri: string,
  { maxDim, quality, rotate = 0 }: { maxDim: number; quality: number; rotate?: number },
) {
  let ref = await ImageManipulator.manipulate(uri).rotate(rotate).renderAsync();
  if (Math.max(ref.width, ref.height) > maxDim) {
    const landscape = ref.width >= ref.height;
    ref = await ImageManipulator.manipulate(uri)
      .rotate(rotate)
      .resize(landscape ? { width: maxDim } : { height: maxDim })
      .renderAsync();
  }
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality });
  return { uri: out.uri, width: out.width, height: out.height, bytes: await readBytes(out.uri) };
}

export type ImageInput = { uri: string; rotate?: number };

export async function imagesToPdf(
  images: ImageInput[],
  opts: { pageSize: PageSize; margin: number; quality: number; maxDim: number },
  onProgress?: Progress,
) {
  const doc = await newDoc();
  let cover: string | undefined;

  for (let i = 0; i < images.length; i++) {
    const jpg = await toJpeg(images[i].uri, { ...opts, rotate: images[i].rotate });
    cover ??= jpg.uri;
    addImagePage(doc, await doc.embedJpg(jpg.bytes), jpg.width, jpg.height, opts.pageSize, opts.margin);
    onProgress?.(i + 1, images.length);
    await tick();
  }

  return { bytes: await doc.save(), pages: images.length, cover };
}

function addImagePage(
  doc: PDFDocument,
  img: Awaited<ReturnType<PDFDocument['embedJpg']>>,
  w: number,
  h: number,
  pageSize: PageSize,
  margin: number,
) {
  let pw: number;
  let ph: number;
  if (pageSize === 'fit') {
    pw = PAGE_SIZES.a4[0];
    ph = (pw - margin * 2) * (h / w) + margin * 2;
  } else {
    const [a, b] = PAGE_SIZES[pageSize];
    [pw, ph] = w > h ? [b, a] : [a, b];
  }
  const page = doc.addPage([pw, ph]);
  const scale = Math.min((pw - margin * 2) / w, (ph - margin * 2) / h);
  const dw = w * scale;
  const dh = h * scale;
  page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
}

export type MergeInput = { uri: string; kind: 'pdf' | 'image' };

export async function mergeFiles(items: MergeInput[], onProgress?: Progress) {
  const out = await newDoc();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'pdf') {
      const src = await loadPdf(item.uri);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    } else {
      const jpg = await toJpeg(item.uri, { maxDim: 2000, quality: 0.85 });
      addImagePage(out, await out.embedJpg(jpg.bytes), jpg.width, jpg.height, 'a4', 24);
    }
    onProgress?.(i + 1, items.length);
    await tick();
  }
  return { bytes: await out.save({ useObjectStreams: true }), pages: out.getPageCount() };
}

export const COMPRESS_LEVELS = {
  light: { label: 'Light', detail: 'Best quality, gentle savings', maxDim: 2200, quality: 0.72 },
  balanced: { label: 'Balanced', detail: 'Recommended for sharing', maxDim: 1600, quality: 0.55 },
  strong: { label: 'Extreme', detail: 'Smallest file, lower quality', maxDim: 1100, quality: 0.38 },
} as const;

export type CompressLevel = keyof typeof COMPRESS_LEVELS;

const N = (name: string) => PDFName.of(name);

function isJpegImage(dict: PDFDict) {
  if (dict.get(N('Subtype')) !== N('Image')) return false;
  if (dict.get(N('ImageMask')) || dict.get(N('Mask'))) return false;
  if (dict.get(N('ColorSpace')) === N('DeviceCMYK')) return false;
  const filter = dict.get(N('Filter'));
  if (filter === N('DCTDecode')) return true;
  return filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === N('DCTDecode');
}

function numberOf(dict: PDFDict, key: string) {
  const v = dict.get(N(key));
  return v instanceof PDFNumber ? v.asNumber() : 0;
}

/**
 * Re-encodes the JPEG images embedded in a PDF (where scanned/photo PDFs carry
 * nearly all of their weight) and re-saves with compact object streams.
 */
export async function compressPdf(uri: string, level: CompressLevel, onProgress?: Progress) {
  const { maxDim, quality } = COMPRESS_LEVELS[level];
  const doc = await loadPdf(uri);
  const images = doc.context
    .enumerateIndirectObjects()
    .filter(
      (entry): entry is [(typeof entry)[0], PDFRawStream] =>
        entry[1] instanceof PDFRawStream && isJpegImage(entry[1].dict),
    );

  let optimized = 0;
  for (let i = 0; i < images.length; i++) {
    const [ref, stream] = images[i];
    try {
      const src = tempFile('jpg');
      writeFile(src, stream.contents);
      const w = numberOf(stream.dict, 'Width');
      const h = numberOf(stream.dict, 'Height');
      let ctx = ImageManipulator.manipulate(src.uri);
      if (Math.max(w, h) > maxDim) ctx = ctx.resize(w >= h ? { width: maxDim } : { height: maxDim });
      const saved = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: quality });
      const bytes = await new File(saved.uri).bytes();

      if (bytes.length < stream.contents.length * 0.95) {
        const dict = stream.dict;
        dict.set(N('Width'), PDFNumber.of(saved.width));
        dict.set(N('Height'), PDFNumber.of(saved.height));
        dict.set(N('ColorSpace'), N('DeviceRGB'));
        dict.set(N('BitsPerComponent'), PDFNumber.of(8));
        dict.set(N('Filter'), N('DCTDecode'));
        dict.delete(N('Decode'));
        dict.delete(N('DecodeParms'));
        doc.context.assign(ref, PDFRawStream.of(dict, bytes));
        optimized++;
      }
    } catch {
      // Unusual encodings (CMYK, broken streams) are left untouched.
    }
    onProgress?.(i + 1, images.length);
    await tick();
  }

  doc.setProducer('1TapPDF');
  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, pages: doc.getPageCount(), optimized, totalImages: images.length };
}

export async function extractPages(src: PDFDocument, indices: number[]) {
  const out = await newDoc();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return { bytes: await out.save({ useObjectStreams: true }), pages: indices.length };
}

export type SignatureData = { id: string; d: string; w: number; h: number; strokeWidth: number };

export type Placement = {
  pageIndex: number;
  allPages: boolean;
  /** Top-left of the signature box as a fraction of the page. */
  nx: number;
  ny: number;
  /** Signature width as a fraction of the page width. */
  wf: number;
  color: string;
  addDate: boolean;
};

export function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function signPdf(uri: string, sig: SignatureData, p: Placement) {
  const doc = await loadPdf(uri);
  const color = hexToRgb(p.color);
  const font = p.addDate ? await doc.embedFont(StandardFonts.Helvetica) : undefined;
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const pages = p.allPages ? doc.getPages() : [doc.getPage(p.pageIndex)];

  for (const page of pages) {
    const { x: bx, y: by, width, height } = page.getCropBox();
    const scale = (p.wf * width) / sig.w;
    const x = bx + p.nx * width;
    const top = by + height - p.ny * height;
    page.drawSvgPath(sig.d, {
      x,
      y: top,
      scale,
      borderColor: color,
      borderWidth: sig.strokeWidth,
      borderLineCap: LineCapStyle.Round,
    });
    if (font) {
      const size = Math.max(7, Math.min(12, p.wf * width * 0.07));
      page.drawText(`Signed ${date}`, { x, y: top - sig.h * scale - size - 2, size, font, color });
    }
  }
  return { bytes: await doc.save(), pages: doc.getPageCount() };
}
