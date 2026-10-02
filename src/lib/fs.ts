import { Directory, File, Paths } from 'expo-file-system';

export const docsDir = new Directory(Paths.document, 'docs');
export const thumbsDir = new Directory(docsDir, 'thumbs');
export const workDir = new Directory(Paths.cache, 'work');

export function ensureDirs() {
  for (const dir of [docsDir, thumbsDir, workDir]) {
    if (!dir.exists) dir.create({ intermediates: true });
  }
}

export function writeFile(file: File, data: string | Uint8Array) {
  if (!file.exists) file.create();
  file.write(data);
}

export function readBytes(uri: string) {
  return new File(uri).bytes();
}

export function tempFile(ext: string) {
  ensureDirs();
  return new File(workDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
}

/** Clears intermediate files left over from previous operations. */
export function clearWork() {
  try {
    if (workDir.exists) workDir.delete();
  } catch {
    // Best effort; stale temp files are harmless.
  }
  ensureDirs();
}

export function cleanName(name: string) {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatDate(ms: number) {
  const d = new Date(ms);
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000 && d.getDate() === new Date().getDate()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function stampName(prefix: string) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}
