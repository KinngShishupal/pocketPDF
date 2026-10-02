import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BusyOverlay } from '@/components/busy-overlay';
import { FileSlot } from '@/components/file-slot';
import { PageEditor } from '@/components/page-editor';
import { PageThumb } from '@/components/page-thumb';
import { SortableGrid } from '@/components/sortable-grid';
import { Footer, PrimaryButton, Screen, SectionLabel, ToolHeader, Txt, tap } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { applyEdits, readPages, uid, type Ann, type EditPage } from '@/lib/edit';
import { getDoc, saveDoc } from '@/lib/library';
import { usePdfRenderer } from '@/lib/pdf-renderer';
import { fromDoc, type PickedFile } from '@/lib/pickers';
import { TOOLS } from '@/lib/tools';
import { useTask } from '@/lib/use-task';

const tool = TOOLS.edit;
const COLS = 3;
const GAP = 10;

export default function Edit() {
  const { docId } = useLocalSearchParams<{ docId?: string }>();
  const { width } = useWindowDimensions();
  const { status, load, render, text, view } = usePdfRenderer();
  const task = useTask();

  const [file, setFile] = useState<PickedFile | null>(() => {
    const d = getDoc(docId);
    return d ? fromDoc(d) : null;
  });
  const [pages, setPages] = useState<EditPage[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
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
  const editCount = pages.reduce((n, p) => n + p.anns.length, 0);
  const editingIndex = editing ? pages.findIndex((p) => p.key === editing.key) : -1;
  const current = editingIndex >= 0 ? pages[editingIndex] : null;
  const editingSrc = current ? current.src : null;
  // Stable per page, so the editor detects text once.
  const loadText = useMemo(
    () => (editingSrc !== null && status !== 'failed' ? () => text(editingSrc) : undefined),
    [editingSrc, status, text],
  );

  /** Opens a page full-screen, upgrading its preview to a sharp render. */
  const openPage = (page: EditPage) => {
    const preview = page.src !== null ? thumbs[page.src] : undefined;
    setEditing({ key: page.key, image: preview });
    if (page.src !== null && status !== 'failed') {
      render(page.src, 1400)
        .then((img) => setEditing((e) => (e && e.key === page.key ? { ...e, image: img } : e)))
        .catch(() => {});
    }
  };

  const insertAfter = (key: string, page: EditPage) =>
    setPages((ps) => {
      const i = ps.findIndex((p) => p.key === key);
      return [...ps.slice(0, i + 1), page, ...ps.slice(i + 1)];
    });

  const pageActions = (page: EditPage, index: number) => ({
    onChange: (anns: Ann[]) => setPages((ps) => ps.map((p) => (p.key === page.key ? { ...p, anns } : p))),
    onNavigate: (dir: -1 | 1) => {
      const next = pages[index + dir];
      if (next) openPage(next);
    },
    onRotate: (delta: number) =>
      setPages((ps) => ps.map((p) => (p.key === page.key ? { ...p, rotate: (p.rotate + delta + 360) % 360 } : p))),
    onDuplicate: () => {
      const copy: EditPage = { ...page, key: uid(), anns: page.anns.map((a) => ({ ...a, id: uid() })) };
      insertAfter(page.key, copy);
      openPage(copy);
    },
    onInsertBlank: () => {
      const blank: EditPage = { key: uid(), src: null, base: 0, rotate: 0, box: page.box, anns: [] };
      insertAfter(page.key, blank);
      openPage(blank);
    },
    onDelete: () => {
      if (pages.length <= 1) {
        Alert.alert('Keep at least one page', 'A PDF needs at least one page.');
        return;
      }
      Alert.alert(`Delete page ${index + 1}?`, 'You can still discard all changes by leaving without saving.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const neighbour = pages[index + 1] ?? pages[index - 1];
            setPages((ps) => ps.filter((p) => p.key !== page.key));
            if (neighbour) openPage(neighbour);
            else setEditing(null);
          },
        },
      ]);
    },
  });

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

  return (
    <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
      {view}
      <ToolHeader title="Edit PDF" subtitle="Edit text, annotate, rotate & reorder" icon={tool.icon} colors={tool.colors} />
      <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 140 }}>
        <FileSlot
          file={file}
          onChange={(f) => {
            setPages([]);
            setThumbs({});
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
              {pages.length > 1 ? 'Tap to open · hold & drag to reorder' : 'Tap the page to open it'}
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
                const page = pages.find((p) => p.key === key);
                if (!page) return;
                tap();
                openPage(page);
              }}
              onReorder={(keys) =>
                setPages((ps) => {
                  if (keys.join('|') === ps.map((p) => p.key).join('|')) return ps;
                  const byKey = new Map(ps.map((p) => [p.key, p]));
                  return keys.map((k) => byKey.get(k)).filter((p): p is EditPage => !!p);
                })
              }
              renderItem={(p, i) => (
                <View style={[styles.cell, { width: cellW, height: cellH }]}>
                  <PageThumb
                    box={p.box}
                    rotation={p.base + p.rotate}
                    image={p.src !== null ? thumbs[p.src] : undefined}
                    loading={p.src !== null && status !== 'failed'}
                    maxW={cellW - 12}
                    maxH={cellH - 30}
                  />
                  <View style={styles.cellFoot}>
                    <Text style={styles.pageNo}>{i + 1}</Text>
                    {p.src === null && <Text style={styles.tag}>BLANK</Text>}
                    {p.anns.length > 0 && (
                      <View style={[styles.badge, { backgroundColor: tool.colors[0] }]}>
                        <Ionicons name="brush" size={9} color="#fff" />
                        <Text style={styles.badgeText}>{p.anns.length}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            />
          </Animated.View>
        )}
      </ScrollView>

      <Footer>
        <PrimaryButton label="Save changes" icon="save-outline" colors={tool.colors} disabled={!file || !pages.length} onPress={save} />
      </Footer>

      {/* One modal for the whole session, so moving between pages doesn't replay the slide-in. */}
      <Modal visible={!!current} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setEditing(null)}>
        {current && (
          <PageEditor
            key={current.key}
            page={current}
            index={editingIndex}
            count={pages.length}
            image={editing?.image}
            colors={tool.colors}
            loadText={loadText}
            onClose={() => setEditing(null)}
            {...pageActions(current, editingIndex)}
          />
        )}
      </Modal>
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
});
