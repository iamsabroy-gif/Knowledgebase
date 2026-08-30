import React, { useState } from 'react';
import { SharedVaultInfo, Note } from '../types';
import {
  Database, Plus, Key, Users, ArrowRight, Shield, Globe, HardDrive,
  Trash2, LogOut, Check, X, Sparkles, RefreshCw, AlertCircle
} from 'lucide-react';
import { createCloudVault, joinVaultWithShareCode, deleteCloudVault, updateVaultMemberRole } from '../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';

interface VaultSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
  activeVaultId: string; // 'local' or firestore vault ID
  cloudVaults: SharedVaultInfo[];
  localNotes: Note[];
  onSelectVault: (vaultId: string) => void;
  onRequestSignIn: () => void;
}

export const VaultSwitcherModal: React.FC<VaultSwitcherModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  activeVaultId,
  cloudVaults,
  localNotes,
  onSelectVault,
  onRequestSignIn,
}) => {
  const [activeTab, setActiveTab] = useState<'vaults' | 'create' | 'join'>('vaults');
  const [newVaultName, setNewVaultName] = useState('');
  const [newVaultDesc, setNewVaultDesc] = useState('');
  const [importLocalNotes, setImportLocalNotes] = useState(true);
  const [shareCodeInput, setShareCodeInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newVaultName.trim()) return;

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const initialNotes = importLocalNotes ? localNotes : [];
      const created = await createCloudVault(
        currentUser,
        newVaultName.trim(),
        newVaultDesc.trim(),
        initialNotes
      );
      setNewVaultName('');
      setNewVaultDesc('');
      onSelectVault(created.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create cloud vault');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !shareCodeInput.trim()) return;

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const joined = await joinVaultWithShareCode(currentUser, shareCodeInput.trim());
      setShareCodeInput('');
      onSelectVault(joined.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to join vault');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteVault = async (vaultId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the shared cloud vault "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteCloudVault(vaultId);
      if (activeVaultId === vaultId) {
        onSelectVault('local');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete vault');
    }
  };

  const handleLeaveVault = async (vaultId: string) => {
    if (!currentUser?.email) return;
    if (!window.confirm('Are you sure you want to leave this shared vault?')) return;
    try {
      await updateVaultMemberRole(vaultId, currentUser.email, 'remove');
      if (activeVaultId === vaultId) {
        onSelectVault('local');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to leave vault');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Vault Manager</h2>
              <p className="text-xs text-zinc-400">
                Switch workspaces, create shared cloud vaults, or join with a share code
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-zinc-800 bg-zinc-950/60 px-5 gap-2 pt-2">
          <button
            type="button"
            onClick={() => { setActiveTab('vaults'); setErrorMsg(null); }}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'vaults'
                ? 'border-violet-500 text-violet-300 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>All Vaults ({cloudVaults.length + 1})</span>
          </button>

          {currentUser && (
            <>
              <button
                type="button"
                onClick={() => { setActiveTab('create'); setErrorMsg(null); }}
                className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'create'
                    ? 'border-violet-500 text-violet-300 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Cloud Vault</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('join'); setErrorMsg(null); }}
                className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'join'
                    ? 'border-violet-500 text-violet-300 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Join with Code</span>
              </button>
            </>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: ALL VAULTS LIST */}
          {activeTab === 'vaults' && (
            <div className="space-y-3">
              {/* Local Workspace Vault Item */}
              <div
                onClick={() => { onSelectVault('local'); onClose(); }}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  activeVaultId === 'local'
                    ? 'bg-violet-950/30 border-violet-600/80 shadow-lg shadow-violet-950/40'
                    : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0">
                    <HardDrive className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-100">Local Workspace Vault</span>
                      <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 text-[10px] font-mono">
                        GitHub Sync
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 truncate">
                      Default standalone vault with full GitHub push/pull and local diff resolution
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeVaultId === 'local' ? (
                    <span className="px-2.5 py-1 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/30 text-xs font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 font-medium">
                      Select <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>

              {/* Cloud Vaults List */}
              {cloudVaults.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
                    Cloud & Shared Vaults
                  </div>
                  {cloudVaults.map((v) => {
                    const isOwner = currentUser && (v.ownerId === currentUser.uid || v.ownerEmail === currentUser.email);
                    const isActive = activeVaultId === v.id;

                    return (
                      <div
                        key={v.id}
                        onClick={() => { onSelectVault(v.id); onClose(); }}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isActive
                            ? 'bg-violet-950/30 border-violet-600/80 shadow-lg shadow-violet-950/40'
                            : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-violet-900/30 border border-violet-700/40 flex items-center justify-center text-violet-400 shrink-0">
                            <Globe className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-zinc-100 truncate">{v.name}</span>
                              {isOwner ? (
                                <span className="px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-800/50 text-amber-300 text-[10px] font-medium flex items-center gap-1">
                                  <Shield className="w-2.5 h-2.5" /> Owner
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded bg-blue-950/80 border border-blue-800/50 text-blue-300 text-[10px] font-medium flex items-center gap-1">
                                  <Users className="w-2.5 h-2.5" /> Shared with you
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-400 truncate">
                              {v.description || `Shared with ${v.sharedWith?.length || 1} members`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {isActive ? (
                            <span className="px-2.5 py-1 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/30 text-xs font-semibold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Active
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { onSelectVault(v.id); onClose(); }}
                              className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                            >
                              Switch
                            </button>
                          )}

                          {isOwner ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteVault(v.id, v.name)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                              title="Delete Cloud Vault"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleLeaveVault(v.id)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition-colors"
                              title="Leave Shared Vault"
                            >
                              <LogOut className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Login Callout if guest */}
              {!currentUser && (
                <div className="p-4 rounded-xl bg-violet-950/20 border border-violet-800/30 flex items-center justify-between gap-3 mt-4">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-zinc-200">Sign in with Google</span>
                    <p className="text-[11px] text-zinc-400">
                      Sign in to create collaborative cloud vaults and share with teammates.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onRequestSignIn}
                    className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors shrink-0 shadow-sm"
                  >
                    Sign In
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREATE CLOUD VAULT */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateVault} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">Vault Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Research Team Knowledge Base"
                  value={newVaultName}
                  onChange={(e) => setNewVaultName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Shared engineering documentation and wikis"
                  value={newVaultDesc}
                  onChange={(e) => setNewVaultDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-violet-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-zinc-200">Import existing notes</span>
                  <p className="text-[11px] text-zinc-400">
                    Seed this new cloud vault with your current {localNotes.length} notes.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={importLocalNotes}
                  onChange={(e) => setImportLocalNotes(e.target.checked)}
                  className="w-4 h-4 accent-violet-600 rounded cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || !newVaultName.trim()}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30 transition-all"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Create & Publish Cloud Vault</span>
              </button>
            </form>
          )}

          {/* TAB 3: JOIN WITH SHARE CODE */}
          {activeTab === 'join' && (
            <form onSubmit={handleJoinWithCode} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  Enter 6-character Vault Share Code
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="e.g. 7K9P2X"
                    value={shareCodeInput}
                    onChange={(e) => setShareCodeInput(e.target.value.toUpperCase())}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono tracking-widest text-violet-300 placeholder-zinc-600 outline-none focus:border-violet-500 uppercase"
                  />
                </div>
                <p className="text-[11px] text-zinc-500">
                  Ask the vault owner for the share code from their Vault Sharing dialog.
                </p>
              </div>

              <button
                type="submit"
                disabled={isProcessing || !shareCodeInput.trim()}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30 transition-all"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Users className="w-4 h-4" />
                )}
                <span>Join Shared Vault</span>
              </button>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
