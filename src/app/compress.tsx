import Ionicons from '@expo/vector-icons/Ionicons';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BusyOverlay } from '@/components/busy-overlay';
import { FileSlot } from '@/components/file-slot';
import { Footer, PrimaryButton, Screen, SectionLabel, ToolHeader, Txt, tap } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { formatBytes } from '@/lib/fs';
import { getDoc, saveDoc } from '@/lib/library';
import { COMPRESS_LEVELS, compressPdf, type CompressLevel } from '@/lib/pdf';
import { fromDoc, type PickedFile } from '@/lib/pickers';
import { TOOLS } from '@/lib/tools';
import { useTask } from '@/lib/use-task';

const tool = TOOLS.compress;
const ESTIMATE: Record<CompressLevel, number> = { light: 0.25, balanced: 0.55, strong: 0.75 };

export default function Compress() {
  const { docId } = useLocalSearchParams<{ docId?: string }>();
  const [file, setFile] = useState<PickedFile | null>(() => {
    const d = getDoc(docId);
    return d ? fromDoc(d) : null;
  });
  const [level, setLevel] = useState<CompressLevel>('balanced');
  const task = useTask();

  const start = async () => {
    if (!file) return;
    const result = await task.run('Compressing images', async (report) => {
      const res = await compressPdf(file.uri, level, report);
      const doc = await saveDoc({ name: `${file.name} (compressed)`, source: 'compress', pages: res.pages, bytes: res.bytes });
      return { doc, res };
    });
    if (!result) return;
    const { doc, res } = result;
    router.replace({
      pathname: '/result',
      params: {
        id: doc.id,
        before: String(file.size ?? new File(file.uri).size),
        note: res.totalImages
          ? `Optimized ${res.optimized} of ${res.totalImages} images.`
          : 'No photos found inside — structure optimized instead.',
      },
    });
  };

  return (
    <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
      <ToolHeader title="Compress PDF" subtitle="Smaller files, same pages" icon={tool.icon} colors={tool.colors} />
      <ScrollView contentContainerStyle={styles.body}>
        <FileSlot file={file} onChange={setFile} colors={tool.colors} />

        <SectionLabel>Compression level</SectionLabel>
        <View style={{ gap: S.sm }}>
          {(Object.keys(COMPRESS_LEVELS) as CompressLevel[]).map((key, i) => {
            const l = COMPRESS_LEVELS[key];
            const active = key === level;
            return (
              <Animated.View key={key} entering={FadeInDown.delay(i * 70)}>
                <Pressable
                  onPress={() => {
                    tap();
                    setLevel(key);
                  }}
                  style={[styles.level, active && { borderColor: tool.colors[0], backgroundColor: tool.colors[0] + '14' }]}>
                  <View style={[styles.radio, active && { borderColor: tool.colors[0] }]}>
                    {active && <View style={[styles.radioDot, { backgroundColor: tool.colors[0] }]} />}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                      <Txt variant="label">{l.label}</Txt>
                      {key === 'balanced' && (
                        <View style={[styles.tag, { backgroundColor: tool.colors[0] + '26' }]}>
                          <Txt variant="caption" style={{ color: tool.colors[1], fontSize: 11, fontWeight: '700' }}>
                            BEST
                          </Txt>
                        </View>
                      )}
                    </View>
                    <Txt variant="caption">{l.detail}</Txt>
                  </View>
                  {file?.size ? (
                    <Txt variant="caption" style={{ color: active ? C.text : C.faint }}>
                      ~{formatBytes(file.size * (1 - ESTIMATE[key]))}
                    </Txt>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <View style={styles.info}>
          <Ionicons name="information-circle-outline" size={18} color={C.sub} />
          <Txt variant="caption" style={{ flex: 1 }}>
            Works best on scanned and photo-heavy PDFs. Text stays sharp — only embedded photos are re-encoded. Your
            original is never modified.
          </Txt>
        </View>
      </ScrollView>
      <Footer>
        <PrimaryButton label="Compress PDF" icon="contract" colors={tool.colors} disabled={!file} onPress={start} />
      </Footer>
      <BusyOverlay visible={task.busy} label={task.label} progress={task.progress} colors={tool.colors} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: S.lg, paddingBottom: 140 },
  level: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    padding: S.lg,
    borderRadius: R.lg,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  info: { flexDirection: 'row', gap: S.sm, marginTop: S.xl, padding: S.md, borderRadius: R.md, backgroundColor: C.card },
});
