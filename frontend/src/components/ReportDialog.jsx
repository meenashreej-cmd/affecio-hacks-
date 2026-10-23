import React, { useState, useEffect } from 'react';
import { X, Flag, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const REPORT_REASONS = [
  'Suspected romance scam',
  'Asking for money',
  'Phishing link',
  'Impersonation',
  'Harassment or sextortion',
  'Other',
];

/**
 * ReportDialog Component
 * Modal for submitting a safety report to the moderation pipeline.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether dialog is visible
 * @param {() => void} props.onClose - Dismiss dialog callback
 * @param {(reason: string) => Promise<{ok: boolean, error?: string}>} props.onSubmit - Submission callback
 * @param {string} props.reportedUserName - Name of the reported user
 */
export function ReportDialog({ isOpen, onClose, onSubmit, reportedUserName = 'this user' }) {
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0]);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Reset form when reopened
  useEffect(() => {
    if (isOpen) {
      setSelectedReason(REPORT_REASONS[0]);
      setNote('');
      setIsSubmitting(false);
      setIsSuccess(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    // Combine category with optional note
    const fullReason = note.trim()
      ? `${selectedReason}: ${note.trim()}`
      : selectedReason;

    try {
      const res = await onSubmit(fullReason);
      if (res.ok) {
        setIsSuccess(true);
        // Auto-close after ~2 seconds
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setErrorMessage(res.error || 'Failed to submit safety report. Please try again.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Network error occurred while submitting report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={!isSubmitting ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Report Conversation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100 animate-in zoom-in-95 duration-200"
      >
        {isSuccess ? (
          // Success Confirmation View
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Report Received</h3>
            <p className="text-sm text-slate-300 max-w-xs">
              Thank you for keeping the community safe. Our trust &amp; safety pipeline has logged this report and escalated the threat indicators.
            </p>
            <span className="text-xs text-slate-500 font-mono">Closing dialog...</span>
          </div>
        ) : (
          // Form View
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
                  <Flag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Report Conversation</h3>
                  <p className="text-xs text-slate-400">
                    Flag suspicious activity with <strong className="text-slate-200">{reportedUserName}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inline Error Notice with Retry */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="px-2 py-0.5 rounded bg-rose-800 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Reason Dropdown */}
            <div>
              <label htmlFor="report-reason" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase font-mono tracking-wider">
                Reason for report <span className="text-rose-400">*</span>
              </label>
              <select
                id="report-reason"
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {REPORT_REASONS.map((reason) => (
                  <option key={reason} value={reason} className="bg-slate-900 text-slate-100">
                    {reason}
                  </option>
                ))}
              </select>
            </div>

            {/* Additional Details */}
            <div>
              <label htmlFor="report-note" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase font-mono tracking-wider">
                Additional context <span className="text-slate-500 font-normal lowercase">(optional)</span>
              </label>
              <textarea
                id="report-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isSubmitting}
                placeholder="Describe specific messages, requests for gift cards, money, or off-app links..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-submit-report"
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-900/40 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Flag className="w-3.5 h-3.5" />
                    <span>Submit Report</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ReportDialog;
