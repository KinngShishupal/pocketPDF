import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BusyOverlay } from '@/components/busy-overlay';
import { FileSlot } from '@/components/file-slot';
import { PageThumb } from '@/components/page-thumb';
import { Footer, IconButton, PrimaryButton, Screen, Segmented, ToolHeader, Txt, tap } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { readPages, type EditPage } from '@/lib/edit';
import { getDoc, saveDoc } from '@/lib/library';
import { extractPages, loadPdf } from '@/lib/pdf';
import { usePdfRenderer } from '@/lib/pdf-renderer';
import { fromDoc, type PickedFile } from '@/lib/pickers';
import { TOOLS } from '@/lib/tools';
import { useTask } from '@/lib/use-task';

const tool = TOOLS.split;
const COLS = 3;
const GAP = 10;

type Output = 'one' | 'separate' | 'remove';
type Quick = 'all' | 'none' | 'odd' | 'even' | 'invert';

/** Formats zero-based indices as compact 1-based ranges: [0,1,2,4] → "1-3, 5". */
function toRanges(indices: number[]) {
  const parts: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    while (i + 1 < indices.length && indices[i + 1] === indices[i] + 1) i++;
    parts.push(start === indices[i] ? `${start + 1}` : `${start + 1}-${indices[i] + 1}`);
  }
  return parts.join(', ');
}

export default function Split() {
  const { docId } = useLocalSearchParams<{ docId?: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { status, load, render, view } = usePdfRenderer();
  const task = useTask();

  const [file, setFile] = useState<PickedFile | null>(() => {
    const d = getDoc(docId);
    return d ? fromDoc(d) : null;
  });
  const [pages, setPages] = useState<EditPage[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [output, setOutput] = useState<Output>('one');
  const [preview, setPreview] = useState<{ index: number; image?: string } | null>(null);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    const renderThumbs = async () => {
      try {
        const count = await load(file.uri);
        for (let i = 0; i < count && alive; i++) {
          const img = await render(i, 300);
          if (alive) setThumbs((t) => ({ ...t, [i]: img }));
        }
      } catch {
        // Previews are optional; numbered blank pages are shown instead.
      }
    };
    readPages(file.uri)
      .then((ps) => {
        if (!alive) return;
        setPages(ps);
        renderThumbs();
      })
      .catch((e: Error) => {
        if (!alive) return;
        Alert.alert('Cannot open PDF', e.message);
        setFile(null);
      });
    return () => {
      alive = false;
    };
  }, [file, load, render]);

  const count = pages.length;
  const chosen = [...selected].sort((a, b) => a - b);
  const n = chosen.length;
  const cellW = (width - S.lg * 2 - GAP * (COLS - 1)) / COLS;
  const cellH = cellW * 1.38;

  const toggle = (i: number) => {
    tap();
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const quick = (q: Quick) => {
    tap();
    const all = Array.from({ length: count }, (_, i) => i);
    setSelected((cur) => {
      if (q === 'all') return new Set(all);
      if (q === 'none') return new Set();
      if (q === 'odd') return new Set(all.filter((i) => i % 2 === 0));
      if (q === 'even') return new Set(all.filter((i) => i % 2 === 1));
      return new Set(all.filter((i) => !cur.has(i)));
    });
  };

  const openPreview = (i: number) => {
    tap();
    setPreview({ index: i, image: thumbs[i] });
    if (status !== 'failed') {
      render(i, 1100)
        .then((img) => setPreview((p) => (p && p.index === i ? { ...p, image: img } : p)))
        .catch(() => {});
    }
  };

  const blocked = output === 'remove' && n === count;
  const label = !n
    ? 'Select pages'
    : blocked
      ? 'Keep at least one page'
      : output === 'one'
        ? `Extract ${n} ${n === 1 ? 'page' : 'pages'}`
        : output === 'separate'
          ? `Save ${n} separate ${n === 1 ? 'PDF' : 'PDFs'}`
          : `Remove ${n} ${n === 1 ? 'page' : 'pages'}`;

  const start = async () => {
    if (!file || !n || blocked) return;
    const result = await task.run(output === 'separate' ? 'Splitting pages' : 'Building your PDF', async (report) => {
      const src = await loadPdf(file.uri);
      if (output === 'separate') {
        let first;
        for (let k = 0; k < n; k++) {
          const res = await extractPages(src, [chosen[k]]);
          const doc = await saveDoc({ name: `${file.name} - page ${chosen[k] + 1}`, source: 'split', pages: 1, bytes: res.bytes });
          first ??= doc;
          report(k + 1, n);
        }
        return first;
      }
      if (output === 'remove') {
        const keep = Array.from({ length: count }, (_, i) => i).filter((i) => !selected.has(i));
        const res = await extractPages(src, keep);
        return saveDoc({ name: `${file.name} (${n} ${n === 1 ? 'page' : 'pages'} removed)`, source: 'split', pages: res.pages, bytes: res.bytes });
      }
      const res = await extractPages(src, chosen);
      const range = toRanges(chosen);
      return saveDoc({
        name: `${file.name} - ${n === 1 ? 'page' : 'pages'} ${range.length > 30 ? `${n} selected` : range}`,
        source: 'split',
        pages: res.pages,
        bytes: res.bytes,
      });
    });
    if (!result) return;
    router.replace({
      pathname: '/result',
      params:
        output === 'separate'
          ? { id: result.id, count: String(n), note: `${n} single-page PDFs saved to Files.` }
          : output === 'remove'
            ? { id: result.id, note: `Removed pages ${toRanges(chosen)}. ${count - n} pages kept.` }
            : { id: result.id, note: `Extracted pages ${toRanges(chosen)}.` },
    });
  };

  return (
    <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
      {view}
      <ToolHeader title="Split PDF" subtitle="Pick pages to extract or remove" icon={tool.icon} colors={tool.colors} />
      <ScrollView contentContainerStyle={styles.body} stickyHeaderIndices={count ? [1] : undefined}>
        <FileSlot
          file={file}
          onChange={(f) => {
            setPages([]);
            setThumbs({});
            setSelected(new Set());
            setFile(f);
          }}
          colors={tool.colors}
          meta={count ? `${count} pages` : undefined}
        />

        {count > 0 ? (
          <View style={styles.toolbar}>
            <View style={styles.countRow}>
              <Txt variant="label">
                <Text style={{ color: tool.colors[0] }}>{n}</Text> of {count} selected
              </Txt>
              {n > 0 && (
                <Txt variant="caption" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
                  {toRanges(chosen)}
                </Txt>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
              {(
                [
                  ['all', 'All', 'checkmark-done'],
                  ['none', 'None', 'close'],
                  ['odd', 'Odd', 'reorder-two-outline'],
                  ['even', 'Even', 'reorder-two'],
                  ['invert', 'Invert', 'swap-horizontal'],
                ] as const
              ).map(([key, text, icon]) => (
                <Pressable key={key} onPress={() => quick(key)} style={({ pressed }) => [styles.chip, pressed && { backgroundColor: C.cardHi }]}>
                  <Ionicons name={icon} size={14} color={C.sub} />
                  <Text style={styles.chipText}>{text}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : (
          <View />
        )}

        {file && count === 0 && (
          <View style={styles.loading}>
            <ActivityIndicator color={tool.colors[0]} />
            <Txt variant="caption">Reading pages…</Txt>
          </View>
        )}

        {count > 0 && (
          <Animated.View entering={FadeIn}>
            {status === 'failed' && (
              <View style={styles.offline}>
                <Ionicons name="cloud-offline-outline" size={16} color={C.sub} />
                <Txt variant="caption" style={{ flex: 1 }}>
                  Page previews need an internet connection. You can still pick pages by number.
                </Txt>
              </View>
            )}
            <Txt variant="caption" style={{ marginBottom: S.md }}>
              Tap pages to select · hold to preview
            </Txt>
            <View style={styles.grid}>
              {pages.map((p, i) => {
                const on = selected.has(i);
                const dim = output === 'remove' ? on : n > 0 && !on;
                return (
                  <Animated.View key={p.key} entering={FadeInDown.delay(Math.min(i, 15) * 25)}>
                    <Pressable
                      onPress={() => toggle(i)}
                      onLongPress={() => openPreview(i)}
                      delayLongPress={300}
                      style={[
                        styles.cell,
                        { width: cellW, height: cellH },
                        on && { borderColor: output === 'remove' ? C.danger : tool.colors[0], backgroundColor: C.surface2 },
                      ]}>
                      <View style={{ opacity: dim ? 0.45 : 1 }}>
                        <PageThumb
                          box={p.box}
                          rotation={p.base}
                          image={thumbs[i]}
                          loading={status !== 'failed'}
                          maxW={cellW - 14}
                          maxH={cellH - 32}
                        />
                      </View>
                      <Text style={[styles.pageNo, on && { color: C.text }]}>{i + 1}</Text>
                      {on && (
                        <Animated.View
                          entering={ZoomIn.duration(160)}
                          style={[styles.check, { backgroundColor: output === 'remove' ? C.danger : tool.colors[0] }]}>
                          <Ionicons name={output === 'remove' ? 'trash' : 'checkmark'} size={14} color="#fff" />
                        </Animated.View>
                      )}
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <Footer>
        {count > 0 && (
          <View style={{ marginBottom: S.md }}>
            <Segmented
              value={output}
              onChange={setOutput}
              accent={tool.colors[0]}
              options={[
                { value: 'one', label: 'One PDF', icon: 'document-outline' },
                { value: 'separate', label: 'Separate', icon: 'documents-outline' },
                { value: 'remove', label: 'Remove', icon: 'trash-outline' },
              ]}
            />
          </View>
        )}
        <PrimaryButton label={label} icon="cut" colors={tool.colors} disabled={!n || blocked} onPress={start} />
      </Footer>

      {preview && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPreview(null)}>
          <View style={[styles.previewBackdrop, { paddingTop: insets.top + S.lg, paddingBottom: insets.bottom + S.lg }]}>
            <View style={styles.previewHead}>
              <Txt variant="h2">Page {preview.index + 1}</Txt>
              <IconButton icon="close" onPress={() => setPreview(null)} />
            </View>
            <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onPress={() => setPreview(null)}>
              {preview.image ? (
                <Image source={{ uri: preview.image }} style={[styles.previewImg, { aspectRatio: pages[preview.index].box.w / pages[preview.index].box.h, transform: [{ rotate: `${pages[preview.index].base}deg` }] }]} contentFit="contain" transition={150} />
              ) : (
                <ActivityIndicator color="#fff" />
              )}
            </Pressable>
            <PrimaryButton
              label={selected.has(preview.index) ? 'Deselect page' : 'Select page'}
              icon={selected.has(preview.index) ? 'remove-circle-outline' : 'checkmark-circle-outline'}
              colors={tool.colors}
              onPress={() => {
                toggle(preview.index);
                setPreview(null);
              }}
            />
          </View>
        </Modal>
      )}
      <BusyOverlay visible={task.busy} label={task.label} progress={task.progress} colors={tool.colors} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: S.lg, paddingBottom: 220 },
  toolbar: {
    gap: S.md,
    paddingVertical: S.md,
    marginTop: S.md,
    marginBottom: S.sm,
    backgroundColor: C.bg,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: S.md,
    borderRadius: 17,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  chipText: { color: C.text, fontSize: 13, fontWeight: '600' },
  loading: { alignItems: 'center', gap: S.sm, paddingVertical: S.xxl },
  offline: { flexDirection: 'row', alignItems: 'center', gap: S.sm, padding: S.md, borderRadius: R.md, backgroundColor: C.card, marginBottom: S.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: {
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 4,
    backgroundColor: C.card,
    borderWidth: 2,
    borderColor: C.border,
  },
  pageNo: { color: C.sub, fontSize: 12, fontWeight: '700' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.bg,
  },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(3,3,8,0.94)', paddingHorizontal: S.lg, gap: S.lg },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewImg: { width: '100%', maxHeight: '100%', backgroundColor: '#fff', borderRadius: 4 },
});
