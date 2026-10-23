import { useState, useEffect, useRef, useCallback } from 'react';
import { mockServer } from '../mocks/mockServer';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Constant for media multipart field name as required by contract
export const MEDIA_FIELD_NAME = 'file';
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * useChatSocket hook
 * Manages WebSocket connection, history hydration, message deduplication,
 * stateful risk scoring, media upload gating, reports, and connection resilience.
 *
 * @param {number|string} conversationId
 * @param {number|string} userId
 */
export function useChatSocket(conversationId = 1, userId = 1) {
  const [messages, setMessages] = useState([]);
  const [risk, setRisk] = useState(10);
  const [state, setState] = useState('normal'); // 'normal' | 'caution' | 'restricted'
  const [scamType, setScamType] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [signals, setSignals] = useState([]);

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);

  // Connection states: 'connected' | 'reconnecting' | 'offline'
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [blockedNotice, setBlockedNotice] = useState(null);

  // Debug strip events (last 5 raw events)
  const [rawEvents, setRawEvents] = useState([]);

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  // Track raw event for debug strip
  const recordRawEvent = useCallback((type, payload) => {
    const eventSummary = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      snippet: typeof payload === 'string' ? payload : JSON.stringify(payload).slice(0, 90),
    };
    setRawEvents((prev) => [eventSummary, ...prev.slice(0, 4)]);
  }, []);

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

  // Insert in-chat system notification for media blockages
  const surfaceMediaBlockedInChat = useCallback(
    (reasonText) => {
      const systemNotice = {
        id: `sys-blocked-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        sender_id: 0,
        isSystemNotice: true,
        text: `Media blocked: ${reasonText}`,
        created_at: new Date().toISOString(),
      };
      appendMessage(systemNotice);
      setBlockedNotice(reasonText);
    },
    [appendMessage]
  );

  // -------------------------------------------------------------
  // MOCK IMPLEMENTATION
  // -------------------------------------------------------------
  const loadMockHistory = useCallback(async () => {
    setLoading(true);
    setHistoryError(null);
    try {
      const [initialMsgs, riskData] = await Promise.all([
        mockServer.getMessages(conversationId),
        mockServer.getRisk(conversationId),
      ]);
      if (isMountedRef.current) {
        setMessages(initialMsgs || []);
        if (riskData) {
          setRisk(Math.min(100, Math.max(0, riskData.risk ?? 10)));
          setState(riskData.state ?? 'normal');
          setScamType(riskData.scam_type ?? null);
          setReasons(riskData.reasons ?? []);
          setSignals(riskData.signals ?? []);
        }
        setConnectionStatus('connected');
        setLoading(false);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setHistoryError(err.message || 'Failed to load conversation history.');
        setLoading(false);
      }
    }
  }, [conversationId]);

  useEffect(() => {
    if (!USE_MOCK) return;

    isMountedRef.current = true;
    loadMockHistory();

    const unsubscribe = mockServer.subscribe((event) => {
      if (!isMountedRef.current) return;
      recordRawEvent(event.type, event);

      switch (event.type) {
        case 'message':
          appendMessage(event.message);
          break;

        case 'risk_update':
          if (Number(event.conversation_id) === Number(conversationId)) {
            setRisk(Math.min(100, Math.max(0, event.risk ?? 0)));
            setState(event.state ?? 'normal');
            setScamType(event.scam_type ?? null);
            setReasons(event.reasons ?? []);
            setSignals(event.signals ?? []);
          }
          break;

        case 'media_blocked':
          if (Number(event.conversation_id) === Number(conversationId)) {
            const reasonText =
              event.reasons?.join(', ') ||
              'Media sharing is disabled because this conversation looks risky.';
            surfaceMediaBlockedInChat(reasonText);
          }
          break;

        case '__mock_disconnect__':
          // Simulate socket drop for verification
          setConnectionStatus('reconnecting');
          setTimeout(() => {
            if (isMountedRef.current) {
              setConnectionStatus('connected');
              loadMockHistory();
            }
          }, 2500);
          break;

        case 'reset':
          if (Number(event.conversation_id) === Number(conversationId)) {
            setMessages([]);
            setRisk(10);
            setState('normal');
            setScamType(null);
            setReasons([]);
            setSignals([]);
            setBlockedNotice(null);
            setConnectionStatus('connected');
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
  }, [conversationId, appendMessage, surfaceMediaBlockedInChat, recordRawEvent, loadMockHistory]);

  // -------------------------------------------------------------
  // REAL NETWORK IMPLEMENTATION (REST + WEBSOCKET)
  // -------------------------------------------------------------
  const loadRealHistoryAndRisk = useCallback(async () => {
    setLoading(true);
    setHistoryError(null);
    try {
      const [msgsRes, riskRes] = await Promise.all([
        fetch(`${API_URL}/conversations/${conversationId}/messages`),
        fetch(`${API_URL}/conversations/${conversationId}/risk`),
      ]);

      if (!msgsRes.ok) {
        throw new Error(`Failed to load messages: HTTP ${msgsRes.status}`);
      }
      if (!riskRes.ok) {
        throw new Error(`Failed to load risk data: HTTP ${riskRes.status}`);
      }

      const msgsData = await msgsRes.json();
      const riskData = await riskRes.json();

      if (isMountedRef.current) {
        if (Array.isArray(msgsData)) {
          setMessages(msgsData);
        }
        if (riskData) {
          setRisk(Math.min(100, Math.max(0, riskData.risk ?? 0)));
          setState(riskData.state ?? 'normal');
          setScamType(riskData.scam_type ?? null);
          setReasons(riskData.reasons ?? []);
          setSignals(riskData.signals ?? []);
        }
        setLoading(false);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setHistoryError(
          err.message || `Cannot reach the server at ${API_URL}. Check that backend is running.`
        );
        setLoading(false);
      }
    }
  }, [conversationId]);

  useEffect(() => {
    if (USE_MOCK) return;

    isMountedRef.current = true;
    loadRealHistoryAndRisk();

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
            setConnectionStatus('connected');
            reconnectAttemptsRef.current = 0;
            // Refetch history and risk on successful reconnect to ensure nothing was dropped
            loadRealHistoryAndRisk();
          }
        };

        ws.onmessage = (event) => {
          if (!isMountedRef.current) return;
          try {
            const data = JSON.parse(event.data);
            recordRawEvent(data.type, data);

            switch (data.type) {
              case 'message':
                if (data.message) {
                  appendMessage(data.message);
                }
                break;

              case 'risk_update':
                if (Number(data.conversation_id) === Number(conversationId)) {
                  setRisk(Math.min(100, Math.max(0, data.risk ?? 0)));
                  setState(data.state ?? 'normal');
                  setScamType(data.scam_type ?? null);
                  setReasons(data.reasons ?? []);
                  setSignals(data.signals ?? []);
                }
                break;

              case 'media_blocked':
                if (Number(data.conversation_id) === Number(conversationId)) {
                  const reasonText =
                    data.reasons?.join(', ') ||
                    'Media sharing is disabled because this conversation looks risky.';
                  surfaceMediaBlockedInChat(reasonText);
                }
                break;

              default:
                // Defensive parsing: ignore unknown event types cleanly
                break;
            }
          } catch (e) {
            console.warn('Failed to parse websocket message:', e);
          }
        };

        ws.onerror = (err) => {
          console.warn('WebSocket error:', err);
        };

        ws.onclose = () => {
          if (!isMountedRef.current) return;
          setConnectionStatus('reconnecting');

          // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connectSocket, delay);
        };
      } catch (err) {
        console.error('Failed to initialize WebSocket:', err);
        setConnectionStatus('offline');
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
  }, [conversationId, userId, appendMessage, surfaceMediaBlockedInChat, recordRawEvent, loadRealHistoryAndRisk]);

  // -------------------------------------------------------------
  // SEND MESSAGE WITH RETRY & ERROR HANDLING
  // -------------------------------------------------------------
  const send = useCallback(
    async (text) => {
      if (!text || !text.trim()) return;
      const trimmed = text.trim();

      if (USE_MOCK) {
        mockServer.sendMessage(conversationId, userId, trimmed);
        return;
      }

      // Real WebSocket client -> server
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        try {
          socketRef.current.send(
            JSON.stringify({
              type: 'message',
              sender_id: Number(userId),
              text: trimmed,
            })
          );
          return;
        } catch (wsErr) {
          console.warn('WS send failed, attempting REST fallback:', wsErr);
        }
      }

      // REST fallback
      try {
        const res = await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender_id: Number(userId),
            text: trimmed,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        console.error('Failed to deliver message:', err);
        // Add optimistic failed message to list with retry capability
        const failedMsg = {
          id: `temp-${Date.now()}`,
          sender_id: Number(userId),
          text: trimmed,
          created_at: new Date().toISOString(),
          failed: true,
        };
        appendMessage(failedMsg);
      }
    },
    [conversationId, userId, appendMessage]
  );

  const retrySend = useCallback(
    (failedMsgId, text) => {
      // Remove temporary failed message and re-send
      setMessages((prev) => prev.filter((m) => m.id !== failedMsgId));
      send(text);
    },
    [send]
  );

  // -------------------------------------------------------------
  // UPLOAD MEDIA (with client-side size check & 403 handling)
  // -------------------------------------------------------------
  const uploadMedia = useCallback(
    async (file, bypassCheck = false) => {
      if (!file) return { ok: false, error: 'No file selected' };

      // Client-side file size check (~5MB limit)
      if (file.size > MAX_FILE_SIZE_BYTES) {
        const errorMsg = 'File exceeds the 5 MB limit. Please select a smaller file.';
        return { ok: false, error: errorMsg };
      }

      if (USE_MOCK) {
        const res = await mockServer.uploadMedia({
          conversationId,
          senderId: userId,
          file,
          bypassCheck,
        });

        if (!res.ok && res.status === 403) {
          const reasonsList = res.data?.reasons || ['High risk behavior detected'];
          const reasonText = reasonsList.join(', ');
          surfaceMediaBlockedInChat(reasonText);
          return { ok: false, status: 403, reasons: reasonsList };
        }
        return { ok: true, status: 201 };
      }

      // Real REST POST /conversations/{id}/media
      const formData = new FormData();
      formData.append(MEDIA_FIELD_NAME, file);
      formData.append('sender_id', String(userId));

      try {
        const res = await fetch(`${API_URL}/conversations/${conversationId}/media`, {
          method: 'POST',
          body: formData,
        });

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          // Defensively parse reasons from body.reasons, body.detail.reasons, or body.detail
          let reasonsList = [];
          if (Array.isArray(body.reasons) && body.reasons.length > 0) {
            reasonsList = body.reasons;
          } else if (body.detail && Array.isArray(body.detail.reasons)) {
            reasonsList = body.detail.reasons;
          } else if (typeof body.detail === 'string') {
            reasonsList = [body.detail];
          } else {
            reasonsList = ['Media sharing is disabled because this conversation looks risky'];
          }

          const reasonText = reasonsList.join(', ');
          surfaceMediaBlockedInChat(reasonText);
          return { ok: false, status: 403, reasons: reasonsList };
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.detail || `Upload failed: HTTP ${res.status}`;
          return { ok: false, status: res.status, error: errMsg };
        }

        const data = await res.json();
        return { ok: true, status: 201, data };
      } catch (err) {
        console.error('Media upload request error:', err);
        return { ok: false, error: err.message || 'Network error during upload' };
      }
    },
    [conversationId, userId, surfaceMediaBlockedInChat]
  );

  // -------------------------------------------------------------
  // SUBMIT REPORT (POST /reports)
  // -------------------------------------------------------------
  const submitReport = useCallback(
    async (reasonText) => {
      if (!reasonText || !reasonText.trim()) {
        return { ok: false, error: 'Reason is required' };
      }

      if (USE_MOCK) {
        const res = await mockServer.submitReport({
          conversationId,
          reporterId: userId,
          reason: reasonText.trim(),
        });
        return { ok: true, data: res };
      }

      try {
        const res = await fetch(`${API_URL}/reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: Number(conversationId),
            reporter_id: Number(userId),
            reason: reasonText.trim(),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();
        return { ok: true, data };
      } catch (err) {
        console.error('Failed to submit report:', err);
        return { ok: false, error: err.message || 'Failed to submit report' };
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
    signals,
    loading,
    historyError,
    retryLoadHistory: USE_MOCK ? loadMockHistory : loadRealHistoryAndRisk,
    connected: connectionStatus === 'connected',
    connectionStatus,
    send,
    retrySend,
    blockedNotice,
    clearBlockedNotice,
    uploadMedia,
    submitReport,
    rawEvents,
  };
}

export default useChatSocket;
