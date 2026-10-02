import { Platform } from 'react-native';

export const C = {
  bg: '#07070F',
  surface: '#10101C',
  surface2: '#181828',
  card: 'rgba(255,255,255,0.05)',
  cardHi: 'rgba(255,255,255,0.09)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#F4F4FB',
  sub: '#A3A3BF',
  faint: '#63637E',
  accent: '#8B5CF6',
  accent2: '#EC4899',
  success: '#2EE6A6',
  danger: '#FF5470',
} as const;

export const Brand = ['#8B5CF6', '#EC4899'] as const;

export const R = { sm: 12, md: 18, lg: 24, xl: 32 } as const;

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const Mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
