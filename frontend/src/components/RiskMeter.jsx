import React from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';

/**
 * RiskMeter Component
 * Displays a 0-100 behavioral risk score with smooth animated transitions,
 * threshold markers, and state labels for judges.
 *
 * Thresholds:
 * - < 40: Normal (Green / Emerald)
 * - 40 - 69: Caution (Amber / Yellow)
 * - 70+: Restricted (Red / Rose)
 *
 * @param {Object} props
 * @param {number} props.risk - Risk score 0 to 100
 * @param {'normal'|'caution'|'restricted'} props.state - Current state
 * @param {string|null} [props.scamType] - Detected pattern category (e.g. romance, phishing)
 */
export function RiskMeter({ risk = 10, state = 'normal', scamType }) {
  // Clamp risk between 0 and 100
  const clampedRisk = Math.min(100, Math.max(0, Math.round(risk)));

  // Derive status configuration
  const config = React.useMemo(() => {
    if (clampedRisk >= 70 || state === 'restricted') {
      return {
        label: 'RESTRICTED',
        textColor: 'text-rose-400',
        bgColor: 'bg-rose-500',
        gradient: 'from-rose-500 via-red-500 to-rose-600',
        badgeBg: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
        glow: 'shadow-[0_0_12px_rgba(244,63,94,0.45)]',
        Icon: ShieldAlert,
      };
    }
    if (clampedRisk >= 40 || state === 'caution') {
      return {
        label: 'CAUTION',
        textColor: 'text-amber-400',
        bgColor: 'bg-amber-500',
        gradient: 'from-amber-400 via-amber-500 to-orange-500',
        badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
        glow: 'shadow-[0_0_10px_rgba(251,191,36,0.35)]',
        Icon: AlertTriangle,
      };
    }
    return {
      label: 'NORMAL',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500',
      gradient: 'from-emerald-400 to-teal-500',
      badgeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
      glow: 'shadow-[0_0_8px_rgba(52,211,153,0.25)]',
      Icon: ShieldCheck,
    };
  }, [clampedRisk, state]);

  const { label, textColor, gradient, badgeBg, glow, Icon } = config;

  return (
    <div className="w-full bg-slate-900/90 border-b border-slate-800/80 px-4 py-3 select-none">
      <div className="flex items-center justify-between gap-3 mb-2">
        {/* Risk meter label + state pill */}
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${textColor} transition-colors duration-300`} />
          <span className="text-xs font-semibold tracking-wider uppercase text-slate-300">
            Trust Risk Score
          </span>
          <span
            className={`text-[11px] font-bold tracking-wider px-2 py-0.5 rounded-full border transition-all duration-300 ${badgeBg}`}
          >
            {label}
          </span>
          {scamType && scamType !== 'none' && (
            <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
              {scamType}
            </span>
          )}
        </div>

        {/* Numeric value readout */}
        <div className="flex items-baseline gap-1 font-mono">
          <span className={`text-lg font-bold ${textColor} transition-colors duration-300`}>
            {clampedRisk}
          </span>
          <span className="text-xs text-slate-500 font-normal">/ 100</span>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="relative w-full h-2.5 bg-slate-800/90 rounded-full overflow-hidden p-[1px] border border-slate-700/50">
        {/* Animated fill */}
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} ${glow} transition-all duration-500 ease-out`}
          style={{ width: `${clampedRisk}%` }}
        />

        {/* Threshold divider ticks at 40% and 70% */}
        <div
          className="absolute top-0 bottom-0 w-[1.5px] bg-slate-950/70 z-10"
          style={{ left: '40%' }}
          title="Caution threshold (40)"
        />
        <div
          className="absolute top-0 bottom-0 w-[1.5px] bg-slate-950/70 z-10"
          style={{ left: '70%' }}
          title="Restricted threshold (70)"
        />
      </div>

      {/* Threshold markings footer */}
      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-1 px-0.5">
        <span>0 Safe</span>
        <span className="ml-[35%] text-slate-400">40 Caution</span>
        <span className="text-slate-400">70+ Restricted</span>
      </div>
    </div>
  );
}

export default RiskMeter;
