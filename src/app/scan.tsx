import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View, type LayoutRectangle } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BusyOverlay } from '@/components/busy-overlay';
import { Footer, GhostButton, IconBadge, IconButton, PrimaryButton, Screen, SectionLabel, Segmented, ToolHeader, Txt, tap } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { stampName } from '@/lib/fs';
import { saveDoc } from '@/lib/library';
import { imagesToPdf } from '@/lib/pdf';
import { pickImages } from '@/lib/pickers';
import { TOOLS } from '@/lib/tools';
import { useTask } from '@/lib/use-task';

const tool = TOOLS.scan;
const A4 = 1.414;

type ScanPage = { key: string; uri: string; rotate: number };
type Rect = { x: number; y: number; w: number; h: number };

function frameFor(layout: LayoutRectangle | null): Rect | null {
  if (!layout) return null;
  let w = layout.width * 0.84;
  let h = w * A4;
  const maxH = layout.height * 0.62;
  if (h > maxH) {
    h = maxH;
    w = h / A4;
  }
  return { x: (layout.width - w) / 2, y: (layout.height - h) / 2 - 24, w, h };
}

/** Maps the on-screen guide frame onto the captured photo, assuming the preview fills the view ("cover"). */
async function cropToFrame(uri: string, pw: number, ph: number, layout: LayoutRectangle, frame: Rect) {
  if (pw > ph !== layout.width > layout.height) return uri;
  const scale = Math.max(layout.width / pw, layout.height / ph);
  const offX = (pw * scale - layout.width) / 2;
  const offY = (ph * scale - layout.height) / 2;
  const pad = 12; // a little breathing room around the guide
  const originX = Math.max(0, (frame.x - pad + offX) / scale);
  const originY = Math.max(0, (frame.y - pad + offY) / scale);
  const width = Math.min(pw - originX, (frame.w + pad * 2) / scale);
  const height = Math.min(ph - originY, (frame.h + pad * 2) / scale);
  const ref = await ImageManipulator.manipulate(uri).crop({ originX, originY, width, height }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
  return out.uri;
}

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [reviewing, setReviewing] = useState(false);

  const addPages = (uris: string[]) =>
    setPages((cur) => [...cur, ...uris.map((uri, i) => ({ key: `${Date.now()}-${i}`, uri, rotate: 0 }))]);

  if (reviewing || (permission && !permission.granted && pages.length > 0)) {
    return <Review pages={pages} setPages={setPages} onAddMore={() => setReviewing(false)} canUseCamera={!!permission?.granted} />;
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
        <ToolHeader title="Scan" />
        <View style={styles.permission}>
          <Animated.View entering={ZoomIn.springify()}>
            <IconBadge icon="camera" colors={tool.colors} size={96} />
          </Animated.View>
          <Txt variant="h1" style={{ textAlign: 'center' }}>
            Camera access
          </Txt>
          <Txt style={{ textAlign: 'center' }}>
            1TapPDF uses your camera to capture documents. Photos stay on your device.
          </Txt>
          <PrimaryButton
            label={permission.canAskAgain ? 'Allow camera' : 'Open settings'}
            icon="camera-outline"
            colors={tool.colors}
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
            style={{ alignSelf: 'stretch', marginTop: S.lg }}
          />
          <GhostButton
            label="Import photos instead"
            icon="images-outline"
            onPress={async () => {
              const picked = await pickImages();
              if (picked.length) {
                addPages(picked.map((p) => p.uri));
                setReviewing(true);
              }
            }}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Camera
      pages={pages}
      onCapture={(uri) => addPages([uri])}
      onImport={addPages}
      onDone={() => setReviewing(true)}
    />
  );
}

function Camera({
  pages,
  onCapture,
  onImport,
  onDone,
}: {
  pages: ScanPage[];
  onCapture: (uri: string) => void;
  onImport: (uris: string[]) => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [layout, setLayout] = useState<LayoutRectangle | null>(null);
  const [torch, setTorch] = useState(false);
  const [autoCrop, setAutoCrop] = useState(true);
  const [busy, setBusy] = useState(false);
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const frame = frameFor(layout);
  const last = pages[pages.length - 1];

  const capture = async () => {
    if (busy || !camera.current || !layout || !frame) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    flash.set(withSequence(withTiming(0.85, { duration: 60 }), withTiming(0, { duration: 260 })));
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9 });
      const uri = autoCrop ? await cropToFrame(photo.uri, photo.width, photo.height, layout, frame) : photo.uri;
      onCapture(uri);
    } catch {
      // Capture can fail if the camera is still warming up; the user can just tap again.
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.camRoot} onLayout={(e) => setLayout(e.nativeEvent.layout)}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} />

      {frame && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {/* Dimmed surround */}
          <View style={[styles.dim, { top: 0, left: 0, right: 0, height: frame.y }]} />
          <View style={[styles.dim, { top: frame.y + frame.h, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.dim, { top: frame.y, left: 0, width: frame.x, height: frame.h }]} />
          <View style={[styles.dim, { top: frame.y, right: 0, width: frame.x, height: frame.h }]} />
          {/* Corner brackets */}
          {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
            <View
              key={c}
              style={[
                styles.corner,
                {
                  left: c[1] === 'l' ? frame.x - 3 : frame.x + frame.w - 31,
                  top: c[0] === 't' ? frame.y - 3 : frame.y + frame.h - 31,
                  borderLeftWidth: c[1] === 'l' ? 4 : 0,
                  borderRightWidth: c[1] === 'r' ? 4 : 0,
                  borderTopWidth: c[0] === 't' ? 4 : 0,
                  borderBottomWidth: c[0] === 'b' ? 4 : 0,
                  borderTopLeftRadius: c === 'tl' ? 14 : 0,
                  borderTopRightRadius: c === 'tr' ? 14 : 0,
                  borderBottomLeftRadius: c === 'bl' ? 14 : 0,
                  borderBottomRightRadius: c === 'br' ? 14 : 0,
                },
              ]}
            />
          ))}
          <View style={[styles.hint, { top: frame.y + frame.h + S.lg }]}>
            <Txt variant="caption" style={{ color: '#fff', fontWeight: '600' }}>
              {autoCrop ? 'Fit the page inside the frame' : 'Full photo will be kept'}
            </Txt>
          </View>
        </View>
      )}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashStyle]} />

      <View style={[styles.camTop, { paddingTop: insets.top + S.sm }]}>
        <IconButton icon="close" onPress={() => router.back()} style={styles.glass} />
        <View style={styles.pill}>
          <Ionicons name="document-text" size={14} color="#fff" />
          <Txt variant="caption" style={{ color: '#fff', fontWeight: '700' }}>
            {pages.length ? `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}` : 'Document'}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <IconButton
            icon={autoCrop ? 'crop' : 'expand'}
            onPress={() => setAutoCrop((v) => !v)}
            tint={autoCrop ? tool.colors[1] : '#fff'}
            style={styles.glass}
          />
          <IconButton
            icon={torch ? 'flash' : 'flash-off'}
            onPress={() => setTorch((v) => !v)}
            tint={torch ? '#FFD166' : '#fff'}
            style={styles.glass}
          />
        </View>
      </View>

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
        style={[styles.camBottom, { paddingBottom: insets.bottom + S.xl }]}>
        <Pressable
          onPress={async () => {
            tap();
            const picked = await pickImages();
            if (picked.length) onImport(picked.map((p) => p.uri));
          }}
          style={styles.sideBtn}>
          <Ionicons name="images" size={24} color="#fff" />
        </Pressable>

        <Pressable onPress={capture} style={({ pressed }) => [styles.shutterOuter, pressed && { transform: [{ scale: 0.92 }] }]}>
          <LinearGradient colors={tool.colors} style={styles.shutter} />
        </Pressable>

        <Pressable
          disabled={!pages.length}
          onPress={() => {
            tap();
            onDone();
          }}
          style={[styles.sideBtn, { opacity: pages.length ? 1 : 0.35 }]}>
          {last ? (
            <Animated.View key={last.key} entering={ZoomIn.springify()} style={styles.lastWrap}>
              <Image source={{ uri: last.uri }} style={styles.last} contentFit="cover" />
              <View style={[styles.count, { backgroundColor: tool.colors[0] }]}>
                <Txt variant="caption" style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                  {pages.length}
                </Txt>
              </View>
            </Animated.View>
          ) : (
            <Ionicons name="checkmark" size={26} color="#fff" />
          )}
        </Pressable>
      </LinearGradient>
    </View>
  );
}

type Quality = 'color' | 'compact';

function Review({
  pages,
  setPages,
  onAddMore,
  canUseCamera,
}: {
  pages: ScanPage[];
  setPages: React.Dispatch<React.SetStateAction<ScanPage[]>>;
  onAddMore: () => void;
  canUseCamera: boolean;
}) {
  const [name, setName] = useState(() => stampName('Scan'));
  const [quality, setQuality] = useState<Quality>('color');
  const task = useTask();

  const create = async () => {
    const doc = await task.run('Creating PDF', async (report) => {
      const res = await imagesToPdf(
        pages.map((p) => ({ uri: p.uri, rotate: p.rotate })),
        { pageSize: 'fit', margin: 0, ...(quality === 'color' ? { maxDim: 2200, quality: 0.8 } : { maxDim: 1500, quality: 0.6 }) },
        report,
      );
      return saveDoc({ name, source: 'scan', pages: res.pages, bytes: res.bytes, thumbFrom: res.cover });
    });
    if (doc) router.replace({ pathname: '/result', params: { id: doc.id } });
  };

  return (
    <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
      <ToolHeader
        title="Review scan"
        subtitle={`${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · tap to rotate`}
        icon={tool.icon}
        colors={tool.colors}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={styles.grid}>
          {pages.map((p, i) => (
            <Animated.View key={p.key} entering={FadeInDown.delay(i * 40)} layout={LinearTransition} style={styles.cell}>
              <Pressable
                onPress={() => {
                  tap();
                  setPages((cur) => cur.map((x) => (x.key === p.key ? { ...x, rotate: (x.rotate + 90) % 360 } : x)));
                }}
                style={styles.pageWrap}>
                <Image source={{ uri: p.uri }} style={[styles.pageImg, { transform: [{ rotate: `${p.rotate}deg` }] }]} contentFit="contain" />
                <View style={styles.pageNo}>
                  <Txt variant="caption" style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                    {i + 1}
                  </Txt>
                </View>
                <Pressable hitSlop={8} style={styles.del} onPress={() => setPages((cur) => cur.filter((x) => x.key !== p.key))}>
                  <Ionicons name="trash" size={13} color="#fff" />
                </Pressable>
              </Pressable>
            </Animated.View>
          ))}
          <Animated.View entering={FadeIn} style={styles.cell}>
            <Pressable
              onPress={async () => {
                tap();
                if (canUseCamera) return onAddMore();
                const picked = await pickImages();
                setPages((cur) => [...cur, ...picked.map((x, i) => ({ key: `${Date.now()}-${i}`, uri: x.uri, rotate: 0 }))]);
              }}
              style={[styles.pageWrap, styles.addPage]}>
              <Ionicons name={canUseCamera ? 'camera' : 'add'} size={26} color={tool.colors[0]} />
              <Txt variant="caption" style={{ color: tool.colors[0], fontWeight: '700' }}>
                Add page
              </Txt>
            </Pressable>
          </Animated.View>
        </View>

        <SectionLabel>File name</SectionLabel>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={C.faint} />

        <SectionLabel>Output</SectionLabel>
        <Segmented
          value={quality}
          onChange={setQuality}
          accent={tool.colors[0]}
          options={[
            { value: 'color', label: 'Sharp', icon: 'diamond-outline' },
            { value: 'compact', label: 'Compact', icon: 'contract-outline' },
          ]}
        />
      </ScrollView>
      <Footer>
        <PrimaryButton
          label={pages.length ? `Save PDF · ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}` : 'Add a page first'}
          icon="download-outline"
          colors={tool.colors}
          disabled={!pages.length || !name.trim()}
          onPress={create}
        />
      </Footer>
      <BusyOverlay visible={task.busy} label={task.label} progress={task.progress} colors={tool.colors} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.md, padding: S.xxl },
  camRoot: { flex: 1, backgroundColor: '#000' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)' },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: '#fff' },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: S.md,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  camTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.lg,
  },
  glass: { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: 'rgba(255,255,255,0.18)' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: S.md,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  camBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  sideBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  shutterOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: { width: 66, height: 66, borderRadius: 33 },
  lastWrap: { width: 56, height: 56 },
  last: { width: 56, height: 56, borderRadius: 16, borderWidth: 2, borderColor: '#fff' },
  count: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -S.xs },
  cell: { width: '50%', padding: S.xs },
  pageWrap: {
    aspectRatio: 1 / A4,
    borderRadius: R.md,
    overflow: 'hidden',
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageImg: { width: '100%', height: '100%' },
  addPage: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: tool.colors[0] + '77', backgroundColor: tool.colors[0] + '10', gap: 4 },
  pageNo: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  del: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,84,112,0.9)',
  },
  input: {
    height: 52,
    borderRadius: R.md,
    paddingHorizontal: S.lg,
    color: C.text,
    fontSize: 16,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
});
