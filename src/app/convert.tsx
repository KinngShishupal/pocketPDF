import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { BusyOverlay } from '@/components/busy-overlay';
import { FileRow, FormatWall } from '@/components/convert-files';
import { VoicePanel } from '@/components/voice-panel';
import { Card, Footer, GhostButton, PrimaryButton, Screen, SectionLabel, Segmented, ToggleRow, ToolHeader, Txt, tap } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { convertFiles, type ConvertItem, type Orientation, type Paper } from '@/lib/convert-files';
import { extOf, formatOf } from '@/lib/converters';
import { appendPhrase } from '@/lib/dictation';
import { stampName } from '@/lib/fs';
import { saveDoc } from '@/lib/library';
import { imagesToPdf, type PageSize } from '@/lib/pdf';
import { pickAnyFiles, pickImages, type PickedFile } from '@/lib/pickers';
import { TOOLS } from '@/lib/tools';
import { useTask } from '@/lib/use-task';

const tool = TOOLS.convert;
type Mode = 'files' | 'images' | 'text';
type Quality = 'high' | 'standard' | 'small';
type TextStyleKey = 'clean' | 'serif' | 'mono';

const QUALITY: Record<Quality, { maxDim: number; quality: number }> = {
  high: { maxDim: 2600, quality: 0.9 },
  standard: { maxDim: 1800, quality: 0.75 },
  small: { maxDim: 1200, quality: 0.55 },
};

const FONTS: Record<TextStyleKey, string> = {
  clean: "-apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "Menlo, 'Courier New', monospace",
};

type Img = PickedFile & { key: string; rotate: number };

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildHtml(title: string, body: string, style: TextStyleKey) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page { margin: 56px 60px; }
    body { font-family: ${FONTS[style]}; color: #1b1b28; font-size: ${style === 'mono' ? 12 : 13.5}px; line-height: 1.6; }
    h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.4px; }
    .rule { height: 4px; width: 56px; border-radius: 2px; background: linear-gradient(90deg, #3A86FF, #4CC9F0); margin: 10px 0 24px; }
    .date { color: #8a8aa0; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; }
    p { margin: 0 0 12px; white-space: normal; }
  </style></head><body>
    ${title ? `<h1>${escapeHtml(title)}</h1>` : ''}
    <div class="date">${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
    <div class="rule"></div>
    ${paragraphs}
  </body></html>`;
}

export default function Convert() {
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'text' || params.mode === 'images' ? params.mode : 'files');
  const [files, setFiles] = useState<ConvertItem[]>([]);
  const [paper, setPaper] = useState<Paper>('a4');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [combine, setCombine] = useState(false);
  const [images, setImages] = useState<Img[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [quality, setQuality] = useState<Quality>('standard');
  const [margins, setMargins] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [font, setFont] = useState<TextStyleKey>('clean');
  const bodyRef = useRef<TextInput>(null);
  const task = useTask();

  const addImages = async () => {
    const picked = await pickImages();
    setImages((cur) => [...cur, ...picked.map((p, i) => ({ ...p, key: `${Date.now()}-${i}`, rotate: 0 }))]);
  };

  const convertImages = async () => {
    const doc = await task.run('Building your PDF', async (report) => {
      const res = await imagesToPdf(
        images.map((i) => ({ uri: i.uri, rotate: i.rotate })),
        { pageSize, margin: margins ? 24 : 0, ...QUALITY[quality] },
        report,
      );
      return saveDoc({ name: stampName('Photos'), source: 'convert', pages: res.pages, bytes: res.bytes, thumbFrom: res.cover });
    });
    if (doc) router.replace({ pathname: '/result', params: { id: doc.id, note: `${images.length} photos converted.` } });
  };

  const convertText = async () => {
    const doc = await task.run('Typesetting', async () => {
      // expo-print may write outside the app sandbox (Expo Go on Android), so take the bytes as base64.
      const res = await Print.printToFileAsync({ html: buildHtml(title.trim(), body, font), width: 595, height: 842, base64: true });
      if (!res.base64) throw new Error('Could not generate the PDF.');
      return saveDoc({ name: title.trim() || stampName('Note'), source: 'convert', pages: res.numberOfPages, base64: res.base64 });
    });
    if (doc) router.replace({ pathname: '/result', params: { id: doc.id } });
  };

  const addFiles = async () => {
    const picked = await pickAnyFiles();
    const accepted: ConvertItem[] = [];
    const skipped: string[] = [];
    for (const p of picked) {
      const format = formatOf(p.name);
      if (format) accepted.push({ ...p, key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, format });
      else skipped.push(extOf(p.name) === 'pdf' ? `${p.name} (already a PDF)` : p.name);
    }
    setFiles((cur) => [...cur, ...accepted]);
    if (skipped.length) Alert.alert('Some files were skipped', `These formats aren't supported:\n\n${skipped.join('\n')}`);
  };

  const convertDocuments = async () => {
    const res = await task.run(files.length > 1 ? `Converting ${files.length} files` : 'Converting file', (report) =>
      convertFiles(files, { paper, orientation, combine }, report),
    );
    if (!res) return;
    if (res.failures.length) {
      Alert.alert(
        res.docs.length ? 'Some files failed' : 'Conversion failed',
        res.failures.map((x) => `• ${x.name}\n  ${x.message}`).join('\n\n'),
      );
    }
    if (!res.docs.length) return;
    const n = res.docs.length;
    const ok = files.length - res.failures.length;
    router.replace({
      pathname: '/result',
      params: {
        id: res.docs[0].id,
        count: n > 1 ? String(n) : undefined,
        note:
          combine && files.length > 1
            ? `${ok} files combined into one PDF.`
            : n > 1
              ? `${n} PDFs saved to Files.`
              : `Converted from ${files[0].format.label}.`,
      },
    });
  };

  const ready = mode === 'files' ? files.length > 0 : mode === 'images' ? images.length > 0 : body.trim().length > 0;

  return (
    <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
      <ToolHeader title="Convert" subtitle="Documents, photos or text to PDF" icon={tool.icon} colors={tool.colors} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Segmented
          value={mode}
          onChange={setMode}
          accent={tool.colors[0]}
          options={[
            { value: 'files', label: 'Files', icon: 'documents-outline' },
            { value: 'images', label: 'Photos', icon: 'images-outline' },
            { value: 'text', label: 'Write', icon: 'create-outline' },
          ]}
        />

        {mode === 'files' ? (
          <Animated.View entering={FadeIn} key="files">
            <SectionLabel right={files.length > 0 && <Txt variant="caption">{files.length} {files.length === 1 ? 'file' : 'files'}</Txt>}>
              {files.length ? 'Ready to convert' : 'Supported formats'}
            </SectionLabel>
            {files.length === 0 ? (
              <FormatWall />
            ) : (
              <View style={{ gap: S.sm }}>
                {files.map((item, i) => (
                  <FileRow key={item.key} item={item} index={i} onRemove={() => setFiles((cur) => cur.filter((x) => x.key !== item.key))} />
                ))}
              </View>
            )}
            <GhostButton
              icon="add-circle-outline"
              label={files.length ? 'Add more files' : 'Choose files'}
              tint={tool.colors[1]}
              onPress={addFiles}
              style={{ marginTop: S.md, borderStyle: 'dashed', borderColor: tool.colors[0] + '88' }}
            />

            {files.length > 0 && (
              <>
                <SectionLabel>Paper</SectionLabel>
                <Segmented
                  value={paper}
                  onChange={setPaper}
                  accent={tool.colors[0]}
                  options={[
                    { value: 'a4', label: 'A4' },
                    { value: 'letter', label: 'Letter' },
                  ]}
                />
                <SectionLabel right={<Txt variant="caption">Auto: sheets and slides go wide</Txt>}>Orientation</SectionLabel>
                <Segmented
                  value={orientation}
                  onChange={setOrientation}
                  accent={tool.colors[0]}
                  options={[
                    { value: 'auto', label: 'Auto', icon: 'sparkles-outline' },
                    { value: 'portrait', label: 'Portrait', icon: 'phone-portrait-outline' },
                    { value: 'landscape', label: 'Landscape', icon: 'phone-landscape-outline' },
                  ]}
                />
                {files.length > 1 && (
                  <Card style={{ marginTop: S.md, paddingVertical: S.sm }}>
                    <ToggleRow
                      label="Combine into one PDF"
                      hint="In the order listed above"
                      value={combine}
                      onChange={setCombine}
                      accent={tool.colors[0]}
                    />
                  </Card>
                )}
              </>
            )}
          </Animated.View>
        ) : mode === 'images' ? (
          <Animated.View entering={FadeIn} key="images">
            <SectionLabel right={images.length > 0 && <Txt variant="caption">Tap a photo to rotate</Txt>}>
              {`Photos · ${images.length}`}
            </SectionLabel>
            <View style={styles.grid}>
              {images.map((img, i) => (
                <Animated.View key={img.key} entering={FadeInDown.delay(i * 30)} layout={LinearTransition} style={styles.cell}>
                  <Pressable
                    onPress={() => {
                      tap();
                      setImages((cur) => cur.map((x) => (x.key === img.key ? { ...x, rotate: (x.rotate + 90) % 360 } : x)));
                    }}
                    style={styles.imgWrap}>
                    <Image source={{ uri: img.uri }} style={[styles.img, { transform: [{ rotate: `${img.rotate}deg` }] }]} contentFit="contain" />
                    <View style={styles.pageNo}>
                      <Txt variant="caption" style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                        {i + 1}
                      </Txt>
                    </View>
                    <Pressable
                      hitSlop={8}
                      style={styles.remove}
                      onPress={() => setImages((cur) => cur.filter((x) => x.key !== img.key))}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </Pressable>
                </Animated.View>
              ))}
              <View style={styles.cell}>
                <Pressable onPress={addImages} style={[styles.imgWrap, styles.addTile]}>
                  <Ionicons name="add" size={30} color={tool.colors[1]} />
                  <Txt variant="caption" style={{ color: tool.colors[1], fontWeight: '700' }}>
                    Add photos
                  </Txt>
                </Pressable>
              </View>
            </View>

            <SectionLabel>Page size</SectionLabel>
            <Segmented
              value={pageSize}
              onChange={setPageSize}
              accent={tool.colors[0]}
              options={[
                { value: 'a4', label: 'A4' },
                { value: 'letter', label: 'Letter' },
                { value: 'fit', label: 'Fit photo' },
              ]}
            />
            <SectionLabel>Quality</SectionLabel>
            <Segmented
              value={quality}
              onChange={setQuality}
              accent={tool.colors[0]}
              options={[
                { value: 'high', label: 'High' },
                { value: 'standard', label: 'Standard' },
                { value: 'small', label: 'Small' },
              ]}
            />
            <Card style={{ marginTop: S.md, paddingVertical: S.sm }}>
              <ToggleRow label="Page margins" hint="White border around each photo" value={margins} onChange={setMargins} accent={tool.colors[0]} />
            </Card>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn} key="text">
            <SectionLabel>Title</SectionLabel>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Meeting notes"
              placeholderTextColor={C.faint}
              style={styles.input}
            />
            <SectionLabel right={<Txt variant="caption">{body.length} chars</Txt>}>Content</SectionLabel>
            <TextInput
              ref={bodyRef}
              value={body}
              onChangeText={setBody}
              placeholder="Type, paste, or tap the mic below and speak. Blank lines start new paragraphs."
              placeholderTextColor={C.faint}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea]}
            />
            <VoicePanel
              colors={tool.colors}
              onPhrase={(phrase) => setBody((b) => appendPhrase(b, phrase))}
              onFallback={() => bodyRef.current?.focus()}
            />
            <SectionLabel>Typeface</SectionLabel>
            <Segmented
              value={font}
              onChange={setFont}
              accent={tool.colors[0]}
              options={[
                { value: 'clean', label: 'Clean' },
                { value: 'serif', label: 'Serif' },
                { value: 'mono', label: 'Mono' },
              ]}
            />
          </Animated.View>
        )}
      </ScrollView>
      <Footer>
        <PrimaryButton
          label={
            mode === 'files'
              ? files.length
                ? `Convert ${files.length} ${files.length === 1 ? 'file' : 'files'}${combine && files.length > 1 ? ' into 1 PDF' : ''}`
                : 'Choose files first'
              : mode === 'images'
                ? images.length
                  ? `Create PDF · ${images.length} pages`
                  : 'Add photos first'
                : 'Create PDF'
          }
          icon="sparkles"
          colors={tool.colors}
          disabled={!ready}
          onPress={mode === 'files' ? convertDocuments : mode === 'images' ? convertImages : convertText}
        />
      </Footer>
      <BusyOverlay visible={task.busy} label={task.label} progress={task.progress} colors={tool.colors} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: S.lg, paddingBottom: 140 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -S.xs },
  cell: { width: '33.333%', padding: S.xs },
  imgWrap: {
    aspectRatio: 0.75,
    borderRadius: R.sm,
    backgroundColor: C.surface2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: { width: '100%', height: '100%' },
  addTile: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: tool.colors[0] + '66', backgroundColor: tool.colors[0] + '10', gap: 4 },
  pageNo: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  remove: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  input: {
    minHeight: 52,
    borderRadius: R.md,
    paddingHorizontal: S.lg,
    paddingVertical: S.md,
    color: C.text,
    fontSize: 16,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  textarea: { minHeight: 220, lineHeight: 22 },
});
