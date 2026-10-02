import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocThumb } from '@/components/doc-row';
import { GhostButton, PrimaryButton, Screen, Txt, tap } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { formatBytes } from '@/lib/fs';
import { docUri, getDoc, useDocs } from '@/lib/library';
import { previewFile, shareFile } from '@/lib/pickers';
import { SOURCE_META, TOOLS, type ToolKey } from '@/lib/tools';

export default function Result() {
  const { id, before, note, count } = useLocalSearchParams<{ id: string; before?: string; note?: string; count?: string }>();
  useDocs(); // re-render if the doc is renamed or removed
  const doc = getDoc(id);
  const insets = useSafeAreaInsets();

  if (!doc) {
    return (
      <Screen>
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <Txt variant="h2">Document not found</Txt>
          <GhostButton label="Go home" onPress={() => router.dismissAll()} />
        </View>
      </Screen>
    );
  }

  const meta = SOURCE_META[doc.source];
  const prev = before ? Number(before) : 0;
  const saved = prev > 0 ? Math.max(0, 1 - doc.size / prev) : 0;
  const next = (['edit', 'sign', 'compress', 'split'] as ToolKey[]).filter((k) => k !== doc.source).slice(0, 3);

  return (
    <Screen glow={meta.colors[0]} glow2={meta.colors[1]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + S.xxl, paddingHorizontal: S.lg, paddingBottom: insets.bottom + S.xl }}>
        <View style={{ alignItems: 'center', gap: S.md }}>
          <Animated.View entering={ZoomIn.springify().damping(12)}>
            <LinearGradient colors={meta.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.check}>
              <Ionicons name="checkmark" size={54} color="#fff" />
            </LinearGradient>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(150)} style={{ alignItems: 'center', gap: 4 }}>
            <Txt variant="h1">{count && Number(count) > 1 ? `${count} PDFs ready` : 'Your PDF is ready'}</Txt>
            <Txt style={{ textAlign: 'center' }}>{note ?? 'Saved to your 1TapPDF library.'}</Txt>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.delay(250)} style={styles.docCard}>
          <DocThumb doc={doc} size={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="label" numberOfLines={2}>
              {doc.name}
            </Txt>
            <Txt variant="caption">
              {doc.pages} {doc.pages === 1 ? 'page' : 'pages'} · {formatBytes(doc.size)}
            </Txt>
          </View>
        </Animated.View>

        {prev > 0 && (
          <Animated.View entering={FadeInDown.delay(320)} style={styles.savings}>
            <View style={{ flex: 1 }}>
              <Txt variant="overline">Before</Txt>
              <Txt variant="h2" style={{ color: C.sub }}>
                {formatBytes(prev)}
              </Txt>
            </View>
            <Ionicons name="arrow-forward" size={20} color={C.faint} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Txt variant="overline">After</Txt>
              <Txt variant="h2">{formatBytes(doc.size)}</Txt>
            </View>
            <View style={[styles.savedPill, { backgroundColor: saved > 0.01 ? C.success + '26' : C.card }]}>
              <Txt variant="label" style={{ color: saved > 0.01 ? C.success : C.sub }}>
                {saved > 0.01 ? `−${Math.round(saved * 100)}%` : 'Already lean'}
              </Txt>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(380)} style={{ gap: S.sm, marginTop: S.xl }}>
          <PrimaryButton label="Share PDF" icon="share-outline" colors={meta.colors} onPress={() => shareFile(docUri(doc))} />
          <GhostButton label="Preview / Print" icon="eye-outline" onPress={() => previewFile(docUri(doc))} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(440)}>
          <Txt variant="overline" style={{ marginTop: S.xl, marginBottom: S.md }}>
            Keep going
          </Txt>
          <View style={styles.nextRow}>
            {next.map((k) => {
              const t = TOOLS[k];
              return (
                <Pressable
                  key={k}
                  onPress={() => {
                    tap();
                    router.replace({ pathname: t.route, params: { docId: doc.id } });
                  }}
                  style={({ pressed }) => [styles.next, pressed && { backgroundColor: C.cardHi }]}>
                  <LinearGradient colors={t.colors} style={styles.nextIcon}>
                    <Ionicons name={t.icon} size={18} color="#fff" />
                  </LinearGradient>
                  <Txt variant="label" style={{ fontSize: 14 }}>
                    {t.title}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <GhostButton label="Done" onPress={() => router.dismissAll()} style={{ marginTop: S.xl, backgroundColor: 'transparent' }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.lg },
  check: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    marginTop: S.xl,
    padding: S.lg,
    borderRadius: R.lg,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  savings: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: S.md,
    marginTop: S.md,
    padding: S.lg,
    borderRadius: R.lg,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  savedPill: { width: '100%', alignItems: 'center', paddingVertical: S.sm, borderRadius: R.sm },
  nextRow: { flexDirection: 'row', gap: S.sm },
  next: {
    flex: 1,
    alignItems: 'center',
    gap: S.sm,
    paddingVertical: S.md,
    borderRadius: R.md,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  nextIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
