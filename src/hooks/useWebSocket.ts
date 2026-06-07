import { useEffect, useRef, useCallback, useState } from 'react';

interface WSMessage {
  type: string;
  mode?: string;
  id?: string;
  source?: string;
  translation?: string;
  oldTranslation?: string;
  newTranslation?: string;
  reason?: string;
  confidence?: number;
  timestamp?: number;
  message?: string;
  // sentiment fields
  emotion?: string;
  intensity?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  lastMessage: WSMessage | null;
  messageHistory: WSMessage[];
  sendMessage: (msg: object) => void;
  clearHistory: () => void;
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [messageHistory, setMessageHistory] = useState<WSMessage[]>([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          setLastMessage(msg);
          setMessageHistory((prev) => [...prev.slice(-99), msg]);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    } catch {
      reconnectRef.current = setTimeout(connect, 2000);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const clearHistory = useCallback(() => setMessageHistory([]), []);

  return { isConnected, lastMessage, messageHistory, sendMessage, clearHistory };
}
