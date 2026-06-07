interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

declare var SpeechRecognition: {
  new(): SpeechRecognition;
  prototype: SpeechRecognition;
};

declare var webkitSpeechRecognition: {
  new(): SpeechRecognition;
  prototype: SpeechRecognition;
};

interface SentimentInfo {
  emotion: 'happy' | 'sad' | 'angry' | 'urgent' | 'calm' | 'neutral' | 'excited' | 'confused';
  intensity: number;  // 0.0 - 1.0
  confidence: number; // 0 - 100
}

// Document Picture-in-Picture API (Chrome 116+)
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture;
  electronAPI?: {
    openPip: () => void;
    closePip: () => void;
    isPipOpen: () => Promise<boolean>;
    onPipClosed: (callback: () => void) => () => void;
  };
}
