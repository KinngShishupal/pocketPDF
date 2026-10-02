import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { C, R, S } from '@/constants/theme';
import { formatBytes } from '@/lib/fs';
import { fromDoc, pickPdfs, type PickedFile } from '@/lib/pickers';
import type { Gradient } from '@/lib/tools';

import { LibraryPicker } from './library-picker';
import { GhostButton, IconBadge, Txt, tap } from './ui';

/** Single-PDF chooser: device files or the in-app library. */
export function FileSlot({
  file,
  onChange,
  colors,
  meta,
}: {
  file: PickedFile | null;
  onChange: (file: PickedFile | null) => void;
  colors: Gradient;
  meta?: string;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);

  const fromDevice = async () => {
    const [picked] = await pickPdfs(false);
    if (picked) onChange(picked);
  };

  return (
    <>
      {file ? (
        <Animated.View entering={FadeIn} style={[styles.filled, { borderColor: colors[0] + '66' }]}>
          <IconBadge icon="document-text" colors={colors} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="label" numberOfLines={1}>
              {file.name}
            </Txt>
            <Txt variant="caption">
              {[file.size ? formatBytes(file.size) : null, meta].filter(Boolean).join(' · ') || 'PDF document'}
            </Txt>
          </View>
          <Pressable
            hitSlop={10}
            onPress={() => {
              tap();
              onChange(null);
            }}>
            <Ionicons name="close-circle" size={24} color={C.faint} />
          </Pressable>
        </Animated.View>
      ) : (
        <View style={[styles.empty, { borderColor: colors[0] + '55' }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors[0] + '1F' }]}>
            <Ionicons name="cloud-upload-outline" size={30} color={colors[0]} />
          </View>
          <Txt variant="label">Choose a PDF</Txt>
          <Txt variant="caption" style={{ textAlign: 'center' }}>
            Pick from your device or your 1TapPDF library
          </Txt>
          <View style={styles.actions}>
            <GhostButton icon="folder-open-outline" label="Device" onPress={fromDevice} style={{ flex: 1 }} />
            <GhostButton icon="albums-outline" label="Library" onPress={() => setLibraryOpen(true)} style={{ flex: 1 }} />
          </View>
        </View>
      )}
      <LibraryPicker
        visible={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={([doc]) => doc && onChange(fromDoc(doc))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: S.sm,
    padding: S.xl,
    borderRadius: R.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    backgroundColor: C.card,
  },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: S.xs },
  actions: { flexDirection: 'row', gap: S.sm, marginTop: S.md, alignSelf: 'stretch' },
  filled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    padding: S.md,
    borderRadius: R.lg,
    borderWidth: 1,
    backgroundColor: C.card,
  },
});
