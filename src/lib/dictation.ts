import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import type { ExpoSpeechRecognitionModule as SpeechModule } from 'expo-speech-recognition';

/**
 * expo-speech-recognition ships native code that Expo Go doesn't include and
 * throws on import when it's missing, so it is loaded optionally. In Expo Go
 * `dictationAvailable` is false and the UI falls back to keyboard dictation.
 */
let speech: typeof SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  speech = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {
  speech = null;
}

export const dictationAvailable = speech !== null;

export const DICTATION_LANGS = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
] as const;

/** Spoken formatting commands, applied to each finished phrase. */
function applyCommands(text: string) {
  return text
    .replace(/\s*\bnew paragraph\b\s*/gi, '\n\n')
    .replace(/\s*\bnew line\b\s*/gi, '\n')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/(\n|[.!?] )(\p{Ll})/gu, (_, lead: string, ch: string) => lead + ch.toUpperCase());
}

/** Joins a dictated phrase onto existing text with sensible spacing and capitalization. */
export function appendPhrase(existing: string, phrase: string) {
  const clean = applyCommands(phrase.trim());
  if (!clean.trim()) return existing + clean;
  const endsSentence = !existing.trim() || /[.!?]\s*$|\n\s*$/.test(existing);
  const body = endsSentence ? clean.charAt(0).toUpperCase() + clean.slice(1) : clean;
  const sep = !existing || /\s$/.test(existing) || /^\n/.test(body) ? '' : ' ';
  return existing + sep + body;
}

export function useDictation(onPhrase: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [level, setLevel] = useState(0);
  const handler = useRef(onPhrase);

  useEffect(() => {
    handler.current = onPhrase;
  }, [onPhrase]);

  useEffect(() => {
    if (!speech) return;
    const subs = [
      speech.addListener('start', () => setListening(true)),
      speech.addListener('end', () => {
        setListening(false);
        setPartial('');
        setLevel(0);
      }),
      speech.addListener('result', (e) => {
        const text = e.results[0]?.transcript ?? '';
        if (e.isFinal) {
          setPartial('');
          if (text) handler.current(text);
        } else {
          setPartial(text);
        }
      }),
      speech.addListener('volumechange', (e) => setLevel(Math.max(0, Math.min(1, (e.value + 2) / 12)))),
      speech.addListener('error', (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'not-allowed') {
          Alert.alert('Microphone blocked', 'Allow microphone and speech recognition for 1TapPDF in Settings.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
        Alert.alert('Voice typing stopped', e.message || e.error);
      }),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      speech?.abort();
    };
  }, []);

  const start = async (lang: string) => {
    if (!speech) return;
    if (!speech.isRecognitionAvailable()) {
      Alert.alert('Voice typing unavailable', 'This device has no speech recognition service. Install or enable Google speech services and try again.');
      return;
    }
    const perm = await speech.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone needed', 'Allow microphone access to type by speaking.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    speech.start({
      lang,
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
    });
  };

  const stop = () => speech?.stop();

  return { available: dictationAvailable, listening, partial, level, start, stop };
}
