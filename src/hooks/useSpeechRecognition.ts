import { useRef, useCallback, useState, useEffect } from 'react';

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  status: string;
  audioLevel: number;
  start: (onInterim: (text: string) => void, onFinal: (text: string) => void) => Promise<void>;
  stop: () => void;
}

export function useSpeechRecognition(language = 'en-US'): UseSpeechRecognitionReturn {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [status, setStatus] = useState('待机');
  const [audioLevel, setAudioLevel] = useState(0);

  const updateVolume = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    // Average magnitude across frequency bins, normalized to 0–1
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length / 255;
    // Apply a gentle expansion curve so quiet speech still visibly moves the meter
    const expanded = Math.min(1, avg * 2.5);
    setAudioLevel(Math.max(0, expanded));
    animationRef.current = requestAnimationFrame(updateVolume);
  }, []);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  const start = useCallback(
    async (onInterim: (text: string) => void, onFinal: (text: string) => void) => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        setStatus('浏览器不支持语音识别，请使用 Chrome');
        return;
      }

      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ok */ }
      }

      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const audioContext = new AudioContext();
        // Resume if suspended — async gap after getUserMedia may leave context suspended
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        // Cancel any stale rAF loop before starting fresh
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        updateVolume();
      } catch {
        setStatus('麦克风权限被拒绝，请在浏览器设置中允许');
        return;
      }

      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setStatus('正在监听...');
        setIsListening(true);
      };

      recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
        const msg = e.error === 'not-allowed'
          ? '麦克风权限被拒绝'
          : e.error === 'no-speech'
            ? '未检测到语音，继续监听中...'
            : `识别错误: ${e.error}`;
        setStatus(msg);
        if (e.error !== 'no-speech') {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setStatus('已停止');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) {
            finalText += r[0].transcript;
          } else {
            interimText += r[0].transcript;
          }
        }

        if (interimText && interimText.trim()) {
          onInterim(interimText.trim());
        }
        if (finalText && finalText.trim()) {
          onFinal(finalText.trim());
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    },
    [language, updateVolume]
  );

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => null);
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setAudioLevel(0);
    setIsListening(false);
    setStatus('已停止');
  }, []);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => null);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return { isListening, isSupported, status, audioLevel, start, stop };
}
