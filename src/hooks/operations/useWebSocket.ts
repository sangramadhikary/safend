'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

type WebSocketEvent = {
  type: string;
  payload: any;
};

export function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketEvent | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    // Try the custom session_token first (set by SessionGuard after login),
    // then fall back to the Supabase access token stored by @supabase/supabase-js.
    let token = localStorage.getItem('session_token');
    if (!token) {
      // Supabase stores the session under a key like `sb-<ref>-auth-token`
      try {
        const sbKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (sbKey) {
          const sbSession = JSON.parse(localStorage.getItem(sbKey) || '{}');
          token = sbSession?.access_token || null;
        }
      } catch {
        // Ignore parse errors
      }
    }
    if (!token) {
      // No token available — mark as disconnected but don't retry endlessly
      setIsConnected(false);
      return;
    }

    // Clean up any existing socket before creating a new one
    if (socketRef.current) {
      socketRef.current.onclose = null; // prevent triggering reconnect from cleanup
      socketRef.current.close();
      socketRef.current = null;
    }

    try {
      const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (unmountedRef.current) { ws.close(); return; }
        setIsConnected(true);
        reconnectAttemptRef.current = 0;
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setIsConnected(false);
        socketRef.current = null;

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptRef.current < maxReconnectAttempts) {
          const delay = reconnectDelay * Math.pow(1.5, reconnectAttemptRef.current);
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onerror is always followed by onclose — no action needed here
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          setLastMessage(data);
        } catch {
          // Ignore unparseable messages
        }
      };

      socketRef.current = ws;
    } catch {
      // WebSocket constructor can throw on invalid URLs — treat as connection failure
      setIsConnected(false);
    }
  }, [url]);

  // Initialize connection
  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  // Function to send messages
  const sendMessage = useCallback((type: string, payload: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const message: WebSocketEvent = { type, payload };
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    reconnectAttempt: reconnectAttemptRef.current,
    maxReconnectAttempts
  };
}
