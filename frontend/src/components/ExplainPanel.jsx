import React, { useEffect, useRef } from 'react';
import { X, ShieldCheck, AlertTriangle, ShieldAlert, Flag, HelpCircle, ArrowRight, CornerDownRight } from 'lucide-react';

/**
 * ExplainPanel Component
 * Slide-in drawer on the right explaining risk factors, triggered heuristic reasons,
 * evidence message links, and safety actions.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether drawer is visible
 * @param {() => void} props.onClose - Close drawer callback
 * @param {number} props.risk - 0-100 risk score
 * @param {'normal'|'caution'|'restricted'} props.state - Current threat state
 * @param {string|null} props.scamType - Detected category
 * @param {string[]} props.reasons - List of reason strings
 * @param {Array<{label: string, evidence_msg_id?: number}>} [props.signals] - Optional signals with evidence message ID
 * @param {(msgId: number) => void} [props.onSelectEvidenceMessage] - Callback to scroll to and highlight message
 * @param {() => void} props.onOpenReportDialog - Opens report modal
 * @param {boolean} props.isRecipient - Only shown in recipient pane
 */
export function ExplainPanel({
  isOpen,
  onClose,
  risk = 10,
  state = 'normal',
  scamType = 'none',
  reasons = [],
  signals = [],
  onSelectEvidenceMessage,
  onOpenReportDialog,
  isRecipient = true,
}) {
  const panelRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Don't render if not recipient or not open
  if (!isRecipient || !isOpen) {
    return null;
  }

  const isRestricted = state === 'restricted' || risk >= 70;
  const isCaution = state === 'caution' || (risk >= 40 && risk < 70);

  // Status visual configurations
  const theme = isRestricted
    ? {
        badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        textColor: 'text-rose-400',
        dotColor: 'bg-rose-500',
        plainLine: 'Media sharing is disabled for your safety.',
        icon: ShieldAlert,
        headerBg: 'bg-rose-950/40 border-rose-800/40',
      }
    : isCaution
    ? {
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        textColor: 'text-amber-400',
        dotColor: 'bg-amber-400',
        plainLine: 'Be careful. This conversation shows warning signs.',
        icon: AlertTriangle,
        headerBg: 'bg-amber-950/40 border-amber-800/40',
      }
    : {
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        textColor: 'text-emerald-400',
        dotColor: 'bg-emerald-400',
        plainLine: 'No concerning patterns detected.',
        icon: ShieldCheck,
        headerBg: 'bg-emerald-950/40 border-emerald-800/40',
      };

  const { badge, textColor, dotColor, plainLine, icon: StatusIcon, headerBg } = theme;

  const handleReasonClick = (msgId) => {
    if (msgId && onSelectEvidenceMessage) {
      onSelectEvidenceMessage(msgId);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Behavioral Trust Explain Panel"
    >
      {/* Slide-in Drawer Container */}
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <StatusIcon className={`w-5 h-5 ${textColor}`} />
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Safety Analysis &amp; Breakdown
              </h2>
              <p className="text-xs text-slate-400">BehavioralTrust Scorer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close explain panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Score & Threat Level Card */}
          <div className={`p-4 rounded-xl border ${headerBg} transition-all`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Threat Assessment
              </span>
              <span className={`text-xs font-bold font-mono px-2.5 py-0.5 rounded-full border uppercase ${badge}`}>
                {state}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mb-2 font-mono">
              <span className={`text-4xl font-extrabold ${textColor}`}>{risk}</span>
              <span className="text-sm text-slate-500">/ 100 risk score</span>
            </div>

            <p className="text-sm font-medium text-slate-200 mb-3">{plainLine}</p>

            {/* Scam Type Badge */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-medium">Scam Pattern:</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-indigo-300 font-semibold uppercase font-mono text-[11px]">
                {scamType && scamType !== 'none' ? scamType : 'No active pattern'}
              </span>
            </div>
          </div>

          {/* Triggered Reasons & Evidence Signals */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
                Triggered Heuristic Reasons ({reasons.length})
              </h3>
              {signals.length > 0 && (
                <span className="text-[11px] text-indigo-400 font-medium">Click to jump to message</span>
              )}
            </div>

            {reasons.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-800 text-center text-xs text-slate-400">
                No threat indicators currently active in this thread.
              </div>
            ) : (
              <div className="space-y-2">
                {reasons.map((reason, idx) => {
                  // Find corresponding evidence signal if available
                  const matchingSignal = signals.find(
                    (s) => s.label === reason || reason.toLowerCase().includes(s.label?.toLowerCase() || '')
                  );
                  const evidenceMsgId = matchingSignal?.evidence_msg_id;

                  return (
                    <div
                      key={idx}
                      onClick={() => evidenceMsgId && handleReasonClick(evidenceMsgId)}
                      className={`p-3 rounded-xl border text-xs transition-all ${
                        evidenceMsgId
                          ? 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 cursor-pointer group shadow-sm hover:border-indigo-500/50'
                          : 'bg-slate-800/40 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />
                        <div className="flex-1">
                          <p className="text-slate-100 font-medium leading-relaxed">{reason}</p>
                          {evidenceMsgId && (
                            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-indigo-400 font-semibold group-hover:text-indigo-300">
                              <CornerDownRight className="w-3.5 h-3.5" />
                              <span>Triggered by message #{evidenceMsgId}</span>
                              <span className="text-[10px] text-slate-400">(jump to chat)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Report Button Entry Point */}
          <div className="pt-2">
            <button
              onClick={() => {
                onClose();
                onOpenReportDialog();
              }}
              type="button"
              className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isRestricted
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Flag className="w-4 h-4" />
              <span>Report this conversation</span>
            </button>
          </div>

          {/* Static Educational Section */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center gap-1.5 mb-2.5 text-slate-300">
              <HelpCircle className="w-4 h-4 text-indigo-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider">
                What do these checks look at?
              </h4>
            </div>
            <ul className="space-y-2 text-xs text-slate-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 font-bold">&bull;</span>
                <span><strong>Fast emotional escalation:</strong> professing intense love, soulmate claims, or deep commitment unusually early in the conversation.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 font-bold">&bull;</span>
                <span><strong>Pressure to leave the app:</strong> urging to move immediately to WhatsApp, Telegram, or private phone numbers to avoid platform safety filters.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 font-bold">&bull;</span>
                <span><strong>Money requests:</strong> asking for urgent emergency transfers, gift cards (Apple, Steam), wire transfers, or cryptocurrency.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 font-bold">&bull;</span>
                <span><strong>Urgency or secrecy:</strong> claiming fabricated crises, freezing cards, or demanding immediate discreet assistance.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExplainPanel;
