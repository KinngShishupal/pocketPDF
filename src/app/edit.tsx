import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { BusyOverlay } from '@/components/busy-overlay';
import { FileSlot } from '@/components/file-slot';
import { PageEditor } from '@/components/page-editor';
import { PageThumb } from '@/components/page-thumb';
import { SortableGrid } from '@/components/sortable-grid';
import { Footer, PrimaryButton, Screen, SectionLabel, ToolHeader, Txt, tap } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { applyEdits, readPages, uid, type EditPage } from '@/lib/edit';
import { getDoc, saveDoc } from '@/lib/library';
import { usePdfRenderer } from '@/lib/pdf-renderer';
import { fromDoc, type PickedFile } from '@/lib/pickers';
import { TOOLS, type IconName } from '@/lib/tools';
import { useTask } from '@/lib/use-task';

const tool = TOOLS.edit;
const COLS = 3;
const GAP = 10;

export default function Edit() {
  const { docId } = useLocalSearchParams<{ docId?: string }>();
  const { width } = useWindowDimensions();
  const { status, load, render, view } = usePdfRenderer();
  const task = useTask();

  const [file, setFile] = useState<PickedFile | null>(() => {
    const d = getDoc(docId);
    return d ? fromDoc(d) : null;
  });
  const [pages, setPages] = useState<EditPage[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<{ key: string; image?: string } | null>(null);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    const renderThumbs = async () => {
      try {
        const count = await load(file.uri);
        for (let i = 0; i < count && alive; i++) {
          const img = await render(i, 360);
          if (alive) setThumbs((t) => ({ ...t, [i]: img }));
        }
      } catch {
        // Previews are optional; the grid falls back to blank pages.
      }
    };
    readPages(file.uri)
      .then((initial) => {
        if (!alive) return;
        setPages(initial);
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

  const cellW = (width - S.lg * 2 - GAP * (COLS - 1)) / COLS;
  const cellH = cellW * 1.35;
  const selIndex = pages.findIndex((p) => p.key === selected);
  const sel = selIndex >= 0 ? pages[selIndex] : null;
  const editCount = pages.reduce((n, p) => n + p.anns.length, 0);
  const editingIndex = editing ? pages.findIndex((p) => p.key === editing.key) : -1;

  const update = (fn: (pages: EditPage[]) => EditPage[]) => {
    tap();
    setPages(fn);
  };

  const rotate = (delta: number) =>
    update((ps) => ps.map((p) => (p.key === selected ? { ...p, rotate: (p.rotate + delta + 360) % 360 } : p)));

  const move = (dir: -1 | 1) =>
    update((ps) => {
      const i = ps.findIndex((p) => p.key === selected);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ps.length) return ps;
      const next = [...ps];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const duplicate = () =>
    update((ps) => {
      const i = ps.findIndex((p) => p.key === selected);
      if (i < 0) return ps;
      const copy = { ...ps[i], key: uid(), anns: ps[i].anns.map((a) => ({ ...a, id: uid() })) };
      return [...ps.slice(0, i + 1), copy, ...ps.slice(i + 1)];
    });

  const insertBlank = () =>
    update((ps) => {
      const i = ps.findIndex((p) => p.key === selected);
      const ref = ps[i] ?? ps[ps.length - 1];
      const blank: EditPage = { key: uid(), src: null, base: 0, rotate: 0, box: ref ? ref.box : { w: 595.28, h: 841.89 }, anns: [] };
      const at = i >= 0 ? i + 1 : ps.length;
      return [...ps.slice(0, at), blank, ...ps.slice(at)];
    });

  const remove = () => {
    if (pages.length <= 1) {
      Alert.alert('Keep at least one page', 'A PDF needs at least one page.');
      return;
    }
    update((ps) => ps.filter((p) => p.key !== selected));
    setSelected(null);
  };

  const openEditor = (page: EditPage) => {
    tap();
    const preview = page.src !== null ? thumbs[page.src] : undefined;
    setEditing({ key: page.key, image: preview });
    if (page.src !== null && status !== 'failed') {
      render(page.src, 1400)
        .then((img) => setEditing((e) => (e && e.key === page.key ? { ...e, image: img } : e)))
        .catch(() => {});
    }
  };

  const save = async () => {
    if (!file) return;
    const doc = await task.run('Saving your edits', async () => {
      const res = await applyEdits(file.uri, pages);
      return saveDoc({ name: `${file.name} (edited)`, source: 'edit', pages: res.pages, bytes: res.bytes });
    });
    if (doc) {
      router.replace({
        pathname: '/result',
        params: { id: doc.id, note: editCount ? `${editCount} ${editCount === 1 ? 'edit' : 'edits'} applied across ${pages.length} pages.` : 'Page changes applied.' },
      });
    }
  };

  const actions: { icon: IconName; label: string; onPress: () => void; danger?: boolean }[] = [
    { icon: 'brush', label: 'Annotate', onPress: () => sel && openEditor(sel) },
    { icon: 'arrow-undo', label: 'Rotate L', onPress: () => rotate(-90) },
    { icon: 'arrow-redo', label: 'Rotate R', onPress: () => rotate(90) },
    { icon: 'chevron-back', label: 'Move', onPress: () => move(-1) },
    { icon: 'chevron-forward', label: 'Move', onPress: () => move(1) },
    { icon: 'copy-outline', label: 'Duplicate', onPress: duplicate },
    { icon: 'document-outline', label: 'Blank after', onPress: insertBlank },
    { icon: 'trash-outline', label: 'Delete', onPress: remove, danger: true },
  ];

  return (
    <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
      {view}
      <ToolHeader title="Edit PDF" subtitle="Annotate, rotate, reorder & more" icon={tool.icon} colors={tool.colors} />
      <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: sel ? 260 : 140 }}>
        <FileSlot
          file={file}
          onChange={(f) => {
            setPages([]);
            setThumbs({});
            setSelected(null);
            setFile(f);
          }}
          colors={tool.colors}
          meta={pages.length ? `${pages.length} pages` : undefined}
        />

        {file && pages.length === 0 && (
          <View style={styles.loading}>
            <ActivityIndicator color={tool.colors[1]} />
            <Txt variant="caption">Reading pages…</Txt>
          </View>
        )}

        {pages.length > 0 && (
          <Animated.View entering={FadeIn}>
            <SectionLabel right={editCount > 0 && <Txt variant="caption" style={{ color: tool.colors[1], fontWeight: '700' }}>{editCount} edits</Txt>}>
              {pages.length > 1 ? 'Tap to select · hold & drag to reorder' : 'Tap the page to select it'}
            </SectionLabel>
            {status === 'failed' && (
              <View style={styles.offline}>
                <Ionicons name="cloud-offline-outline" size={16} color={C.sub} />
                <Txt variant="caption" style={{ flex: 1 }}>
                  Page previews need an internet connection. You can still edit — changes are placed exactly.
                </Txt>
              </View>
            )}
            <SortableGrid
              items={pages}
              keyOf={(p) => p.key}
              cols={COLS}
              cellW={cellW}
              cellH={cellH}
              gap={GAP}
              onDragStateChange={setDragging}
              onTap={(key) => {
                tap();
                setSelected((cur) => (cur === key ? null : key));
              }}
              onReorder={(keys) =>
                setPages((ps) => {
                  if (keys.join('|') === ps.map((p) => p.key).join('|')) return ps;
                  const byKey = new Map(ps.map((p) => [p.key, p]));
                  return keys.map((k) => byKey.get(k)).filter((p): p is EditPage => !!p);
                })
              }
              renderItem={(p, i) => {
                const active = p.key === selected;
                return (
                  <View style={[styles.cell, { width: cellW, height: cellH }, active && { borderColor: tool.colors[0], backgroundColor: C.surface2 }]}>
                    <PageThumb
                      box={p.box}
                      rotation={p.base + p.rotate}
                      image={p.src !== null ? thumbs[p.src] : undefined}
                      loading={p.src !== null && status !== 'failed'}
                      maxW={cellW - 12}
                      maxH={cellH - 30}
                    />
                    <View style={styles.cellFoot}>
                      <Text style={[styles.pageNo, active && { color: C.text }]}>{i + 1}</Text>
                      {p.src === null && <Text style={styles.tag}>BLANK</Text>}
                      {p.anns.length > 0 && (
                        <View style={[styles.badge, { backgroundColor: tool.colors[0] }]}>
                          <Ionicons name="brush" size={9} color="#fff" />
                          <Text style={styles.badgeText}>{p.anns.length}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          </Animated.View>
        )}
      </ScrollView>

      <Footer>
        {sel && (
          <Animated.View entering={SlideInDown.springify().damping(18)} style={styles.actionBar}>
            <Txt variant="overline" style={{ paddingHorizontal: S.xs }}>
              Page {selIndex + 1}
            </Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {actions.map((a, i) => (
                <Pressable key={i} onPress={a.onPress} style={({ pressed }) => [styles.action, pressed && { backgroundColor: C.cardHi }, i === 0 && { backgroundColor: tool.colors[0] + '30' }]}>
                  <Ionicons name={a.icon} size={20} color={a.danger ? C.danger : i === 0 ? C.text : C.sub} />
                  <Text style={[styles.actionLabel, a.danger && { color: C.danger }, i === 0 && { color: C.text }]}>{a.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}
        <PrimaryButton label="Save changes" icon="save-outline" colors={tool.colors} disabled={!file || !pages.length} onPress={save} />
      </Footer>

      {editing && editingIndex >= 0 && (
        <PageEditor
          key={editing.key}
          page={pages[editingIndex]}
          index={editingIndex}
          image={editing.image}
          colors={tool.colors}
          onClose={() => setEditing(null)}
          onSave={(anns) => {
            setPages((ps) => ps.map((p) => (p.key === editing.key ? { ...p, anns } : p)));
            setEditing(null);
          }}
        />
      )}
      <BusyOverlay visible={task.busy} label={task.label} colors={tool.colors} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: S.sm, paddingVertical: S.xxl },
  offline: { flexDirection: 'row', alignItems: 'center', gap: S.sm, padding: S.md, borderRadius: R.md, backgroundColor: C.card, marginBottom: S.md },
  cell: {
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  cellFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24 },
  pageNo: { color: C.sub, fontSize: 12, fontWeight: '700' },
  tag: { color: C.faint, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, height: 16, borderRadius: 8 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  actionBar: {
    gap: S.sm,
    padding: S.sm,
    marginBottom: S.md,
    borderRadius: R.lg,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  action: { alignItems: 'center', gap: 3, width: 70, paddingVertical: S.sm, borderRadius: R.sm },
  actionLabel: { color: C.sub, fontSize: 11, fontWeight: '600' },
});
