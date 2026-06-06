import { useEffect, useRef, useCallback, useState } from 'react';

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  status: string;
  start: () => Promise<void>;
  stop: () => void;
  setOnInterim: (fn: ((text: string) => void) | null) => void;
  setOnFinal: (fn: ((text: string) => void) | null) => void;
}

export function useSpeechRecognition(language = 'en-US'): UseSpeechRecognitionReturn {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onInterimRef = useRef<((text: string) => void) | null>(null);
  const onFinalRef = useRef<((text: string) => void) | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [status, setStatus] = useState('待机');

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  const start = useCallback(async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setStatus('浏览器不支持语音识别'); return; }

    try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
      setStatus('麦克风权限被拒绝'); return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { setStatus('正在监听...'); setIsListening(true); };
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setStatus(e.error === 'not-allowed' ? '麦克风权限被拒绝' : `错误: ${e.error}`);
    };
    recognition.onend = () => { setIsListening(false); setStatus('已停止'); };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }

      if (interimText && onInterimRef.current) onInterimRef.current(interimText);
      if (finalText && onFinalRef.current) onFinalRef.current(finalText);
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [language]);

  const stop = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); }
  }, []);

  return {
    isListening, isSupported, status, start, stop,
    setOnInterim: (fn) => { onInterimRef.current = fn; },
    setOnFinal: (fn) => { onFinalRef.current = fn; }
  };
}
