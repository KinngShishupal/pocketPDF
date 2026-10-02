import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

/**
 * A page preview fitted inside maxW × maxH. Renders arrive unrotated (pdf.js,
 * crop box), so the page's rotation is applied here.
 */
export function PageThumb({
  box,
  rotation,
  image,
  loading,
  maxW,
  maxH,
}: {
  box: { w: number; h: number };
  rotation: number;
  image?: string;
  loading?: boolean;
  maxW: number;
  maxH: number;
}) {
  const total = ((rotation % 360) + 360) % 360;
  const sideways = total % 180 !== 0;
  const aspect = sideways ? box.h / box.w : box.w / box.h; // as displayed
  const w = Math.min(maxW, maxH * aspect);
  const h = w / aspect;

  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={[
          styles.page,
          { width: sideways ? h : w, height: sideways ? w : h, transform: [{ rotate: `${total}deg` }] },
        ]}>
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="fill" transition={200} />
        ) : (
          loading && <ActivityIndicator size="small" color="#C0C0D0" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff', borderRadius: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
