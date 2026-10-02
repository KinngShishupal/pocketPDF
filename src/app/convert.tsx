import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { BusyOverlay } from '@/components/busy-overlay';
import { Card, Footer, PrimaryButton, Screen, SectionLabel, Segmented, ToggleRow, ToolHeader, Txt, tap } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { stampName } from '@/lib/fs';
import { saveDoc } from '@/lib/library';
import { imagesToPdf, type PageSize } from '@/lib/pdf';
import { pickImages, type PickedFile } from '@/lib/pickers';
import { TOOLS } from '@/lib/tools';
import { useTask } from '@/lib/use-task';

const tool = TOOLS.convert;
type Mode = 'images' | 'text';
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
  const [mode, setMode] = useState<Mode>(params.mode === 'text' ? 'text' : 'images');
  const [images, setImages] = useState<Img[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [quality, setQuality] = useState<Quality>('standard');
  const [margins, setMargins] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [font, setFont] = useState<TextStyleKey>('clean');
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

  const ready = mode === 'images' ? images.length > 0 : body.trim().length > 0;

  return (
    <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
      <ToolHeader title="Convert" subtitle="Create PDFs from photos or text" icon={tool.icon} colors={tool.colors} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Segmented
          value={mode}
          onChange={setMode}
          accent={tool.colors[0]}
          options={[
            { value: 'images', label: 'Photos → PDF', icon: 'images-outline' },
            { value: 'text', label: 'Text → PDF', icon: 'text-outline' },
          ]}
        />

        {mode === 'images' ? (
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
              value={body}
              onChangeText={setBody}
              placeholder="Type or paste your text. Blank lines start new paragraphs."
              placeholderTextColor={C.faint}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea]}
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
          label={mode === 'images' ? (images.length ? `Create PDF · ${images.length} pages` : 'Add photos first') : 'Create PDF'}
          icon="sparkles"
          colors={tool.colors}
          disabled={!ready}
          onPress={mode === 'images' ? convertImages : convertText}
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
