import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import type { TextBlock } from './edit';

/**
 * Expo has no native PDF rasterizer, so pages are rendered by pdf.js inside a
 * hidden WebView and handed back as JPEG data URLs. pdf.js loads from cdnjs,
 * so previews need a network connection; editing itself works offline.
 */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

const HTML = `<!doctype html><html><head><meta charset="utf-8"/>
<script>
  var doc = null;
  function send(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  function fail() { send({ type: 'fail' }); }
  function init() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.js';
    send({ type: 'ready' });
  }
  function hex(c) {
    return '#' + c.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join('');
  }

  /*
   * Groups pdf.js text items into editable lines (same baseline, size and style)
   * and samples the rendered page for each line's text and background colors.
   * Coordinates are fractions of the unrotated crop box.
   */
  async function textBlocks(pageIndex) {
    var page = await doc.getPage(pageIndex + 1);
    var vp = page.getViewport({ scale: 1, rotation: 0 });
    var vb = vp.viewBox, pw = vb[2] - vb[0], ph = vb[3] - vb[1];
    await page.getOperatorList(); // makes font objects available in commonObjs
    var tc = await page.getTextContent();

    function fontInfo(name) {
      var real = '', b = false, it = false;
      try {
        if (page.commonObjs.has(name)) {
          var f = page.commonObjs.get(name);
          real = (f && f.name) || '';
          b = !!(f && (f.bold || f.black));
          it = !!(f && f.italic);
        }
      } catch (e) {}
      var all = real + ' ' + ((tc.styles[name] || {}).fontFamily || '');
      var family = /courier|mono|consol/i.test(all) ? 'mono'
        : (/times|georgia|garamond|cambria|minion|roman|book|serif/i.test(all) && !/sans/i.test(all)) ? 'serif' : 'sans';
      return { family: family, bold: b || /bold|black|heavy|semibold|demi/i.test(real), italic: it || /italic|oblique/i.test(real) };
    }

    var blocks = [], cur = null;
    tc.items.forEach(function (item) {
      if (!('str' in item)) return;
      var t = item.transform;
      if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01 || t[0] <= 0 || t[3] <= 0) { cur = null; return; } // rotated/mirrored text
      if (!item.str) { if (item.hasEOL) cur = null; return; }
      var size = t[3], x0 = t[4] - vb[0], base = vb[3] - t[5], x1 = x0 + item.width;
      var fi = fontInfo(item.fontName);
      if (cur && Math.abs(base - cur.base) < size * 0.35 && x0 - cur.x1 < size * 1.2 && x0 > cur.x0 - size * 0.5 &&
          Math.abs(size - cur.size) < size * 0.2 && fi.family === cur.family && fi.bold === cur.bold) {
        if (x0 - cur.x1 > size * 0.15 && !/\\s$/.test(cur.text) && !/^\\s/.test(item.str)) cur.text += ' ';
        cur.text += item.str;
        cur.x1 = Math.max(cur.x1, x1);
      } else if (item.str.trim()) {
        cur = { text: item.str, x0: x0, x1: x1, base: base, size: size, family: fi.family, bold: fi.bold, italic: fi.italic };
        blocks.push(cur);
      } else {
        cur = null;
      }
      if (item.hasEOL) cur = null;
    });
    if (!blocks.length) return [];

    // Render once to sample colors.
    var S = Math.min(2, 2000 / pw);
    var svp = page.getViewport({ scale: S, rotation: 0 });
    var canvas = document.createElement('canvas');
    var W = canvas.width = Math.floor(svp.width), H = canvas.height = Math.floor(svp.height);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    await page.render({ canvasContext: ctx, viewport: svp }).promise;
    var data = ctx.getImageData(0, 0, W, H).data;
    canvas.width = 0;
    function px(x, y) {
      x = Math.max(0, Math.min(W - 1, x | 0)); y = Math.max(0, Math.min(H - 1, y | 0));
      var i = (y * W + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    }

    return blocks.map(function (b, idx) {
      var top = b.base - b.size * 0.9, bottom = b.base + b.size * 0.25;
      var X0 = b.x0 * S, X1 = b.x1 * S, Y0 = top * S, Y1 = bottom * S;
      var ring = [], x, y;
      var sx = Math.max(1, (X1 - X0) / 40), sy = Math.max(1, (Y1 - Y0) / 8);
      for (x = X0 - 3; x <= X1 + 3; x += sx) { ring.push(px(x, Y0 - 3)); ring.push(px(x, Y1 + 3)); }
      for (y = Y0; y <= Y1; y += sy) { ring.push(px(X0 - 3, y)); ring.push(px(X1 + 3, y)); }
      var bg = [0, 1, 2].map(function (c) {
        var v = ring.map(function (p) { return p[c]; }).sort(function (a, z) { return a - z; });
        return v[v.length >> 1];
      });
      var ink = [];
      for (y = Y0; y < Y1; y += Math.max(1, (Y1 - Y0) / 12)) {
        for (x = X0; x < X1; x += Math.max(1, (X1 - X0) / 60)) {
          var p = px(x, y), d = Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]);
          if (d > 60) ink.push([d, p]);
        }
      }
      ink.sort(function (a, z) { return z[0] - a[0]; });
      var take = ink.slice(0, Math.max(1, Math.ceil(ink.length * 0.3)));
      var fg = ink.length
        ? [0, 1, 2].map(function (c) { return take.reduce(function (s, e) { return s + e[1][c]; }, 0) / take.length; })
        : [17, 24, 39];
      return {
        id: 'b' + idx, text: b.text.trim(),
        nx: b.x0 / pw, ny: top / ph, nw: (b.x1 - b.x0) / pw, nh: (bottom - top) / ph, nbase: b.base / ph,
        size: Math.round(b.size * 10) / 10, family: b.family, bold: b.bold, italic: b.italic,
        color: hex(fg), bg: hex(bg),
      };
    });
  }

  window.__req = async function (req) {
    try {
      if (req.type === 'load') {
        var bin = atob(req.data);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        if (doc) doc.destroy();
        doc = await pdfjsLib.getDocument({
          data: bytes,
          cMapUrl: '${PDFJS}/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '${PDFJS}/standard_fonts/',
        }).promise;
        send({ id: req.id, ok: true, result: doc.numPages });
      } else if (req.type === 'render') {
        var page = await doc.getPage(req.page + 1);
        var base = page.getViewport({ scale: 1, rotation: 0 });
        var vp = page.getViewport({ scale: req.width / base.width, rotation: 0 });
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        var url = canvas.toDataURL('image/jpeg', 0.82);
        canvas.width = 0;
        send({ id: req.id, ok: true, result: url });
      } else if (req.type === 'text') {
        send({ id: req.id, ok: true, result: await textBlocks(req.page) });
      }
    } catch (e) {
      send({ id: req.id, ok: false, error: String((e && e.message) || e) });
    }
  };
</script>
<script src="${PDFJS}/pdf.min.js" onload="init()" onerror="fail()"></script>
</head><body></body></html>`;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
export type RendererStatus = 'loading' | 'ready' | 'failed';

export function usePdfRenderer() {
  const web = useRef<WebView>(null);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(1);
  const [status, setStatus] = useState<RendererStatus>('loading');
  const [gate] = useState(() => {
    let resolve: (ok: boolean) => void = () => {};
    const promise = new Promise<boolean>((r) => (resolve = r));
    return { promise, resolve };
  });

  useEffect(() => {
    // Give up on previews if pdf.js hasn't loaded (e.g. offline).
    const t = setTimeout(() => {
      gate.resolve(false);
      setStatus((s) => (s === 'loading' ? 'failed' : s));
    }, 15000);
    return () => clearTimeout(t);
  }, [gate]);

  const call = useCallback(async <T,>(type: string, payload: object): Promise<T> => {
    if (!(await gate.promise)) throw new Error('Preview unavailable');
    const id = nextId.current++;
    return new Promise<T>((resolve, reject) => {
      pending.current.set(id, { resolve: resolve as (v: unknown) => void, reject });
      web.current?.injectJavaScript(`window.__req(${JSON.stringify({ id, type, ...payload })});true;`);
    });
  }, [gate]);

  /** Loads a PDF into the renderer; resolves to its page count. */
  const load = useCallback(async (uri: string) => call<number>('load', { data: await new File(uri).base64() }), [call]);

  /** Renders a page (unrotated, crop box) to a JPEG data URL `width` pixels wide. */
  const render = useCallback((page: number, width: number) => call<string>('render', { page, width }), [call]);

  /** Finds editable text lines on a page, with their style and colors. */
  const text = useCallback((page: number) => call<TextBlock[]>('text', { page }), [call]);

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data);
    if (msg.type === 'ready') {
      setStatus('ready');
      gate.resolve(true);
    } else if (msg.type === 'fail') {
      setStatus('failed');
      gate.resolve(false);
    } else {
      const p = pending.current.get(msg.id);
      pending.current.delete(msg.id);
      if (msg.ok) p?.resolve(msg.result);
      else p?.reject(new Error(msg.error));
    }
  };

  return {
    status,
    load,
    render,
    text,
    view: (
      <WebView
        ref={web}
        style={styles.hidden}
        originWhitelist={['*']}
        source={{ html: HTML, baseUrl: 'https://cdnjs.cloudflare.com' }}
        onMessage={onMessage}
        onError={() => {
          setStatus('failed');
          gate.resolve(false);
        }}
        javaScriptEnabled
      />
    ),
  };
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});
