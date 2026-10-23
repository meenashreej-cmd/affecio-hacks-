import { useState, useEffect, useRef, useCallback } from 'react';
import { mockServer } from '../mocks/mockServer';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * useChatSocket hook
 * Interacts with either the in-memory mock server or the live FastAPI backend.
 *
 * @param {number|string} conversationId
 * @param {number|string} userId
 * @returns {{
 *   messages: Array<{id: number, sender_id: number, text: string, created_at: string, flagged?: string}>,
 *   risk: number,
 *   state: 'normal'|'caution'|'restricted',
 *   scamType: string|null,
 *   reasons: string[],
 *   connected: boolean,
 *   send: (text: string) => void,
 *   blockedNotice: string|null,
 *   clearBlockedNotice: () => void,
 *   attemptMediaUpload: (file?: File) => void,
 * }}
 */
export function useChatSocket(conversationId = 1, userId = 1) {
  const [messages, setMessages] = useState([]);
  const [risk, setRisk] = useState(10);
  const [state, setState] = useState('normal');
  const [scamType, setScamType] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [connected, setConnected] = useState(false);
  const [blockedNotice, setBlockedNotice] = useState(null);

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  // Helper to deduplicate messages by ID
  const appendMessage = useCallback((msg) => {
    if (!msg || !msg.id) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) {
        return prev;
      }
      return [...prev, msg];
    });
  }, []);

  const clearBlockedNotice = useCallback(() => {
    setBlockedNotice(null);
  }, []);

  // -------------------------------------------------------------
  // MOCK IMPLEMENTATION
  // -------------------------------------------------------------
  useEffect(() => {
    if (!USE_MOCK) return;

    isMountedRef.current = true;
    setConnected(true);

    // Initial load: history + risk
    mockServer.getMessages(conversationId).then((initialMsgs) => {
      if (isMountedRef.current) {
        setMessages(initialMsgs);
      }
    });

    mockServer.getRisk(conversationId).then((riskData) => {
      if (isMountedRef.current && riskData) {
        setRisk(riskData.risk ?? 10);
        setState(riskData.state ?? 'normal');
        setScamType(riskData.scam_type ?? null);
        setReasons(riskData.reasons ?? []);
      }
    });

    // Subscribe to events broadcasted across all panes
    const unsubscribe = mockServer.subscribe((event) => {
      if (!isMountedRef.current) return;

      switch (event.type) {
        case 'message':
          appendMessage(event.message);
          break;

        case 'risk_update':
          if (Number(event.conversation_id) === Number(conversationId)) {
            setRisk(event.risk ?? 0);
            setState(event.state ?? 'normal');
            setScamType(event.scam_type ?? null);
            setReasons(event.reasons ?? []);
          }
          break;

        case 'media_blocked':
          if (Number(event.conversation_id) === Number(conversationId)) {
            const reasonText = event.reasons?.[0] || 'Media upload blocked: Thread is under restricted state.';
            setBlockedNotice(reasonText);
          }
          break;

        case 'reset':
          if (Number(event.conversation_id) === Number(conversationId)) {
            setMessages([]);
            setRisk(10);
            setState('normal');
            setScamType(null);
            setReasons([]);
            setBlockedNotice(null);
          }
          break;

        default:
          break;
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [conversationId, appendMessage]);

  // -------------------------------------------------------------
  // REAL NETWORK IMPLEMENTATION (REST + WEBSOCKET)
  // -------------------------------------------------------------
  useEffect(() => {
    if (USE_MOCK) return;

    isMountedRef.current = true;

    // 1. Initial REST fetch for history & risk
    const fetchHistoryAndRisk = async () => {
      try {
        const [msgsRes, riskRes] = await Promise.all([
          fetch(`${API_URL}/conversations/${conversationId}/messages`),
          fetch(`${API_URL}/conversations/${conversationId}/risk`),
        ]);

        if (msgsRes.ok) {
          const msgsData = await msgsRes.json();
          if (isMountedRef.current && Array.isArray(msgsData)) {
            setMessages(msgsData);
          }
        }

        if (riskRes.ok) {
          const riskData = await riskRes.json();
          if (isMountedRef.current && riskData) {
            setRisk(riskData.risk ?? 0);
            setState(riskData.state ?? 'normal');
            setScamType(riskData.scam_type ?? null);
            setReasons(riskData.reasons ?? []);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch initial history/risk:', err);
      }
    };

    fetchHistoryAndRisk();

    // 2. Setup WebSocket connection with auto-reconnect & exponential backoff
    const connectSocket = () => {
      if (!isMountedRef.current) return;

      // Derive ws:// or wss:// from API_URL
      const wsProtocol = API_URL.startsWith('https://') ? 'wss://' : 'ws://';
      const hostPath = API_URL.replace(/^https?:\/\//, '');
      const wsUrl = `${wsProtocol}${hostPath}/ws/${conversationId}?user_id=${userId}`;

      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (isMountedRef.current) {
            setConnected(true);
            reconnectAttemptsRef.current = 0;
          }
        };

        ws.onmessage = (event) => {
          if (!isMountedRef.current) return;
          try {
            const data = JSON.parse(event.data);
            switch (data.type) {
              case 'message':
                if (data.message) {
                  appendMessage(data.message);
                }
                break;

              case 'risk_update':
                if (Number(data.conversation_id) === Number(conversationId)) {
                  setRisk(data.risk ?? 0);
                  setState(data.state ?? 'normal');
                  setScamType(data.scam_type ?? null);
                  setReasons(data.reasons ?? []);
                }
                break;

              case 'media_blocked':
                if (Number(data.conversation_id) === Number(conversationId)) {
                  setBlockedNotice(data.reasons?.[0] || 'Media upload blocked.');
                }
                break;

              default:
                break;
            }
          } catch (e) {
            console.error('Failed to parse websocket message:', e);
          }
        };

        ws.onerror = (err) => {
          console.warn('WebSocket error:', err);
        };

        ws.onclose = () => {
          if (!isMountedRef.current) return;
          setConnected(false);

          // Exponential backoff reconnect: 1s, 2s, 4s, 8s, capped at 10s
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connectSocket, delay);
        };
      } catch (err) {
        console.error('Failed to initialize WebSocket:', err);
        setConnected(false);
      }
    };

    connectSocket();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [conversationId, userId, appendMessage]);

  // -------------------------------------------------------------
  // SEND MESSAGE
  // -------------------------------------------------------------
  const send = useCallback(
    (text) => {
      if (!text || !text.trim()) return;

      if (USE_MOCK) {
        mockServer.sendMessage(conversationId, userId, text);
        return;
      }

      // Real WebSocket client -> server
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'message',
            sender_id: Number(userId),
            text: text.trim(),
          })
        );
      } else {
        // Fallback to REST POST /conversations/{id}/messages
        fetch(`${API_URL}/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender_id: Number(userId),
            text: text.trim(),
          }),
        }).catch((err) => console.error('Failed to send message via REST:', err));
      }
    },
    [conversationId, userId]
  );

  // -------------------------------------------------------------
  // MEDIA UPLOAD / PAPERCLIP ATTEMPT
  // -------------------------------------------------------------
  const attemptMediaUpload = useCallback(
    async (file) => {
      if (USE_MOCK) {
        const result = mockServer.trySendMedia(conversationId, userId);
        if (!result.allowed) {
          setBlockedNotice(result.reasons[0]);
        }
        return;
      }

      // Real REST POST /conversations/{id}/media
      const formData = new FormData();
      formData.append('sender_id', String(userId));
      if (file) {
        formData.append('file', file);
      }

      try {
        const res = await fetch(`${API_URL}/conversations/${conversationId}/media`, {
          method: 'POST',
          body: formData,
        });

        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          const reasonMsg = errData.detail || 'Media upload blocked: Thread state is restricted.';
          setBlockedNotice(reasonMsg);
        }
      } catch (err) {
        console.error('Failed to upload media:', err);
      }
    },
    [conversationId, userId]
  );

  return {
    messages,
    risk,
    state,
    scamType,
    reasons,
    connected,
    send,
    blockedNotice,
    clearBlockedNotice,
    attemptMediaUpload,
  };
}
