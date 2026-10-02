import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { BusyOverlay } from '@/components/busy-overlay';
import { LibraryPicker } from '@/components/library-picker';
import { Footer, GhostButton, IconBadge, IconButton, PrimaryButton, Screen, SectionLabel, ToolHeader, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { formatBytes, stampName } from '@/lib/fs';
import { getDoc, saveDoc } from '@/lib/library';
import { mergeFiles } from '@/lib/pdf';
import { fromDoc, pickImages, pickPdfs, type PickedFile } from '@/lib/pickers';
import { TOOLS } from '@/lib/tools';
import { useTask } from '@/lib/use-task';

const tool = TOOLS.merge;
type Item = PickedFile & { key: string };

let seq = 0;
const withKey = (f: PickedFile): Item => ({ ...f, key: `${Date.now()}-${seq++}` });

export default function Merge() {
  const { docId } = useLocalSearchParams<{ docId?: string }>();
  const [items, setItems] = useState<Item[]>(() => {
    const d = getDoc(docId);
    return d ? [withKey(fromDoc(d))] : [];
  });
  const [name, setName] = useState(() => stampName('Merged'));
  const [libraryOpen, setLibraryOpen] = useState(false);
  const task = useTask();

  const add = (files: PickedFile[]) => setItems((cur) => [...cur, ...files.map(withKey)]);

  const move = (index: number, dir: -1 | 1) =>
    setItems((cur) => {
      const next = [...cur];
      const target = index + dir;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const start = async () => {
    const doc = await task.run('Merging files', async (report) => {
      const res = await mergeFiles(items, report);
      const firstImage = items.find((i) => i.kind === 'image')?.uri;
      return saveDoc({ name, source: 'merge', pages: res.pages, bytes: res.bytes, thumbFrom: items[0].kind === 'image' ? firstImage : undefined });
    });
    if (doc) router.replace({ pathname: '/result', params: { id: doc.id, note: `${items.length} files combined into one.` } });
  };

  return (
    <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
      <ToolHeader title="Merge" subtitle="PDFs and photos into one file" icon={tool.icon} colors={tool.colors} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.addRow}>
          <GhostButton compact icon="document-outline" label="PDFs" onPress={async () => add(await pickPdfs(true))} style={{ flex: 1 }} />
          <GhostButton compact icon="images-outline" label="Photos" onPress={async () => add(await pickImages())} style={{ flex: 1 }} />
          <GhostButton compact icon="albums-outline" label="Library" onPress={() => setLibraryOpen(true)} style={{ flex: 1 }} />
        </View>

        <SectionLabel right={items.length > 0 && <Txt variant="caption">Use arrows to reorder</Txt>}>
          {`Order · ${items.length} ${items.length === 1 ? 'file' : 'files'}`}
        </SectionLabel>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <IconBadge icon={tool.icon} colors={tool.colors} size={60} />
            <Txt variant="label">Add at least two files</Txt>
            <Txt variant="caption" style={{ textAlign: 'center' }}>
              Mix PDFs and photos — each photo becomes its own page.
            </Txt>
          </View>
        ) : (
          <View style={{ gap: S.sm }}>
            {items.map((item, i) => (
              <Animated.View key={item.key} entering={FadeIn} exiting={FadeOut} layout={LinearTransition.springify().damping(16)} style={styles.item}>
                <View style={[styles.index, { backgroundColor: tool.colors[0] + '2A' }]}>
                  <Txt variant="label" style={{ color: tool.colors[1], fontSize: 13 }}>
                    {i + 1}
                  </Txt>
                </View>
                {item.kind === 'image' ? (
                  <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.pdfThumb]}>
                    <Ionicons name="document-text" size={20} color={tool.colors[1]} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Txt variant="label" numberOfLines={1}>
                    {item.name}
                  </Txt>
                  <Txt variant="caption">
                    {item.kind === 'pdf' ? 'PDF' : 'Photo'}
                    {item.size ? ` · ${formatBytes(item.size)}` : ''}
                  </Txt>
                </View>
                <IconButton icon="chevron-up" size={32} onPress={() => move(i, -1)} tint={i === 0 ? C.faint : C.text} />
                <IconButton icon="chevron-down" size={32} onPress={() => move(i, 1)} tint={i === items.length - 1 ? C.faint : C.text} />
                <IconButton icon="close" size={32} tint={C.danger} onPress={() => setItems((cur) => cur.filter((x) => x.key !== item.key))} />
              </Animated.View>
            ))}
          </View>
        )}

        <SectionLabel>File name</SectionLabel>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={C.faint} placeholder="Merged document" />
      </ScrollView>
      <Footer>
        <PrimaryButton
          label={items.length < 2 ? 'Add files to merge' : `Merge ${items.length} files`}
          icon="git-merge"
          colors={tool.colors}
          disabled={items.length < 2}
          onPress={start}
        />
      </Footer>
      <LibraryPicker visible={libraryOpen} multiple onClose={() => setLibraryOpen(false)} onSelect={(docs) => add(docs.map(fromDoc))} />
      <BusyOverlay visible={task.busy} label={task.label} progress={task.progress} colors={tool.colors} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: S.lg, paddingBottom: 140 },
  addRow: { flexDirection: 'row', gap: S.sm },
  empty: {
    alignItems: 'center',
    gap: S.sm,
    padding: S.xxl,
    borderRadius: R.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: tool.colors[0] + '55',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    padding: S.sm,
    paddingRight: S.sm,
    borderRadius: R.md,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  index: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 38, height: 48, borderRadius: 6, backgroundColor: '#fff' },
  pdfThumb: { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  input: {
    height: 52,
    borderRadius: R.md,
    paddingHorizontal: S.lg,
    color: C.text,
    fontSize: 16,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
});
