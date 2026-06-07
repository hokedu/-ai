import { useRef, useCallback, useState, useEffect } from 'react';

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  status: string;
  start: (onInterim: (text: string) => void, onFinal: (text: string) => void) => Promise<void>;
  stop: () => void;
}

export function useSpeechRecognition(language = 'en-US'): UseSpeechRecognitionReturn {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [status, setStatus] = useState('待机');

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
        await navigator.mediaDevices.getUserMedia({ audio: true });
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
    [language]
  );

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      setStatus('已停止');
    }
  }, []);

  return { isListening, isSupported, status, start, stop };
}
