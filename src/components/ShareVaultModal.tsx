import React, { useState } from 'react';
import { SharedVaultInfo, VaultRole, VaultShareMember } from '../types';
import {
  Users, UserPlus, Copy, Check, Shield, Trash2, Globe, Key,
  X, AlertCircle, RefreshCw, Mail, Sparkles
} from 'lucide-react';
import { shareVaultWithEmail, updateVaultMemberRole } from '../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';

interface ShareVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  vault: SharedVaultInfo | null;
  currentUser: FirebaseUser | null;
  onPublishLocalToCloud?: () => void;
  isLocalVault?: boolean;
}

export const ShareVaultModal: React.FC<ShareVaultModalProps> = ({
  isOpen,
  onClose,
  vault,
  currentUser,
  onPublishLocalToCloud,
  isLocalVault = false,
}) => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<VaultRole>('editor');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const isOwner = vault && currentUser && (vault.ownerId === currentUser.uid || vault.ownerEmail === currentUser.email);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vault || !inviteEmail.trim()) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      await shareVaultWithEmail(vault.id, inviteEmail.trim(), inviteRole);
      setSuccessMsg(`Invited ${inviteEmail.trim()} as ${inviteRole}`);
      setInviteEmail('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to share vault');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (memberEmail: string, newRole: VaultRole | 'remove') => {
    if (!vault) return;
    try {
      await updateVaultMemberRole(vault.id, memberEmail, newRole);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update member role');
    }
  };

  const handleCopyShareCode = () => {
    if (!vault?.shareCode) return;
    navigator.clipboard.writeText(vault.shareCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">
                {isLocalVault ? 'Share Vault' : `Share "${vault?.name || 'Vault'}"`}
              </h2>
              <p className="text-xs text-zinc-400">
                Collaborate in real time with team members and friends
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

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* If Local Vault: Offer 1-click cloud sync & share */}
          {isLocalVault ? (
            <div className="p-5 rounded-xl bg-violet-950/30 border border-violet-800/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto text-violet-300">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">Publish Local Vault to Cloud</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Your current vault is stored locally. Convert it to a Cloud-Synced Vault to enable real-time sharing, multi-user collaboration, and access across all devices.
              </p>
              {onPublishLocalToCloud && (
                <button
                  type="button"
                  id="btn-publish-to-cloud"
                  onClick={() => {
                    onPublishLocalToCloud();
                  }}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-lg shadow-violet-900/30 transition-all flex items-center gap-2 mx-auto"
                >
                  <Globe className="w-4 h-4" />
                  Publish & Enable Sharing
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Share Code Quick Invite Box */}
              {vault?.shareCode && (
                <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-violet-400" />
                      Vault Share Code
                    </div>
                    <div className="text-lg font-mono font-bold tracking-wider text-violet-300">
                      {vault.shareCode}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      Other users can enter this code in Vault Switcher to join instantly.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyShareCode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition-colors shrink-0"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Invite User by Email Form */}
              {isOwner && (
                <form onSubmit={handleInvite} className="space-y-3">
                  <label className="block text-xs font-medium text-zinc-300">
                    Invite Collaborator by Google Account Email
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        placeholder="colleague@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-violet-500 transition-colors"
                      />
                    </div>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as VaultRole)}
                      className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 outline-none focus:border-violet-500 cursor-pointer"
                    >
                      <option value="editor">Editor (Read & Write)</option>
                      <option value="viewer">Viewer (Read Only)</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isSubmitting || !inviteEmail.trim()}
                      className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-md"
                    >
                      {isSubmitting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      <span>Invite</span>
                    </button>
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {successMsg && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-xs text-emerald-300 flex items-center gap-2">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{successMsg}</span>
                    </div>
                  )}
                </form>
              )}

              {/* Members List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300">
                    Members & Permissions ({vault?.sharedWith?.length || 1})
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Owner: {vault?.ownerEmail || 'Unknown'}
                  </span>
                </div>

                <div className="divide-y divide-zinc-800/80 rounded-xl bg-zinc-950/60 border border-zinc-800/80 overflow-hidden">
                  {vault?.sharedWith?.map((member, idx) => {
                    const isMemberOwner = member.role === 'owner' || member.email.toLowerCase() === vault.ownerEmail.toLowerCase();
                    const isSelf = currentUser && (member.userId === currentUser.uid || member.email.toLowerCase() === currentUser.email?.toLowerCase());

                    return (
                      <div key={idx} className="p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-violet-900/60 border border-violet-700/50 flex items-center justify-center font-medium text-violet-200 text-xs shrink-0">
                            {member.displayName?.charAt(0).toUpperCase() || member.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-zinc-200 truncate flex items-center gap-1.5">
                              <span>{member.displayName || member.email}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[10px] text-zinc-400">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate">{member.email}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isMemberOwner ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-800/50 text-amber-300 text-[10px] font-medium flex items-center gap-1">
                              <Shield className="w-3 h-3" />
                              Owner
                            </span>
                          ) : isOwner ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={member.role}
                                onChange={(e) => handleRoleChange(member.email, e.target.value as VaultRole)}
                                className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] outline-none cursor-pointer"
                              >
                                <option value="editor">Editor</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRoleChange(member.email, 'remove')}
                                className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                                title="Remove collaborator"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-[10px] capitalize">
                              {member.role}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
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
