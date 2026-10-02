import * as CFB from 'cfb';
import { File } from 'expo-file-system';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

import { readBytes } from './fs';
import type { IconName } from './tools';

export type SourceKind = 'docx' | 'doc' | 'odt' | 'rtf' | 'sheet' | 'csv' | 'pptx' | 'md' | 'html' | 'text' | 'code' | 'image';

export type Format = { kind: SourceKind; label: string; exts: string[]; icon: IconName; color: string; note?: string };

export const FORMATS: Format[] = [
  { kind: 'docx', label: 'Word', exts: ['docx', 'docm', 'dotx'], icon: 'document-text', color: '#2B7CD3' },
  { kind: 'doc', label: 'Word 97–2003', exts: ['doc'], icon: 'document-text-outline', color: '#4A90E2', note: 'Text only' },
  { kind: 'sheet', label: 'Excel', exts: ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'numbers'], icon: 'grid', color: '#21A366' },
  { kind: 'csv', label: 'CSV', exts: ['csv', 'tsv'], icon: 'list', color: '#34C38F' },
  { kind: 'pptx', label: 'PowerPoint', exts: ['pptx'], icon: 'easel', color: '#D35230', note: 'Text & pictures' },
  { kind: 'odt', label: 'OpenDocument', exts: ['odt'], icon: 'document', color: '#3E9BD6' },
  { kind: 'rtf', label: 'Rich Text', exts: ['rtf'], icon: 'reader', color: '#8E7CC3' },
  { kind: 'text', label: 'Text', exts: ['txt', 'text', 'log'], icon: 'document-outline', color: '#94A3B8' },
  { kind: 'md', label: 'Markdown', exts: ['md', 'markdown'], icon: 'logo-markdown', color: '#E2E8F0' },
  { kind: 'html', label: 'Web page', exts: ['html', 'htm', 'xhtml'], icon: 'globe-outline', color: '#F97316' },
  { kind: 'code', label: 'Code & data', exts: ['json', 'xml', 'yaml', 'yml', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'cs', 'sql', 'css', 'sh'], icon: 'code-slash', color: '#A78BFA' },
  { kind: 'image', label: 'Images', exts: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'bmp'], icon: 'image', color: '#F472B6' },
];

export function extOf(name: string) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function formatOf(name: string) {
  const ext = extOf(name);
  return FORMATS.find((f) => f.exts.includes(ext)) ?? null;
}

/** Kinds that read best on a landscape page. */
export const WIDE_KINDS: SourceKind[] = ['sheet', 'csv', 'pptx'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

const toArrayBuffer = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

const paragraphs = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');

// ---------- Word (.docx) ----------

async function docxToHtml(bytes: Uint8Array) {
  // The browser build (used by Metro) reads `arrayBuffer`; the Node build reads `buffer`.
  const input = { arrayBuffer: toArrayBuffer(bytes), buffer: bytes } as unknown as { arrayBuffer: ArrayBuffer };
  const res = await mammoth.convertToHtml(input);
  return res.value || '<p><em>This document has no readable content.</em></p>';
}

// ---------- Word 97–2003 (.doc), text extraction via the piece table ----------

const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
  0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

function docToText(bytes: Uint8Array) {
  let container;
  try {
    container = CFB.read(bytes, { type: 'array' });
  } catch {
    throw new Error("This .doc file couldn't be read. Try saving it as .docx in Word first.");
  }
  const wordEntry = CFB.find(container, 'WordDocument');
  if (!wordEntry?.content) throw new Error("This doesn't look like a Word 97–2003 document.");
  const word = Uint8Array.from(wordEntry.content as ArrayLike<number>);
  const dv = new DataView(word.buffer);
  if (dv.getUint16(0, true) !== 0xa5ec) throw new Error('This Word file uses a very old format (Word 6/95). Save it as .docx and try again.');
  const flags = dv.getUint16(0x0a, true);
  if (flags & 0x0100) throw new Error('This document is password-protected.');

  const table = CFB.find(container, flags & 0x0200 ? '1Table' : '0Table');
  if (!table?.content) throw new Error('This Word document is missing its text table.');
  const tbl = Uint8Array.from(table.content as ArrayLike<number>);
  const tdv = new DataView(tbl.buffer);
  const fcClx = dv.getUint32(0x01a2, true);
  const lcbClx = dv.getUint32(0x01a6, true);

  // Skip any Prc entries, then read the PlcPcd piece table.
  let pos = fcClx;
  while (pos < fcClx + lcbClx && tbl[pos] === 0x01) pos += 3 + tdv.getUint16(pos + 1, true);
  if (tbl[pos] !== 0x02) throw new Error("This Word document's text couldn't be located.");
  const lcb = tdv.getUint32(pos + 1, true);
  const plc = pos + 5;
  const n = (lcb - 4) / 12;

  let out = '';
  for (let i = 0; i < n; i++) {
    const cpStart = tdv.getUint32(plc + i * 4, true);
    const cpEnd = tdv.getUint32(plc + (i + 1) * 4, true);
    const raw = tdv.getUint32(plc + (n + 1) * 4 + i * 8 + 2, true);
    const compressed = (raw & 0x40000000) !== 0;
    const fc = raw & 0x3fffffff;
    const len = cpEnd - cpStart;
    if (compressed) {
      const start = fc / 2;
      for (let k = 0; k < len; k++) {
        const b = word[start + k];
        out += String.fromCharCode(CP1252[b] ?? b);
      }
    } else {
      for (let k = 0; k < len; k++) out += String.fromCharCode(dv.getUint16(fc + k * 2, true));
    }
  }

  // Keep field results, drop field instructions (\x13 instr \x14 result \x15).
  out = out.replace(/\x13[^\x13\x14\x15]*\x14/g, '').replace(/\x13[^\x13\x15]*\x15/g, '').replace(/\x15/g, '');
  return out
    .replace(/\x07\x07/g, '\n')
    .replace(/\x07/g, '\t')
    .replace(/\x0b/g, '\n')
    .replace(/\x0c/g, '\n\n')
    .replace(/\r/g, '\n\n')
    .replace(/[\x00-\x08\x0e-\x1f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- Spreadsheets (.xlsx, .xls, .ods, .csv …) ----------

function workbookToHtml(wb: XLSX.WorkBook) {
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    const table = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' });
    parts.push(`<section class="sheet">${wb.SheetNames.length > 1 ? `<h2>${esc(name)}</h2>` : ''}${table}</section>`);
  }
  return parts.join('\n') || '<p><em>This spreadsheet is empty.</em></p>';
}

// ---------- PowerPoint (.pptx) ----------

async function pptxToHtml(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files)
    .map((p) => p.match(/^ppt\/slides\/slide(\d+)\.xml$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  if (!slides.length) throw new Error('No slides found in this presentation.');

  const out: string[] = [];
  for (const [path, num] of slides) {
    const xml = await zip.file(path)!.async('string');
    const relsXml = (await zip.file(`ppt/slides/_rels/slide${num}.xml.rels`)?.async('string')) ?? '';
    const rels = new Map<string, string>();
    for (const m of relsXml.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rels.set(m[1], m[2]);

    let title = '';
    const blocks: string[] = [];
    for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []) {
      const isTitle = /<p:ph[^>]*type="(title|ctrTitle)"/.test(sp);
      const paras = (sp.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? [])
        .map((p) => ({
          lvl: Number(p.match(/<a:pPr[^>]*lvl="(\d)"/)?.[1] ?? 0),
          text: decodeXml((p.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? []).map((t) => t.replace(/<\/?a:t>/g, '')).join('')),
        }))
        .filter((p) => p.text.trim());
      if (!paras.length) continue;
      if (isTitle && !title) title = paras.map((p) => p.text).join(' ');
      else if (paras.length === 1 && !/<a:buNone/.test(sp) && sp.includes('type="subTitle"')) blocks.push(`<p class="sub">${esc(paras[0].text)}</p>`);
      else blocks.push(`<ul>${paras.map((p) => `<li style="margin-left:${p.lvl * 18}px">${esc(p.text)}</li>`).join('')}</ul>`);
    }

    const images: string[] = [];
    for (const m of xml.matchAll(/<p:pic>[\s\S]*?r:embed="([^"]+)"[\s\S]*?<\/p:pic>/g)) {
      const target = rels.get(m[1]);
      if (!target) continue;
      const media = target.replace(/^\.\.\//, 'ppt/');
      const ext = extOf(media);
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : null;
      const file = zip.file(media);
      if (mime && file) images.push(`<img src="data:${mime};base64,${await file.async('base64')}"/>`);
    }

    out.push(`<section class="slide">
      <div class="slide-no">${num}</div>
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      ${blocks.join('')}
      ${images.length ? `<div class="pics">${images.join('')}</div>` : ''}
    </section>`);
  }
  return out.join('\n');
}

// ---------- OpenDocument text (.odt) ----------

async function odtToHtml(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = (await zip.file('content.xml')?.async('string')) ?? '';
  const body = xml.match(/<office:text[^>]*>([\s\S]*)<\/office:text>/)?.[1];
  if (!body) throw new Error("This OpenDocument file has no text body.");
  return body
    .replace(/<text:sequence-decls>[\s\S]*?<\/text:sequence-decls>/g, '')
    .replace(/<text:h(\s[^>]*)?>([\s\S]*?)<\/text:h>/g, (_, attrs: string | undefined, inner: string) => {
      const n = Math.min(4, Number(attrs?.match(/outline-level="(\d)"/)?.[1] ?? 1) + 1);
      return `<h${n}>${inner}</h${n}>`;
    })
    .replace(/<text:p(\s[^>]*)?\/>/g, '<p></p>')
    .replace(/<text:p(\s[^>]*)?>/g, '<p>')
    .replace(/<\/text:p>/g, '</p>')
    .replace(/<text:list-item(\s[^>]*)?>/g, '<li>')
    .replace(/<\/text:list-item>/g, '</li>')
    .replace(/<text:list(\s[^>]*)?>/g, '<ul>')
    .replace(/<\/text:list>/g, '</ul>')
    .replace(/<text:line-break\/>/g, '<br/>')
    .replace(/<text:tab\/>/g, '&#9;')
    .replace(/<text:s text:c="(\d+)"\/>/g, (_, c) => '&#160;'.repeat(Number(c)))
    .replace(/<text:s\/>/g, '&#160;')
    .replace(/<table:table [^>]*>/g, '<table>')
    .replace(/<\/table:table>/g, '</table>')
    .replace(/<table:table-row[^>]*>/g, '<tr>')
    .replace(/<\/table:table-row>/g, '</tr>')
    .replace(/<table:table-cell[^>]*\/>/g, '<td></td>')
    .replace(/<table:table-cell[^>]*>/g, '<td>')
    .replace(/<\/table:table-cell>/g, '</td>')
    .replace(/<\/?[a-z]+:[^>]*>/g, ''); // any remaining ODF-namespaced tags
}

// ---------- Rich Text (.rtf) ----------

const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore']);

function rtfToText(rtf: string) {
  if (!rtf.startsWith('{\\rtf')) throw new Error("This doesn't look like an RTF file.");
  let out = '';
  const stack: { skip: boolean; uc: number }[] = [];
  let skip = false;
  let uc = 1;
  let pendingSkip = 0;
  let i = 0;
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === '{') {
      stack.push({ skip, uc });
      i++;
    } else if (ch === '}') {
      ({ skip, uc } = stack.pop() ?? { skip: false, uc: 1 });
      i++;
    } else if (ch === '\\') {
      const next = rtf[i + 1];
      if (next === '\\' || next === '{' || next === '}') {
        if (!skip) out += next;
        i += 2;
      } else if (next === '*') {
        skip = true;
        i += 2;
      } else if (next === "'") {
        const code = parseInt(rtf.substr(i + 2, 2), 16);
        if (pendingSkip > 0) pendingSkip--;
        else if (!skip) out += String.fromCharCode(CP1252[code] ?? code);
        i += 4;
      } else {
        const m = rtf.slice(i).match(/^\\([a-z]+)(-?\d+)? ?/i);
        if (!m) {
          i += 2;
          continue;
        }
        const [all, word, arg] = m;
        i += all.length;
        if (RTF_SKIP.has(word)) skip = true;
        else if (skip) continue;
        else if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') out += '\n';
        else if (word === 'tab' || word === 'cell') out += '\t';
        else if (word === 'row') out += '\n';
        else if (word === 'uc') uc = Number(arg ?? 1);
        else if (word === 'u') {
          let code = Number(arg);
          if (code < 0) code += 65536;
          out += String.fromCharCode(code);
          pendingSkip = uc;
        } else if (word === 'emdash') out += '—';
        else if (word === 'endash') out += '–';
        else if (word === 'bullet') out += '•';
        else if (word === 'lquote') out += '‘';
        else if (word === 'rquote') out += '’';
        else if (word === 'ldblquote') out += '“';
        else if (word === 'rdblquote') out += '”';
      }
    } else if (ch === '\r' || ch === '\n') {
      i++;
    } else {
      if (pendingSkip > 0) pendingSkip--;
      else if (!skip) out += ch;
      i++;
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- Markdown ----------

function inlineMd(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2"/>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

export function markdownToHtml(md: string) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      out.push('<hr/>');
      i++;
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-+/.test(lines[i + 1] ?? '')) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inlineMd(c.trim()));
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const task = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
        items.push(`<li>${inlineMd(task).replace(/^\[ \]/, '☐').replace(/^\[x\]/i, '☑')}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inlineMd(quote.join(' '))}</blockquote>`);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s|\|)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push(`<p>${para.map(inlineMd).join('<br/>')}</p>`);
  }
  return out.join('\n');
}

// ---------- Plain text & code ----------

function codeToHtml(text: string, ext: string) {
  let body = text;
  if (ext === 'json') {
    try {
      body = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // Keep the original if it isn't valid JSON.
    }
  }
  return `<pre class="code"><code>${esc(body)}</code></pre>`;
}

// ---------- Page wrapper ----------

const CSS = `
  @page { margin: 48px 52px; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif; color: #1b1b28; font-size: 12.5px; line-height: 1.55; margin: 0; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.1em 0 0.45em; letter-spacing: -0.2px; }
  h1 { font-size: 24px; } h2 { font-size: 19px; } h3 { font-size: 16px; } h4 { font-size: 14px; }
  p { margin: 0 0 10px; }
  img { max-width: 100%; height: auto; }
  a { color: #2563eb; }
  ul, ol { padding-left: 22px; margin: 0 0 10px; }
  blockquote { margin: 0 0 12px; padding: 6px 14px; border-left: 4px solid #c7d2fe; color: #475569; background: #f8fafc; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f5f6fa; border-radius: 6px; padding: 10px 12px; font-size: 11px; }
  code { font-family: Menlo, 'Courier New', monospace; font-size: 0.92em; }
  pre.code { background: none; padding: 0; font-size: 10.5px; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 14px; font-size: 10.5px; }
  th, td { border: 1px solid #d5d8e2; padding: 4px 6px; text-align: left; vertical-align: top; word-break: break-word; }
  th, thead td, tr:first-child td { background: #f1f3f9; font-weight: 600; }
  .sheet + .sheet, .slide + .slide { page-break-before: always; }
  .sheet h2 { margin-top: 0; color: #21A366; }
  .slide { position: relative; border: 1px solid #e3e6ef; border-radius: 10px; padding: 28px 32px; min-height: 420px; page-break-inside: avoid; }
  .slide h2 { margin-top: 0; font-size: 24px; color: #111827; }
  .slide .sub { color: #64748b; font-size: 15px; }
  .slide li { font-size: 14px; margin: 4px 0; }
  .slide .pics { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .slide .pics img { max-height: 220px; max-width: 48%; object-fit: contain; }
  .slide-no { position: absolute; right: 14px; bottom: 10px; color: #a0a4b8; font-size: 10px; }
  .doc-title { font-size: 11px; color: #8a8aa0; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 18px; }
`;

function wrap(title: string, body: string, showTitle: boolean) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><style>${CSS}</style></head><body>${
    showTitle ? `<div class="doc-title">${esc(title)}</div>` : ''
  }${body}</body></html>`;
}

/** Converts a document file into printable HTML. Images are handled separately. */
export async function fileToHtml(uri: string, name: string, kind: SourceKind) {
  const title = name.replace(/\.[^.]+$/, '');
  switch (kind) {
    case 'docx':
      return wrap(title, await docxToHtml(await readBytes(uri)), false);
    case 'doc':
      return wrap(title, paragraphs(docToText(await readBytes(uri))), false);
    case 'odt':
      return wrap(title, await odtToHtml(await readBytes(uri)), false);
    case 'rtf':
      return wrap(title, paragraphs(rtfToText(await new File(uri).text())), false);
    case 'sheet':
      return wrap(title, workbookToHtml(XLSX.read(await readBytes(uri), { type: 'array', cellDates: true })), true);
    case 'csv':
      return wrap(title, workbookToHtml(XLSX.read(await new File(uri).text(), { type: 'string', FS: extOf(name) === 'tsv' ? '\t' : undefined })), true);
    case 'pptx':
      return wrap(title, await pptxToHtml(await readBytes(uri)), false);
    case 'md':
      return wrap(title, markdownToHtml(await new File(uri).text()), false);
    case 'html': {
      const html = await new File(uri).text();
      return /<html[\s>]/i.test(html) ? html : wrap(title, html, false);
    }
    case 'text':
      return wrap(title, paragraphs(await new File(uri).text()), true);
    case 'code':
      return wrap(title, codeToHtml(await new File(uri).text(), extOf(name)), true);
    case 'image':
      throw new Error('Images are converted directly.');
  }
}
