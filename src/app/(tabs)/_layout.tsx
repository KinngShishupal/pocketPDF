import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { C } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <NativeTabs
      backgroundColor={C.surface}
      tintColor={C.text}
      iconColor={C.faint}
      indicatorColor={C.accent + '40'}
      labelStyle={{ color: C.faint, selected: { color: C.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Tools</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" md="apps" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="files">
        <NativeTabs.Trigger.Label>Files</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="folder.fill" md="folder" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
