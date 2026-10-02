import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, R, S } from '@/constants/theme';
import { formatBytes } from '@/lib/fs';
import { deleteDoc, docUri, renameDoc, type DocEntry } from '@/lib/library';
import { previewFile, shareFile } from '@/lib/pickers';
import { TOOLS, type IconName, type ToolKey } from '@/lib/tools';

import { DocThumb } from './doc-row';
import { PrimaryButton, Txt, tap } from './ui';

const NEXT_TOOLS: ToolKey[] = ['edit', 'sign', 'compress', 'split', 'merge'];

export function DocActions({ doc, onClose }: { doc: DocEntry | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');

  if (!doc) return null;

  const close = () => {
    setRenaming(false);
    onClose();
  };

  const act = (fn: () => void) => () => {
    tap();
    close();
    // Let the sheet finish dismissing before presenting system UI.
    setTimeout(fn, 250);
  };

  const confirmDelete = () =>
    Alert.alert('Delete document?', `"${doc.name}" will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(doc.id) },
    ]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + S.lg }]}>
            <View style={styles.grabber} />
            <View style={styles.head}>
              <DocThumb doc={doc} size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="h2" numberOfLines={2}>
                  {doc.name}
                </Txt>
                <Txt variant="caption">
                  {formatBytes(doc.size)} · {doc.pages} {doc.pages === 1 ? 'page' : 'pages'}
                </Txt>
              </View>
            </View>

            {renaming ? (
              <View style={{ gap: S.md }}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  selectTextOnFocus
                  placeholder="Document name"
                  placeholderTextColor={C.faint}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    renameDoc(doc.id, name);
                    close();
                  }}
                />
                <PrimaryButton
                  label="Save name"
                  icon="checkmark"
                  disabled={!name.trim()}
                  onPress={() => {
                    renameDoc(doc.id, name);
                    close();
                  }}
                />
              </View>
            ) : (
              <>
                <View style={styles.quickRow}>
                  <Quick icon="share-outline" label="Share" onPress={act(() => shareFile(docUri(doc)))} />
                  <Quick icon="eye-outline" label="Preview" onPress={act(() => previewFile(docUri(doc)))} />
                  <Quick
                    icon="pencil-outline"
                    label="Rename"
                    onPress={() => {
                      tap();
                      setName(doc.name);
                      setRenaming(true);
                    }}
                  />
                  <Quick icon="trash-outline" label="Delete" tint={C.danger} onPress={act(confirmDelete)} />
                </View>
                <Txt variant="overline" style={{ marginTop: S.lg, marginBottom: S.sm }}>
                  Continue with
                </Txt>
                <View style={styles.toolRow}>
                  {NEXT_TOOLS.map((k) => {
                    const t = TOOLS[k];
                    return (
                      <Pressable
                        key={k}
                        onPress={act(() => router.push({ pathname: t.route, params: { docId: doc.id } }))}
                        style={({ pressed }) => [styles.toolChip, pressed && { backgroundColor: C.cardHi }]}>
                        <Ionicons name={t.icon} size={16} color={t.colors[0]} />
                        <Txt variant="label" style={{ fontSize: 14 }}>
                          {t.title}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function Quick({ icon, label, onPress, tint = C.text }: { icon: IconName; label: string; onPress: () => void; tint?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { backgroundColor: C.cardHi }]}>
      <Ionicons name={icon} size={22} color={tint} />
      <Txt variant="caption" style={{ color: tint }}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    paddingHorizontal: S.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.borderStrong, marginTop: S.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.lg },
  quickRow: { flexDirection: 'row', gap: S.sm },
  quick: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: S.md,
    borderRadius: R.md,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: S.md,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  input: {
    height: 52,
    borderRadius: R.md,
    paddingHorizontal: S.lg,
    color: C.text,
    fontSize: 16,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
});
