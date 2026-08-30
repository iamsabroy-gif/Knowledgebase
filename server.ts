import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { vaultStorage } from './server/storage';
import { GitHubSyncService } from './server/github';
import { parseObsidianNote } from './src/utils/markdown-parser';
import { generateChatResponse, testGeminiConnection } from './server/gemini';

let serverGeminiEnabled = true;
let serverGeminiAllowedAccess: 'all' | 'authenticated_only' | 'admin_only' = 'all';
let serverGeminiDisabledMsg = 'Gemini AI chatbot is currently disabled by the administrator.';
let serverAdminPasscode = process.env.ADMIN_PASSCODE || 'admin';

const githubSync = new GitHubSyncService(vaultStorage);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 attachments and large notes
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ==========================================
  // NOTE API ROUTES
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
  // ATTACHMENTS API
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
  // GITHUB SYNC API
  // ==========================================
  app.get('/api/github/config', (req, res) => {
    try {
      res.json(vaultStorage.getConfig());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/github/config', (req, res) => {
    try {
      vaultStorage.saveConfig(req.body);
      res.json(vaultStorage.getConfig());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/github/test', async (req, res) => {
    try {
      const { owner, repo, branch, token } = req.body;
      const effectiveToken = token || vaultStorage.getToken();
      const result = await githubSync.testConnection(effectiveToken, owner, repo, branch);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/github/summary', (req, res) => {
    try {
      const summary = githubSync.getSyncSummary();
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/github/pull', async (req, res) => {
    try {
      const result = await githubSync.pull();
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/github/push', async (req, res) => {
    try {
      const { commitMessage } = req.body;
      const result = await githubSync.push(commitMessage);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/github/conflicts', (req, res) => {
    try {
      res.json(vaultStorage.getConflicts());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/github/conflicts/resolve', (req, res) => {
    try {
      const { path: filePath, resolution, mergedContent } = req.body;
      if (!filePath || !resolution) {
        return res.status(400).json({ error: 'path and resolution (keep_local | take_remote | manual) required' });
      }
      const result = githubSync.resolveConflict(filePath, resolution, mergedContent);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
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
