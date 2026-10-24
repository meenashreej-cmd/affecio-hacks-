import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatSocket } from '../hooks/useChatSocket';
import { SEED_USERS } from '../mocks/mockServer';
import MessageBubble from './MessageBubble';
import RiskMeter from './RiskMeter';
import CautionBanner from './CautionBanner';
import UserSwitcher from './UserSwitcher';
import MediaButton from './MediaButton';
import ExplainPanel from './ExplainPanel';
import ReportDialog from './ReportDialog';
import {
  Send,
  Flag,
  AlertTriangle,
  RotateCcw,
  Wifi,
  WifiOff,
  ArrowDown,
  Info,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from 'lucide-react';

const SHOW_DEV_TOOLS = import.meta.env.VITE_SHOW_DEV_TOOLS === 'true';

/**
 * ChatWindow Component (Day 2 Deliverable)
 * Full-featured chat pane with real-time risk scoring, explain drawer,
 * report workflow, gated media uploads, and resilient connection handling.
 *
 * @param {Object} props
 * @param {number|string} props.conversationId
 * @param {number} props.userId
 * @param {(newId: number) => void} props.onSelectUser
 * @param {string} props.paneRole
 * @param {string} props.paneId
 * @param {Array<{id: number, name: string, is_new?: boolean, role?: string, avatar?: string}>} [props.userList]
 */
export function ChatWindow({
  conversationId = 1,
  userId = 1,
  onSelectUser,
  paneRole = 'Pane',
  paneId = 'pane-a',
  userList = SEED_USERS,
}) {
  const [inputText, setInputText] = useState('');
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [isExplainOpen, setIsExplainOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [hasScrolledUp, setHasScrolledUp] = useState(false);
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false);

  // Floating toast state
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const messagesContainerRef = useRef(null);
  const prevMessagesCountRef = useRef(0);

  const showToast = useCallback((message, type = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Hook connecting to mock server or live backend
  const {
    messages,
    risk,
    state,
    scamType,
    reasons,
    signals,
    loading,
    historyError,
    retryLoadHistory,
    connected,
    connectionStatus,
    send,
    retrySend,
    uploadMedia,
    submitReport,
    rawEvents,
  } = useChatSocket(conversationId, userId);

  // Active user details
  const currentUser = userList.find((u) => Number(u.id) === Number(userId)) || {
    id: userId,
    name: `User ${userId}`,
    avatar: '👤',
    role: 'Member',
  };

  // Other user in this conversation
  const otherUser = userList.find((u) => Number(u.id) !== Number(userId)) || {
    id: 99,
    name: 'Contact',
    avatar: '💬',
    role: 'Contact',
  };

  // Priya (ID 1) is recipient/victim
  const isRecipient = Number(userId) === 1;
  const isRestricted = state === 'restricted' || risk >= 70;

  // Track scroll position to prevent auto-scroll jump when user scrolls up
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    setHasScrolledUp(!isAtBottom);
    if (isAtBottom) {
      setShowNewMessagesPill(false);
    }
  };

  // Auto-scroll logic with "New messages" pill when scrolled up
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (messages.length > prevMessagesCountRef.current) {
      if (hasScrolledUp) {
        setShowNewMessagesPill(true);
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
    prevMessagesCountRef.current = messages.length;
  }, [messages, hasScrolledUp]);

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
      setShowNewMessagesPill(false);
      setHasScrolledUp(false);
    }
  };

  // Jump to specific evidence message and highlight briefly
  const handleSelectEvidenceMessage = (msgId) => {
    setHighlightedMsgId(msgId);
    setTimeout(() => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    setTimeout(() => {
      setHighlightedMsgId(null);
    }, 3000);
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputText.trim() || connectionStatus !== 'connected') return;
    send(inputText);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Dev bypass button to demonstrate server-side 403 enforcement
  const handleDevUploadBypass = async () => {
    showToast('Dev Mode: Attempting bypass upload against restricted state...', 'info');
    const dummyFile = new File(['test malware receipt bytes'], 'receipt_urgent.png', {
      type: 'image/png',
    });
    const res = await uploadMedia(dummyFile, true);
    if (!res.ok && res.status === 403) {
      const reasonMsg = res.reasons?.join(', ') || 'High risk behavior detected';
      showToast(`Server 403 Enforced: ${reasonMsg}`, 'error');
    }
  };

  return (
    <div
      id={`${paneId}-container`}
      className="flex flex-col h-[720px] bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden relative"
    >
      {/* Pane Top Bar: Identity Switcher & Connection Pill */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-300 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700/60">
            {paneRole}
          </span>

          {/* Connection Status Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono">
            {connectionStatus === 'connected' ? (
              <>
                <span
                  id={`${paneId}-status-dot`}
                  className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                />
                <span className="text-[11px] text-emerald-300 font-semibold">Connected</span>
              </>
            ) : connectionStatus === 'reconnecting' ? (
              <>
                <span
                  id={`${paneId}-status-dot`}
                  className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                />
                <span className="text-[11px] text-amber-300 font-semibold">Reconnecting...</span>
              </>
            ) : (
              <>
                <span
                  id={`${paneId}-status-dot`}
                  className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                />
                <span className="text-[11px] text-rose-300 font-semibold">Offline</span>
              </>
            )}
          </div>
        </div>

        {/* User Switcher Control */}
        <UserSwitcher currentUserId={userId} onSelectUser={onSelectUser} />
      </div>

      {/* Chat Header: Persona info & Report Button */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-lg select-none shadow-sm">
              {otherUser.avatar || '👤'}
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">
                Chat with {otherUser.name}
              </h2>
              {otherUser.id === 2 && (
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded border border-slate-700 font-mono">
                  Scripted Partner
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Viewing as <strong className="text-indigo-400 font-semibold">{currentUser.name}</strong> ({currentUser.role || 'Member'})
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Dev Bypass Upload Button (Hidden unless VITE_SHOW_DEV_TOOLS=true) */}
          {SHOW_DEV_TOOLS && (
            <button
              onClick={handleDevUploadBypass}
              type="button"
              className="px-2 py-1 text-[11px] rounded bg-purple-950/80 hover:bg-purple-900 border border-purple-500/50 text-purple-200 font-mono font-bold cursor-pointer"
              title="Dev Tool: Send media upload even if disabled to demonstrate 403 refusal on stage"
            >
              Try upload anyway
            </button>
          )}

          {/* Report Button (pulsing red outline when state is restricted) */}
          <button
            id={`${paneId}-report-btn`}
            type="button"
            onClick={() => setIsReportOpen(true)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isRestricted
                ? 'bg-rose-950/80 text-rose-300 border border-rose-500/60 shadow-lg shadow-rose-950/40 ring-2 ring-rose-500/40 animate-pulse'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-700'
            }`}
            title="Report this conversation"
          >
            <Flag className="w-3.5 h-3.5 text-rose-400" />
            <span>Report</span>
          </button>
        </div>
      </div>

      {/* Risk Meter with Explain Action */}
      <RiskMeter
        risk={risk}
        state={state}
        scamType={scamType}
        loading={loading}
        onOpenExplain={() => setIsExplainOpen(true)}
        showExplainButton={isRecipient}
      />

      {/* Caution Banner (Visible in recipient pane only) */}
      <CautionBanner
        state={state}
        reasons={reasons}
        scamType={scamType}
        isRecipient={isRecipient}
        onOpenExplain={() => setIsExplainOpen(true)}
      />

      {/* Offline / Reconnecting Alert Strip */}
      {connectionStatus !== 'connected' && (
        <div className="bg-amber-950/80 border-b border-amber-600/40 px-4 py-1.5 text-xs text-amber-200 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Connection dropped. Reconnecting in background with exponential backoff...</span>
          </div>
          <span className="font-mono text-[10px] uppercase text-amber-300">Live Sync Paused</span>
        </div>
      )}

      {/* Messages Scroll Feed */}
      <div
        id={`${paneId}-messages`}
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 relative"
      >
        {/* Loading Skeleton */}
        {loading ? (
          <div className="h-full flex flex-col justify-end space-y-3 p-4 animate-pulse">
            <div className="w-1/2 h-10 bg-slate-800/80 rounded-2xl" />
            <div className="w-2/3 h-12 bg-slate-800/80 rounded-2xl ml-auto" />
            <div className="w-1/3 h-10 bg-slate-800/80 rounded-2xl" />
          </div>
        ) : historyError ? (
          // History Load Failure Card with Retry
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-950/40 border border-rose-800/60 flex items-center justify-center text-rose-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Failed to Load History</h3>
            <p className="text-xs text-slate-400 max-w-xs mb-4">{historyError}</p>
            <button
              onClick={retryLoadHistory}
              type="button"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-950/40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Load</span>
            </button>
          </div>
        ) : messages.length === 0 ? (
          // Friendly Empty State
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6 select-none">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-800 flex items-center justify-center text-3xl mb-3 shadow-inner">
              💬
            </div>
            <p className="text-base font-semibold text-slate-300 mb-1">No messages yet</p>
            <p className="text-xs text-slate-400 max-w-xs">
              Say hello to start the conversation, or click <span className="text-indigo-400 font-semibold">&quot;Play scam demo&quot;</span> in the header to run the test script.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = Number(msg.sender_id) === Number(userId);
            const senderObj = userList.find((u) => Number(u.id) === Number(msg.sender_id));

            return (
              <MessageBubble
                key={msg.id}
                messageId={msg.id}
                text={msg.text}
                timestamp={msg.created_at}
                isOwn={isOwn}
                flagged={msg.flagged}
                isSystemNotice={msg.isSystemNotice}
                failed={msg.failed}
                onRetry={() => retrySend(msg.id, msg.text)}
                isHighlighted={Number(highlightedMsgId) === Number(msg.id)}
                senderName={senderObj?.name || `User ${msg.sender_id}`}
              />
            );
          })
        )}

        {/* "New messages" pill when scrolled up */}
        {showNewMessagesPill && (
          <div className="sticky bottom-2 left-0 right-0 flex justify-center z-20">
            <button
              onClick={scrollToBottom}
              type="button"
              className="px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-950/80 flex items-center gap-1.5 cursor-pointer animate-bounce"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>New messages below</span>
            </button>
          </div>
        )}
      </div>

      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={`absolute bottom-16 left-4 right-4 z-30 p-3 rounded-xl text-xs flex items-center justify-between gap-2 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border border-rose-500/80 text-rose-100 shadow-rose-950/60'
              : toast.type === 'success'
              ? 'bg-emerald-950/95 border border-emerald-500/80 text-emerald-100 shadow-emerald-950/60'
              : 'bg-slate-800/95 border border-slate-700 text-slate-100'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'error' ? (
              <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            ) : toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            type="button"
            className="text-slate-400 hover:text-white p-1 rounded"
          >
            &times;
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 bg-slate-950 border-t border-slate-800">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          {/* Gated MediaButton replacing paperclip */}
          <MediaButton
            state={state}
            onUpload={uploadMedia}
            showToast={showToast}
            idPrefix={`${paneId}-media`}
          />

          {/* Message Input */}
          <input
            id={`${paneId}-input`}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              connectionStatus !== 'connected'
                ? 'Reconnecting to chat stream...'
                : `Message ${otherUser.name}... (Press Enter)`
            }
            className="flex-1 bg-slate-900 text-base text-slate-100 placeholder-slate-500 px-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner disabled:opacity-50"
          />

          {/* Send Button */}
          <button
            id={`${paneId}-send-btn`}
            type="submit"
            disabled={!inputText.trim() || connectionStatus !== 'connected'}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-md shadow-indigo-900/30 cursor-pointer flex-shrink-0"
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* ExplainPanel Side Drawer */}
      <ExplainPanel
        isOpen={isExplainOpen}
        onClose={() => setIsExplainOpen(false)}
        risk={risk}
        state={state}
        scamType={scamType}
        reasons={reasons}
        signals={signals}
        onSelectEvidenceMessage={handleSelectEvidenceMessage}
        onOpenReportDialog={() => setIsReportOpen(true)}
        isRecipient={isRecipient}
      />

      {/* ReportDialog Modal */}
      <ReportDialog
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        onSubmit={submitReport}
        reportedUserName={otherUser.name}
      />
    </div>
  );
}

export default ChatWindow;
