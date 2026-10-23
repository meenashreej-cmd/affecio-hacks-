import React from 'react';

/**
 * MessageBubble Component
 * Displays a single chat message with timestamps, sender alignment,
 * and optional risk alert indicator dot.
 *
 * @param {Object} props
 * @param {string} props.text - The message content
 * @param {string} props.timestamp - ISO date string
 * @param {boolean} props.isOwn - Whether message was sent by current pane's user
 * @param {'caution'|'restricted'|undefined} [props.flagged] - Alert status flag
 * @param {string} [props.senderName] - Name of sender for context
 */
export function MessageBubble({ text, timestamp, isOwn, flagged, senderName }) {
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

  const flaggedStyles = {
    caution: {
      dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]',
      border: 'border-amber-500/40',
      badge: 'text-amber-300 bg-amber-500/10 border border-amber-500/30',
      label: 'Flagged: Caution',
    },
    restricted: {
      dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse',
      border: 'border-rose-500/50',
      badge: 'text-rose-300 bg-rose-500/10 border border-rose-500/30',
      label: 'Flagged: High Risk',
    },
  };

  const currentFlag = flagged ? flaggedStyles[flagged] : null;

  return (
    <div className={`flex flex-col mb-3.5 ${isOwn ? 'items-end' : 'items-start'} transition-all duration-200`}>
      {/* Sender label for other user */}
      {!isOwn && senderName && (
        <span className="text-xs font-semibold text-slate-400 mb-1 ml-1 tracking-wide">
          {senderName}
        </span>
      )}

      <div
        className={`relative max-w-[82%] px-4 py-2.5 rounded-2xl text-[14.5px] leading-relaxed shadow-sm transition-all duration-150 ${
          isOwn
            ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-br-xs shadow-indigo-950/40'
            : 'bg-slate-800/90 text-slate-100 rounded-bl-xs border border-slate-700/60 shadow-black/20'
        } ${currentFlag ? `${currentFlag.border} border` : ''}`}
      >
        {/* Flag warning dot / badge if flagged */}
        {currentFlag && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`w-2 h-2 rounded-full ${currentFlag.dot}`} />
            <span className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-full ${currentFlag.badge}`}>
              {currentFlag.label}
            </span>
          </div>
        )}

        {/* Message body */}
        <p className="whitespace-pre-wrap break-words">{text}</p>

        {/* Timestamp */}
        <div
          className={`flex items-center justify-end gap-1 mt-1 text-[11px] font-mono select-none ${
            isOwn ? 'text-indigo-200/70' : 'text-slate-400/80'
          }`}
        >
          <span>{formattedTime}</span>
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
