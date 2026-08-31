import { Note, Attachment, GitHubConfig, SyncStatusSummary, ConflictItem } from '../types';
import { auth } from '../lib/firebase';

/**
 * Wrapper around fetch() that attaches the current user's Firebase ID token
 * as an Authorization: Bearer header on every request.
 * Throws a user-friendly error if the server responds with 401.
 */
async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) throw new Error('Session expired. Please sign in again.');
  return res;
}

export const api = {
  // Notes
  async getNotes(): Promise<Note[]> {
    const res = await authedFetch('/api/notes');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getNote(path: string): Promise<Note> {
    const res = await authedFetch(`/api/notes/get?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async saveNote(note: Note): Promise<Note> {
    const res = await authedFetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async deleteNote(path: string): Promise<void> {
    const res = await authedFetch(`/api/notes?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await res.text());
  },

  async renameNote(oldPath: string, newPath: string): Promise<Note> {
    const res = await authedFetch('/api/notes/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async reseedVault(): Promise<{ success: boolean; notes: Note[] }> {
    const res = await authedFetch('/api/vault/reseed', { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Attachments
  async getAttachments(): Promise<Attachment[]> {
    const res = await authedFetch('/api/attachments');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async uploadAttachment(filename: string, base64Data: string, mimeType: string): Promise<Attachment> {
    const res = await authedFetch('/api/attachments/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, base64Data, mimeType }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async deleteAttachment(path: string): Promise<void> {
    const res = await authedFetch(`/api/attachments?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await res.text());
  },

  // GitHub App & Sync
  async getGitHubConnection(): Promise<{ connected: boolean; githubLogin?: string; needsReauth?: boolean }> {
    const res = await authedFetch('/api/github/connection');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getGitHubConnectUrl(): Promise<{ url: string }> {
    const res = await authedFetch('/api/github/connect');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get GitHub connect URL');
    return data;
  },

  async disconnectGitHub(): Promise<void> {
    const res = await authedFetch('/api/github/disconnect', { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
  },

  async getGitHubRepos(): Promise<Array<{ id: number; name: string; full_name: string; owner: string; default_branch: string; private: boolean }>> {
    const res = await authedFetch('/api/github/repos');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch repositories');
    return data;
  },

  async saveVaultGitHubConfig(params: {
    vaultId: string;
    owner: string;
    repo: string;
    branch: string;
    subfolder: string;
  }): Promise<any> {
    const res = await authedFetch('/api/github/vault-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save vault GitHub config');
    return data;
  },

  async getGitHubConfig(): Promise<GitHubConfig> {
    const res = await authedFetch('/api/github/config');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async saveGitHubConfig(config: Partial<GitHubConfig>): Promise<GitHubConfig> {
    const res = await authedFetch('/api/github/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async testGitHub(config: { owner: string; repo: string; branch?: string }) {
    const res = await authedFetch('/api/github/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Connection failed');
    return data;
  },

  async getSyncSummary(vaultId: string = 'local'): Promise<SyncStatusSummary> {
    const res = await authedFetch(`/api/github/summary?vaultId=${encodeURIComponent(vaultId)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async pullGitHub(options: { vaultId?: string } = {}): Promise<any> {
    const res = await authedFetch('/api/github/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: options.vaultId || 'local' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Pull failed');
    return data;
  },

  async pushGitHub(options: { vaultId?: string; commitMessage?: string } = {}): Promise<any> {
    const res = await authedFetch('/api/github/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId: options.vaultId || 'local',
        commitMessage: options.commitMessage,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Push failed');
    return data;
  },

  async getConflicts(vaultId: string = 'local'): Promise<ConflictItem[]> {
    const res = await authedFetch(`/api/github/conflicts?vaultId=${encodeURIComponent(vaultId)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async resolveConflict(
    path: string,
    resolution: 'keep_local' | 'take_remote' | 'manual',
    mergedContent?: string,
    vaultId: string = 'local'
  ): Promise<any> {
    const res = await authedFetch('/api/github/conflicts/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, resolution, mergedContent, vaultId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Conflict resolution failed');
    return data;
  },

  // Gemini AI Chatbot
  async sendChatMessage(payload: {
    messages: Array<{ role: 'user' | 'model'; content: string }>;
    activeNote?: { title: string; path: string; body: string } | null;
    vaultContext?: Array<{ title: string; path: string; tags?: string[] }>;
    isAdmin?: boolean;
    isAuthenticated?: boolean;
  }): Promise<string> {
    const res = await authedFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gemini chat request failed');
    }
    return data.text;
  },

  // Admin Management Endpoints
  async verifyAdminPasscode(passcode: string): Promise<{ valid: boolean; message?: string }> {
    const res = await authedFetch('/api/admin/verify-passcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid passcode');
    return data;
  },

  async getAdminGeminiStatus(): Promise<{
    enabled: boolean;
    allowedAccess: 'all' | 'authenticated_only' | 'admin_only';
    disabledMessage: string;
    model: string;
    hasApiKey: boolean;
  }> {
    // Public endpoint — no auth token needed.
    const res = await fetch('/api/admin/gemini-status');
    if (!res.ok) throw new Error('Failed to fetch Gemini status');
    return res.json();
  },

  async setAdminGeminiStatus(params: {
    enabled?: boolean;
    allowedAccess?: 'all' | 'authenticated_only' | 'admin_only';
    disabledMessage?: string;
    passcode?: string;
    newPasscode?: string;
  }): Promise<{ success: boolean; enabled: boolean; allowedAccess: string; disabledMessage: string }> {
    const res = await authedFetch('/api/admin/gemini-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update Gemini admin status');
    return data;
  },

  async testGeminiApi(): Promise<{ success: boolean; latencyMs: number; model: string; message: string }> {
    const res = await authedFetch('/api/admin/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gemini test failed');
    return data;
  },
};
