import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BusyOverlay } from '@/components/busy-overlay';
import { DocActions } from '@/components/doc-actions';
import { DocRow } from '@/components/doc-row';
import { IconButton, Screen, Segmented, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { formatBytes } from '@/lib/fs';
import { saveDoc, useDocs, type DocEntry } from '@/lib/library';
import { getPdfInfo } from '@/lib/pdf';
import { pickPdfs } from '@/lib/pickers';
import { useTask } from '@/lib/use-task';

type Sort = 'recent' | 'name' | 'size';

export default function Files() {
  const insets = useSafeAreaInsets();
  const docs = useDocs();
  const task = useTask();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [active, setActive] = useState<DocEntry | null>(null);

  const q = query.trim().toLowerCase();
  const list = docs
    .filter((d) => !q || d.name.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size - a.size : b.createdAt - a.createdAt,
    );

  const importFiles = async () => {
    const picked = await pickPdfs(true);
    if (!picked.length) return;
    await task.run(`Importing ${picked.length} ${picked.length === 1 ? 'file' : 'files'}`, async (report) => {
      for (let i = 0; i < picked.length; i++) {
        const { pages } = await getPdfInfo(picked[i].uri);
        await saveDoc({ name: picked[i].name, source: 'import', pages, fromUri: picked[i].uri });
        report(i + 1, picked.length);
      }
    });
  };

  return (
    <Screen glow="#3A86FF" glow2="#8B5CF6">
      <View style={[styles.head, { paddingTop: insets.top + S.lg }]}>
        <View style={{ flex: 1 }}>
          <Txt variant="display">Files</Txt>
          <Txt variant="caption">
            {docs.length} {docs.length === 1 ? 'document' : 'documents'} · {formatBytes(docs.reduce((n, d) => n + d.size, 0))}
          </Txt>
        </View>
        <IconButton icon="add" size={46} onPress={importFiles} style={{ backgroundColor: C.accent, borderColor: C.accent }} />
      </View>

      <View style={{ paddingHorizontal: S.lg, gap: S.md }}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={C.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search documents"
            placeholderTextColor={C.faint}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'recent', label: 'Recent', icon: 'time-outline' },
            { value: 'name', label: 'Name', icon: 'text-outline' },
            { value: 'size', label: 'Size', icon: 'resize-outline' },
          ]}
        />
      </View>

      <FlatList
        data={list}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: S.lg, gap: S.sm, paddingBottom: 140 }}
        keyboardDismissMode="on-drag"
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 40)}>
            <DocRow doc={item} onPress={() => setActive(item)} onMore={() => setActive(item)} />
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name={q ? 'search' : 'documents-outline'} size={34} color={C.accent} />
            </View>
            <Txt variant="h2">{q ? 'No matches' : 'Nothing here yet'}</Txt>
            <Txt style={{ textAlign: 'center' }}>
              {q ? 'Try a different name.' : 'Tap + to import PDFs, or create one with any tool.'}
            </Txt>
          </View>
        }
      />
      <DocActions doc={active} onClose={() => setActive(null)} />
      <BusyOverlay visible={task.busy} label={task.label} progress={task.progress} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, marginBottom: S.lg },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    height: 48,
    paddingHorizontal: S.lg,
    borderRadius: R.md,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 16 },
  empty: { alignItems: 'center', gap: S.sm, paddingTop: 60, paddingHorizontal: S.xl },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent + '1F',
    marginBottom: S.sm,
  },
});
