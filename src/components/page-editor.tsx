import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { C, R, S } from '@/constants/theme';
import { LINE, annBounds, moveAnn, uid, type Ann, type EditPage, type FontFamily, type InkAnn, type RectAnn, type TextBlock } from '@/lib/edit';
import { strokesToPath } from '@/lib/signatures';
import type { Gradient, IconName } from '@/lib/tools';

import { GhostButton, IconButton, PrimaryButton, Screen, Txt, tap } from './ui';

type Mode = 'edit' | 'select' | 'text' | 'draw' | 'highlight' | 'whiteout';
type Size = { w: number; h: number };

const MODES: { key: Mode; label: string; icon: IconName }[] = [
  { key: 'edit', label: 'Edit text', icon: 'create-outline' },
  { key: 'text', label: 'Add text', icon: 'text' },
  { key: 'draw', label: 'Draw', icon: 'brush' },
  { key: 'highlight', label: 'Highlight', icon: 'color-fill' },
  { key: 'whiteout', label: 'Whiteout', icon: 'square' },
  { key: 'select', label: 'Move', icon: 'hand-left-outline' },
];
const INK = ['#111827', '#DC2626', '#2563EB', '#059669', '#F59E0B'];
const MARKER = ['#FDE047', '#86EFAC', '#F9A8D4', '#93C5FD'];
const PEN = { thin: 1.5, medium: 3, thick: 6 } as const;
const HINT: Record<Mode, string> = {
  edit: 'Tap any outlined line to change its text',
  select: 'Tap an item to select it, drag to move',
  text: 'Tap where the text should go',
  draw: 'Draw freely on the page',
  highlight: 'Drag across the area to highlight',
  whiteout: 'Drag to cover content with white',
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** `block` is set when editing existing page text rather than adding new text. */
type TextDraft = { id?: string; nx: number; ny: number; text: string; size: number; bold: boolean; block?: TextBlock };

const FAMILY: Record<FontFamily, string | undefined> = {
  sans: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
  serif: Platform.select({ ios: 'Times New Roman', default: 'serif' }),
  mono: Platform.select({ ios: 'Courier', default: 'monospace' }),
};
/** Approximate distance from a text box's top to its baseline, as a fraction of font size. */
const ASCENT = Platform.OS === 'ios' ? 0.8 : 0.93;

const inside = (p: { x: number; y: number }, b: { nx: number; ny: number; nw: number; nh: number }, pad = 0.006) =>
  p.x >= b.nx - pad && p.x <= b.nx + b.nw + pad && p.y >= b.ny - pad && p.y <= b.ny + b.nh + pad;

export function PageEditor({
  page,
  index,
  image,
  colors,
  onClose,
  onSave,
  loadText,
}: {
  page: EditPage;
  index: number;
  image?: string;
  colors: Gradient;
  onClose: () => void;
  onSave: (anns: Ann[]) => void;
  /** Detects existing text lines; omitted for blank pages or when previews are unavailable. */
  loadText?: () => Promise<TextBlock[]>;
}) {
  const insets = useSafeAreaInsets();
  const defaultSize = Math.max(8, Math.round(page.box.w / 40));

  const [anns, setAnns] = useState<Ann[]>(page.anns);
  const firstMode: Mode = loadText ? 'edit' : 'text';
  const [mode, setMode] = useState<Mode>(firstMode);
  const [blocks, setBlocks] = useState<TextBlock[] | null>(null);
  const [textError, setTextError] = useState(false);
  const [ink, setInk] = useState(INK[0]);
  const [marker, setMarker] = useState(MARKER[0]);
  const [pen, setPen] = useState<keyof typeof PEN>('medium');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<InkAnn | RectAnn | null>(null);
  const [disp, setDisp] = useState<Size>({ w: 0, h: 0 });
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);

  // The responder is created once, so it reads live values through these refs (updated only in handlers).
  const s = useRef({
    anns: page.anns,
    mode: firstMode as Mode,
    blocks: [] as TextBlock[],
    ink: INK[0],
    marker: MARKER[0],
    pen: PEN.medium as number,
    disp: { w: 1, h: 1 },
    start: { x: 0, y: 0 },
    moved: false,
    draft: null as InkAnn | RectAnn | null,
    dragOrigin: null as Ann | null,
  });

  useEffect(() => {
    if (!loadText) return;
    let alive = true;
    loadText()
      .then((found) => {
        if (!alive) return;
        s.current.blocks = found;
        setBlocks(found);
      })
      .catch(() => alive && setTextError(true));
    return () => {
      alive = false;
    };
  }, [loadText]);

  const commit = (next: Ann[]) => {
    s.current.anns = next;
    setAnns(next);
  };

  const pickMode = (m: Mode) => {
    tap();
    s.current.mode = m;
    setMode(m);
    if (m !== 'select') setSelected(null);
  };

  const fit = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const aspect = page.box.w / page.box.h;
    const w = Math.min(width, height * aspect);
    const next = { w, h: w / aspect };
    s.current.disp = next;
    setDisp(next);
  };

  // eslint-disable-next-line react-hooks/refs -- handlers read refs only when gestures fire
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const st = s.current;
        const p = { x: clamp(e.nativeEvent.locationX / st.disp.w), y: clamp(e.nativeEvent.locationY / st.disp.h) };
        st.start = p;
        st.moved = false;
        if (st.mode === 'draw') {
          st.draft = { id: uid(), type: 'ink', points: [p], color: st.ink, width: st.pen };
        } else if (st.mode === 'highlight' || st.mode === 'whiteout') {
          st.draft = { id: uid(), type: st.mode, nx: p.x, ny: p.y, nw: 0, nh: 0, color: st.marker };
        } else if (st.mode === 'select') {
          const hit = [...st.anns].reverse().find((a) => {
            const b = annBounds(a, page.box);
            return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
          });
          st.dragOrigin = hit ?? null;
          setSelected(hit?.id ?? null);
        }
        setDraft(st.draft);
      },
      onPanResponderMove: (_, g) => {
        const st = s.current;
        const q = { x: clamp(st.start.x + g.dx / st.disp.w), y: clamp(st.start.y + g.dy / st.disp.h) };
        if (Math.abs(g.dx) + Math.abs(g.dy) > 6) st.moved = true;
        if (st.draft?.type === 'ink') {
          const pts = st.draft.points;
          const last = pts[pts.length - 1];
          if (Math.hypot((q.x - last.x) * st.disp.w, (q.y - last.y) * st.disp.h) < 1.5) return;
          st.draft = { ...st.draft, points: [...pts, q] };
          setDraft(st.draft);
        } else if (st.draft) {
          st.draft = {
            ...st.draft,
            nx: Math.min(st.start.x, q.x),
            ny: Math.min(st.start.y, q.y),
            nw: Math.abs(q.x - st.start.x),
            nh: Math.abs(q.y - st.start.y),
          };
          setDraft(st.draft);
        } else if (st.mode === 'select' && st.dragOrigin) {
          const origin = st.dragOrigin;
          const moved = moveAnn(origin, q.x - st.start.x, q.y - st.start.y);
          commit(st.anns.map((a) => (a.id === origin.id ? moved : a)));
        }
      },
      onPanResponderRelease: () => {
        const st = s.current;
        const d = st.draft;
        if (d?.type === 'ink') {
          commit([...st.anns, d]);
        } else if (d && d.nw > 0.01 && d.nh > 0.005) {
          commit([...st.anns, d]);
        } else if (st.mode === 'text' && !st.moved) {
          setTextDraft({ nx: st.start.x, ny: st.start.y, text: '', size: defaultSize, bold: false });
        } else if (st.mode === 'edit' && !st.moved) {
          const p = st.start;
          const existing = [...st.anns].reverse().find((a) => a.type === 'replace' && inside(p, a));
          if (existing?.type === 'replace') {
            const block: TextBlock = { ...existing, id: existing.block, text: existing.original };
            setTextDraft({ id: existing.id, nx: existing.nx, ny: existing.ny, text: existing.text, size: existing.size, bold: existing.bold, block });
          } else {
            // Prefer the smallest line under the finger.
            const hit = st.blocks.filter((b) => inside(p, b)).sort((a, b) => a.nw * a.nh - b.nw * b.nh)[0];
            if (hit) {
              tap();
              setTextDraft({ nx: hit.nx, ny: hit.ny, text: hit.text, size: hit.size, bold: hit.bold, block: hit });
            }
          }
        }
        st.draft = null;
        st.dragOrigin = null;
        setDraft(null);
      },
    }),
  );

  const sel = anns.find((a) => a.id === selected) ?? null;
  const k = disp.w / page.box.w; // display pixels per PDF point

  const saveText = () => {
    if (!textDraft) return;
    if (textDraft.block) {
      const b = textDraft.block;
      const text = textDraft.text.replace(/\s*\n\s*/g, ' ').trim();
      const unchanged = text === b.text && textDraft.size === b.size && textDraft.bold === b.bold;
      if (textDraft.id) {
        commit(
          unchanged
            ? anns.filter((a) => a.id !== textDraft.id)
            : anns.map((a) => (a.id === textDraft.id && a.type === 'replace' ? { ...a, text, size: textDraft.size, bold: textDraft.bold } : a)),
        );
      } else if (!unchanged) {
        const { id: blockId, ...rest } = b;
        commit([...anns, { ...rest, id: uid(), type: 'replace', block: blockId, original: b.text, text, size: textDraft.size, bold: textDraft.bold }]);
      }
      setTextDraft(null);
      return;
    }
    const text = textDraft.text.replace(/\s+$/, '');
    if (textDraft.id) {
      commit(
        text
          ? anns.map((a) => (a.id === textDraft.id && a.type === 'text' ? { ...a, text, size: textDraft.size, bold: textDraft.bold } : a))
          : anns.filter((a) => a.id !== textDraft.id),
      );
    } else if (text) {
      const id = uid();
      commit([...anns, { id, type: 'text', nx: textDraft.nx, ny: textDraft.ny, text, size: textDraft.size, color: ink, bold: textDraft.bold }]);
      setSelected(id);
    }
    setTextDraft(null);
  };

  const renderAnn = (a: Ann, ghost = false) => {
    if (a.type === 'text' || a.type === 'replace') return null;
    if (a.type === 'ink') {
      const d = strokesToPath([a.points.map((p) => ({ x: p.x * disp.w, y: p.y * disp.h }))]);
      return <Path key={a.id} d={d} stroke={a.color} strokeWidth={a.width * k} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={ghost ? 0.7 : 1} />;
    }
    return (
      <Rect
        key={a.id}
        x={a.nx * disp.w}
        y={a.ny * disp.h}
        width={a.nw * disp.w}
        height={a.nh * disp.h}
        fill={a.type === 'whiteout' ? '#FFFFFF' : a.color}
        fillOpacity={a.type === 'whiteout' ? 1 : 0.45}
        stroke={a.type === 'whiteout' ? '#C7C7D6' : undefined}
        strokeDasharray={a.type === 'whiteout' ? '4 3' : undefined}
        strokeWidth={a.type === 'whiteout' ? 1 : 0}
      />
    );
  };

  const selBounds = sel ? annBounds(sel, page.box) : null;
  const replaced = new Set(anns.flatMap((a) => (a.type === 'replace' ? [a.block] : [])));
  const editCount = anns.filter((a) => a.type === 'replace').length;
  const textLoading = !!loadText && blocks === null && !textError;
  const editBlock = (a: Ann) => {
    if (a.type !== 'replace') return;
    setTextDraft({ id: a.id, nx: a.nx, ny: a.ny, text: a.text, size: a.size, bold: a.bold, block: { ...a, id: a.block, text: a.original } });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <Screen glow={colors[0]} glow2={colors[1]}>
        <View style={[styles.head, { paddingTop: insets.top + S.sm }]}>
          <IconButton icon="close" onPress={onClose} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt variant="h2">Page {index + 1}</Txt>
            <Txt variant="caption">{HINT[mode]}</Txt>
          </View>
          <IconButton
            icon="arrow-undo"
            tint={anns.length ? C.text : C.faint}
            onPress={() => {
              commit(anns.slice(0, -1));
              setSelected(null);
            }}
          />
        </View>

        <View style={styles.stage} onLayout={fit}>
          {disp.w > 0 && (
            <View style={[styles.page, { width: disp.w, height: disp.h }]}>
              {image ? (
                <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="fill" transition={150} />
              ) : (
                page.src !== null && (
                  <View style={styles.noPreview}>
                    <Ionicons name="cloud-offline-outline" size={22} color="#A0A0B5" />
                    <Text style={styles.noPreviewText}>Preview unavailable — edits are still placed exactly</Text>
                  </View>
                )
              )}
              {anns.map(
                (a) =>
                  a.type === 'replace' && (
                    <View
                      key={a.id}
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: a.nx * disp.w - a.size * k * 0.08,
                        top: a.ny * disp.h - a.size * k * 0.08,
                        width: a.nw * disp.w + a.size * k * 0.16,
                        height: a.nh * disp.h + a.size * k * 0.16,
                        backgroundColor: a.bg,
                      }}
                    />
                  ),
              )}
              {anns.map(
                (a) =>
                  a.type === 'replace' &&
                  !!a.text && (
                    <Text
                      key={a.id + '-t'}
                      pointerEvents="none"
                      numberOfLines={1}
                      style={{
                        position: 'absolute',
                        left: a.nx * disp.w,
                        top: a.nbase * disp.h - a.size * k * ASCENT,
                        width: (1 - a.nx) * disp.w,
                        color: a.color,
                        fontSize: a.size * k,
                        fontFamily: FAMILY[a.family],
                        fontWeight: a.bold ? '700' : '400',
                        fontStyle: a.italic ? 'italic' : 'normal',
                        includeFontPadding: false,
                      }}>
                      {a.text}
                    </Text>
                  ),
              )}
              <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                {mode === 'edit' &&
                  blocks
                    ?.filter((b) => !replaced.has(b.id))
                    .map((b) => (
                      <Rect
                        key={b.id}
                        x={b.nx * disp.w - 2}
                        y={b.ny * disp.h - 1}
                        width={b.nw * disp.w + 4}
                        height={b.nh * disp.h + 2}
                        rx={2}
                        fill={colors[0]}
                        fillOpacity={0.08}
                        stroke={colors[0]}
                        strokeOpacity={0.55}
                        strokeWidth={1}
                        strokeDasharray="3 2"
                      />
                    ))}
                {mode === 'edit' &&
                  anns.map(
                    (a) =>
                      a.type === 'replace' && (
                        <Rect
                          key={a.id + '-o'}
                          x={a.nx * disp.w - 2}
                          y={a.ny * disp.h - 1}
                          width={annBounds(a, page.box).w * disp.w + 4}
                          height={a.nh * disp.h + 2}
                          rx={2}
                          fill="none"
                          stroke={colors[1]}
                          strokeWidth={1.5}
                        />
                      ),
                  )}
                {anns.map((a) => renderAnn(a))}
                {draft && renderAnn(draft, true)}
              </Svg>
              {anns.map(
                (a) =>
                  a.type === 'text' && (
                    <Text
                      key={a.id}
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: a.nx * disp.w,
                        top: a.ny * disp.h,
                        color: a.color,
                        fontSize: a.size * k,
                        lineHeight: a.size * LINE * k,
                        fontWeight: a.bold ? '700' : '400',
                        fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
                        width: (1 - a.nx) * disp.w,
                      }}>
                      {a.text}
                    </Text>
                  ),
              )}
              {selBounds && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.selection,
                    { borderColor: colors[0], left: selBounds.x * disp.w - 4, top: selBounds.y * disp.h - 4, width: selBounds.w * disp.w + 8, height: selBounds.h * disp.h + 8 },
                  ]}
                />
              )}
              <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />
            </View>
          )}
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + S.md }]}>
          {sel && mode === 'select' ? (
            <Animated.View entering={FadeInDown.duration(180)} style={styles.context}>
              {sel.type === 'replace' && <GhostButton compact icon="create-outline" label="Edit text" onPress={() => editBlock(sel)} />}
              {sel.type === 'text' && (
                <>
                  <GhostButton
                    compact
                    icon="create-outline"
                    label="Edit"
                    onPress={() => setTextDraft({ id: sel.id, nx: sel.nx, ny: sel.ny, text: sel.text, size: sel.size, bold: sel.bold })}
                  />
                  <IconButton icon="remove" size={34} onPress={() => commit(anns.map((a) => (a.id === sel.id && a.type === 'text' ? { ...a, size: Math.max(6, a.size - 2) } : a)))} />
                  <Txt variant="caption" style={{ minWidth: 34, textAlign: 'center' }}>
                    {sel.size}pt
                  </Txt>
                  <IconButton icon="add" size={34} onPress={() => commit(anns.map((a) => (a.id === sel.id && a.type === 'text' ? { ...a, size: Math.min(96, a.size + 2) } : a)))} />
                </>
              )}
              <View style={{ flex: 1 }} />
              <GhostButton
                compact
                icon="trash-outline"
                label={sel.type === 'replace' ? 'Restore original' : 'Delete'}
                tint={C.danger}
                onPress={() => {
                  commit(anns.filter((a) => a.id !== sel.id));
                  setSelected(null);
                }}
              />
            </Animated.View>
          ) : (
            <View style={styles.context}>
              {mode === 'edit' && (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                  {textLoading && <ActivityIndicator size="small" color={colors[1]} />}
                  <Txt variant="caption" style={{ flex: 1 }} numberOfLines={2}>
                    {!loadText
                      ? page.src === null
                        ? 'Blank pages have no existing text. Use Add text instead.'
                        : 'Finding text needs an internet connection (for page previews).'
                      : textLoading
                        ? 'Finding text on this page…'
                        : textError
                          ? "Couldn't read the text on this page."
                          : blocks && blocks.length === 0
                            ? 'No editable text here. It may be a scanned image; try Whiteout + Add text.'
                            : `${blocks?.length ?? 0} lines found · ${editCount} edited`}
                  </Txt>
                </View>
              )}
              {(mode === 'text' || mode === 'draw') &&
                INK.map((c) => (
                  <Swatch
                    key={c}
                    color={c}
                    active={ink === c}
                    onPress={() => {
                      s.current.ink = c;
                      setInk(c);
                    }}
                  />
                ))}
              {mode === 'highlight' &&
                MARKER.map((c) => (
                  <Swatch
                    key={c}
                    color={c}
                    active={marker === c}
                    onPress={() => {
                      s.current.marker = c;
                      setMarker(c);
                    }}
                  />
                ))}
              <View style={{ flex: 1 }} />
              {mode === 'draw' &&
                (Object.keys(PEN) as (keyof typeof PEN)[]).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => {
                      tap();
                      s.current.pen = PEN[p];
                      setPen(p);
                    }}
                    style={[styles.pen, pen === p && { borderColor: colors[0] }]}>
                    <View style={{ width: PEN[p] * 2 + 2, height: PEN[p] * 2 + 2, borderRadius: 8, backgroundColor: ink }} />
                  </Pressable>
                ))}
              {(mode === 'select' || mode === 'whiteout') && (
                <Txt variant="caption" style={{ flex: 1 }}>
                  {anns.length} {anns.length === 1 ? 'edit' : 'edits'} on this page
                </Txt>
              )}
            </View>
          )}

          <View style={styles.modes}>
            {MODES.map((m) => {
              const active = m.key === mode;
              return (
                <Pressable key={m.key} onPress={() => pickMode(m.key)} style={[styles.mode, active && { backgroundColor: colors[0] + '2A', borderColor: colors[0] + '88' }]}>
                  <Ionicons name={m.icon} size={20} color={active ? C.text : C.sub} />
                  <Text style={[styles.modeLabel, active && { color: C.text }]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <PrimaryButton label="Done" icon="checkmark" colors={colors} onPress={() => onSave(anns)} />
        </View>

        {textDraft && (
          <Modal transparent animationType="fade" onRequestClose={() => setTextDraft(null)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetBackdrop}>
              <Animated.View entering={FadeIn.duration(150)} style={styles.sheet}>
                <Txt variant="h2">{textDraft.block || textDraft.id ? 'Edit text' : 'Add text'}</Txt>
                {textDraft.block && (
                  <Txt variant="caption" numberOfLines={2}>
                    Original: “{textDraft.block.text}” · Clear it to remove the line
                  </Txt>
                )}
                <TextInput
                  value={textDraft.text}
                  onChangeText={(text) => setTextDraft({ ...textDraft, text })}
                  autoFocus
                  multiline={!textDraft.block}
                  placeholder="Type here…"
                  placeholderTextColor={C.faint}
                  style={styles.input}
                />
                <View style={styles.sheetRow}>
                  <IconButton icon="remove" size={34} onPress={() => setTextDraft({ ...textDraft, size: Math.max(4, textDraft.size - (textDraft.block ? 0.5 : 2)) })} />
                  <Txt variant="label" style={{ minWidth: 44, textAlign: 'center' }}>
                    {textDraft.size}pt
                  </Txt>
                  <IconButton icon="add" size={34} onPress={() => setTextDraft({ ...textDraft, size: Math.min(96, textDraft.size + (textDraft.block ? 0.5 : 2)) })} />
                  <View style={{ flex: 1 }} />
                  <Pressable
                    onPress={() => setTextDraft({ ...textDraft, bold: !textDraft.bold })}
                    style={[styles.bold, textDraft.bold && { backgroundColor: colors[0] + '33', borderColor: colors[0] }]}>
                    <Text style={{ color: C.text, fontWeight: '900', fontSize: 16 }}>B</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: S.sm }}>
                  <GhostButton label="Cancel" onPress={() => setTextDraft(null)} style={{ flex: 1 }} />
                  <PrimaryButton label={textDraft.block ? 'Replace' : textDraft.id ? 'Update' : 'Add'} colors={colors} onPress={saveText} style={{ flex: 1 }} />
                </View>
              </Animated.View>
            </KeyboardAvoidingView>
          </Modal>
        )}
      </Screen>
    </Modal>
  );
}

function Swatch({ color, active, onPress }: { color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.swatchOuter, active && { borderColor: C.text }]}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingBottom: S.sm },
  stage: { flex: 1, margin: S.lg, alignItems: 'center', justifyContent: 'center' },
  page: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  noPreview: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6, padding: S.xl },
  noPreviewText: { color: '#A0A0B5', fontSize: 12, textAlign: 'center' },
  selection: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 4 },
  bottom: {
    gap: S.md,
    paddingHorizontal: S.lg,
    paddingTop: S.md,
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  context: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 40 },
  modes: { flexDirection: 'row', gap: 6 },
  mode: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: S.sm,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeLabel: { color: C.sub, fontSize: 11, fontWeight: '600' },
  swatchOuter: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  pen: { width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: S.lg },
  sheet: {
    gap: S.md,
    padding: S.lg,
    borderRadius: R.xl,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  input: {
    minHeight: 96,
    maxHeight: 200,
    borderRadius: R.md,
    padding: S.md,
    color: C.text,
    fontSize: 16,
    textAlignVertical: 'top',
    backgroundColor: C.surface2,
  },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  bold: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
});
