import React, { useState, useEffect } from 'react';
import { GitHubConfig, SyncStatusSummary } from '../types';
import { api } from '../api/client';
import {
  Github, Key, Server, CheckCircle2, AlertCircle, RefreshCw,
  Save, DownloadCloud, UploadCloud, RotateCcw, X, ExternalLink, ShieldCheck
} from 'lucide-react';

interface GitHubSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
  onPullTriggered: () => void;
  onReseedVault: () => void;
}

export const GitHubSettingsModal: React.FC<GitHubSettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
  onPullTriggered,
  onReseedVault,
}) => {
  const [config, setConfig] = useState<GitHubConfig>({
    owner: '',
    repo: '',
    branch: 'main',
    subfolder: '',
    has_token: false,
    last_synced_at: null,
    last_commit_sha: null,
  });

  const [tokenInput, setTokenInput] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.getGitHubConfig().then(cfg => {
        setConfig(cfg);
        setTokenInput('');
        setTestResult(null);
      }).catch(err => console.error('Failed to load GitHub config:', err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testGitHub({
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        token: tokenInput || undefined,
      });
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
      const payload: any = {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch || 'main',
        subfolder: config.subfolder || '',
      };
      if (tokenInput.trim()) {
        payload.token = tokenInput.trim();
      }
      await api.saveGitHubConfig(payload);
      onConfigSaved();
      onClose();
    } catch (err: any) {
      alert(`Failed to save config: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

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
              <h2 className="text-sm font-bold text-zinc-100">
                GitHub Synchronization Settings
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
        <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* SSO / PAT Security Notice */}
          <div className="p-3.5 rounded-lg bg-violet-950/30 border border-violet-800/40 text-xs text-zinc-300 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-violet-300">
              <ShieldCheck className="w-4 h-4 text-violet-400 shrink-0" />
              <span>Google SSO & Fine-Grained Token Auth</span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              If your GitHub account uses Google SSO for interactive logins, auth to GitHub's Git API uses a <strong>Fine-Grained Personal Access Token (PAT)</strong> generated from your GitHub Developer Settings with <em>Repository Permissions → Contents: Read and write</em>. The token is encrypted server-side and never exposed to the client.
            </p>
          </div>

          {/* Repository Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Repository Owner / Org <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                id="github-owner-input"
                required
                placeholder="e.g. your-username"
                value={config.owner}
                onChange={(e) => setConfig({ ...config, owner: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none"
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
                placeholder="e.g. emv-research-vault"
                value={config.repo}
                onChange={(e) => setConfig({ ...config, repo: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none"
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
                value={config.branch}
                onChange={(e) => setConfig({ ...config, branch: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Vault Root Subfolder (Optional)
              </label>
              <input
                type="text"
                id="github-subfolder-input"
                placeholder="e.g. notes or leave blank for root"
                value={config.subfolder}
                onChange={(e) => setConfig({ ...config, subfolder: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none"
              />
            </div>
          </div>

          {/* Token Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-zinc-300">
                Personal Access Token (PAT)
              </label>
              {config.has_token && (
                <span className="text-[11px] text-emerald-400 font-mono">
                  ✓ Token Stored ({config.token_preview})
                </span>
              )}
            </div>
            <input
              type="password"
              id="github-token-input"
              placeholder={config.has_token ? "Enter new token to replace existing..." : "github_pat_... (Contents: Read/Write)"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono focus:border-violet-500 outline-none"
            />
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
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <button
              type="button"
              id="btn-test-connection"
              onClick={handleTestConnection}
              disabled={isTesting || !config.owner || !config.repo}
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

        {/* Bottom Utility Tools (Reseed Vault) */}
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
      </div>
    </div>
  );
};
