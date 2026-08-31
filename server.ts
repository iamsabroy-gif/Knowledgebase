import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { vaultStorage } from './server/storage';
import { GitHubSyncService, VaultGitHubConfig } from './server/github';
import { FirestoreNoteStore, LocalVaultNoteStore } from './server/notestore';
import {
  signState,
  verifyState,
  exchangeCode,
  getUserToken,
  getGitHubConnection,
  disconnectGitHub,
  getInstallationRepos,
} from './server/github-app';
import { generateChatResponse, testGeminiConnection } from './server/gemini';
import { requireAuth, AuthedRequest, adminDb } from './server/auth';

let serverGeminiEnabled = true;
let serverGeminiAllowedAccess: 'all' | 'authenticated_only' | 'admin_only' = 'all';
let serverGeminiDisabledMsg = 'Gemini AI chatbot is currently disabled by the administrator.';
let serverAdminPasscode = process.env.ADMIN_PASSCODE || 'admin';

const githubSync = new GitHubSyncService();

/**
 * IDOR helper: Verifies the authenticated user is the owner or a member of the vault
 */
async function assertVaultAccess(uid: string, vaultId: string) {
  if (vaultId === 'local') {
    return { id: 'local', isLocal: true, data: null };
  }

  const snap = await adminDb.collection('vaults').doc(vaultId).get();
  if (!snap.exists) {
    const err: any = new Error(`Vault "${vaultId}" not found`);
    err.status = 404;
    throw err;
  }

  const data = snap.data();
  const isOwner = data?.ownerId === uid;
  const isMember = Array.isArray(data?.memberUids) && data.memberUids.includes(uid);

  if (!isOwner && !isMember) {
    const err: any = new Error('Forbidden: You do not have access to this vault.');
    err.status = 403;
    throw err;
  }

  return { id: vaultId, isLocal: false, data };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 attachments and large notes
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ==========================================
  // AUTHENTICATION MIDDLEWARE
  // All /api/* routes require a valid Firebase ID token except public endpoints:
  // - GET /api/admin/gemini-status
  // - GET /api/github/callback (OAuth redirect from GitHub)
  // - POST /api/github/webhook (GitHub App webhooks)
  // ==========================================
  app.use('/api', (req, res, next) => {
    const isPublic =
      (req.method === 'GET' && req.path === '/admin/gemini-status') ||
      (req.method === 'GET' && req.path === '/github/callback') ||
      (req.method === 'POST' && req.path === '/github/webhook');
    if (isPublic) return next();
    return requireAuth(req as AuthedRequest, res, next);
  });

  // ==========================================
  // NOTE API ROUTES (LOCAL VAULT DEMO)
  // ==========================================
  app.get('/api/notes', (req, res) => {
    try {
      const notes = vaultStorage.getNotes();
      res.json(notes);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/notes/get', (req, res) => {
    try {
      const notePath = req.query.path as string;
      if (!notePath) return res.status(400).json({ error: 'Path query param required' });
      const note = vaultStorage.getNote(notePath);
      if (!note) return res.status(404).json({ error: 'Note not found' });
      res.json(note);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/notes', (req, res) => {
    try {
      const note = req.body;
      if (!note || !note.path) return res.status(400).json({ error: 'Valid note object with path required' });
      const saved = vaultStorage.saveNote(note);
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/notes', (req, res) => {
    try {
      const notePath = req.query.path as string;
      if (!notePath) return res.status(400).json({ error: 'Path query param required' });
      const ok = vaultStorage.deleteNote(notePath);
      if (!ok) return res.status(404).json({ error: 'Note not found' });
      res.json({ success: true, path: notePath });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/notes/rename', (req, res) => {
    try {
      const { oldPath, newPath } = req.body;
      if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath required' });
      const renamed = vaultStorage.renameNote(oldPath, newPath);
      if (!renamed) return res.status(404).json({ error: 'Original note not found' });
      res.json(renamed);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Reseed default EMV notes
  app.post('/api/vault/reseed', (req, res) => {
    try {
      vaultStorage.seedVault();
      res.json({ success: true, notes: vaultStorage.getNotes() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==========================================
  // ATTACHMENTS API (LOCAL VAULT DEMO)
  // ==========================================
  app.get('/api/attachments', (req, res) => {
    try {
      res.json(vaultStorage.getAttachments());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/attachments/raw', (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'Path required' });

      const fileData = vaultStorage.getAttachment(filePath);
      if (!fileData) return res.status(404).send('Attachment not found');

      res.setHeader('Content-Type', fileData.meta.mime_type);
      res.setHeader('Content-Length', fileData.buffer.length);
      res.send(fileData.buffer);
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  app.post('/api/attachments/upload', (req, res) => {
    try {
      const { filename, base64Data, mimeType } = req.body;
      if (!filename || !base64Data) {
        return res.status(400).json({ error: 'filename and base64Data required' });
      }

      const cleanName = filename.replace(/^[\/\\]+/, '');
      const storagePath = cleanName.startsWith('attachments/') ? cleanName : `attachments/${cleanName}`;
      const buffer = Buffer.from(base64Data, 'base64');
      const resolvedMime = mimeType || 'application/octet-stream';

      const saved = vaultStorage.saveAttachment(storagePath, buffer, resolvedMime, '', 'local_changes');
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/attachments', (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'Path required' });
      const ok = vaultStorage.deleteAttachment(filePath);
      if (!ok) return res.status(404).json({ error: 'Attachment not found' });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==========================================
  // GITHUB APP & SYNC API
  // ==========================================

  // Check connection status for current authenticated user
  app.get('/api/github/connection', async (req: AuthedRequest, res) => {
    try {
      const status = await getGitHubConnection(req.uid!);
      res.json(status);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Generate GitHub App Connect / Installation URL with HMAC-signed CSRF state
  app.get('/api/github/connect', (req: AuthedRequest, res) => {
    try {
      const state = signState(req.uid!);
      const appSlug = process.env.GITHUB_APP_SLUG;
      const clientId = process.env.GITHUB_APP_CLIENT_ID;

      let url = '';
      if (appSlug) {
        url = `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(state)}`;
      } else if (clientId) {
        url = `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${encodeURIComponent(state)}&scope=repo`;
      } else {
        return res.status(500).json({ error: 'Neither GITHUB_APP_SLUG nor GITHUB_APP_CLIENT_ID is configured in environment.' });
      }

      res.json({ url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Public OAuth Callback Handler
  app.get('/api/github/callback', async (req, res) => {
    try {
      const { code, state, installation_id } = req.query as {
        code?: string;
        state?: string;
        installation_id?: string;
      };

      if (!code || !state) {
        return res.status(400).send('Missing code or state in OAuth callback');
      }

      let uid: string;
      try {
        const verified = verifyState(state);
        uid = verified.uid;
      } catch (err: any) {
        return res.status(400).send(`Invalid OAuth state: ${err.message}`);
      }

      const tokenSet = await exchangeCode(code);

      // Fetch GitHub profile for the user login name
      let githubLogin = 'User';
      let githubAccountId: number | undefined;
      try {
        const userRes = await fetch('https://api.github.com/user', {
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${tokenSet.access_token}`,
            'User-Agent': 'Knowledgebase-App',
          },
        });
        if (userRes.ok) {
          const ghUser = await userRes.json();
          githubLogin = ghUser.login || 'User';
          githubAccountId = ghUser.id;
        }
      } catch (e) {
        console.warn('Could not fetch GitHub user profile:', e);
      }

      const now = new Date();
      const accessTokenExpiresAt = new Date(now.getTime() + (tokenSet.expires_in || 28800) * 1000).toISOString();
      const refreshTokenExpiresAt = new Date(now.getTime() + (tokenSet.refresh_token_expires_in || 15552000) * 1000).toISOString();

      await adminDb.collection('github_connections').doc(uid).set({
        uid,
        installationId: installation_id ? parseInt(installation_id, 10) : undefined,
        githubLogin,
        githubAccountId,
        accessToken: tokenSet.access_token,
        accessTokenExpiresAt,
        refreshToken: tokenSet.refresh_token || '',
        refreshTokenExpiresAt,
        connectedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      res.redirect('/?github=connected');
    } catch (e: any) {
      console.error('GitHub Callback Error:', e);
      res.status(500).send(`GitHub Connection Failed: ${e.message}`);
    }
  });

  // Disconnect GitHub account
  app.post('/api/github/disconnect', async (req: AuthedRequest, res) => {
    try {
      await disconnectGitHub(req.uid!);
      res.json({ success: true, message: 'GitHub account disconnected successfully' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Public Webhook Handler (timing-safe HMAC verification)
  app.post('/api/github/webhook', async (req, res) => {
    const signature = req.headers['x-hub-signature-256'] as string;
    const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;

    if (secret && signature) {
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      const digest = `sha256=${hmac.digest('hex')}`;
      const sigBuf = Buffer.from(signature);
      const digBuf = Buffer.from(digest);
      if (sigBuf.length !== digBuf.length || !crypto.timingSafeEqual(sigBuf, digBuf)) {
        return res.status(401).send('Signature verification failed');
      }
    }

    const event = req.headers['x-github-event'];
    const payload = req.body;

    if (event === 'installation' && payload.action === 'deleted') {
      const instId = payload.installation?.id;
      if (instId) {
        const snap = await adminDb.collection('github_connections').where('installationId', '==', instId).get();
        for (const doc of snap.docs) {
          await doc.ref.delete();
        }
      }
    }

    res.json({ received: true });
  });

  // List repositories accessible to the user
  app.get('/api/github/repos', async (req: AuthedRequest, res) => {
    try {
      const repos = await getInstallationRepos(req.uid!);
      res.json(repos);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Save GitHub configuration on a vault
  app.post('/api/github/vault-config', async (req: AuthedRequest, res) => {
    try {
      const { vaultId, owner, repo, branch, subfolder } = req.body;
      if (!vaultId) return res.status(400).json({ error: 'vaultId is required' });

      if (vaultId === 'local') {
        vaultStorage.saveConfig({ owner, repo, branch, subfolder });
        return res.json(vaultStorage.getConfig());
      }

      const vault = await assertVaultAccess(req.uid!, vaultId);
      const ghConfig: VaultGitHubConfig = {
        owner: (owner || '').trim(),
        repo: (repo || '').trim(),
        branch: (branch || 'main').trim(),
        subfolder: (subfolder || '').trim(),
        lastSyncedAt: vault.data?.github?.lastSyncedAt || null,
        lastCommitSha: vault.data?.github?.lastCommitSha || null,
        connectedByUid: req.uid!,
      };

      await adminDb.collection('vaults').doc(vaultId).update({
        github: ghConfig,
        updatedAt: new Date().toISOString(),
      });

      res.json(ghConfig);
    } catch (e: any) {
      const status = e.status || 400;
      res.status(status).json({ error: e.message });
    }
  });

  // Test repository connection
  app.post('/api/github/test', async (req: AuthedRequest, res) => {
    try {
      const { owner, repo, branch } = req.body;
      let token = '';
      try {
        token = await getUserToken(req.uid!);
      } catch {
        token = process.env.GITHUB_TOKEN || '';
      }
      if (!token) {
        return res.status(400).json({ error: 'GitHub is not connected. Please connect your GitHub account.' });
      }
      const result = await githubSync.testConnection(token, owner, repo, branch);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Get Sync Summary
  app.get('/api/github/summary', async (req: AuthedRequest, res) => {
    try {
      const vaultId = (req.query.vaultId as string) || 'local';
      if (vaultId === 'local') {
        const cfg = vaultStorage.getConfig();
        const summary = await githubSync.getSyncSummary(cfg as any, new LocalVaultNoteStore(vaultStorage));
        return res.json(summary);
      }

      const vault = await assertVaultAccess(req.uid!, vaultId);
      const noteStore = new FirestoreNoteStore(vaultId);
      const summary = await githubSync.getSyncSummary(vault.data?.github || null, noteStore);
      res.json(summary);
    } catch (e: any) {
      const status = e.status || 500;
      res.status(status).json({ error: e.message });
    }
  });

  // Pull changes from GitHub
  app.post('/api/github/pull', async (req: AuthedRequest, res) => {
    try {
      const { vaultId = 'local' } = req.body;

      if (vaultId === 'local') {
        let token = process.env.GITHUB_TOKEN || '';
        try {
          if (req.uid) token = await getUserToken(req.uid);
        } catch {}
        const cfg = vaultStorage.getConfig();
        const result = await githubSync.pull(token, cfg as any, new LocalVaultNoteStore(vaultStorage));
        return res.json(result);
      }

      const vault = await assertVaultAccess(req.uid!, vaultId);
      const ghConfig = vault.data?.github as VaultGitHubConfig | undefined;
      if (!ghConfig || !ghConfig.owner || !ghConfig.repo) {
        return res.status(400).json({ error: 'GitHub repository is not configured for this vault.' });
      }

      const tokenUid = ghConfig.connectedByUid || req.uid!;
      const token = await getUserToken(tokenUid);
      const noteStore = new FirestoreNoteStore(vaultId);
      const result = await githubSync.pull(token, ghConfig, noteStore);
      res.json(result);
    } catch (e: any) {
      const status = e.status || 400;
      res.status(status).json({ error: e.message });
    }
  });

  // Push changes to GitHub
  app.post('/api/github/push', async (req: AuthedRequest, res) => {
    try {
      const { vaultId = 'local', commitMessage } = req.body;

      if (vaultId === 'local') {
        let token = process.env.GITHUB_TOKEN || '';
        try {
          if (req.uid) token = await getUserToken(req.uid);
        } catch {}
        const cfg = vaultStorage.getConfig();
        const result = await githubSync.push(token, cfg as any, new LocalVaultNoteStore(vaultStorage), commitMessage);
        return res.json(result);
      }

      const vault = await assertVaultAccess(req.uid!, vaultId);
      const ghConfig = vault.data?.github as VaultGitHubConfig | undefined;
      if (!ghConfig || !ghConfig.owner || !ghConfig.repo) {
        return res.status(400).json({ error: 'GitHub repository is not configured for this vault.' });
      }

      const tokenUid = ghConfig.connectedByUid || req.uid!;
      const token = await getUserToken(tokenUid);
      const noteStore = new FirestoreNoteStore(vaultId);
      const result = await githubSync.push(token, ghConfig, noteStore, commitMessage);
      res.json(result);
    } catch (e: any) {
      const status = e.status || 400;
      res.status(status).json({ error: e.message });
    }
  });

  // List Conflicts
  app.get('/api/github/conflicts', async (req: AuthedRequest, res) => {
    try {
      const vaultId = (req.query.vaultId as string) || 'local';
      if (vaultId === 'local') {
        return res.json(vaultStorage.getConflicts());
      }
      await assertVaultAccess(req.uid!, vaultId);
      const noteStore = new FirestoreNoteStore(vaultId);
      const conflicts = await noteStore.getConflicts();
      res.json(conflicts);
    } catch (e: any) {
      const status = e.status || 500;
      res.status(status).json({ error: e.message });
    }
  });

  // Resolve Conflict
  app.post('/api/github/conflicts/resolve', async (req: AuthedRequest, res) => {
    try {
      const { vaultId = 'local', path: filePath, resolution, mergedContent } = req.body;
      if (!filePath || !resolution) {
        return res.status(400).json({ error: 'path and resolution (keep_local | take_remote | manual) required' });
      }

      if (vaultId === 'local') {
        const noteStore = new LocalVaultNoteStore(vaultStorage);
        const result = await githubSync.resolveConflict(noteStore, filePath, resolution, mergedContent);
        return res.json(result);
      }

      await assertVaultAccess(req.uid!, vaultId);
      const noteStore = new FirestoreNoteStore(vaultId);
      const result = await githubSync.resolveConflict(noteStore, filePath, resolution, mergedContent);
      res.json(result);
    } catch (e: any) {
      const status = e.status || 400;
      res.status(status).json({ error: e.message });
    }
  });

  // ==========================================
  // GEMINI AI CHATBOT API
  // ==========================================
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, activeNote, vaultContext, isAdmin, isAuthenticated } = req.body;

      // Server-side policy check
      if (!serverGeminiEnabled && !isAdmin) {
        return res.status(403).json({
          error: serverGeminiDisabledMsg || 'Gemini AI Chatbot has been disabled by the administrator.',
          disabled: true,
        });
      }

      if (serverGeminiAllowedAccess === 'authenticated_only' && !isAuthenticated && !isAdmin) {
        return res.status(403).json({
          error: 'Gemini AI Chatbot is restricted to signed-in users. Please sign in with your Google account.',
          restricted: true,
        });
      }

      if (serverGeminiAllowedAccess === 'admin_only' && !isAdmin) {
        return res.status(403).json({
          error: 'Gemini AI Chatbot is currently restricted to Administrators only.',
          restricted: true,
        });
      }

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required' });
      }

      const responseText = await generateChatResponse({
        messages,
        activeNote,
        vaultContext,
      });

      res.json({ text: responseText });
    } catch (e: any) {
      console.error('Gemini API Error:', e);
      res.status(500).json({ error: e.message || 'Gemini API call failed' });
    }
  });

  // ==========================================
  // ADMIN MANAGEMENT API
  // ==========================================
  app.get('/api/admin/gemini-status', (req, res) => {
    res.json({
      enabled: serverGeminiEnabled,
      allowedAccess: serverGeminiAllowedAccess,
      disabledMessage: serverGeminiDisabledMsg,
      model: 'gemini-3.7-flash',
      hasApiKey: !!process.env.GEMINI_API_KEY,
    });
  });

  app.post('/api/admin/verify-passcode', (req, res) => {
    const { passcode } = req.body;
    if (!passcode) {
      return res.status(400).json({ valid: false, error: 'Passcode is required' });
    }
    const isValid = passcode.trim() === serverAdminPasscode.trim();
    if (isValid) {
      res.json({ valid: true, message: 'Admin authenticated successfully' });
    } else {
      res.status(401).json({ valid: false, error: 'Invalid admin passcode' });
    }
  });

  app.post('/api/admin/gemini-status', (req, res) => {
    const { enabled, allowedAccess, disabledMessage, passcode, newPasscode } = req.body;
    
    // Validate passcode if provided
    if (passcode && passcode.trim() !== serverAdminPasscode.trim()) {
      return res.status(401).json({ error: 'Unauthorized: Invalid admin passcode' });
    }

    if (typeof enabled === 'boolean') {
      serverGeminiEnabled = enabled;
    }
    if (allowedAccess && ['all', 'authenticated_only', 'admin_only'].includes(allowedAccess)) {
      serverGeminiAllowedAccess = allowedAccess;
    }
    if (typeof disabledMessage === 'string') {
      serverGeminiDisabledMsg = disabledMessage;
    }
    if (newPasscode && typeof newPasscode === 'string' && newPasscode.trim().length >= 3) {
      serverAdminPasscode = newPasscode.trim();
    }

    res.json({
      success: true,
      enabled: serverGeminiEnabled,
      allowedAccess: serverGeminiAllowedAccess,
      disabledMessage: serverGeminiDisabledMsg,
    });
  });

  app.post('/api/admin/test-connection', async (req, res) => {
    try {
      const result = await testGeminiConnection();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({
        success: false,
        error: e.message || 'Gemini API test failed',
      });
    }
  });

  // ==========================================
  // VITE DEV SERVER / STATIC PROD SERVING
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Knowledge-base server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
