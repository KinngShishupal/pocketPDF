import { useState } from 'react';
import { FlatList, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, R, S } from '@/constants/theme';
import { useDocs, type DocEntry } from '@/lib/library';

import { DocRow } from './doc-row';
import { IconButton, PrimaryButton, Txt } from './ui';

export function LibraryPicker({
  visible,
  multiple,
  onClose,
  onSelect,
}: {
  visible: boolean;
  multiple?: boolean;
  onClose: () => void;
  onSelect: (docs: DocEntry[]) => void;
}) {
  const docs = useDocs();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string[]>([]);

  const close = () => {
    setPicked([]);
    onClose();
  };

  const toggle = (doc: DocEntry) => {
    if (!multiple) {
      onSelect([doc]);
      close();
      return;
    }
    setPicked((p) => (p.includes(doc.id) ? p.filter((id) => id !== doc.id) : [...p, doc.id]));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + S.lg }]}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Txt variant="h2">From 1TapPDF</Txt>
              <Txt variant="caption">{multiple ? 'Tap files in the order you want them' : 'Choose a document'}</Txt>
            </View>
            <IconButton icon="close" onPress={close} />
          </View>
          <FlatList
            data={docs}
            keyExtractor={(d) => d.id}
            contentContainerStyle={{ gap: S.sm, paddingBottom: S.lg }}
            ListEmptyComponent={
              <Txt style={{ textAlign: 'center', paddingVertical: S.xxl }}>
                No documents yet. Scan or import one first.
              </Txt>
            }
            renderItem={({ item }) => (
              <DocRow
                doc={item}
                onPress={() => toggle(item)}
                selected={multiple ? picked.includes(item.id) : undefined}
              />
            )}
          />
          {multiple && (
            <PrimaryButton
              label={picked.length ? `Add ${picked.length} ${picked.length === 1 ? 'file' : 'files'}` : 'Select files'}
              disabled={!picked.length}
              onPress={() => {
                onSelect(picked.map((id) => docs.find((d) => d.id === id)!).filter(Boolean));
                close();
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '82%',
    backgroundColor: C.surface,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    paddingHorizontal: S.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.borderStrong, marginTop: S.sm },
  head: { flexDirection: 'row', alignItems: 'center', paddingVertical: S.lg },
});
