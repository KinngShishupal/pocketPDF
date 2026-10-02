import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { C, R } from '@/constants/theme';
import { strokesToPath, type Point } from '@/lib/signatures';

import { Txt } from './ui';

export function SignaturePad({
  color,
  strokeWidth,
  strokes,
  onStroke,
  height = 220,
}: {
  color: string;
  strokeWidth: number;
  strokes: Point[][];
  onStroke: (stroke: Point[]) => void;
  height?: number;
}) {
  const current = useRef<Point[]>([]);
  const [live, setLive] = useState('');

  // PanResponder handlers only read refs when gestures fire, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        current.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
        setLive(strokesToPath([current.current]));
      },
      onPanResponderMove: (e) => {
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        const prev = current.current[current.current.length - 1];
        if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) return;
        current.current.push(p);
        setLive(strokesToPath([current.current]));
      },
      onPanResponderRelease: () => {
        if (current.current.length) onStroke(current.current);
        current.current = [];
        setLive('');
      },
    }),
  );

  const committed = strokesToPath(strokes);

  return (
    <View style={[styles.pad, { height }]} {...responder.panHandlers}>
      <View pointerEvents="none" style={styles.baseline} />
      <Txt variant="overline" style={styles.hint}>
        {strokes.length ? ' ' : 'Sign here'}
      </Txt>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        {!!committed && (
          <Path d={committed} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        )}
        {!!live && (
          <Path d={live} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    borderRadius: R.lg,
    backgroundColor: '#FBFBFE',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  baseline: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 56,
    height: 1.5,
    backgroundColor: '#D7D7E3',
  },
  hint: { position: 'absolute', left: 24, bottom: 30, color: '#A5A5BA' },
});
