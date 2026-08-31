import React, { useState, useRef, useEffect } from 'react';
import { SyncStatusSummary, SharedVaultInfo, GeminiAdminConfig, AdminAuthState } from '../types';
import { User as FirebaseUser } from 'firebase/auth';
import {
  Github, RefreshCw, UploadCloud, DownloadCloud, AlertTriangle,
  CheckCircle2, Search, Settings, BookOpen, Layers, Plus, Network,
  Users, ChevronDown, LogIn, LogOut, Database, Globe, HardDrive, Share2, Sparkles,
  Shield, ShieldCheck, Lock, MoreVertical
} from 'lucide-react';

interface HeaderProps {
  syncSummary: SyncStatusSummary | null;
  onOpenQuickSwitcher: () => void;
  onOpenSettings: () => void;
  onOpenCommitModal: () => void;
  onOpenConflictModal: () => void;
  onQuickPull: () => void;
  onReseedVault: () => void;
  isSyncing: boolean;
  isGraphViewOpen?: boolean;
  onToggleGraphView?: () => void;
  isChatbotOpen?: boolean;
  onToggleChatbot?: () => void;
  currentUser: FirebaseUser | null;
  activeVault: SharedVaultInfo | null;
  isLocalVault: boolean;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  onOpenShareModal: () => void;
  onOpenVaultSwitcher: () => void;
  onOpenAdminModal: () => void;
  adminAuthState: AdminAuthState;
  adminConfig: GeminiAdminConfig;
}

export const Header: React.FC<HeaderProps> = ({
  syncSummary,
  onOpenQuickSwitcher,
  onOpenSettings,
  onOpenCommitModal,
  onOpenConflictModal,
  onQuickPull,
  onReseedVault,
  isSyncing,
  isGraphViewOpen,
  onToggleGraphView,
  isChatbotOpen,
  onToggleChatbot,
  currentUser,
  activeVault,
  isLocalVault,
  onSignInGoogle,
  onSignOutGoogle,
  onOpenShareModal,
  onOpenVaultSwitcher,
  onOpenAdminModal,
  adminAuthState,
  adminConfig,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const isConfigured = syncSummary?.configured;
  const pendingCount = syncSummary?.total_pending_count || 0;
  const conflictCount = syncSummary?.conflicts_count || 0;
  const mobileMenuNeedsAttention = isLocalVault && (conflictCount > 0 || pendingCount > 0);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatLastSync = (iso?: string | null) => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Recently';
    }
  };

  return (
    <header className="min-h-14 pt-safe border-b border-zinc-800/80 bg-zinc-950 px-2.5 sm:px-4 flex items-center justify-between shrink-0 select-none text-zinc-300 relative z-30">
      {/* Left: Vault Identity & Switcher */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          id="btn-header-vault-switcher"
          onClick={onOpenVaultSwitcher}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-zinc-900/90 border border-transparent hover:border-zinc-800 transition-all text-left group"
          title="Click to switch or manage vaults"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-md ${
            isLocalVault
              ? 'bg-gradient-to-br from-violet-600 to-indigo-700 shadow-violet-950'
              : 'bg-gradient-to-br from-emerald-600 to-teal-700 shadow-teal-950'
          }`}>
            {isLocalVault ? <BookOpen className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-zinc-100 tracking-tight max-w-[110px] sm:max-w-[200px] truncate">
                {isLocalVault ? 'KnowledgeBase' : activeVault?.name || 'Shared Vault'}
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono border ${
                isLocalVault
                  ? 'bg-violet-950/80 text-violet-300 border-violet-800/50'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/50'
              }`}>
                {isLocalVault ? 'Local' : 'Cloud Shared'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            </div>
            <div className="text-[11px] text-zinc-500 truncate max-w-[110px] sm:max-w-xs">
              {isLocalVault
                ? (isConfigured ? `${syncSummary?.repo_name} (${syncSummary?.branch})` : 'Local File Store')
                : `Shared with ${activeVault?.sharedWith?.length || 1} members`}
            </div>
          </div>
        </button>
      </div>

      {/* Middle: Quick Switcher Bar */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          type="button"
          id="btn-quick-switcher"
          onClick={onOpenQuickSwitcher}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800/80 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <span>Search or jump to note...</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-500">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Sync Status, Graph View, Share, & Google Auth */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Mobile-only: quick switcher search icon (the search bar above is hidden below md) */}
        <button
          type="button"
          id="btn-mobile-search"
          onClick={onOpenQuickSwitcher}
          className="md:hidden p-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
          title="Search or jump to note (⌘K)"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Desktop action cluster: Sync status, Share, Graph, Gemini, Admin, Settings */}
        <div className="hidden md:flex items-center gap-2">
        {/* Sync Status Badge (when in local vault) */}
        {isLocalVault && (
          <>
            {isSyncing ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-950/60 border border-violet-800/50 text-violet-300 text-xs font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400" />
                <span className="hidden sm:inline">Syncing...</span>
              </div>
            ) : conflictCount > 0 ? (
              <button
                type="button"
                id="btn-conflicts-alert"
                onClick={onOpenConflictModal}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/80 border border-rose-700 text-rose-300 text-xs font-medium hover:bg-rose-900 transition-colors animate-pulse"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>{conflictCount} Conflict{conflictCount > 1 ? 's' : ''}</span>
              </button>
            ) : pendingCount > 0 ? (
              <button
                type="button"
                id="btn-push-changes"
                onClick={onOpenCommitModal}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/70 border border-amber-800/60 text-amber-300 text-xs font-medium hover:bg-amber-900 transition-colors"
                title="Push local commits to GitHub"
              >
                <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{pendingCount} pending</span>
              </button>
            ) : isConfigured ? (
              <div
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-800/40 text-emerald-400 text-xs font-medium"
                title={`Last synced at ${formatLastSync(syncSummary?.last_synced_at)}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Synced</span>
              </div>
            ) : (
              <button
                type="button"
                id="btn-connect-github-pill"
                onClick={onOpenSettings}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                <span>GitHub</span>
              </button>
            )}

            {isConfigured && (
              <button
                type="button"
                id="btn-quick-pull"
                onClick={onQuickPull}
                disabled={isSyncing}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors disabled:opacity-50 hidden sm:flex"
                title="Pull latest changes from GitHub"
              >
                <DownloadCloud className="w-4 h-4" />
              </button>
            )}
          </>
        )}

        {/* Share Vault Trigger */}
        <button
          type="button"
          id="btn-open-share-modal"
          onClick={onOpenShareModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600/90 to-purple-600/90 hover:from-violet-500 hover:to-purple-500 text-white text-xs font-semibold shadow-md shadow-violet-950/50 transition-all"
          title="Share vault with collaborators"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Share Vault</span>
        </button>

        {/* Graph View Toggle */}
        {onToggleGraphView && (
          <button
            type="button"
            id="btn-toggle-graph-view"
            onClick={onToggleGraphView}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              isGraphViewOpen
                ? 'bg-purple-950/80 border-purple-700 text-purple-200 shadow-sm'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
            }`}
            title="Toggle Vault Link Graph View"
          >
            <Network className="w-4 h-4 text-purple-400" />
            <span className="hidden md:inline">Graph</span>
          </button>
        )}

        {/* Gemini AI Chatbot Toggle */}
        {onToggleChatbot && (
          <button
            type="button"
            id="btn-toggle-gemini-chat"
            onClick={onToggleChatbot}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              isChatbotOpen
                ? 'bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-600/30 ring-1 ring-violet-400'
                : !adminConfig.gemini_chat_enabled
                ? 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-zinc-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-violet-300 hover:text-violet-200 hover:border-violet-700/50'
            }`}
            title={
              !adminConfig.gemini_chat_enabled
                ? 'Gemini AI Assistant (Disabled by Admin)'
                : 'Gemini AI Research Assistant (Cmd/Ctrl + J)'
            }
          >
            <Sparkles className={`w-3.5 h-3.5 ${!adminConfig.gemini_chat_enabled ? 'text-zinc-500' : 'text-violet-400 animate-pulse'}`} />
            <span className="hidden sm:inline">Ask Gemini</span>
            {!adminConfig.gemini_chat_enabled && (
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" title="Disabled" />
            )}
          </button>
        )}

        {/* Admin Login & Controls Trigger */}
        <button
          type="button"
          id="btn-open-admin-modal"
          onClick={onOpenAdminModal}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            adminAuthState.isAdmin
              ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/40'
              : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          title={adminAuthState.isAdmin ? 'Admin Control Center (Unlocked)' : 'Admin Login & Gemini Management'}
        >
          {adminAuthState.isAdmin ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Shield className="w-3.5 h-3.5 text-zinc-400" />
          )}
          <span className="hidden md:inline">
            {adminAuthState.isAdmin ? 'Admin' : 'Admin Login'}
          </span>
        </button>

        {/* GitHub Settings */}
        {isLocalVault && (
          <button
            type="button"
            id="btn-open-settings"
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
            title="GitHub Sync Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
        </div>

        {/* Mobile-only overflow menu: collects Sync, Share, Graph, Gemini, Admin, Settings */}
        <div className="md:hidden relative" ref={mobileMenuRef}>
          <button
            type="button"
            id="btn-mobile-overflow-menu"
            onClick={() => setIsMobileMenuOpen(prev => !prev)}
            className="relative p-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
            title="More actions"
          >
            <MoreVertical className="w-4 h-4" />
            {mobileMenuNeedsAttention && (
              <span
                className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                  conflictCount > 0 ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'
                }`}
              />
            )}
          </button>

          {isMobileMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-2 z-50 text-xs animate-in fade-in-50 zoom-in-95">
              {isLocalVault && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    if (isSyncing) return;
                    if (conflictCount > 0) onOpenConflictModal();
                    else if (pendingCount > 0) onOpenCommitModal();
                    else if (!isConfigured) onOpenSettings();
                  }}
                  className="w-full text-left p-2 rounded-xl hover:bg-zinc-800/80 text-zinc-200 flex items-center gap-2.5 transition-colors"
                >
                  {isSyncing ? (
                    <RefreshCw className="w-4 h-4 text-violet-400 animate-spin" />
                  ) : conflictCount > 0 ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  ) : pendingCount > 0 ? (
                    <UploadCloud className="w-4 h-4 text-amber-400" />
                  ) : isConfigured ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Github className="w-4 h-4 text-zinc-400" />
                  )}
                  <span>
                    {isSyncing
                      ? 'Syncing...'
                      : conflictCount > 0
                      ? `${conflictCount} Conflict${conflictCount > 1 ? 's' : ''}`
                      : pendingCount > 0
                      ? `${pendingCount} pending change${pendingCount > 1 ? 's' : ''}`
                      : isConfigured
                      ? 'Synced with GitHub'
                      : 'Connect GitHub'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenShareModal();
                }}
                className="w-full text-left p-2 rounded-xl hover:bg-zinc-800/80 text-zinc-200 flex items-center gap-2.5 transition-colors"
              >
                <Share2 className="w-4 h-4 text-violet-400" />
                <span>Share Vault</span>
              </button>

              {onToggleGraphView && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onToggleGraphView();
                  }}
                  className="w-full text-left p-2 rounded-xl hover:bg-zinc-800/80 text-zinc-200 flex items-center gap-2.5 transition-colors"
                >
                  <Network className="w-4 h-4 text-purple-400" />
                  <span>{isGraphViewOpen ? 'Close Graph View' : 'Open Graph View'}</span>
                </button>
              )}

              {onToggleChatbot && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onToggleChatbot();
                  }}
                  className="w-full text-left p-2 rounded-xl hover:bg-zinc-800/80 text-zinc-200 flex items-center gap-2.5 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <span>{adminConfig.gemini_chat_enabled ? 'Ask Gemini' : 'Gemini (Disabled)'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenAdminModal();
                }}
                className="w-full text-left p-2 rounded-xl hover:bg-zinc-800/80 text-zinc-200 flex items-center gap-2.5 transition-colors"
              >
                {adminAuthState.isAdmin ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Shield className="w-4 h-4 text-violet-400" />
                )}
                <span>{adminAuthState.isAdmin ? 'Admin Control Center' : 'Admin Login'}</span>
              </button>

              {isLocalVault && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full text-left p-2 rounded-xl hover:bg-zinc-800/80 text-zinc-200 flex items-center gap-2.5 transition-colors"
                >
                  <Settings className="w-4 h-4 text-zinc-400" />
                  <span>GitHub Sync Settings</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* GOOGLE AUTH PROFILE / LOGIN BUTTON */}
        <div className="relative ml-1" ref={userMenuRef}>
          {currentUser ? (
            <div>
              <button
                type="button"
                id="btn-user-profile"
                onClick={() => setIsUserMenuOpen(prev => !prev)}
                className="flex items-center gap-2 p-1 pl-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
              >
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'User'}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover border border-violet-500/40"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-violet-700 font-semibold text-[11px] text-white flex items-center justify-center">
                    {(currentUser.displayName || currentUser.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium text-zinc-200 hidden lg:inline max-w-[90px] truncate">
                  {currentUser.displayName || currentUser.email?.split('@')[0]}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-400 mr-1" />
              </button>

              {/* User Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-2 z-50 text-xs animate-in fade-in-50 zoom-in-95">
                  <div className="p-3 border-b border-zinc-800 mb-1">
                    <div className="font-semibold text-zinc-100 truncate">
                      {currentUser.displayName || 'Signed in'}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {currentUser.email}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenAdminModal();
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-zinc-800/80 text-zinc-200 flex items-center gap-2.5 transition-colors"
                  >
                    <Shield className="w-4 h-4 text-violet-400" />
                    <span>Admin Control Center</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenVaultSwitcher();
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-zinc-800/80 text-zinc-200 flex items-center gap-2.5 transition-colors"
                  >
                    <Database className="w-4 h-4 text-violet-400" />
                    <span>Manage Vaults & Workspaces</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenShareModal();
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-zinc-800/80 text-zinc-200 flex items-center gap-2.5 transition-colors"
                  >
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>Share Current Vault</span>
                  </button>

                  <div className="border-t border-zinc-800 my-1"></div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onSignOutGoogle();
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 flex items-center gap-2.5 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              id="btn-google-login"
              onClick={onSignInGoogle}
              className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-semibold text-xs transition-colors shadow-sm shrink-0"
              title="Sign in with Google Account"
            >
              {/* Google G SVG icon */}
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
