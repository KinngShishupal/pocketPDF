import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { C, R, S } from '@/constants/theme';
import { FORMATS, extOf } from '@/lib/converters';
import type { ConvertItem } from '@/lib/convert-files';
import { formatBytes } from '@/lib/fs';

import { Txt } from './ui';

/** Showcase of every supported input format. */
export function FormatWall() {
  return (
    <View style={styles.wall}>
      {FORMATS.map((f, i) => (
        <Animated.View key={f.kind} entering={FadeInDown.delay(i * 25)} style={styles.fmt}>
          <View style={[styles.fmtIcon, { backgroundColor: f.color + '22' }]}>
            <Ionicons name={f.icon} size={18} color={f.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fmtLabel} numberOfLines={1}>
              {f.label}
            </Text>
            <Text style={styles.fmtExts} numberOfLines={1}>
              {f.note ?? f.exts.slice(0, 3).map((e) => `.${e}`).join(' ')}
            </Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

export function FileRow({ item, index, onRemove }: { item: ConvertItem; index: number; onRemove: () => void }) {
  const f = item.format;
  return (
    <Animated.View entering={FadeInDown.delay(index * 40)} exiting={FadeOut} layout={LinearTransition} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: f.color + '22' }]}>
        <Ionicons name={f.icon} size={22} color={f.color} />
        <Text style={[styles.ext, { color: f.color }]}>{extOf(item.name).toUpperCase().slice(0, 4)}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label" numberOfLines={1}>
          {item.name}
        </Txt>
        <Txt variant="caption" numberOfLines={1}>
          {f.label} · {formatBytes(item.size)}
          {f.note ? ` · ${f.note}` : ''}
        </Txt>
      </View>
      <Pressable hitSlop={10} onPress={onRemove}>
        <Ionicons name="close-circle" size={24} color={C.faint} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  fmt: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    padding: S.sm,
    borderRadius: R.sm,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  fmtIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fmtLabel: { color: C.text, fontSize: 13, fontWeight: '700' },
  fmtExts: { color: C.faint, fontSize: 11 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    padding: S.md,
    borderRadius: R.md,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  rowIcon: { width: 48, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 1 },
  ext: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
});
