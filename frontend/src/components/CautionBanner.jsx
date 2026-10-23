import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, ChevronRight, X, Info } from 'lucide-react';

/**
 * CautionBanner Component
 * Displayed exclusively in the recipient's chat pane (e.g. Priya)
 * when state is "caution" (amber) or "restricted" (red).
 *
 * @param {Object} props
 * @param {'normal'|'caution'|'restricted'} props.state
 * @param {string[]} props.reasons - Array of risk explanation reasons
 * @param {string|null} [props.scamType] - Detected pattern category
 * @param {boolean} props.isRecipient - Whether this pane is the recipient
 */
export function CautionBanner({ state = 'normal', reasons = [], scamType, isRecipient = false }) {
  const [showExplainModal, setShowExplainModal] = useState(false);

  // Strictly visible only for recipient when state is caution or restricted
  if (!isRecipient || state === 'normal') {
    return null;
  }

  const isRestricted = state === 'restricted';
  const topReason = reasons[0] || (isRestricted ? 'High risk behavioral pattern detected' : 'Unusual behavioral pattern detected');

  const bannerTheme = isRestricted
    ? {
        container: 'bg-rose-950/80 border-rose-500/50 text-rose-200 shadow-lg shadow-rose-950/40',
        badge: 'bg-rose-500 text-white font-bold',
        icon: ShieldAlert,
        iconColor: 'text-rose-400',
        whyButton: 'text-rose-300 hover:text-white underline decoration-rose-400 decoration-1 underline-offset-2',
        title: 'Safety Interventions Active: Thread Restricted',
      }
    : {
        container: 'bg-amber-950/80 border-amber-500/50 text-amber-200 shadow-md shadow-amber-950/30',
        badge: 'bg-amber-500 text-slate-950 font-bold',
        icon: AlertTriangle,
        iconColor: 'text-amber-400',
        whyButton: 'text-amber-300 hover:text-white underline decoration-amber-400 decoration-1 underline-offset-2',
        title: 'Heuristic Warning: Potential Romance Scam',
      };

  const { container, badge, icon: Icon, iconColor, whyButton, title } = bannerTheme;

  const handleWhyClick = (e) => {
    e.preventDefault();
    console.log('[BehavioralTrust Scorer] Why flagged?', { state, scamType, reasons });
    setShowExplainModal(true);
  };

  return (
    <>
      <div
        className={`mx-3 my-2.5 px-3.5 py-2.5 rounded-xl border backdrop-blur-sm transition-all duration-300 animate-in fade-in slide-in-from-top-1 ${container}`}
        role="alert"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${badge}`}>
                  {isRestricted ? 'Danger' : 'Caution'}
                </span>
                <span className="text-xs font-semibold tracking-wide truncate">
                  {title}
                </span>
              </div>
              <p className="text-xs text-slate-200 leading-snug line-clamp-2">
                <span className="font-semibold text-white">Detection: </span>
                {topReason}
              </p>
            </div>
          </div>

          <button
            onClick={handleWhyClick}
            type="button"
            className={`flex items-center gap-0.5 text-xs font-semibold flex-shrink-0 pt-0.5 transition-colors cursor-pointer ${whyButton}`}
            title="Inspect risk reasons"
          >
            Why?
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Lightweight ExplainModal stub (Day 2 preview) */}
      {showExplainModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 text-slate-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-base">Behavioral Risk Breakdown</h3>
              </div>
              <button
                onClick={() => setShowExplainModal(false)}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between bg-slate-800/60 p-2.5 rounded-lg">
                <span className="text-slate-400 text-xs font-mono uppercase">Scam Category</span>
                <span className="font-semibold capitalize text-indigo-300">
                  {scamType || 'Romance / Phishing'}
                </span>
              </div>

              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-1.5">
                  Triggered Indicators ({reasons.length})
                </span>
                <ul className="space-y-1.5">
                  {reasons.length > 0 ? (
                    reasons.map((r, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 bg-slate-800/40 border border-slate-700/50 p-2 rounded text-xs text-slate-200"
                      >
                        <span className="text-rose-400 font-bold">•</span>
                        <span>{r}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-slate-400 italic">No specific reasons provided.</li>
                  )}
                </ul>
              </div>

              <div className="pt-2 text-xs text-slate-400 border-t border-slate-800 flex justify-between items-center">
                <span>ExplainPanel (Full integration in Day 2)</span>
                <button
                  onClick={() => setShowExplainModal(false)}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default CautionBanner;
