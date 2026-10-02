import { File } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { docsDir, ensureDirs, writeFile } from './fs';
import type { SignatureData } from './pdf';

const storeFile = new File(docsDir, 'signatures.json');
const listeners = new Set<() => void>();
let signatures: SignatureData[] | null = null;

function load() {
  if (signatures) return signatures;
  ensureDirs();
  try {
    signatures = storeFile.exists ? JSON.parse(storeFile.textSync()) : [];
  } catch {
    signatures = [];
  }
  return signatures as SignatureData[];
}

function commit(next: SignatureData[]) {
  signatures = next;
  writeFile(storeFile, JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSignatures() {
  return useSyncExternalStore(subscribe, load, load);
}

export function addSignature(sig: SignatureData) {
  commit([sig, ...load()].slice(0, 6));
}

export function removeSignature(id: string) {
  commit(load().filter((s) => s.id !== id));
}

export type Point = { x: number; y: number };

const r = (n: number) => Math.round(n * 10) / 10;

/** Smooths raw touch points with quadratic curves through segment midpoints. */
function strokeToPath(pts: Point[]) {
  const [first] = pts;
  if (pts.length === 1) return `M${r(first.x)} ${r(first.y)} L${r(first.x + 0.2)} ${r(first.y + 0.2)}`;
  let d = `M${r(first.x)} ${r(first.y)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    d += ` Q${r(a.x)} ${r(a.y)} ${r((a.x + b.x) / 2)} ${r((a.y + b.y) / 2)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${r(last.x)} ${r(last.y)}`;
}

export function strokesToPath(strokes: Point[][]) {
  return strokes.map(strokeToPath).join(' ');
}

/** Trims strokes to their bounding box so the signature can be placed and scaled freely. */
export function buildSignature(strokes: Point[][], strokeWidth: number): SignatureData | null {
  const pts = strokes.flat();
  if (pts.length < 2) return null;
  const pad = strokeWidth;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  const shifted = strokes.map((s) => s.map((p) => ({ x: p.x - minX, y: p.y - minY })));
  return {
    id: Date.now().toString(36),
    d: strokesToPath(shifted),
    w: r(maxX - minX),
    h: r(maxY - minY),
    strokeWidth,
  };
}
