import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { BusyOverlay } from '@/components/busy-overlay';
import { FileSlot } from '@/components/file-slot';
import { SignaturePad } from '@/components/signature-pad';
import {
  Card,
  Footer,
  GhostButton,
  IconButton,
  PrimaryButton,
  Screen,
  SectionLabel,
  Segmented,
  ToggleRow,
  ToolHeader,
  Txt,
  tap,
} from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { getDoc, saveDoc } from '@/lib/library';
import { getPdfInfo, signPdf, type SignatureData } from '@/lib/pdf';
import { usePdfRenderer } from '@/lib/pdf-renderer';
import { fromDoc, type PickedFile } from '@/lib/pickers';
import { addSignature, buildSignature, removeSignature, useSignatures, type Point } from '@/lib/signatures';
import { TOOLS } from '@/lib/tools';
import { useTask } from '@/lib/use-task';

const tool = TOOLS.sign;
const INKS = ['#111827', '#1D4ED8', '#B91C1C', '#047857'];
const WIDTHS = { fine: 2, medium: 3.5, bold: 5.5 } as const;

type PageSize = { width: number; height: number };
type Pos = { nx: number; ny: number };

function SigPreview({ sig, color, width, height }: { sig: SignatureData; color: string; width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${sig.w} ${sig.h}`}>
      <Path d={sig.d} stroke={color} strokeWidth={sig.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export default function Sign() {
  const { docId } = useLocalSearchParams<{ docId?: string }>();
  const { width: screenW } = useWindowDimensions();
  const signatures = useSignatures();
  const task = useTask();
  const { load, render, view } = usePdfRenderer();
  const [loaded, setLoaded] = useState<string | null>(null);
  const [pageImg, setPageImg] = useState<{ key: string; uri: string } | null>(null);

  const [file, setFile] = useState<PickedFile | null>(() => {
    const d = getDoc(docId);
    return d ? fromDoc(d) : null;
  });
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [sigId, setSigId] = useState<string | null>(signatures[0]?.id ?? null);
  const [ink, setInk] = useState(INKS[0]);
  const [wf, setWf] = useState(0.32);
  const [pos, setPos] = useState<Pos>({ nx: 0.55, ny: 0.8 });
  const [allPages, setAllPages] = useState(false);
  const [addDate, setAddDate] = useState(true);
  const [drawing, setDrawing] = useState(false);

  // Render the real page behind the signature when pdf.js is available.
  useEffect(() => {
    if (!file) return;
    let alive = true;
    load(file.uri)
      .then(() => alive && setLoaded(file.uri))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [file, load]);

  useEffect(() => {
    if (!loaded || loaded !== file?.uri) return;
    let alive = true;
    const key = `${loaded}#${pageIndex}`;
    render(pageIndex, 900)
      .then((uri) => alive && setPageImg({ key, uri }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loaded, file, pageIndex, render]);

  const pageImage = pageImg?.key === `${file?.uri}#${pageIndex}` ? pageImg.uri : undefined;

  const sig = signatures.find((s) => s.id === sigId) ?? null;
  const page = sizes[pageIndex];

  useEffect(() => {
    let alive = true;
    if (!file) return;
    getPdfInfo(file.uri)
      .then((info) => {
        if (!alive) return;
        setSizes(info.sizes);
        setPageIndex(info.pages - 1); // signatures usually go on the last page
      })
      .catch((e: Error) => {
        Alert.alert('Cannot open PDF', e.message);
        setFile(null);
      });
    return () => {
      alive = false;
    };
  }, [file]);

  // Page canvas fits within the screen width and a max height.
  const maxW = screenW - S.lg * 2 - S.lg * 2;
  const canvas = page
    ? (() => {
        const h = Math.min(maxW * (page.height / page.width), 440);
        return { w: h * (page.width / page.height), h };
      })()
    : { w: 0, h: 0 };
  const boxW = wf * canvas.w;
  const boxH = sig ? boxW * (sig.h / sig.w) : 0;

  // Gesture state lives in refs so the responder (created once) always sees fresh values.
  const posRef = useRef(pos);
  const startRef = useRef(pos);
  const limits = useRef({ cw: 1, ch: 1, maxX: 1, maxY: 1 });
  useEffect(() => {
    limits.current = {
      cw: canvas.w || 1,
      ch: canvas.h || 1,
      maxX: Math.max(0, 1 - boxW / (canvas.w || 1)),
      maxY: Math.max(0, 1 - boxH / (canvas.h || 1)),
    };
    const clamped = {
      nx: Math.min(posRef.current.nx, limits.current.maxX),
      ny: Math.min(posRef.current.ny, limits.current.maxY),
    };
    posRef.current = clamped;
    setPos(clamped);
  }, [canvas.w, canvas.h, boxW, boxH]);

  // PanResponder handlers only read refs when gestures fire, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [drag] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startRef.current = posRef.current;
      },
      onPanResponderMove: (_, g) => {
        const l = limits.current;
        const next = {
          nx: Math.min(l.maxX, Math.max(0, startRef.current.nx + g.dx / l.cw)),
          ny: Math.min(l.maxY, Math.max(0, startRef.current.ny + g.dy / l.ch)),
        };
        posRef.current = next;
        setPos(next);
      },
    }),
  );

  const apply = async () => {
    if (!file || !sig) return;
    const doc = await task.run('Signing document', async () => {
      const res = await signPdf(file.uri, sig, { pageIndex, allPages, nx: pos.nx, ny: pos.ny, wf, color: ink, addDate });
      return saveDoc({ name: `${file.name} (signed)`, source: 'sign', pages: res.pages, bytes: res.bytes });
    });
    if (doc) {
      router.replace({
        pathname: '/result',
        params: { id: doc.id, note: allPages ? 'Signed on every page.' : `Signed on page ${pageIndex + 1}.` },
      });
    }
  };

  return (
    <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
      {view}
      <ToolHeader title="Sign PDF" subtitle="Draw once, sign anything" icon={tool.icon} colors={tool.colors} />
      <ScrollView contentContainerStyle={styles.body}>
        <FileSlot
          file={file}
          onChange={(f) => {
            setSizes([]);
            setFile(f);
          }}
          colors={tool.colors}
          meta={sizes.length ? `${sizes.length} pages` : undefined}
        />

        <SectionLabel>Your signature</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
          <Pressable
            onPress={() => {
              tap();
              setDrawing(true);
            }}
            style={[styles.sigCard, styles.newSig, { borderColor: tool.colors[0] + '88' }]}>
            <Ionicons name="brush" size={22} color={tool.colors[0]} />
            <Txt variant="caption" style={{ color: tool.colors[0], fontWeight: '700' }}>
              Draw new
            </Txt>
          </Pressable>
          {signatures.map((s) => {
            const active = s.id === sigId;
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  tap();
                  setSigId(s.id);
                }}
                onLongPress={() =>
                  Alert.alert('Delete signature?', undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => removeSignature(s.id) },
                  ])
                }
                style={[styles.sigCard, active && { borderColor: tool.colors[0], borderWidth: 2 }]}>
                <SigPreview sig={s} color={ink} width={110} height={54} />
                {active && (
                  <View style={[styles.sigCheck, { backgroundColor: tool.colors[0] }]}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.inkRow}>
          {INKS.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                tap();
                setInk(c);
              }}
              style={[styles.inkOuter, ink === c && { borderColor: C.text }]}>
              <View style={[styles.ink, { backgroundColor: c }]} />
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <IconButton icon="remove" size={34} onPress={() => setWf((w) => Math.max(0.12, w - 0.04))} />
          <Txt variant="caption" style={{ width: 44, textAlign: 'center' }}>
            Size
          </Txt>
          <IconButton icon="add" size={34} onPress={() => setWf((w) => Math.min(0.8, w + 0.04))} />
        </View>

        {page && sig && (
          <Animated.View entering={FadeInDown}>
            <SectionLabel
              right={
                sizes.length > 1 && (
                  <View style={styles.pager}>
                    <IconButton icon="chevron-back" size={30} onPress={() => setPageIndex((i) => Math.max(0, i - 1))} />
                    <Txt variant="label" style={{ minWidth: 64, textAlign: 'center' }}>
                      {pageIndex + 1} / {sizes.length}
                    </Txt>
                    <IconButton icon="chevron-forward" size={30} onPress={() => setPageIndex((i) => Math.min(sizes.length - 1, i + 1))} />
                  </View>
                )
              }>
              Drag to position
            </SectionLabel>
            <View style={styles.stage}>
              <View style={[styles.page, { width: canvas.w, height: canvas.h }]}>
                {pageImage ? (
                  <Image source={{ uri: pageImage }} style={StyleSheet.absoluteFill} contentFit="fill" transition={150} />
                ) : (
                /* Stylized placeholder until the real page renders (or when offline). */
                <View style={{ padding: canvas.w * 0.09, gap: canvas.h * 0.018 }}>
                  <View style={[styles.line, { width: '45%', height: 8, backgroundColor: '#D9D9E6' }]} />
                  {Array.from({ length: 11 }, (_, i) => (
                    <View key={i} style={[styles.line, { width: `${[92, 88, 95, 70, 90, 84, 93, 60, 89, 94, 50][i]}%` }]} />
                  ))}
                </View>
                )}
                <Txt variant="caption" style={styles.pageNum}>
                  Page {pageIndex + 1}
                </Txt>
                <View
                  {...drag.panHandlers}
                  style={[styles.sigBox, { left: pos.nx * canvas.w, top: pos.ny * canvas.h, width: boxW, height: boxH + (addDate ? 14 : 0) }]}>
                  <SigPreview sig={sig} color={ink} width={boxW} height={boxH} />
                  {addDate && (
                    <Txt variant="caption" style={{ fontSize: 8, color: ink }}>
                      Signed {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Txt>
                  )}
                  <View style={[styles.handle, { backgroundColor: tool.colors[0] }]}>
                    <Ionicons name="move" size={11} color="#fff" />
                  </View>
                </View>
              </View>
            </View>

            <Card style={{ marginTop: S.md, paddingVertical: S.sm }}>
              <ToggleRow label="Add date" hint="Prints today's date under the signature" value={addDate} onChange={setAddDate} accent={tool.colors[0]} />
              <View style={styles.divider} />
              <ToggleRow label="Sign every page" hint="Same position on all pages" value={allPages} onChange={setAllPages} accent={tool.colors[0]} />
            </Card>
          </Animated.View>
        )}

        {!sig && (
          <Txt variant="caption" style={{ marginTop: S.lg, textAlign: 'center' }}>
            Draw a signature to start placing it.
          </Txt>
        )}
      </ScrollView>
      <Footer>
        <PrimaryButton label="Apply signature" icon="checkmark-done" colors={tool.colors} disabled={!file || !sig || !page} onPress={apply} />
      </Footer>

      <DrawModal
        visible={drawing}
        ink={ink}
        onInk={setInk}
        onClose={() => setDrawing(false)}
        onSave={(s) => {
          addSignature(s);
          setSigId(s.id);
          setDrawing(false);
        }}
      />
      <BusyOverlay visible={task.busy} label={task.label} colors={tool.colors} />
    </Screen>
  );
}

function DrawModal({
  visible,
  ink,
  onInk,
  onClose,
  onSave,
}: {
  visible: boolean;
  ink: string;
  onInk: (c: string) => void;
  onClose: () => void;
  onSave: (sig: SignatureData) => void;
}) {
  const insets = useSafeAreaInsets();
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [weight, setWeight] = useState<keyof typeof WIDTHS>('medium');

  const close = () => {
    setStrokes([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <Screen glow={tool.colors[0]} glow2={tool.colors[1]}>
        <View style={[styles.drawHead, { paddingTop: insets.top + S.sm }]}>
          <IconButton icon="close" onPress={close} />
          <Txt variant="h2" style={{ flex: 1, textAlign: 'center' }}>
            Draw your signature
          </Txt>
          <IconButton icon="arrow-undo" onPress={() => setStrokes((s) => s.slice(0, -1))} tint={strokes.length ? C.text : C.faint} />
        </View>
        <Animated.View entering={FadeIn} style={{ padding: S.lg, gap: S.lg, flex: 1 }}>
          <SignaturePad
            color={ink}
            strokeWidth={WIDTHS[weight]}
            strokes={strokes}
            onStroke={(s) => setStrokes((cur) => [...cur, s])}
            height={260}
          />
          <View style={styles.inkRow}>
            {INKS.map((c) => (
              <Pressable key={c} onPress={() => onInk(c)} style={[styles.inkOuter, ink === c && { borderColor: C.text }]}>
                <View style={[styles.ink, { backgroundColor: c }]} />
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <GhostButton compact label="Clear" icon="trash-outline" onPress={() => setStrokes([])} />
          </View>
          <Segmented
            value={weight}
            onChange={setWeight}
            accent={tool.colors[0]}
            options={[
              { value: 'fine', label: 'Fine' },
              { value: 'medium', label: 'Medium' },
              { value: 'bold', label: 'Bold' },
            ]}
          />
        </Animated.View>
        <View style={{ padding: S.lg, paddingBottom: insets.bottom + S.lg }}>
          <PrimaryButton
            label="Save signature"
            icon="checkmark"
            colors={tool.colors}
            disabled={!strokes.length}
            onPress={() => {
              const sig = buildSignature(strokes, WIDTHS[weight]);
              if (!sig) return;
              setStrokes([]);
              onSave(sig);
            }}
          />
        </View>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: S.lg, paddingBottom: 140 },
  sigCard: {
    width: 130,
    height: 74,
    borderRadius: R.md,
    backgroundColor: '#FBFBFE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  newSig: { backgroundColor: C.card, borderStyle: 'dashed', borderWidth: 1.5, gap: 4 },
  sigCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inkRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.md },
  inkOuter: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  ink: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stage: {
    alignItems: 'center',
    padding: S.lg,
    borderRadius: R.lg,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  page: {
    backgroundColor: '#fff',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  line: { height: 5, borderRadius: 3, backgroundColor: '#ECECF3' },
  pageNum: { position: 'absolute', bottom: 8, alignSelf: 'center', color: '#B0B0C0', fontSize: 10 },
  sigBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: tool.colors[0],
    backgroundColor: tool.colors[0] + '12',
    borderRadius: 4,
  },
  handle: {
    position: 'absolute',
    right: -10,
    top: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: S.xs },
  drawHead: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg },
});
