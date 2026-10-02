import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { Alert, Platform } from 'react-native';

import { writeFile } from './fs';
import { docUri, type DocEntry } from './library';

export type PickedFile = {
  uri: string;
  name: string;
  size?: number;
  kind: 'pdf' | 'image';
  docId?: string;
  width?: number;
  height?: number;
};

export function fromDoc(doc: DocEntry): PickedFile {
  return { uri: docUri(doc), name: doc.name, size: doc.size, kind: 'pdf', docId: doc.id };
}

const pickedDir = new Directory(Paths.cache, 'picked');

/** Drops document copies from previous sessions. */
export function clearPicked() {
  try {
    if (pickedDir.exists) pickedDir.delete();
  } catch {
    // Stale cache files are harmless.
  }
}

/**
 * Copies a picked document into a cache folder this app owns. The picker's own
 * cache copy can sit outside the app's sandbox (e.g. in Expo Go on Android),
 * where expo-file-system refuses to read it; content:// URIs are always readable.
 */
async function adopt(uri: string, ext = 'pdf') {
  if (!pickedDir.exists) pickedDir.create({ intermediates: true });
  const target = new File(pickedDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  writeFile(target, await new File(uri).bytes());
  return target;
}

export async function pickPdfs(multiple: boolean): Promise<PickedFile[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple,
    // On Android, read straight from the content:// URI instead of the picker's cache copy.
    copyToCacheDirectory: Platform.OS !== 'android',
  });
  if (res.canceled) return [];
  const files: PickedFile[] = [];
  for (const a of res.assets) {
    try {
      const local = await adopt(a.uri);
      files.push({ uri: local.uri, name: a.name.replace(/\.pdf$/i, ''), size: local.size, kind: 'pdf' });
    } catch (e) {
      Alert.alert(`Couldn't open "${a.name}"`, e instanceof Error ? e.message : String(e));
    }
  }
  return files;
}

export type PickedAny = { uri: string; name: string; size: number };

/** Picks documents of any type (for conversion), copied into the app's own cache. */
export async function pickAnyFiles(): Promise<PickedAny[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: true,
    copyToCacheDirectory: Platform.OS !== 'android',
  });
  if (res.canceled) return [];
  const files: PickedAny[] = [];
  for (const a of res.assets) {
    try {
      const ext = a.name.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? 'bin';
      const local = await adopt(a.uri, ext);
      files.push({ uri: local.uri, name: a.name, size: local.size });
    } catch (e) {
      Alert.alert(`Couldn't open "${a.name}"`, e instanceof Error ? e.message : String(e));
    }
  }
  return files;
}

export async function pickImages(limit = 0): Promise<PickedFile[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 1,
  });
  if (res.canceled) return [];
  return res.assets.map((a, i) => ({
    uri: a.uri,
    name: a.fileName ?? `Image ${i + 1}`,
    size: a.fileSize,
    kind: 'image',
    width: a.width,
    height: a.height,
  }));
}

export async function shareFile(uri: string) {
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert('Sharing unavailable', 'Sharing is not supported on this device.');
    return;
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share PDF' });
}

export async function previewFile(uri: string) {
  try {
    await Print.printAsync({ uri });
  } catch {
    // User dismissed the preview.
  }
}
