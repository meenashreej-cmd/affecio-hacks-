import React from 'react';
import { AlertTriangle, ShieldAlert, ChevronRight } from 'lucide-react';

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
 * @param {() => void} props.onOpenExplain - Opens the ExplainPanel side drawer
 */
export function CautionBanner({
  state = 'normal',
  reasons = [],
  scamType,
  isRecipient = false,
  onOpenExplain,
}) {
  // Strictly visible only for recipient when state is caution or restricted
  if (!isRecipient || state === 'normal') {
    return null;
  }

  const isRestricted = state === 'restricted';
  const topReason =
    reasons[0] ||
    (isRestricted
      ? 'High risk behavioral pattern detected'
      : 'Unusual behavioral pattern detected');

  const bannerTheme = isRestricted
    ? {
        container: 'bg-rose-950/90 border-rose-500/60 text-rose-200 shadow-xl shadow-rose-950/50',
        badge: 'bg-rose-500 text-white font-bold',
        icon: ShieldAlert,
        iconColor: 'text-rose-400',
        whyButton:
          'text-rose-300 hover:text-white underline decoration-rose-400 decoration-1 underline-offset-4',
        title: 'Safety Interventions Active: Thread Restricted',
      }
    : {
        container: 'bg-amber-950/90 border-amber-500/60 text-amber-200 shadow-lg shadow-amber-950/40',
        badge: 'bg-amber-500 text-slate-950 font-bold',
        icon: AlertTriangle,
        iconColor: 'text-amber-400',
        whyButton:
          'text-amber-300 hover:text-white underline decoration-amber-400 decoration-1 underline-offset-4',
        title: 'Heuristic Warning: Potential Romance Scam',
      };

  const { container, badge, icon: Icon, iconColor, whyButton, title } = bannerTheme;

  const handleWhyClick = (e) => {
    e.preventDefault();
    onOpenExplain?.();
  };

  return (
    <div
      className={`mx-4 my-3 px-4 py-3 rounded-xl border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${container}`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded ${badge}`}>
                {isRestricted ? 'DANGER' : 'CAUTION'}
              </span>
              <span className="text-sm font-bold tracking-wide truncate">
                {title}
              </span>
            </div>
            <p className="text-sm text-slate-200 leading-snug line-clamp-2">
              <span className="font-semibold text-white">Detection: </span>
              {topReason}
            </p>
          </div>
        </div>

        <button
          onClick={handleWhyClick}
          type="button"
          className={`flex items-center gap-1 text-sm font-bold flex-shrink-0 pt-0.5 transition-colors cursor-pointer ${whyButton}`}
          title="Inspect full risk breakdown and evidence"
        >
          Why?
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default CautionBanner;
