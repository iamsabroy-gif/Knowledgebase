import React, { useState } from 'react';
import { Note, Attachment, SyncStatusSummary } from '../types';
import { api } from '../api/client';
import {
  UploadCloud, FileText, Paperclip, Trash2, CheckCircle2,
  AlertCircle, RefreshCw, X, GitCommit
} from 'lucide-react';

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  attachments: Attachment[];
  syncSummary: SyncStatusSummary | null;
  onPushSuccess: (result: any) => void;
}

export const CommitModal: React.FC<CommitModalProps> = ({
  isOpen,
  onClose,
  notes,
  attachments,
  syncSummary,
  onPushSuccess,
}) => {
  const pendingNotes = notes.filter(n => n.sync_status === 'local_changes');
  const pendingAttachments = attachments.filter(a => a.sync_status === 'local_changes');

  // Default smart commit message based on modified files
  const defaultMsg = React.useMemo(() => {
    if (pendingNotes.length === 1) {
      return `Update note: ${pendingNotes[0].title}`;
    } else if (pendingNotes.length > 1) {
      return `Update ${pendingNotes.length} notes: ${pendingNotes.slice(0, 2).map(n => n.title).join(', ')}${pendingNotes.length > 2 ? ' and more' : ''}`;
    } else if (pendingAttachments.length > 0) {
      return `Add ${pendingAttachments.length} attachment(s)`;
    }
    return 'Update research notes from Obsidian vault';
  }, [pendingNotes, pendingAttachments]);

  const [commitMessage, setCommitMessage] = useState(defaultMsg);
  const [isPushing, setIsPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<any | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setCommitMessage(defaultMsg);
      setPushError(null);
      setPushResult(null);
    }
  }, [isOpen, defaultMsg]);

  if (!isOpen) return null;

  const handlePush = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPushing(true);
    setPushError(null);

    try {
      const result = await api.pushGitHub(commitMessage.trim() || defaultMsg);
      setPushResult(result);
      onPushSuccess(result);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setPushError(err.message || 'Push failed');
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-800/50 text-amber-300">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">
                Commit & Push Changes
              </h2>
              <p className="text-xs text-zinc-400">
                Pushing {pendingNotes.length + pendingAttachments.length} local change(s) to GitHub
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handlePush} className="p-5 space-y-4">
          {/* Changed items list */}
          <div>
            <div className="text-xs font-semibold text-zinc-300 mb-1.5 flex items-center justify-between">
              <span>Changed Files to Commit</span>
              <span className="font-mono text-[11px] text-zinc-500">
                {pendingNotes.length + pendingAttachments.length} files
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 space-y-1">
              {pendingNotes.map(n => (
                <div key={n.path} className="flex items-center justify-between px-2 py-1 rounded text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-zinc-200 truncate">{n.title}</span>
                    <span className="text-[10px] text-zinc-500 font-mono truncate">({n.path})</span>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400 font-medium shrink-0 ml-2">
                    {n.git_sha ? 'modified' : 'new note'}
                  </span>
                </div>
              ))}

              {pendingAttachments.map(a => (
                <div key={a.path} className="flex items-center justify-between px-2 py-1 rounded text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <Paperclip className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="text-zinc-200 truncate">{a.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 font-medium shrink-0 ml-2">
                    attachment
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Commit Message Input */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Git Commit Message <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                id="git-commit-message-input"
                required
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Describe your research note updates..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-amber-500 outline-none"
              />
            </div>
          </div>

          {/* Push error feedback */}
          {pushError && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-sans">{pushError}</div>
            </div>
          )}

          {/* Push success feedback */}
          {pushResult && (
            <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {pushResult.message || `Committed successfully (${pushResult.commit_sha?.slice(0, 7)})`}
              </span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isPushing}
              className="px-3.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-execute-git-push"
              disabled={isPushing || (pendingNotes.length === 0 && pendingAttachments.length === 0)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-zinc-950 text-xs font-bold shadow-md transition-colors disabled:opacity-50"
            >
              {isPushing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Pushing to GitHub...</span>
                </>
              ) : (
                <>
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>Commit & Push</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
