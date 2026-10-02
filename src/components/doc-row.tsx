import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { C, R, S } from '@/constants/theme';
import { formatBytes, formatDate } from '@/lib/fs';
import { thumbUri, type DocEntry } from '@/lib/library';
import { SOURCE_META } from '@/lib/tools';

import { IconBadge, Txt } from './ui';

export function DocThumb({ doc, size = 52 }: { doc: DocEntry; size?: number }) {
  const meta = SOURCE_META[doc.source];
  const thumb = thumbUri(doc);
  if (thumb) {
    return (
      <View style={[styles.thumb, { width: size * 0.8, height: size }]}>
        <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.thumbTag}>
          <Ionicons name={meta.icon} size={10} color="#fff" />
        </View>
      </View>
    );
  }
  return <IconBadge icon={meta.icon} colors={meta.colors} size={size} iconSize={size * 0.42} />;
}

export function DocRow({
  doc,
  onPress,
  onMore,
  selected,
}: {
  doc: DocEntry;
  onPress: () => void;
  onMore?: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: C.cardHi },
        selected && { borderColor: C.accent, backgroundColor: C.accent + '1A' },
      ]}>
      <DocThumb doc={doc} />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="label" numberOfLines={1}>
          {doc.name}
        </Txt>
        <Txt variant="caption" numberOfLines={1}>
          {formatBytes(doc.size)} · {doc.pages} {doc.pages === 1 ? 'page' : 'pages'} · {formatDate(doc.createdAt)}
        </Txt>
      </View>
      {selected !== undefined ? (
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={selected ? C.accent : C.faint}
        />
      ) : (
        onMore && (
          <Pressable hitSlop={12} onPress={onMore} style={styles.more}>
            <Ionicons name="ellipsis-horizontal" size={20} color={C.sub} />
          </Pressable>
        )
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  thumb: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  thumbTag: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: { padding: S.xs },
});
