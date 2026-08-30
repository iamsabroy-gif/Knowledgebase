import { Note, Attachment, GitHubConfig, SyncStatusSummary, ConflictItem } from '../types';

export const api = {
  // Notes
  async getNotes(): Promise<Note[]> {
    const res = await fetch('/api/notes');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getNote(path: string): Promise<Note> {
    const res = await fetch(`/api/notes/get?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async saveNote(note: Note): Promise<Note> {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async deleteNote(path: string): Promise<void> {
    const res = await fetch(`/api/notes?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await res.text());
  },

  async renameNote(oldPath: string, newPath: string): Promise<Note> {
    const res = await fetch('/api/notes/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async reseedVault(): Promise<{ success: boolean; notes: Note[] }> {
    const res = await fetch('/api/vault/reseed', { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Attachments
  async getAttachments(): Promise<Attachment[]> {
    const res = await fetch('/api/attachments');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async uploadAttachment(filename: string, base64Data: string, mimeType: string): Promise<Attachment> {
    const res = await fetch('/api/attachments/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, base64Data, mimeType }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async deleteAttachment(path: string): Promise<void> {
    const res = await fetch(`/api/attachments?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await res.text());
  },

  // GitHub Config & Sync
  async getGitHubConfig(): Promise<GitHubConfig> {
    const res = await fetch('/api/github/config');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async saveGitHubConfig(config: Partial<GitHubConfig> & { token?: string }): Promise<GitHubConfig> {
    const res = await fetch('/api/github/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async testGitHub(config: { owner: string; repo: string; branch?: string; token?: string }) {
    const res = await fetch('/api/github/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Connection failed');
    return data;
  },

  async getSyncSummary(): Promise<SyncStatusSummary> {
    const res = await fetch('/api/github/summary');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async pullGitHub(): Promise<any> {
    const res = await fetch('/api/github/pull', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Pull failed');
    return data;
  },

  async pushGitHub(commitMessage?: string): Promise<any> {
    const res = await fetch('/api/github/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitMessage }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Push failed');
    return data;
  },

  async getConflicts(): Promise<ConflictItem[]> {
    const res = await fetch('/api/github/conflicts');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async resolveConflict(path: string, resolution: 'keep_local' | 'take_remote' | 'manual', mergedContent?: string): Promise<any> {
    const res = await fetch('/api/github/conflicts/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, resolution, mergedContent }),
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
    const res = await fetch('/api/chat', {
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
    const res = await fetch('/api/admin/verify-passcode', {
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
    const res = await fetch('/api/admin/gemini-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update Gemini admin status');
    return data;
  },

  async testGeminiApi(): Promise<{ success: boolean; latencyMs: number; model: string; message: string }> {
    const res = await fetch('/api/admin/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gemini test failed');
    return data;
  },
};
