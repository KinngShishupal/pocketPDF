import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { cleanName, docsDir, ensureDirs, thumbsDir, writeFile } from './fs';
import type { DocSource } from './tools';

export type DocEntry = {
  id: string;
  name: string;
  /** File name inside docsDir. Absolute URIs are derived at runtime because app container paths can change. */
  file: string;
  size: number;
  pages: number;
  createdAt: number;
  source: DocSource;
  thumb?: string;
};

const indexFile = new File(docsDir, 'index.json');
const listeners = new Set<() => void>();
let docs: DocEntry[] | null = null;

function load(): DocEntry[] {
  if (docs) return docs;
  ensureDirs();
  try {
    const parsed: DocEntry[] = indexFile.exists ? JSON.parse(indexFile.textSync()) : [];
    docs = parsed.filter((d) => new File(docsDir, d.file).exists);
  } catch {
    docs = [];
  }
  return docs;
}

function commit(next: DocEntry[]) {
  docs = next;
  writeFile(indexFile, JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDocs() {
  return useSyncExternalStore(subscribe, load, load);
}

export function getDoc(id: string | undefined) {
  return id ? load().find((d) => d.id === id) : undefined;
}

export function docUri(doc: DocEntry) {
  return new File(docsDir, doc.file).uri;
}

export function thumbUri(doc: DocEntry) {
  return doc.thumb ? new File(thumbsDir, doc.thumb).uri : undefined;
}

function uniqueFileName(base: string, ignore?: string) {
  let candidate = `${base}.pdf`;
  let i = 2;
  while (candidate !== ignore && new File(docsDir, candidate).exists) {
    candidate = `${base} (${i++}).pdf`;
  }
  return candidate;
}

async function makeThumb(fromUri: string, id: string) {
  try {
    const ref = await ImageManipulator.manipulate(fromUri).resize({ width: 280 }).renderAsync();
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    const name = `${id}.jpg`;
    new File(saved.uri).copySync(new File(thumbsDir, name));
    return name;
  } catch {
    return undefined;
  }
}

export async function saveDoc(opts: {
  name: string;
  source: DocSource;
  pages: number;
  bytes?: Uint8Array;
  base64?: string;
  fromUri?: string;
  thumbFrom?: string;
}): Promise<DocEntry> {
  ensureDirs();
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const fileName = uniqueFileName(cleanName(opts.name) || 'Document');
  const target = new File(docsDir, fileName);

  if (opts.bytes) writeFile(target, opts.bytes);
  else if (opts.base64) {
    if (!target.exists) target.create();
    target.write(opts.base64, { encoding: 'base64' });
  }
  else if (opts.fromUri) new File(opts.fromUri).copySync(target);
  else throw new Error('Nothing to save');

  const entry: DocEntry = {
    id,
    name: fileName.replace(/\.pdf$/, ''),
    file: fileName,
    size: new File(docsDir, fileName).size,
    pages: opts.pages,
    createdAt: Date.now(),
    source: opts.source,
    thumb: opts.thumbFrom ? await makeThumb(opts.thumbFrom, id) : undefined,
  };
  commit([entry, ...load()]);
  return entry;
}

export function renameDoc(id: string, name: string) {
  const doc = getDoc(id);
  const base = cleanName(name);
  if (!doc || !base) return;
  const fileName = uniqueFileName(base, doc.file);
  if (fileName !== doc.file) new File(docsDir, doc.file).rename(fileName);
  commit(load().map((d) => (d.id === id ? { ...d, file: fileName, name: fileName.replace(/\.pdf$/, '') } : d)));
}

export function deleteDoc(id: string) {
  const doc = getDoc(id);
  if (!doc) return;
  try {
    new File(docsDir, doc.file).delete();
    if (doc.thumb) new File(thumbsDir, doc.thumb).delete();
  } catch {
    // File already gone; still drop the entry.
  }
  commit(load().filter((d) => d.id !== id));
}
