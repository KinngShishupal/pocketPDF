import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BusyOverlay } from '@/components/busy-overlay';
import { FileSlot } from '@/components/file-slot';
import { Card, Footer, PrimaryButton, Screen, SectionLabel, Segmented, Stepper, ToolHeader, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { getDoc, saveDoc } from '@/lib/library';
import { extractPages, loadPdf } from '@/lib/pdf';
import { fromDoc, type PickedFile } from '@/lib/pickers';
import { TOOLS } from '@/lib/tools';
import { useTask } from '@/lib/use-task';

const tool = TOOLS.split;
type Mode = 'range' | 'custom' | 'every';

/** Parses "1-3, 5, 8-10" into zero-based page indices. */
function parsePages(input: string, count: number) {
  const out = new Set<number>();
  for (const part of input.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let p = Math.min(a, b); p <= Math.max(a, b); p++) if (p >= 1 && p <= count) out.add(p - 1);
  }
  return [...out].sort((x, y) => x - y);
}

export default function Split() {
  const { docId } = useLocalSearchParams<{ docId?: string }>();
  const [file, setFile] = useState<PickedFile | null>(() => {
    const d = getDoc(docId);
    return d ? fromDoc(d) : null;
  });
  const [count, setCount] = useState(0);
  const [mode, setMode] = useState<Mode>('range');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [custom, setCustom] = useState('');
  const task = useTask();

  useEffect(() => {
    let alive = true;
    if (!file) return;
    loadPdf(file.uri)
      .then((doc) => {
        if (!alive) return;
        const n = doc.getPageCount();
        setCount(n);
        setFrom(1);
        setTo(n);
      })
      .catch((e: Error) => {
        Alert.alert('Cannot open PDF', e.message);
        setFile(null);
      });
    return () => {
      alive = false;
    };
  }, [file]);

  const pages = !file || !count ? 0 : mode === 'range' ? to - from + 1 : mode === 'custom' ? parsePages(custom, count).length : count;

  const start = async () => {
    if (!file) return;
    const result = await task.run(mode === 'every' ? 'Splitting pages' : 'Extracting pages', async (report) => {
      const src = await loadPdf(file.uri);
      if (mode === 'every') {
        let first;
        for (let i = 0; i < count; i++) {
          const res = await extractPages(src, [i]);
          const doc = await saveDoc({ name: `${file.name} - page ${i + 1}`, source: 'split', pages: 1, bytes: res.bytes });
          first ??= doc;
          report(i + 1, count);
        }
        return first;
      }
      const indices = mode === 'range' ? Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i) : parsePages(custom, count);
      const res = await extractPages(src, indices);
      const label = mode === 'range' ? (from === to ? `page ${from}` : `pages ${from}-${to}`) : `pages ${custom.replace(/\s+/g, '')}`;
      return saveDoc({ name: `${file.name} - ${label}`, source: 'split', pages: res.pages, bytes: res.bytes });
    });
    if (!result) return;
    router.replace({
      pathname: '/result',
      params:
        mode === 'every'
          ? { id: result.id, count: String(count), note: `${count} single-page PDFs saved to Files.` }
          : { id: result.id, note: `Extracted ${pages} of ${count} pages.` },
    });
  };

  return (
    <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
      <ToolHeader title="Split PDF" subtitle="Extract pages into new files" icon={tool.icon} colors={tool.colors} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <FileSlot
          file={file}
          onChange={(f) => {
            setCount(0);
            setFile(f);
          }}
          colors={tool.colors}
          meta={count ? `${count} pages` : undefined}
        />

        {file && count > 0 && (
          <Animated.View entering={FadeInDown}>
            <SectionLabel>How to split</SectionLabel>
            <Segmented
              value={mode}
              onChange={setMode}
              accent={tool.colors[0]}
              options={[
                { value: 'range', label: 'Range', icon: 'swap-vertical' },
                { value: 'custom', label: 'Custom', icon: 'list' },
                { value: 'every', label: 'Every page', icon: 'copy-outline' },
              ]}
            />

            <Card style={{ marginTop: S.md }}>
              {mode === 'range' && (
                <View style={{ flexDirection: 'row', gap: S.xl }}>
                  <Stepper label="From page" value={from} min={1} max={to} onChange={setFrom} />
                  <Stepper label="To page" value={to} min={from} max={count} onChange={setTo} />
                </View>
              )}
              {mode === 'custom' && (
                <View style={{ gap: S.sm }}>
                  <Txt variant="caption">Pages and ranges, separated by commas</Txt>
                  <TextInput
                    value={custom}
                    onChangeText={setCustom}
                    placeholder={`e.g. 1-3, 5, ${Math.min(count, 8)}`}
                    placeholderTextColor={C.faint}
                    keyboardType="numbers-and-punctuation"
                    style={styles.input}
                  />
                </View>
              )}
              {mode === 'every' && (
                <Txt>
                  Creates <Txt variant="label">{count} separate PDFs</Txt>, one for each page.
                </Txt>
              )}
            </Card>

            <View style={styles.pagesViz}>
              {Array.from({ length: Math.min(count, 40) }, (_, i) => {
                const on =
                  mode === 'every' ||
                  (mode === 'range' ? i + 1 >= from && i + 1 <= to : parsePages(custom, count).includes(i));
                return (
                  <View key={i} style={[styles.page, on && { backgroundColor: tool.colors[0], borderColor: tool.colors[1] }]}>
                    <Txt variant="caption" style={{ fontSize: 10, color: on ? '#1a1200' : C.faint, fontWeight: '700' }}>
                      {i + 1}
                    </Txt>
                  </View>
                );
              })}
              {count > 40 && <Txt variant="caption">+{count - 40} more</Txt>}
            </View>
          </Animated.View>
        )}
      </ScrollView>
      <Footer>
        <PrimaryButton
          label={pages ? (mode === 'every' ? `Split into ${pages} files` : `Extract ${pages} ${pages === 1 ? 'page' : 'pages'}`) : 'Choose pages'}
          icon="cut"
          colors={tool.colors}
          disabled={!pages}
          onPress={start}
        />
      </Footer>
      <BusyOverlay visible={task.busy} label={task.label} progress={task.progress} colors={tool.colors} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: S.lg, paddingBottom: 140 },
  input: {
    height: 50,
    borderRadius: R.md,
    paddingHorizontal: S.lg,
    color: C.text,
    fontSize: 16,
    backgroundColor: C.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  pagesViz: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: S.lg, alignItems: 'center' },
  page: {
    width: 28,
    height: 36,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
});
