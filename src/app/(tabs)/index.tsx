import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocActions } from '@/components/doc-actions';
import { DocRow } from '@/components/doc-row';
import { IconBadge, Screen, SectionLabel, Txt, tap } from '@/components/ui';
import { Brand, C, R, S } from '@/constants/theme';
import { formatBytes } from '@/lib/fs';
import { useDocs, type DocEntry } from '@/lib/library';
import { TOOLS, type Tool } from '@/lib/tools';

const GRID: Tool[] = [TOOLS.edit, TOOLS.sign, TOOLS.merge, TOOLS.compress, TOOLS.convert, TOOLS.split];

export default function Home() {
  const insets = useSafeAreaInsets();
  const docs = useDocs();
  const [active, setActive] = useState<DocEntry | null>(null);
  const total = docs.reduce((n, d) => n + d.size, 0);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + S.lg, paddingHorizontal: S.lg, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.top}>
          <View style={styles.brand}>
            <IconBadge icon="layers" colors={Brand} size={40} />
            <View>
              <Txt variant="h2" style={{ fontSize: 21 }}>
                DocKeeper
              </Txt>
              <Txt variant="caption">Your pocket PDF studio</Txt>
            </View>
          </View>
          <Pressable onPress={() => router.push('/files')} style={styles.stat}>
            <Ionicons name="folder-open" size={14} color={C.sub} />
            <Txt variant="caption" style={{ color: C.text, fontWeight: '600' }}>
              {docs.length} · {formatBytes(total)}
            </Txt>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <ScanHero />
        </Animated.View>

        <SectionLabel>Toolkit</SectionLabel>
        <View style={styles.grid}>
          {GRID.map((tool, i) => (
            <Animated.View key={tool.key} entering={FadeInDown.delay(140 + i * 60).duration(450)} style={styles.cell}>
              <ToolTile tool={tool} />
            </Animated.View>
          ))}
        </View>

        <SectionLabel
          right={
            docs.length > 0 && (
              <Pressable hitSlop={8} onPress={() => router.push('/files')}>
                <Txt variant="caption" style={{ color: C.accent, fontWeight: '700' }}>
                  See all
                </Txt>
              </Pressable>
            )
          }>
          Recent
        </SectionLabel>
        {docs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="sparkles" size={22} color={C.accent} />
            <Txt style={{ textAlign: 'center' }}>
              Your documents land here. Scan a page or pick a tool to get started.
            </Txt>
          </View>
        ) : (
          <View style={{ gap: S.sm }}>
            {docs.slice(0, 4).map((d, i) => (
              <Animated.View key={d.id} entering={FadeInDown.delay(300 + i * 50)}>
                <DocRow doc={d} onPress={() => setActive(d)} onMore={() => setActive(d)} />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
      <DocActions doc={active} onClose={() => setActive(null)} />
    </Screen>
  );
}

function ScanHero() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.7 }],
  }));

  return (
    <Pressable
      onPress={() => {
        tap();
        router.push('/scan');
      }}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <LinearGradient
        colors={['#FF6B6B', '#F72585', '#7C5CFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}>
        <View style={styles.heroDecor1} />
        <View style={styles.heroDecor2} />
        <View style={{ flex: 1, gap: S.sm }}>
          <View style={styles.heroPill}>
            <Ionicons name="flash" size={12} color="#fff" />
            <Txt variant="caption" style={{ color: '#fff', fontWeight: '700' }}>
              Quick scan
            </Txt>
          </View>
          <Txt variant="h1" style={{ color: '#fff', fontSize: 28 }}>
            Scan a{'\n'}document
          </Txt>
          <Txt style={{ color: 'rgba(255,255,255,0.85)' }}>Snap pages, get a crisp PDF in seconds.</Txt>
        </View>
        <View style={styles.camWrap}>
          <Animated.View style={[styles.camRing, ring]} />
          <View style={styles.cam}>
            <Ionicons name="camera" size={30} color="#F72585" />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function ToolTile({ tool }: { tool: Tool }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        router.push(tool.route);
      }}
      style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.96 }], backgroundColor: C.cardHi }]}>
      <View
        pointerEvents="none"
        style={[
          styles.tileGlow,
          { experimental_backgroundImage: `radial-gradient(circle, ${tool.colors[0]}40 0%, ${tool.colors[0]}00 70%)` },
        ]}
      />
      <IconBadge icon={tool.icon} colors={tool.colors} size={46} />
      <View style={{ gap: 2 }}>
        <Txt variant="label" style={{ fontSize: 17, fontWeight: '700' }}>
          {tool.title}
        </Txt>
        <Txt variant="caption" numberOfLines={1}>
          {tool.tagline}
        </Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: S.md,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  hero: {
    borderRadius: R.xl,
    padding: S.xl,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 190,
  },
  heroDecor1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -60,
    top: -90,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroDecor2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    right: 40,
    bottom: -80,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  camWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  camRing: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: '#fff' },
  cam: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -S.xs },
  cell: { width: '50%', padding: S.xs },
  tile: {
    height: 150,
    padding: S.lg,
    borderRadius: R.lg,
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
  },
  tileGlow: { position: 'absolute', width: 200, height: 200, borderRadius: 100, right: -90, top: -90 },
  empty: {
    alignItems: 'center',
    gap: S.sm,
    padding: S.xl,
    borderRadius: R.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.borderStrong,
  },
});
