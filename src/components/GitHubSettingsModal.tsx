import React, { useState, useEffect } from 'react';
import { GitHubConfig, GitHubRepoItem, SharedVaultInfo, VaultGitHubConfig } from '../types';
import { api } from '../api/client';
import {
  Github, Server, CheckCircle2, AlertCircle, RefreshCw,
  Save, DownloadCloud, UploadCloud, RotateCcw, X, ExternalLink, ShieldCheck, LogOut, Unlink
} from 'lucide-react';

interface GitHubSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
  onPullTriggered: () => void;
  onReseedVault?: () => void;
  activeVaultId?: string;
  activeVault?: SharedVaultInfo | null;
}

export const GitHubSettingsModal: React.FC<GitHubSettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
  onPullTriggered,
  onReseedVault,
  activeVaultId = 'local',
  activeVault,
}) => {
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    githubLogin?: string;
    needsReauth?: boolean;
  }>({ connected: false });

  const [availableRepos, setAvailableRepos] = useState<GitHubRepoItem[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [subfolder, setSubfolder] = useState('');

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Load connection status
    api.getGitHubConnection()
      .then(async (status) => {
        setConnectionStatus(status);
        if (status.connected && !status.needsReauth) {
          setIsLoadingRepos(true);
          try {
            const repos = await api.getGitHubRepos();
            setAvailableRepos(repos);
          } catch (e) {
            console.warn('Could not load repos:', e);
          } finally {
            setIsLoadingRepos(false);
          }
        }
      })
      .catch((err) => console.error('Failed to get GitHub connection status:', err));

    // Load current vault GitHub configuration
    if (activeVaultId !== 'local' && activeVault?.github) {
      setOwner(activeVault.github.owner || '');
      setRepo(activeVault.github.repo || '');
      setBranch(activeVault.github.branch || 'main');
      setSubfolder(activeVault.github.subfolder || '');
    } else {
      api.getGitHubConfig()
        .then((cfg) => {
          setOwner(cfg.owner || '');
          setRepo(cfg.repo || '');
          setBranch(cfg.branch || 'main');
          setSubfolder(cfg.subfolder || '');
        })
        .catch((err) => console.error('Failed to load local GitHub config:', err));
    }
    setTestResult(null);
  }, [isOpen, activeVaultId, activeVault]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { url } = await api.getGitHubConnectUrl();
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      alert(`Failed to initiate GitHub connection: ${err.message}`);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your GitHub account? This will stop repository sync for your vaults.')) return;
    setIsDisconnecting(true);
    try {
      await api.disconnectGitHub();
      setConnectionStatus({ connected: false });
      setAvailableRepos([]);
    } catch (err: any) {
      alert(`Failed to disconnect: ${err.message}`);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleRepoSelect = (fullName: string) => {
    if (!fullName) return;
    const parts = fullName.split('/');
    if (parts.length === 2) {
      setOwner(parts[0]);
      setRepo(parts[1]);
      const matched = availableRepos.find(r => r.full_name === fullName);
      if (matched && matched.default_branch) {
        setBranch(matched.default_branch);
      }
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testGitHub({ owner, repo, branch });
      setTestResult({
        success: true,
        message: `Successfully connected to ${res.repo} on branch "${res.branch}" (Commit: ${res.latest_commit_sha?.slice(0, 7)})`,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to connect to GitHub repository.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (activeVaultId !== 'local') {
        await api.saveVaultGitHubConfig({
          vaultId: activeVaultId,
          owner,
          repo,
          branch: branch || 'main',
          subfolder: subfolder || '',
        });
      } else {
        await api.saveGitHubConfig({
          owner,
          repo,
          branch: branch || 'main',
          subfolder: subfolder || '',
        });
      }
      onConfigSaved();
      onClose();
    } catch (err: any) {
      alert(`Failed to save config: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedFullName = owner && repo ? `${owner}/${repo}` : '';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-800 text-zinc-100">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <span>GitHub Synchronization</span>
                {activeVault && (
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-violet-950/80 border border-violet-700/60 text-violet-300">
                    {activeVault.name}
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Bidirectional sync with your Obsidian markdown vault repository
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

        {/* Body Form */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* STATE 1: NOT CONNECTED */}
          {!connectionStatus.connected ? (
            <div className="p-6 rounded-2xl bg-zinc-950/90 border border-zinc-800 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-zinc-800/80 text-white flex items-center justify-center mx-auto shadow-inner">
                <Github className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-100">Connect Your GitHub Account</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                  Connect your GitHub account to sync this vault with a repository. You'll choose exactly which repositories to grant on GitHub's consent screen.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  id="btn-connect-github-oauth"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-xs font-semibold shadow-lg shadow-violet-950/60 transition-all disabled:opacity-50"
                >
                  {isConnecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                  <span>{isConnecting ? 'Opening GitHub...' : 'Connect GitHub'}</span>
                </button>
              </div>

              <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero token exposure — tokens are managed server-side and never sent to the browser</span>
              </div>
            </div>
          ) : connectionStatus.needsReauth ? (
            /* STATE 2: NEEDS REAUTH */
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs space-y-3">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>GitHub Authorization Expired</span>
              </div>
              <p className="text-zinc-300 text-[11px] leading-relaxed">
                Your authorization for <strong>@{connectionStatus.githubLogin}</strong> has expired or was revoked. Please reconnect to continue syncing.
              </p>
              <button
                type="button"
                id="btn-reconnect-github"
                onClick={handleConnect}
                disabled={isConnecting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                <span>Reconnect GitHub</span>
              </button>
            </div>
          ) : (
            /* STATE 3: CONNECTED */
            <form onSubmit={handleSave} className="space-y-4">
              {/* Account Connection Status Badge */}
              <div className="p-3 rounded-xl bg-zinc-950/90 border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <span>Connected as</span>
                      <span className="text-violet-400 font-mono">@{connectionStatus.githubLogin}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      User-to-server token active
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-disconnect-github"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-rose-300 text-xs transition-colors"
                  title="Disconnect GitHub account"
                >
                  <Unlink className="w-3 h-3" />
                  <span>Disconnect</span>
                </button>
              </div>

              {/* Repository Selector Dropdown / Free text */}
              <div className="space-y-3">
                {availableRepos.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Select Granted Repository
                    </label>
                    <select
                      value={selectedFullName}
                      onChange={(e) => handleRepoSelect(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none"
                    >
                      <option value="">-- Choose from your granted repositories --</option>
                      {availableRepos.map((r) => (
                        <option key={r.id} value={r.full_name}>
                          {r.full_name} {r.private ? '(private)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Repository Owner / Org <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      id="github-owner-input"
                      required
                      placeholder="e.g. username"
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Repository Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      id="github-repo-input"
                      required
                      placeholder="e.g. knowledgebase-vault"
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Target Branch
                    </label>
                    <input
                      type="text"
                      id="github-branch-input"
                      placeholder="main"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Vault Root Subfolder (Optional)
                    </label>
                    <input
                      type="text"
                      id="github-subfolder-input"
                      placeholder="e.g. notes or leave blank"
                      value={subfolder}
                      onChange={(e) => setSubfolder(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Test connection feedback */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/50 border border-rose-800 text-rose-300'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  )}
                  <div className="leading-relaxed font-sans">{testResult.message}</div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  id="btn-test-connection"
                  onClick={handleTestConnection}
                  disabled={isTesting || !owner || !repo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                  <span>Test Connection</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="btn-save-github-config"
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Bottom Utility Tools (Reseed Vault) */}
        {activeVaultId === 'local' && onReseedVault && (
          <div className="px-5 py-3 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
            <span>Demo Vault Tools</span>
            <button
              type="button"
              id="btn-reseed-demo-vault"
              onClick={() => {
                if (confirm('Reset and re-seed the full EMV specification research vault? Any unsynced local edits will be reset.')) {
                  onReseedVault();
                  onClose();
                }
              }}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-amber-400 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset / Re-seed EMV Vault</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
