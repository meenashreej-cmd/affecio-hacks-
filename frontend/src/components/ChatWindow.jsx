import React, { useState, useRef, useEffect } from 'react';
import { useChatSocket } from '../hooks/useChatSocket';
import { SEED_USERS } from '../mocks/mockServer';
import MessageBubble from './MessageBubble';
import RiskMeter from './RiskMeter';
import CautionBanner from './CautionBanner';
import UserSwitcher from './UserSwitcher';
import { Paperclip, Send, AlertCircle, X } from 'lucide-react';

/**
 * ChatWindow Component
 * Represents one pane of the dual-pane chat platform.
 *
 * @param {Object} props
 * @param {number|string} props.conversationId - Conversation ID (default 1)
 * @param {number} props.userId - Current active user ID for this pane
 * @param {(newId: number) => void} props.onSelectUser - Switch user callback
 * @param {string} props.paneRole - Descriptive label, e.g. "User A" or "User B"
 * @param {string} [props.paneId] - Identifier for unique DOM element IDs ('pane-a' | 'pane-b')
 */
export function ChatWindow({
  conversationId = 1,
  userId = 1,
  onSelectUser,
  paneRole = 'Pane',
  paneId = 'pane-a',
}) {
  const [inputText, setInputText] = useState('');
  const messagesContainerRef = useRef(null);

  // Connect to chat hook (mock or real backend)
  const {
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
  } = useChatSocket(conversationId, userId);

  // Active user details
  const currentUser = SEED_USERS.find((u) => u.id === Number(userId)) || {
    id: userId,
    name: `User ${userId}`,
    avatar: '👤',
    role: 'Member',
  };

  // Other user in this 2-party chat
  const otherUser = SEED_USERS.find((u) => u.id !== Number(userId)) || {
    id: 99,
    name: 'Contact',
    avatar: '💬',
    role: 'Contact',
  };

  // Priya (ID 1) is the seeded recipient / target
  const isRecipient = Number(userId) === 1;

  // Auto-scroll message container to latest without shifting window scroll position
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    send(inputText);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaperclipClick = () => {
    attemptMediaUpload();
  };

  return (
    <div
      id={`${paneId}-container`}
      className="flex flex-col h-[650px] bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden"
    >
      {/* Pane Top Bar: Identity Switcher & Connection Dot */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-300 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700/60">
            {paneRole}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <span
              id={`${paneId}-status-dot`}
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                connected
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
              }`}
              title={connected ? 'Connected to live stream' : 'Disconnected'}
            />
            <span className="text-[11px] font-mono text-slate-400">
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* User Switcher Control */}
        <UserSwitcher currentUserId={userId} onSelectUser={onSelectUser} />
      </div>

      {/* Chat Header: Current Persona & Partner Info */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-lg select-none shadow-sm">
              {otherUser.avatar}
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
              Viewing as <strong className="text-indigo-400 font-semibold">{currentUser.name}</strong> ({currentUser.role})
            </p>
          </div>
        </div>
      </div>

      {/* Prominent Risk Meter in Pane */}
      <RiskMeter risk={risk} state={state} scamType={scamType} />

      {/* Caution Banner (Shown ONLY for recipient pane on caution/restricted) */}
      <CautionBanner
        state={state}
        reasons={reasons}
        scamType={scamType}
        isRecipient={isRecipient}
      />

      {/* Blocked Media Alert (if user tried paperclip during restricted) */}
      {blockedNotice && (
        <div
          id={`${paneId}-blocked-notice`}
          className="mx-3 my-2 p-2.5 rounded-lg bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs flex items-start justify-between gap-2 shadow-lg animate-in fade-in"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Action Prohibited</span>
              <span>{blockedNotice}</span>
            </div>
          </div>
          <button
            onClick={clearBlockedNotice}
            className="text-rose-400 hover:text-white p-0.5 rounded cursor-pointer"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        id={`${paneId}-messages`}
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6 select-none">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-800 flex items-center justify-center text-2xl mb-3">
              💬
            </div>
            <p className="text-sm font-medium text-slate-400 mb-1">No messages in thread yet</p>
            <p className="text-xs text-slate-500 max-w-xs">
              Type a message below or click <span className="text-indigo-400 font-semibold">&quot;Play scam demo&quot;</span> in the header to run the test script.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = Number(msg.sender_id) === Number(userId);
            const senderObj = SEED_USERS.find((u) => u.id === Number(msg.sender_id));
            return (
              <MessageBubble
                key={msg.id}
                text={msg.text}
                timestamp={msg.created_at}
                isOwn={isOwn}
                flagged={msg.flagged}
                senderName={senderObj?.name || `User ${msg.sender_id}`}
              />
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-slate-950 border-t border-slate-800">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          {/* Paperclip placeholder for media upload */}
          <button
            id={`${paneId}-clip-btn`}
            type="button"
            onClick={handlePaperclipClick}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex-shrink-0 ${
              state === 'restricted'
                ? 'bg-rose-950/40 border-rose-800/60 text-rose-400 hover:bg-rose-900/60 hover:text-rose-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
            title={
              state === 'restricted'
                ? 'Media upload disabled in restricted state'
                : 'Attach media (click to test restricted-state intercept)'
            }
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Message Input */}
          <input
            id={`${paneId}-input`}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${otherUser.name}... (Press Enter)`}
            className="flex-1 bg-slate-900 text-sm text-slate-100 placeholder-slate-500 px-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
          />

          {/* Send Button */}
          <button
            id={`${paneId}-send-btn`}
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-md shadow-indigo-900/30 cursor-pointer flex-shrink-0"
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatWindow;
