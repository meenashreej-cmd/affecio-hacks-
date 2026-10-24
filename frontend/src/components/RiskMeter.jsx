import React, { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert, Info } from 'lucide-react';

/**
 * RiskMeter Component
 * Displays a 0-100 behavioral risk score with smooth animated transitions,
 * smooth numeric counting, state change pulse, and an "Explain" action button.
 *
 * @param {Object} props
 * @param {number} props.risk - Risk score 0 to 100
 * @param {'normal'|'caution'|'restricted'} props.state - Current state
 * @param {string|null} [props.scamType] - Detected pattern category
 * @param {boolean} [props.loading] - Whether score is loading
 * @param {() => void} [props.onOpenExplain] - Action to open ExplainPanel
 * @param {boolean} [props.showExplainButton] - Show explain button (in recipient view)
 */
export function RiskMeter({
  risk = 10,
  state = 'normal',
  scamType,
  loading = false,
  onOpenExplain,
  showExplainButton = true,
}) {
  const targetRisk = Math.min(100, Math.max(0, Math.round(risk)));
  const [displayValue, setDisplayValue] = useState(targetRisk);
  const [pulseAnimation, setPulseAnimation] = useState(false);

  // Smooth numeric counter animation (~600ms ease-out)
  useEffect(() => {
    if (loading) return;

    setPulseAnimation(true);
    const pulseTimer = setTimeout(() => setPulseAnimation(false), 800);

    const startValue = displayValue;
    const diff = targetRisk - startValue;
    if (diff === 0) return () => clearTimeout(pulseTimer);

    const duration = 600;
    const startTime = performance.now();

    const animateNumber = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + diff * eased);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animateNumber);
      }
    };

    const animFrame = requestAnimationFrame(animateNumber);
    return () => {
      cancelAnimationFrame(animFrame);
      clearTimeout(pulseTimer);
    };
  }, [targetRisk, loading, state]);

  // Neutral grey skeleton while loading
  if (loading) {
    return (
      <div className="w-full bg-slate-900 border-b border-slate-800 px-5 py-3.5 select-none animate-pulse">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-slate-700" />
            <div className="w-28 h-3.5 bg-slate-700 rounded" />
            <div className="w-16 h-4 bg-slate-700 rounded-full" />
          </div>
          <div className="w-12 h-6 bg-slate-700 rounded" />
        </div>
        <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden" />
      </div>
    );
  }

  // Derive status configuration
  const isRestricted = state === 'restricted' || targetRisk >= 70;
  const isCaution = state === 'caution' || (targetRisk >= 40 && targetRisk < 70);

  const config = isRestricted
    ? {
        label: 'RESTRICTED',
        textColor: 'text-rose-400',
        bgColor: 'bg-rose-500',
        gradient: 'from-rose-500 via-red-500 to-rose-600',
        badgeBg: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
        glow: 'shadow-[0_0_16px_rgba(244,63,94,0.5)]',
        Icon: ShieldAlert,
      }
    : isCaution
    ? {
        label: 'CAUTION',
        textColor: 'text-amber-400',
        bgColor: 'bg-amber-500',
        gradient: 'from-amber-400 via-amber-500 to-orange-500',
        badgeBg: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
        glow: 'shadow-[0_0_12px_rgba(251,191,36,0.4)]',
        Icon: AlertTriangle,
      }
    : {
        label: 'NORMAL',
        textColor: 'text-emerald-400',
        bgColor: 'bg-emerald-500',
        gradient: 'from-emerald-400 to-teal-500',
        badgeBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
        glow: 'shadow-[0_0_10px_rgba(52,211,153,0.3)]',
        Icon: ShieldCheck,
      };

  const { label, textColor, gradient, badgeBg, glow, Icon } = config;

  return (
    <div
      className={`w-full bg-slate-900 border-b border-slate-800 px-5 py-3.5 select-none transition-colors duration-500 ${
        pulseAnimation && isRestricted ? 'bg-rose-950/20' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-2.5">
        {/* Risk meter label + state pill */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Icon className={`w-4 h-4 ${textColor} transition-colors duration-300`} />
          <span className="text-xs font-bold tracking-wider uppercase text-slate-300">
            Trust Risk Score
          </span>
          <span
            className={`text-xs font-extrabold tracking-wider px-2.5 py-0.5 rounded-full border transition-all duration-300 ${badgeBg}`}
          >
            {label}
          </span>
          {scamType && scamType !== 'none' && (
            <span className="text-xs font-mono uppercase bg-slate-800 text-indigo-300 px-2 py-0.5 rounded border border-slate-700">
              {scamType}
            </span>
          )}
        </div>

        {/* Explain action & Numeric readout */}
        <div className="flex items-center gap-3">
          {showExplainButton && onOpenExplain && (
            <button
              onClick={onOpenExplain}
              type="button"
              className="hidden sm:flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-all cursor-pointer"
              title="Open safety explanation panel"
            >
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              <span>Explain</span>
            </button>
          )}

          <div className="flex items-baseline gap-1 font-mono">
            <span
              className={`text-xl sm:text-2xl font-black ${textColor} transition-colors duration-300 ${
                pulseAnimation ? 'scale-110' : 'scale-100'
              }`}
            >
              {displayValue}
            </span>
            <span className="text-xs text-slate-500 font-normal">/ 100</span>
          </div>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="relative w-full h-3 bg-slate-800 rounded-full overflow-hidden p-[1px] border border-slate-700/60">
        {/* Animated fill */}
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} ${glow} transition-all duration-700 ease-out`}
          style={{ width: `${targetRisk}%` }}
        />

        {/* Threshold divider ticks at 40% and 70% */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-slate-950/80 z-10"
          style={{ left: '40%' }}
          title="Caution threshold (40)"
        />
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-slate-950/80 z-10"
          style={{ left: '70%' }}
          title="Restricted threshold (70)"
        />
      </div>

      {/* Threshold markings footer */}
      <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono mt-1 px-1">
        <span>0 Safe</span>
        <span className="ml-[35%] text-slate-400">40 Caution</span>
        <span className="text-slate-400">70+ Restricted</span>
      </div>
    </div>
  );
}

export default RiskMeter;
