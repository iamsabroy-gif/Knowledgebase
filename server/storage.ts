import fs from 'fs';
import path from 'path';
import { Note, Attachment, GitHubConfig, ConflictItem } from '../src/types';
import { parseObsidianNote, serializeObsidianNote } from '../src/utils/markdown-parser';
import { SEED_NOTES } from './default-vault';

const DATA_DIR = path.join(process.cwd(), 'data');
const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');
const NOTES_DB_FILE = path.join(DATA_DIR, 'vault_db.json');
const ATTACHMENTS_DB_FILE = path.join(DATA_DIR, 'attachments_db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'github_config.json');
const DELETED_TRACKER_FILE = path.join(DATA_DIR, 'deleted_tracker.json');
const CONFLICTS_FILE = path.join(DATA_DIR, 'conflicts.json');

// Ensure data directories exist
function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ATTACHMENTS_DIR)) {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  }
}

export class VaultStorage {
  private notes: Map<string, Note> = new Map();
  private attachments: Map<string, Attachment> = new Map();
  private deletedPaths: Set<string> = new Set();
  private conflicts: Map<string, ConflictItem> = new Map();
  private config: GitHubConfig = {
    owner: '',
    repo: '',
    branch: 'main',
    subfolder: '',
    has_token: false,
    last_synced_at: null,
    last_commit_sha: null,
  };
  private token: string = '';

  constructor() {
    ensureDirs();
    this.loadConfig();
    this.loadAttachments();
    this.loadNotes();
    this.loadDeletedTracker();
    this.loadConflicts();
  }

  private loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const data = JSON.parse(raw);
        this.config = {
          owner: data.owner || '',
          repo: data.repo || '',
          branch: data.branch || 'main',
          subfolder: data.subfolder || '',
          has_token: !!data.token,
          token_preview: data.token ? `${data.token.slice(0, 10)}...${data.token.slice(-4)}` : undefined,
          last_synced_at: data.last_synced_at || null,
          last_commit_sha: data.last_commit_sha || null,
        };
        this.token = data.token || '';
      }
    } catch (e) {
      console.error('Failed to load GitHub config:', e);
    }
  }

  public saveConfig(newConfig: Partial<GitHubConfig> & { token?: string }) {
    if (newConfig.owner !== undefined) this.config.owner = newConfig.owner.trim();
    if (newConfig.repo !== undefined) this.config.repo = newConfig.repo.trim();
    if (newConfig.branch !== undefined) this.config.branch = newConfig.branch.trim() || 'main';
    if (newConfig.subfolder !== undefined) this.config.subfolder = newConfig.subfolder.trim();
    if (newConfig.token !== undefined) {
      if (newConfig.token) {
        this.token = newConfig.token.trim();
        this.config.has_token = true;
        this.config.token_preview = `${this.token.slice(0, 10)}...${this.token.slice(-4)}`;
      } else {
        this.token = '';
        this.config.has_token = false;
        this.config.token_preview = undefined;
      }
    }
    if (newConfig.last_synced_at !== undefined) this.config.last_synced_at = newConfig.last_synced_at;
    if (newConfig.last_commit_sha !== undefined) this.config.last_commit_sha = newConfig.last_commit_sha;

    const dataToSave = {
      ...this.config,
      token: this.token,
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
  }

  public getConfig(): GitHubConfig {
    return { ...this.config };
  }

  public getToken(): string {
    return this.token;
  }

  private loadNotes() {
    try {
      if (fs.existsSync(NOTES_DB_FILE)) {
        const raw = fs.readFileSync(NOTES_DB_FILE, 'utf-8');
        const list: Note[] = JSON.parse(raw);
        for (const note of list) {
          this.notes.set(note.path, note);
        }
      } else {
        // First run: Seed from built-in EMV research vault
        this.seedVault();
      }
    } catch (e) {
      console.error('Failed to load notes DB, reseeding:', e);
      this.seedVault();
    }
  }

  public seedVault() {
    this.notes.clear();
    for (const seed of SEED_NOTES) {
      const note = parseObsidianNote(seed.content, seed.path, '', 'synced');
      this.notes.set(note.path, note);
    }
    this.saveNotesToDisk();
  }

  private saveNotesToDisk() {
    const list = Array.from(this.notes.values());
    fs.writeFileSync(NOTES_DB_FILE, JSON.stringify(list, null, 2), 'utf-8');
  }

  public getNotes(): Note[] {
    return Array.from(this.notes.values());
  }

  public getNote(pathStr: string): Note | null {
    return this.notes.get(pathStr) || null;
  }

  public saveNote(note: Note): Note {
    const existing = this.notes.get(note.path);
    const now = new Date().toISOString();

    const updatedNote: Note = {
      ...note,
      updated_at: now,
      created_at: existing ? existing.created_at : (note.created_at || now),
      git_sha: existing ? existing.git_sha : (note.git_sha || ''),
      sync_status: (existing && existing.git_sha) ? 'local_changes' : 'local_changes',
    };

    // If it was previously tracked as deleted, unmark it
    this.deletedPaths.delete(note.path);
    this.saveDeletedTracker();

    this.notes.set(note.path, updatedNote);
    this.saveNotesToDisk();
    return updatedNote;
  }

  public updateNoteDirect(note: Note) {
    this.notes.set(note.path, note);
    this.saveNotesToDisk();
  }

  public deleteNote(pathStr: string): boolean {
    const existing = this.notes.get(pathStr);
    if (!existing) return false;

    this.notes.delete(pathStr);
    if (existing.git_sha) {
      this.deletedPaths.add(pathStr);
      this.saveDeletedTracker();
    }
    this.saveNotesToDisk();
    return true;
  }

  public renameNote(oldPath: string, newPath: string): Note | null {
    const existing = this.notes.get(oldPath);
    if (!existing) return null;

    this.notes.delete(oldPath);
    if (existing.git_sha) {
      this.deletedPaths.add(oldPath);
      this.saveDeletedTracker();
    }

    const newFilename = newPath.split('/').pop() || newPath;
    const newTitle = existing.frontmatter.title || newFilename.replace(/\.md$/i, '');

    const newNote: Note = {
      ...existing,
      path: newPath,
      title: newTitle,
      updated_at: new Date().toISOString(),
      sync_status: 'local_changes',
    };

    this.notes.set(newPath, newNote);
    this.saveNotesToDisk();
    return newNote;
  }

  // Attachments
  private loadAttachments() {
    try {
      if (fs.existsSync(ATTACHMENTS_DB_FILE)) {
        const raw = fs.readFileSync(ATTACHMENTS_DB_FILE, 'utf-8');
        const list: Attachment[] = JSON.parse(raw);
        for (const item of list) {
          this.attachments.set(item.path, item);
        }
      }
    } catch (e) {
      console.error('Failed to load attachments DB:', e);
    }
  }

  private saveAttachmentsToDisk() {
    const list = Array.from(this.attachments.values());
    fs.writeFileSync(ATTACHMENTS_DB_FILE, JSON.stringify(list, null, 2), 'utf-8');
  }

  public getAttachments(): Attachment[] {
    return Array.from(this.attachments.values());
  }

  public getAttachment(pathStr: string): { meta: Attachment; buffer: Buffer } | null {
    const meta = this.attachments.get(pathStr);
    if (!meta) return null;

    const diskPath = path.join(DATA_DIR, pathStr);
    if (!fs.existsSync(diskPath)) return null;

    const buffer = fs.readFileSync(diskPath);
    return { meta, buffer };
  }

  public saveAttachment(filePath: string, buffer: Buffer, mimeType: string, gitSha: string = '', syncStatus: Attachment['sync_status'] = 'local_changes'): Attachment {
    const diskPath = path.join(DATA_DIR, filePath);
    const parentDir = path.dirname(diskPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(diskPath, buffer);

    const name = path.basename(filePath);
    const item: Attachment = {
      path: filePath,
      name,
      mime_type: mimeType,
      size: buffer.length,
      git_sha: gitSha,
      sync_status: syncStatus,
      updated_at: new Date().toISOString(),
    };

    this.deletedPaths.delete(filePath);
    this.saveDeletedTracker();

    this.attachments.set(filePath, item);
    this.saveAttachmentsToDisk();
    return item;
  }

  public deleteAttachment(filePath: string): boolean {
    const meta = this.attachments.get(filePath);
    if (!meta) return false;

    const diskPath = path.join(DATA_DIR, filePath);
    if (fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath);
    }

    this.attachments.delete(filePath);
    if (meta.git_sha) {
      this.deletedPaths.add(filePath);
      this.saveDeletedTracker();
    }
    this.saveAttachmentsToDisk();
    return true;
  }

  // Deletion tracker
  private loadDeletedTracker() {
    try {
      if (fs.existsSync(DELETED_TRACKER_FILE)) {
        const list: string[] = JSON.parse(fs.readFileSync(DELETED_TRACKER_FILE, 'utf-8'));
        this.deletedPaths = new Set(list);
      }
    } catch (e) {
      console.error('Failed to load deleted tracker:', e);
    }
  }

  private saveDeletedTracker() {
    fs.writeFileSync(DELETED_TRACKER_FILE, JSON.stringify(Array.from(this.deletedPaths), null, 2), 'utf-8');
  }

  public getDeletedPaths(): string[] {
    return Array.from(this.deletedPaths);
  }

  public clearDeletedPaths() {
    this.deletedPaths.clear();
    this.saveDeletedTracker();
  }

  // Conflicts
  private loadConflicts() {
    try {
      if (fs.existsSync(CONFLICTS_FILE)) {
        const list: ConflictItem[] = JSON.parse(fs.readFileSync(CONFLICTS_FILE, 'utf-8'));
        for (const item of list) {
          this.conflicts.set(item.path, item);
        }
      }
    } catch (e) {
      console.error('Failed to load conflicts:', e);
    }
  }

  private saveConflictsToDisk() {
    fs.writeFileSync(CONFLICTS_FILE, JSON.stringify(Array.from(this.conflicts.values()), null, 2), 'utf-8');
  }

  public getConflicts(): ConflictItem[] {
    return Array.from(this.conflicts.values());
  }

  public setConflict(conflict: ConflictItem) {
    this.conflicts.set(conflict.path, conflict);
    this.saveConflictsToDisk();
  }

  public removeConflict(filePath: string) {
    this.conflicts.delete(filePath);
    this.saveConflictsToDisk();
  }

  public clearConflicts() {
    this.conflicts.clear();
    this.saveConflictsToDisk();
  }
}

export const vaultStorage = new VaultStorage();
