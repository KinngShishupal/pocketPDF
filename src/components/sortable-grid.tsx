import * as Haptics from 'expo-haptics';
import { useEffect, type ReactNode } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

type Geometry = { cols: number; cellW: number; cellH: number; gap: number };

const SPRING = { damping: 20, stiffness: 220, mass: 0.6 };

function slot(i: number, g: Geometry) {
  'worklet';
  return { x: (i % g.cols) * (g.cellW + g.gap), y: Math.floor(i / g.cols) * (g.cellH + g.gap) };
}

/**
 * Grid whose cells can be picked up with a long press and dragged into a new
 * position; neighbours slide out of the way live. A short tap calls `onTap`.
 */
export function SortableGrid<T>({
  items,
  keyOf,
  renderItem,
  onReorder,
  onTap,
  onDragStateChange,
  enabled = true,
  ...g
}: Geometry & {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onReorder: (keys: string[]) => void;
  onTap: (key: string) => void;
  onDragStateChange?: (dragging: boolean) => void;
  enabled?: boolean;
}) {
  const keys = items.map(keyOf);
  const signature = keys.join('|');
  const order = useSharedValue(keys);

  // Keep the shared order in sync with changes made outside the grid (buttons, inserts, deletes).
  useEffect(() => {
    order.set(signature ? signature.split('|') : []);
  }, [signature, order]);

  const rows = Math.ceil(items.length / g.cols);
  const height = rows > 0 ? rows * g.cellH + (rows - 1) * g.gap : 0;

  return (
    <Animated.View style={{ height }}>
      {items.map((item, i) => {
        const key = keyOf(item);
        return (
          <Cell
            key={key}
            id={key}
            index={i}
            count={items.length}
            order={order}
            geometry={g}
            enabled={enabled}
            onTap={onTap}
            onReorder={onReorder}
            onDragStateChange={onDragStateChange}>
            {renderItem(item, i)}
          </Cell>
        );
      })}
    </Animated.View>
  );
}

function Cell({
  id,
  index,
  count,
  order,
  geometry: g,
  enabled,
  onTap,
  onReorder,
  onDragStateChange,
  children,
}: {
  id: string;
  index: number;
  count: number;
  order: SharedValue<string[]>;
  geometry: Geometry;
  enabled: boolean;
  onTap: (key: string) => void;
  onReorder: (keys: string[]) => void;
  onDragStateChange?: (dragging: boolean) => void;
  children: ReactNode;
}) {
  const start = slot(index, g);
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  const origin = useSharedValue({ x: 0, y: 0 });
  const active = useSharedValue(false);
  const lift = useSharedValue(0);

  // Glide to the cell's slot whenever its position in the order changes (unless it's under the finger).
  useAnimatedReaction(
    () => order.value.indexOf(id),
    (i, prev) => {
      if (i < 0 || i === prev || active.value) return;
      const p = slot(i, g);
      x.set(withSpring(p.x, SPRING));
      y.set(withSpring(p.y, SPRING));
    },
    [g.cols, g.cellW, g.cellH, g.gap],
  );

  const haptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  const tick = () => Haptics.selectionAsync().catch(() => {});
  const dragState = (dragging: boolean) => onDragStateChange?.(dragging);

  const pan = Gesture.Pan()
    .enabled(enabled && count > 1)
    .activateAfterLongPress(280)
    .onStart(() => {
      active.set(true);
      origin.set({ x: x.value, y: y.value });
      lift.set(withTiming(1, { duration: 150 }));
      scheduleOnRN(haptic);
      scheduleOnRN(dragState, true);
    })
    .onUpdate((e) => {
      x.set(origin.value.x + e.translationX);
      y.set(origin.value.y + e.translationY);

      const rows = Math.ceil(order.value.length / g.cols);
      const col = Math.min(g.cols - 1, Math.max(0, Math.round(x.value / (g.cellW + g.gap))));
      const row = Math.min(rows - 1, Math.max(0, Math.round(y.value / (g.cellH + g.gap))));
      const to = Math.min(order.value.length - 1, row * g.cols + col);
      const from = order.value.indexOf(id);
      if (to !== from) {
        const next = order.value.slice();
        next.splice(from, 1);
        next.splice(to, 0, id);
        order.set(next);
        scheduleOnRN(tick);
      }
    })
    .onFinalize(() => {
      if (!active.value) return;
      const p = slot(order.value.indexOf(id), g);
      x.set(withSpring(p.x, SPRING));
      y.set(withSpring(p.y, SPRING));
      lift.set(withTiming(0, { duration: 200 }));
      active.set(false);
      scheduleOnRN(dragState, false);
      scheduleOnRN(onReorder, order.value.slice());
    });

  const tap = Gesture.Tap()
    .maxDuration(260)
    .onEnd((_, success) => {
      if (success) scheduleOnRN(onTap, id);
    });

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    width: g.cellW,
    height: g.cellH,
    zIndex: active.value ? 100 : 1,
    shadowColor: '#000',
    shadowOpacity: 0.5 * lift.value,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: lift.value * 16,
    opacity: 1 - lift.value * 0.08,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: 1 + lift.value * 0.08 }],
  }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}
