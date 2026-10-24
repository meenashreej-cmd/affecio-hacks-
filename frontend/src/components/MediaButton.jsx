import React, { useRef, useState } from 'react';
import { Paperclip, Lock, Loader2 } from 'lucide-react';
import { MEDIA_FIELD_NAME, MAX_FILE_SIZE_BYTES } from '../hooks/useChatSocket';

/**
 * MediaButton Component
 * Gated media attachment button that respects platform behavioral risk state.
 *
 * @param {Object} props
 * @param {'normal'|'caution'|'restricted'} props.state - Conversation threat state
 * @param {(file: File, bypassCheck?: boolean) => Promise<{ok: boolean, status?: number, reasons?: string[], error?: string}>} props.onUpload
 * @param {(msg: string, type?: 'success'|'error'|'info') => void} props.showToast - Toast notification trigger
 * @param {string} [props.idPrefix] - DOM ID prefix for testing
 */
export function MediaButton({ state = 'normal', onUpload, showToast, idPrefix = 'media' }) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const isRestricted = state === 'restricted';

  const handleClick = () => {
    if (isRestricted) {
      showToast?.('Media sharing is disabled because this conversation looks risky.', 'error');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again if needed
    e.target.value = '';

    // Client-side file size check (~5MB limit)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast?.('File exceeds 5 MB limit. Please select a smaller file.', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const res = await onUpload(file);
      if (res.ok) {
        showToast?.('File sent successfully', 'success');
      } else if (res.status === 403) {
        const reasonText = res.reasons?.join(', ') || 'Media sharing is restricted due to high risk behavior';
        showToast?.(`Upload Blocked: ${reasonText}`, 'error');
      } else {
        showToast?.(res.error || 'Failed to upload file', 'error');
      }
    } catch (err) {
      showToast?.(err.message || 'Error uploading file', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  if (isRestricted) {
    return (
      <button
        id={`${idPrefix}-btn`}
        type="button"
        disabled
        aria-label="Media sharing disabled due to elevated risk"
        title="Media sharing is disabled because this conversation looks risky"
        className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/50 text-slate-500 cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0 relative group"
      >
        <Lock className="w-4 h-4 text-rose-400/80" />
      </button>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.doc,.docx"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload media file"
      />
      <button
        id={`${idPrefix}-btn`}
        type="button"
        onClick={handleClick}
        disabled={isUploading}
        aria-label="Attach media or image"
        title="Attach file or photo (max 5 MB)"
        className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center flex-shrink-0 disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
        ) : (
          <Paperclip className="w-4 h-4" />
        )}
      </button>
    </>
  );
}

export default MediaButton;
