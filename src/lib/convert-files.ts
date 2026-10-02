import * as Print from 'expo-print';

import { WIDE_KINDS, fileToHtml, type Format } from './converters';
import { stampName, tempFile, writeFile } from './fs';
import { saveDoc, type DocEntry } from './library';
import { PAGE_SIZES, imagesToPdf, mergeFiles } from './pdf';

export type ConvertItem = { key: string; uri: string; name: string; size: number; format: Format };
export type Paper = keyof typeof PAGE_SIZES;
export type Orientation = 'auto' | 'portrait' | 'landscape';
export type ConvertOptions = { paper: Paper; orientation: Orientation; combine: boolean };

const baseName = (name: string) => name.replace(/\.[^.]+$/, '');

/** Converts one file into a temporary PDF. */
async function convertOne(item: ConvertItem, opts: ConvertOptions) {
  const out = tempFile('pdf');
  if (item.format.kind === 'image') {
    const res = await imagesToPdf([{ uri: item.uri }], { pageSize: opts.paper, margin: 24, quality: 0.82, maxDim: 2200 });
    writeFile(out, res.bytes);
    return { uri: out.uri, pages: res.pages, thumb: res.cover };
  }
  const html = await fileToHtml(item.uri, item.name, item.format.kind);
  const [w, h] = PAGE_SIZES[opts.paper];
  const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && WIDE_KINDS.includes(item.format.kind));
  // base64: expo-print may write outside the app sandbox (Expo Go on Android).
  const res = await Print.printToFileAsync({ html, width: landscape ? h : w, height: landscape ? w : h, base64: true });
  if (!res.base64) throw new Error('The PDF could not be generated.');
  if (!out.exists) out.create();
  out.write(res.base64, { encoding: 'base64' });
  return { uri: out.uri, pages: res.numberOfPages, thumb: undefined as string | undefined };
}

export async function convertFiles(
  items: ConvertItem[],
  opts: ConvertOptions,
  report: (done: number, total: number) => void,
): Promise<{ docs: DocEntry[]; failures: { name: string; message: string }[] }> {
  const converted: { item: ConvertItem; uri: string; pages: number; thumb?: string }[] = [];
  const failures: { name: string; message: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      converted.push({ item: items[i], ...(await convertOne(items[i], opts)) });
    } catch (e) {
      failures.push({ name: items[i].name, message: e instanceof Error ? e.message : String(e) });
    }
    report(i + 1, items.length + (opts.combine ? 1 : 0));
  }

  if (!converted.length) return { docs: [], failures };

  if (opts.combine && converted.length > 1) {
    const merged = await mergeFiles(converted.map((c) => ({ uri: c.uri, kind: 'pdf' as const })));
    report(items.length + 1, items.length + 1);
    const doc = await saveDoc({
      name: stampName('Converted'),
      source: 'convert',
      pages: merged.pages,
      bytes: merged.bytes,
      thumbFrom: converted[0].thumb,
    });
    return { docs: [doc], failures };
  }

  const docs: DocEntry[] = [];
  for (const c of converted) {
    docs.push(await saveDoc({ name: baseName(c.item.name), source: 'convert', pages: c.pages, fromUri: c.uri, thumbFrom: c.thumb }));
  }
  return { docs, failures };
}
