import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert } from 'react-native';

import { clearWork } from './fs';

/** Runs a long PDF job behind the busy overlay and surfaces failures as alerts. */
export function useTask() {
  const [label, setLabel] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | undefined>(undefined);

  async function run<T>(
    text: string,
    job: (report: (done: number, total: number) => void) => Promise<T>,
  ): Promise<T | undefined> {
    setLabel(text);
    setProgress(undefined);
    try {
      const result = await job((done, total) => setProgress(total ? done / total : undefined));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return result;
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Something went wrong', e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setLabel(null);
      clearWork();
    }
  }

  return { busy: label !== null, label: label ?? '', progress, run };
}
