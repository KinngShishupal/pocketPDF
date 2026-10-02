import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, C, R, S } from '@/constants/theme';
import type { Gradient, IconName } from '@/lib/tools';

export const tap = () => Haptics.selectionAsync().catch(() => {});

export function Screen({
  children,
  glow = Brand[0],
  glow2 = Brand[1],
}: {
  children: ReactNode;
  glow?: string;
  glow2?: string;
}) {
  return (
    <View style={styles.screen}>
      <View
        pointerEvents="none"
        style={[
          styles.orb,
          { top: -160, right: -140, experimental_backgroundImage: `radial-gradient(circle, ${glow}55 0%, ${glow}00 70%)` },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.orb,
          { top: 260, left: -220, experimental_backgroundImage: `radial-gradient(circle, ${glow2}30 0%, ${glow2}00 70%)` },
        ]}
      />
      {children}
    </View>
  );
}

export function Txt({
  children,
  variant = 'body',
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: keyof typeof textStyles;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text style={[textStyles[variant], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function IconBadge({
  icon,
  colors,
  size = 44,
  iconSize,
}: {
  icon: IconName;
  colors: Gradient;
  size?: number;
  iconSize?: number;
}) {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.badge, { width: size, height: size, borderRadius: size * 0.32 }]}>
      <Ionicons name={icon} size={iconSize ?? size * 0.5} color="#fff" />
    </LinearGradient>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  colors = Brand,
  disabled,
  loading,
  style,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  colors?: Gradient;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        { opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        style,
      ]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={20} color="#fff" />}
            <Text style={styles.primaryLabel}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({
  label,
  icon,
  onPress,
  tint = C.text,
  style,
  compact,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  tint?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.ghost,
        compact && styles.ghostCompact,
        { backgroundColor: pressed ? C.cardHi : C.card },
        style,
      ]}>
      {icon && <Ionicons name={icon} size={compact ? 16 : 18} color={tint} />}
      <Text style={[styles.ghostLabel, compact && { fontSize: 13 }, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  tint = C.text,
  size = 40,
  style,
}: {
  icon: IconName;
  onPress: () => void;
  tint?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      hitSlop={8}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: pressed ? C.cardHi : C.card },
        style,
      ]}>
      <Ionicons name={icon} size={size * 0.48} color={tint} />
    </Pressable>
  );
}

export function ToolHeader({
  title,
  subtitle,
  icon,
  colors,
  right,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  colors?: Gradient;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
      <IconButton icon="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.md }}>
        {icon && colors && <IconBadge icon={icon} colors={colors} size={38} />}
        <View style={{ flex: 1 }}>
          <Txt variant="h2">{title}</Txt>
          {subtitle && (
            <Txt variant="caption" numberOfLines={1}>
              {subtitle}
            </Txt>
          )}
        </View>
      </View>
      {right}
    </View>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionLabel}>
      <Txt variant="overline">{children}</Txt>
      {right}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accent = C.accent,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  accent?: string;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.segment, active && { backgroundColor: accent + '2E', borderColor: accent + '80' }]}>
            {o.icon && <Ionicons name={o.icon} size={16} color={active ? C.text : C.sub} />}
            <Text style={[styles.segmentLabel, active && { color: C.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Txt variant="caption">{label}</Txt>
      <View style={styles.stepperRow}>
        <IconButton icon="remove" size={34} onPress={() => onChange(Math.max(min, value - 1))} />
        <Text style={styles.stepperValue}>{value}</Text>
        <IconButton icon="add" size={34} onPress={() => onChange(Math.min(max, value + 1))} />
      </View>
    </View>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  accent = C.accent,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Txt variant="label">{label}</Txt>
        {hint && <Txt variant="caption">{hint}</Txt>}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          tap();
          onChange(v);
        }}
        trackColor={{ true: accent, false: C.surface2 }}
        thumbColor="#fff"
      />
    </View>
  );
}

/** Sticky bottom action area that respects the home indicator. */
export function Footer({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[C.bg + '00', C.bg, C.bg]}
      locations={[0, 0.35, 1]}
      style={[styles.footer, { paddingBottom: Math.max(insets.bottom, S.lg) }]}>
      {children}
    </LinearGradient>
  );
}

export const textStyles = StyleSheet.create({
  display: { color: C.text, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  h1: { color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  h2: { color: C.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  body: { color: C.sub, fontSize: 15, lineHeight: 21 },
  caption: { color: C.sub, fontSize: 13 },
  overline: { color: C.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },
  orb: { position: 'absolute', width: 520, height: 520, borderRadius: 260 },
  badge: { alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: R.lg,
    padding: S.lg,
  },
  primary: {
    height: 56,
    borderRadius: R.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.sm,
    paddingHorizontal: S.xl,
  },
  primaryLabel: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  ghost: {
    height: 48,
    borderRadius: R.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.sm,
    paddingHorizontal: S.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  ghostCompact: { height: 38, borderRadius: R.sm, paddingHorizontal: S.md },
  ghostLabel: { fontSize: 15, fontWeight: '600' },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    paddingHorizontal: S.lg,
    paddingBottom: S.md,
  },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: S.xl,
    marginBottom: S.md,
  },
  segmented: {
    flexDirection: 'row',
    gap: S.sm,
    padding: S.xs,
    borderRadius: R.md,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  segment: {
    flex: 1,
    height: 42,
    borderRadius: R.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentLabel: { color: C.sub, fontSize: 14, fontWeight: '600' },
  stepper: { flex: 1, gap: S.sm },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperValue: { color: C.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.lg, paddingTop: S.xxl },
});
