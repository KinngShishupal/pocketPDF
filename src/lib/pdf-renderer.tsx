import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

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
