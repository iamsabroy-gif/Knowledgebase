import React, { useState, useEffect } from 'react';
import { ConflictItem } from '../types';
import { api } from '../api/client';
import {
  AlertTriangle, CheckCircle2, Split, Check, ArrowRight,
  RotateCcw, FileText, X, Sparkles, ShieldAlert
} from 'lucide-react';
import * as Diff from 'diff';

interface ConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConflictResolved: () => void;
  vaultId?: string;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  onClose,
  onConflictResolved,
  vaultId = 'local',
}) => {
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [manualMergeText, setManualMergeText] = useState('');
  const [isManualMode, setIsManualMode] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const loadConflicts = async () => {
    try {
      const list = await api.getConflicts(vaultId);
      setConflicts(list);
      if (list.length > 0 && selectedIndex >= list.length) {
        setSelectedIndex(0);
      }
    } catch (e) {
      console.error('Failed to load conflicts:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConflicts();
      setIsManualMode(false);
    }
  }, [isOpen, vaultId]);

  const activeConflict = conflicts[selectedIndex] || null;

  useEffect(() => {
    if (activeConflict) {
      setManualMergeText(activeConflict.local_content || '');
    }
  }, [activeConflict]);

  if (!isOpen) return null;

  const handleResolve = async (resolution: 'keep_local' | 'take_remote' | 'manual') => {
    if (!activeConflict) return;
    setIsResolving(true);
    try {
      await api.resolveConflict(
        activeConflict.path,
        resolution,
        resolution === 'manual' ? manualMergeText : undefined,
        vaultId
      );

      const remaining = conflicts.filter(c => c.path !== activeConflict.path);
      setConflicts(remaining);
      setIsManualMode(false);
      onConflictResolved();

      if (remaining.length === 0) {
        onClose();
      } else {
        setSelectedIndex(0);
      }
    } catch (err: any) {
      alert(`Conflict resolution error: ${err.message}`);
    } finally {
      setIsResolving(false);
    }
  };

  // Compute line-by-line diff
  const diffLines = activeConflict
    ? Diff.diffLines(activeConflict.remote_content, activeConflict.local_content)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl h-[85vh] bg-zinc-900 border border-rose-800/60 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 bg-rose-950/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-900/60 border border-rose-700 text-rose-300">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-rose-200">
                Sync Conflict Detected ({conflicts.length} files)
              </h2>
              <p className="text-xs text-zinc-400">
                Both local vault and remote GitHub repository have modified changes. Choose how to merge.
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

        {/* Content area */}
        {conflicts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
            <h3 className="text-base font-semibold text-zinc-200">No active conflicts</h3>
            <p className="text-xs text-zinc-500 mt-1">All notes are safely synchronized.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* File Switcher Tabs if multiple */}
            {conflicts.length > 1 && (
              <div className="flex items-center gap-1 px-4 py-2 bg-zinc-950 border-b border-zinc-800 overflow-x-auto shrink-0">
                {conflicts.map((c, i) => (
                  <button
                    key={c.path}
                    type="button"
                    onClick={() => {
                      setSelectedIndex(i);
                      setIsManualMode(false);
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-mono truncate max-w-xs transition-colors ${
                      i === selectedIndex
                        ? 'bg-rose-950 text-rose-200 border border-rose-800 font-semibold'
                        : 'text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    {c.path}
                  </button>
                ))}
              </div>
            )}

            {/* Conflict details header */}
            <div className="px-5 py-2.5 bg-zinc-950/60 border-b border-zinc-800 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-400" />
                <span className="font-mono text-zinc-200 font-semibold">{activeConflict?.path}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
                <span>Local SHA: {activeConflict?.local_sha?.slice(0, 7) || 'new'}</span>
                <span>Remote SHA: {activeConflict?.remote_sha?.slice(0, 7)}</span>
              </div>
            </div>

            {/* Visual Side-by-side or Diff View */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-[#18181b]">
              {/* Local version */}
              <div className="flex flex-col border-r border-zinc-800 h-full overflow-hidden">
                <div className="px-3.5 py-1.5 bg-amber-950/30 border-b border-zinc-800 flex items-center justify-between text-xs font-semibold text-amber-300">
                  <span>Your Local Version (Browser)</span>
                </div>
                <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {activeConflict?.local_content}
                </div>
              </div>

              {/* Remote GitHub version */}
              <div className="flex flex-col h-full overflow-hidden">
                <div className="px-3.5 py-1.5 bg-blue-950/30 border-b border-zinc-800 flex items-center justify-between text-xs font-semibold text-blue-300">
                  <span>Remote GitHub Version (Repo)</span>
                </div>
                <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {activeConflict?.remote_content}
                </div>
              </div>
            </div>

            {/* Manual Merge Editor (Expandable) */}
            {isManualMode && (
              <div className="h-64 border-t-2 border-violet-600 bg-zinc-950 flex flex-col shrink-0">
                <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-violet-300">Manual Merge Buffer</span>
                  <span className="text-[11px] text-zinc-500">Edit and click Save Resolved</span>
                </div>
                <textarea
                  value={manualMergeText}
                  onChange={(e) => setManualMergeText(e.target.value)}
                  className="flex-1 p-3 bg-zinc-950 text-zinc-200 font-mono text-xs leading-relaxed outline-none resize-none"
                  placeholder="Combine or edit final content here..."
                />
              </div>
            )}

            {/* Action Resolution Bar */}
            <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
              <div className="text-xs text-zinc-400 truncate">
                Select resolution for <strong className="text-zinc-200">{activeConflict?.path}</strong>:
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  id="btn-keep-local"
                  onClick={() => handleResolve('keep_local')}
                  disabled={isResolving}
                  className="px-3 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900 border border-amber-800/60 text-amber-300 text-xs font-medium transition-colors"
                >
                  Keep Mine (Local)
                </button>

                <button
                  type="button"
                  id="btn-take-remote"
                  onClick={() => handleResolve('take_remote')}
                  disabled={isResolving}
                  className="px-3 py-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900 border border-blue-800/60 text-blue-300 text-xs font-medium transition-colors"
                >
                  Take Remote (GitHub)
                </button>

                {isManualMode ? (
                  <button
                    type="button"
                    id="btn-save-manual-merge"
                    onClick={() => handleResolve('manual')}
                    disabled={isResolving}
                    className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
                  >
                    Save Resolved
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsManualMode(true)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                  >
                    Manual Merge...
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
