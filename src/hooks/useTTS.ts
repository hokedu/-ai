import { useCallback, useRef, useState } from 'react';

/**
 * Maps source language BCP-47 tags to TTS output language.
 * Translations always go to the "other" language in each pair.
 */
const TTS_TARGET_LANG: Record<string, string> = {
  'en-US': 'zh-CN',
  'ja-JP': 'zh-CN',
  'ko-KR': 'zh-CN',
  'zh-CN': 'en-US',
};

/**
 * Emotion → SpeechSynthesis voice modulation parameters.
 *
 * | Emotion  | Pitch  | Rate   | Effect                      |
 * |----------|--------|--------|-----------------------------|
 * | happy    | +20%   | +10%   | Brighter, slightly faster   |
 * | sad      | -15%   | -15%   | Lower, slower, quieter      |
 * | angry    | +30%   | +15%   | Sharper, faster, forceful   |
 * | urgent   | +10%   | +25%   | Elevated, noticeably fast   |
 * | calm     | normal | -10%   | Even, unhurried             |
 * | excited  | +25%   | +20%   | High-energy delivery        |
 * | confused | +5%    | -5%    | Slightly hesitant pacing    |
 * | neutral  | normal | normal | Default delivery            |
 */
const EMOTION_TTS_PARAMS: Record<string, { pitch: number; rate: number; volume: number }> = {
  happy:    { pitch: 1.2,  rate: 1.1,  volume: 1.0 },
  sad:      { pitch: 0.85, rate: 0.85, volume: 0.8 },
  angry:    { pitch: 1.3,  rate: 1.15, volume: 1.0 },
  urgent:   { pitch: 1.1,  rate: 1.25, volume: 1.0 },
  calm:     { pitch: 1.0,  rate: 0.9,  volume: 0.9 },
  neutral:  { pitch: 1.0,  rate: 1.0,  volume: 1.0 },
  excited:  { pitch: 1.25, rate: 1.2,  volume: 1.0 },
  confused: { pitch: 1.05, rate: 0.95, volume: 0.9 },
};

interface TTSHook {
  /** Whether speech synthesis is currently playing. */
  isSpeaking: boolean;
  /** Whether the browser supports SpeechSynthesis at all. */
  isSupported: boolean;
  /**
   * Speak the given text in the target language with emotion-modulated voice.
   * @param text - The translated text to speak.
   * @param sourceLanguage - BCP-47 source language (used to derive target TTS lang).
   * @param sentiment - Optional sentiment info for pitch/rate/volume modulation.
   */
  speak: (text: string, sourceLanguage: string, sentiment?: SentimentInfo) => void;
  /** Stop any currently-playing speech. */
  stop: () => void;
}

export function useTTS(): TTSHook {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported = typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined';

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    utteranceRef.current = null;
  }, [isSupported]);

  const speak = useCallback(
    (text: string, sourceLanguage: string, sentiment?: SentimentInfo) => {
      if (!isSupported || !text.trim()) return;

      // Cancel any in-progress speech before starting new one
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      // Set target language for TTS
      const ttsLang = TTS_TARGET_LANG[sourceLanguage] || 'zh-CN';
      utterance.lang = ttsLang;

      // Apply emotion-based voice modulation
      const emotion = sentiment?.emotion || 'neutral';
      const intensity = sentiment?.intensity ?? 0.5;
      const params = EMOTION_TTS_PARAMS[emotion] || EMOTION_TTS_PARAMS.neutral;

      // Blend between neutral (1.0) and emotion target based on intensity
      utterance.pitch = 1.0 + (params.pitch - 1.0) * intensity;
      utterance.rate = 1.0 + (params.rate - 1.0) * intensity;
      utterance.volume = 1.0 + (params.volume - 1.0) * intensity;

      // Try to pick a voice matching the target language
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const matchingVoice = voices.find((v) => v.lang.startsWith(ttsLang))
          || voices.find((v) => v.lang.startsWith(ttsLang.split('-')[0]))
          || voices[0];
        utterance.voice = matchingVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };
      utterance.onerror = (event) => {
        // 'canceled' is expected when stop() is called — don't log.
        if (event.error !== 'canceled') {
          console.error('TTS error:', event.error);
        }
        setIsSpeaking(false);
        utteranceRef.current = null;
      };

      window.speechSynthesis.speak(utterance);
    },
    [isSupported]
  );

  return { isSpeaking, isSupported, speak, stop };
}
