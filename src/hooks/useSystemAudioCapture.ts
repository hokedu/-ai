import { useRef, useCallback, useState, useEffect } from 'react';

interface UseSystemAudioCaptureReturn {
  isCapturing: boolean;
  isSupported: boolean;
  status: string;
  audioLevel: number;
  start: (onAudioChunk: (base64Pcm: string) => void) => Promise<void>;
  stop: () => void;
}

/**
 * Capture system audio via getDisplayMedia (Chrome 74+).
 *
 * Extracts PCM16 16kHz mono audio as base64 chunks for server-side STT.
 * Drives the audio level meter via AnalyserNode.
 *
 * Usage:
 *   const { start, stop, audioLevel } = useSystemAudioCapture();
 *   start((chunk) => sendMessage({ type: 'audio-chunk', data: chunk }));
 */
export function useSystemAudioCapture(): UseSystemAudioCaptureReturn {
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const onChunkRef = useRef<((base64Pcm: string) => void) | null>(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [status, setStatus] = useState('待机');
  const [audioLevel, setAudioLevel] = useState(0);

  useEffect(() => {
    const supported = !!(navigator.mediaDevices && (navigator.mediaDevices as any).getDisplayMedia);
    setIsSupported(supported);
  }, []);

  const updateLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length / 255;
    const expanded = Math.min(1, avg * 2.5);
    setAudioLevel(Math.max(0, expanded));
    animationRef.current = requestAnimationFrame(updateLevel);
  }, []);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
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
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    onChunkRef.current = null;
    setAudioLevel(0);
  }, []);

  const start = useCallback(
    async (onAudioChunk: (base64Pcm: string) => void) => {
      if (!isSupported) {
        setStatus('系统音频采集需 Chrome 浏览器');
        return;
      }

      onChunkRef.current = onAudioChunk;

      try {
        // Prompt user to share system/tab audio
        const stream = await (navigator.mediaDevices as any).getDisplayMedia({
          audio: true,
          video: { displaySurface: 'browser' } as any,
        });

        streamRef.current = stream;

        // Stop video tracks — we only need audio
        stream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          setStatus('未检测到系统音频，请勾选"分享音频"');
          stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
          streamRef.current = null;
          return;
        }

        // Use 16kHz sample rate — optimal for STT engines
        const audioContext = new AudioContext({ sampleRate: 16000 });
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        audioContextRef.current = audioContext;

        // Analyser for level meter
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        analyserRef.current = analyser;

        // ScriptProcessor extracts raw PCM (4096 samples @ 16kHz ≈ 256ms chunks)
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        source.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (event: AudioProcessingEvent) => {
          const input = event.inputBuffer.getChannelData(0);
          // Float32 [-1, 1] → Int16 PCM
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          const base64 = bufferToBase64(pcm.buffer as ArrayBuffer);
          onChunkRef.current?.(base64);
        };

        // Start level meter loop
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        updateLevel();

        // Handle user clicking "Stop sharing" in the browser toolbar
        stream.getAudioTracks()[0].onended = () => {
          setIsCapturing(false);
          setStatus('音频共享已停止');
          cleanup();
        };

        setIsCapturing(true);
        setStatus('系统音频收集中...');
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          setStatus('请允许屏幕共享以捕获系统音频');
        } else {
          setStatus(`音频捕获失败: ${err.message}`);
        }
      }
    },
    [isSupported, updateLevel, cleanup]
  );

  const stop = useCallback(() => {
    cleanup();
    setIsCapturing(false);
    setStatus('已停止');
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => null);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { isCapturing, isSupported, status, audioLevel, start, stop };
}

/** Convert ArrayBuffer → base64 for JSON WebSocket transport */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
