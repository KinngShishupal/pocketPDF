import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Brand, C, R, S } from '@/constants/theme';
import type { Gradient } from '@/lib/tools';

import { Txt } from './ui';

export function BusyOverlay({
  visible,
  label,
  progress,
  colors = Brand,
}: {
  visible: boolean;
  label: string;
  /** 0..1, or undefined for an indeterminate spinner. */
  progress?: number;
  colors?: Gradient;
}) {
  const spin = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      spin.value = 0;
      spin.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1);
    }
  }, [visible, spin]);

  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <Animated.View style={[styles.ringWrap, ring]}>
            <LinearGradient colors={[colors[0], colors[1], colors[0] + '00']} style={styles.ring} />
            <View style={styles.ringHole} />
          </Animated.View>
          <Txt variant="label" style={{ textAlign: 'center' }}>
            {label}
          </Txt>
          {progress !== undefined && (
            <View style={styles.track}>
              <LinearGradient
                colors={colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.fill, { width: `${Math.round(Math.min(1, progress) * 100)}%` }]}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(3,3,8,0.78)', alignItems: 'center', justifyContent: 'center' },
  box: {
    width: 240,
    padding: S.xl,
    gap: S.lg,
    alignItems: 'center',
    borderRadius: R.xl,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  ringWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 64, height: 64, borderRadius: 32 },
  ringHole: { position: 'absolute', width: 50, height: 50, borderRadius: 25, backgroundColor: C.surface },
  track: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
