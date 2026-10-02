import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { C, R, S } from '@/constants/theme';
import { DICTATION_LANGS, useDictation } from '@/lib/dictation';
import type { Gradient } from '@/lib/tools';

import { Txt, tap } from './ui';

export function VoicePanel({
  colors,
  onPhrase,
  onFallback,
}: {
  colors: Gradient;
  onPhrase: (text: string) => void;
  /** Called in Expo Go, where live dictation isn't available (e.g. focus the text box). */
  onFallback: () => void;
}) {
  const [lang, setLang] = useState<string>(DICTATION_LANGS[0].code);
  const [picking, setPicking] = useState(false);
  const { available, listening, partial, level, start, stop } = useDictation(onPhrase);

  const pulse = useSharedValue(0);
  const vol = useSharedValue(0);
  useEffect(() => {
    if (listening) pulse.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1));
    else pulse.set(withTiming(0, { duration: 200 }));
  }, [listening, pulse]);
  useEffect(() => {
    vol.set(withSpring(level, { damping: 14, stiffness: 180 }));
  }, [level, vol]);

  const ring = useAnimatedStyle(() => ({
    opacity: listening ? 0.55 * (1 - pulse.value) : 0,
    transform: [{ scale: 1 + pulse.value * 0.9 }],
  }));
  const core = useAnimatedStyle(() => ({ transform: [{ scale: 1 + vol.value * 0.25 }] }));

  const langLabel = DICTATION_LANGS.find((l) => l.code === lang)?.label ?? lang;

  const toggle = () => {
    tap();
    if (!available) {
      Alert.alert(
        'Use your keyboard mic',
        'Live voice typing needs a development build of 1TapPDF (it isn\'t included in Expo Go).\n\nFor now, tap the 🎤 on your keyboard to dictate into the text box.',
        [{ text: 'Got it', onPress: onFallback }],
      );
      return;
    }
    if (listening) stop();
    else start(lang);
  };

  return (
    <View style={[styles.wrap, listening && { borderColor: colors[0] + '99' }]}>
      <View style={styles.row}>
        <Pressable onPress={toggle} hitSlop={6} style={styles.micWrap}>
          <Animated.View style={[styles.ring, { borderColor: colors[0] }, ring]} />
          <Animated.View style={core}>
            <LinearGradient
              colors={listening ? [C.danger, '#FF8A9E'] : colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.mic}>
              <Ionicons name={listening ? 'stop' : 'mic'} size={listening ? 20 : 24} color="#fff" />
            </LinearGradient>
          </Animated.View>
        </Pressable>

        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label">{listening ? 'Listening…' : 'Speak to type'}</Txt>
          <Txt variant="caption" numberOfLines={2}>
            {listening
              ? 'Say "new paragraph" or "new line". Tap stop when done.'
              : available
                ? 'Your words are added to the end of the text.'
                : 'Tap to dictate with your keyboard mic.'}
          </Txt>
        </View>

        {available && (
          <Pressable
            disabled={listening}
            onPress={() => {
              tap();
              setPicking(true);
            }}
            style={[styles.lang, listening && { opacity: 0.4 }]}>
            <Ionicons name="language" size={14} color={C.sub} />
            <Text style={styles.langText} numberOfLines={1}>
              {langLabel}
            </Text>
          </Pressable>
        )}
      </View>

      {listening && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.live}>
          <View style={styles.bars}>
            {[0.5, 0.9, 0.65, 1, 0.75].map((h, i) => (
              <Bar key={i} weight={h} level={level} color={colors[0]} />
            ))}
          </View>
          <Text style={[styles.partial, !partial && { color: C.faint }]} numberOfLines={3}>
            {partial || 'Start speaking…'}
          </Text>
        </Animated.View>
      )}

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)}>
          <View style={styles.sheet}>
            <Txt variant="h2" style={{ marginBottom: S.sm }}>
              Dictation language
            </Txt>
            {DICTATION_LANGS.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => {
                  tap();
                  setLang(l.code);
                  setPicking(false);
                }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: C.cardHi }]}>
                <Txt variant="label" style={{ flex: 1 }}>
                  {l.label}
                </Txt>
                {l.code === lang && <Ionicons name="checkmark-circle" size={22} color={colors[0]} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Bar({ weight, level, color }: { weight: number; level: number; color: string }) {
  const h = useSharedValue(4);
  useEffect(() => {
    h.set(withSpring(4 + level * 18 * weight, { damping: 12, stiffness: 200 }));
  }, [level, weight, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: S.md,
    padding: S.md,
    gap: S.md,
    borderRadius: R.lg,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  micWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 2 },
  mic: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  lang: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 120,
    height: 32,
    paddingHorizontal: S.sm,
    borderRadius: 16,
    backgroundColor: C.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  langText: { color: C.text, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    padding: S.md,
    borderRadius: R.md,
    backgroundColor: C.surface2,
  },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 24, width: 30 },
  bar: { width: 3, borderRadius: 2 },
  partial: { flex: 1, color: C.text, fontSize: 15, fontStyle: 'italic', lineHeight: 21 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: S.xl },
  sheet: {
    padding: S.lg,
    borderRadius: R.xl,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: S.md, paddingHorizontal: S.sm, borderRadius: R.sm },
});
