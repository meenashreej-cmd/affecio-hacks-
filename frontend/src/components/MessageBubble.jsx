import React from 'react';
import { AlertCircle, RotateCcw, ShieldAlert, Paperclip } from 'lucide-react';

/**
 * MessageBubble Component
 * Displays a single chat message with projector-ready large typography (>=16px),
 * timestamps, sender alignment, risk alert indicators, system notice styling,
 * failed message retry action, and evidence pulse highlighting.
 *
 * @param {Object} props
 * @param {string} props.text - The message content
 * @param {string} props.timestamp - ISO date string
 * @param {boolean} props.isOwn - Whether message was sent by current pane's user
 * @param {'caution'|'restricted'|undefined} [props.flagged] - Alert status flag
 * @param {string} [props.senderName] - Name of sender for context
 * @param {boolean} [props.isSystemNotice] - Whether this is an in-chat system message
 * @param {boolean} [props.failed] - Failed delivery status
 * @param {() => void} [props.onRetry] - Retry callback for failed message
 * @param {boolean} [props.isHighlighted] - Temporary highlight flag for evidence jump
 * @param {number|string} [props.messageId] - Unique ID for DOM anchor
 */
export function MessageBubble({
  text,
  timestamp,
  isOwn,
  flagged,
  senderName,
  isSystemNotice = false,
  failed = false,
  onRetry,
  isHighlighted = false,
  messageId,
}) {
  // Format readable time e.g., "11:04 AM"
  const formattedTime = React.useMemo(() => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [timestamp]);

  // Special System Notice (e.g. Media Blocked by risk engine)
  if (isSystemNotice) {
    return (
      <div
        id={`msg-${messageId}`}
        className="my-3 flex justify-center animate-in fade-in slide-in-from-bottom-1 duration-200"
      >
        <div className="max-w-[90%] sm:max-w-md px-4 py-2 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs sm:text-sm flex items-center gap-2.5 shadow-md shadow-rose-950/40">
          <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span className="font-medium">{text}</span>
        </div>
      </div>
    );
  }

  const flaggedStyles = {
    caution: {
      dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]',
      border: 'border-amber-500/50',
      badge: 'text-amber-300 bg-amber-500/15 border border-amber-500/40',
      label: 'Flagged: Caution',
    },
    restricted: {
      dot: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.9)] animate-pulse',
      border: 'border-rose-500/60',
      badge: 'text-rose-300 bg-rose-500/20 border border-rose-500/50',
      label: 'Flagged: High Risk',
    },
  };

  const currentFlag = flagged ? flaggedStyles[flagged] : null;

  return (
    <div
      id={`msg-${messageId}`}
      className={`flex flex-col mb-4 ${
        isOwn ? 'items-end' : 'items-start'
      } transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 duration-200`}
    >
      {/* Sender label for other user */}
      {!isOwn && senderName && (
        <span className="text-xs font-semibold text-slate-400 mb-1 ml-1 tracking-wide select-none">
          {senderName}
        </span>
      )}

      <div
        className={`relative max-w-[84%] px-4 py-3 rounded-2xl text-base leading-relaxed shadow-md transition-all duration-300 ${
          isOwn
            ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-br-xs shadow-indigo-950/50'
            : 'bg-slate-800 text-slate-100 rounded-bl-xs border border-slate-700/70 shadow-black/30'
        } ${currentFlag ? `${currentFlag.border} border` : ''} ${
          isHighlighted ? 'ring-4 ring-indigo-400 ring-offset-2 ring-offset-slate-900 scale-[1.02]' : ''
        } ${failed ? 'border-rose-500/80 bg-slate-800/90' : ''}`}
      >
        {/* Flag warning dot / badge if flagged */}
        {currentFlag && (
          <div className="flex items-center gap-1.5 mb-1.5 select-none">
            <span className={`w-2.5 h-2.5 rounded-full ${currentFlag.dot}`} />
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${currentFlag.badge}`}>
              {currentFlag.label}
            </span>
          </div>
        )}

        {/* Message body with projector-ready readable typography */}
        <p className="whitespace-pre-wrap break-words text-[16px] leading-relaxed m-0 font-normal">
          {text}
        </p>

        {/* Footer: timestamp & delivery status */}
        <div
          className={`flex items-center justify-end gap-1.5 mt-1.5 text-xs font-mono select-none ${
            isOwn ? 'text-indigo-200/80' : 'text-slate-400'
          }`}
        >
          {failed ? (
            <div className="flex items-center gap-1.5 text-rose-400 font-sans">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="font-semibold text-xs">Failed to send</span>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-200 font-semibold text-xs cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retry
                </button>
              )}
            </div>
          ) : (
            <span>{formattedTime}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
