import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export type Gradient = readonly [string, string];

export type ToolKey = 'scan' | 'edit' | 'merge' | 'compress' | 'sign' | 'convert' | 'split';
export type DocSource = ToolKey | 'import';

export type Tool = {
  key: ToolKey;
  title: string;
  tagline: string;
  icon: IconName;
  colors: Gradient;
  route: '/scan' | '/edit' | '/merge' | '/compress' | '/sign' | '/convert' | '/split';
};

export const TOOLS: Record<ToolKey, Tool> = {
  scan: {
    key: 'scan',
    title: 'Scan',
    tagline: 'Camera to crisp PDF',
    icon: 'scan',
    colors: ['#FF6B6B', '#FF9F43'],
    route: '/scan',
  },
  edit: {
    key: 'edit',
    title: 'Edit',
    tagline: 'Annotate & organize pages',
    icon: 'pencil',
    colors: ['#6366F1', '#06B6D4'],
    route: '/edit',
  },
  merge: {
    key: 'merge',
    title: 'Merge',
    tagline: 'Combine files into one',
    icon: 'git-merge',
    colors: ['#7C5CFF', '#B18CFF'],
    route: '/merge',
  },
  compress: {
    key: 'compress',
    title: 'Compress',
    tagline: 'Shrink without the blur',
    icon: 'contract',
    colors: ['#00C9A7', '#3BF5B5'],
    route: '/compress',
  },
  sign: {
    key: 'sign',
    title: 'Sign',
    tagline: 'Draw, place, done',
    icon: 'create',
    colors: ['#F72585', '#B5179E'],
    route: '/sign',
  },
  convert: {
    key: 'convert',
    title: 'Convert',
    tagline: 'Photos & text to PDF',
    icon: 'swap-horizontal',
    colors: ['#3A86FF', '#4CC9F0'],
    route: '/convert',
  },
  split: {
    key: 'split',
    title: 'Split',
    tagline: 'Extract any pages',
    icon: 'cut',
    colors: ['#FFB703', '#FB8500'],
    route: '/split',
  },
};

type SourceMeta = { icon: IconName; colors: Gradient; label: string };

const toolMeta = (t: Tool): SourceMeta => ({ icon: t.icon, colors: t.colors, label: t.title });

export const SOURCE_META: Record<DocSource, SourceMeta> = {
  scan: toolMeta(TOOLS.scan),
  edit: toolMeta(TOOLS.edit),
  merge: toolMeta(TOOLS.merge),
  compress: toolMeta(TOOLS.compress),
  sign: toolMeta(TOOLS.sign),
  convert: toolMeta(TOOLS.convert),
  split: toolMeta(TOOLS.split),
  import: { icon: 'document-text', colors: ['#64748B', '#94A3B8'], label: 'Imported' },
};
