import { Note, Attachment, ConflictItem } from '../src/types';
import { adminDb } from './auth';
import { VaultStorage } from './storage';

export interface NoteStore {
  getNotes(): Promise<Note[]>;
  saveNote(note: Note): Promise<Note>;
  deleteNote(path: string): Promise<boolean>;
  getDeletedPaths(): Promise<string[]>;
  clearDeletedPath(path: string): Promise<void>;
  getAttachments(): Promise<Attachment[]>;
  saveAttachment(att: Attachment): Promise<Attachment>;
  deleteAttachment(path: string): Promise<boolean>;
  getConflicts(): Promise<ConflictItem[]>;
  setConflict(conflict: ConflictItem): Promise<void>;
  deleteConflict(path: string): Promise<boolean>;
  updateSyncMetadata(lastSyncedAt: string, lastCommitSha: string): Promise<void>;
}

function encodePathKey(path: string): string {
  return encodeURIComponent(path).replace(/\./g, '%2E');
}

/**
 * Firestore-backed NoteStore for Cloud Vaults
 */
export class FirestoreNoteStore implements NoteStore {
  private vaultId: string;

  constructor(vaultId: string) {
    this.vaultId = vaultId;
  }

  public async getNotes(): Promise<Note[]> {
    const snap = await adminDb.collection('vaults').doc(this.vaultId).collection('notes').get();
    const notes: Note[] = [];
    snap.forEach(doc => {
      const d = doc.data();
      notes.push({
        path: d.path,
        title: d.title || doc.id,
        body: d.body || '',
        frontmatter: d.frontmatter || {},
        tags: d.tags || [],
        created_at: d.created_at || new Date().toISOString(),
        updated_at: d.updated_at || new Date().toISOString(),
        git_sha: d.git_sha || '',
        sync_status: d.sync_status || 'synced',
      });
    });
    return notes;
  }

  public async saveNote(note: Note): Promise<Note> {
    const docId = encodePathKey(note.path);
    const docRef = adminDb.collection('vaults').doc(this.vaultId).collection('notes').doc(docId);
    await docRef.set({
      ...note,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    return note;
  }

  public async deleteNote(path: string): Promise<boolean> {
    const docId = encodePathKey(path);
    await adminDb.collection('vaults').doc(this.vaultId).collection('notes').doc(docId).delete();
    // Track deletion
    const delDocId = encodePathKey(path);
    await adminDb.collection('vaults').doc(this.vaultId).collection('deleted').doc(delDocId).set({
      path,
      deletedAt: new Date().toISOString(),
    });
    return true;
  }

  public async getDeletedPaths(): Promise<string[]> {
    const snap = await adminDb.collection('vaults').doc(this.vaultId).collection('deleted').get();
    const paths: string[] = [];
    snap.forEach(doc => {
      paths.push(doc.data().path || doc.id);
    });
    return paths;
  }

  public async clearDeletedPath(path: string): Promise<void> {
    const delDocId = encodePathKey(path);
    await adminDb.collection('vaults').doc(this.vaultId).collection('deleted').doc(delDocId).delete();
  }

  public async getAttachments(): Promise<Attachment[]> {
    const snap = await adminDb.collection('vaults').doc(this.vaultId).collection('attachments').get();
    const list: Attachment[] = [];
    snap.forEach(doc => {
      const d = doc.data();
      list.push({
        path: d.path,
        name: d.name,
        mime_type: d.mime_type,
        size: d.size || 0,
        data_base64: d.data_base64,
        git_sha: d.git_sha || '',
        sync_status: d.sync_status || 'synced',
        updated_at: d.updated_at || new Date().toISOString(),
      });
    });
    return list;
  }

  public async saveAttachment(att: Attachment): Promise<Attachment> {
    const docId = encodePathKey(att.path);
    await adminDb.collection('vaults').doc(this.vaultId).collection('attachments').doc(docId).set({
      ...att,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    return att;
  }

  public async deleteAttachment(path: string): Promise<boolean> {
    const docId = encodePathKey(path);
    await adminDb.collection('vaults').doc(this.vaultId).collection('attachments').doc(docId).delete();
    return true;
  }

  public async getConflicts(): Promise<ConflictItem[]> {
    const snap = await adminDb.collection('vaults').doc(this.vaultId).collection('conflicts').get();
    const list: ConflictItem[] = [];
    snap.forEach(doc => {
      list.push(doc.data() as ConflictItem);
    });
    return list;
  }

  public async setConflict(conflict: ConflictItem): Promise<void> {
    const docId = encodePathKey(conflict.path);
    await adminDb.collection('vaults').doc(this.vaultId).collection('conflicts').doc(docId).set(conflict);
  }

  public async deleteConflict(path: string): Promise<boolean> {
    const docId = encodePathKey(path);
    await adminDb.collection('vaults').doc(this.vaultId).collection('conflicts').doc(docId).delete();
    return true;
  }

  public async updateSyncMetadata(lastSyncedAt: string, lastCommitSha: string): Promise<void> {
    await adminDb.collection('vaults').doc(this.vaultId).update({
      'github.lastSyncedAt': lastSyncedAt,
      'github.lastCommitSha': lastCommitSha,
      updatedAt: new Date().toISOString(),
    });
  }
}

/**
 * Adapter wrapping VaultStorage for the local demo vault
 */
export class LocalVaultNoteStore implements NoteStore {
  private storage: VaultStorage;

  constructor(storage: VaultStorage) {
    this.storage = storage;
  }

  public async getNotes(): Promise<Note[]> {
    return this.storage.getNotes();
  }

  public async saveNote(note: Note): Promise<Note> {
    return this.storage.saveNote(note);
  }

  public async deleteNote(path: string): Promise<boolean> {
    return this.storage.deleteNote(path);
  }

  public async getDeletedPaths(): Promise<string[]> {
    return this.storage.getDeletedPaths();
  }

  public async clearDeletedPath(path: string): Promise<void> {
    this.storage.clearDeletedPath(path);
  }

  public async getAttachments(): Promise<Attachment[]> {
    return this.storage.getAttachments();
  }

  public async saveAttachment(att: Attachment): Promise<Attachment> {
    const buffer = att.data_base64
      ? Buffer.from(att.data_base64, 'base64')
      : Buffer.alloc(0);
    return this.storage.saveAttachment(
      att.path,
      buffer,
      att.mime_type,
      att.git_sha || '',
      att.sync_status || 'synced'
    );
  }

  public async deleteAttachment(path: string): Promise<boolean> {
    return this.storage.deleteAttachment(path);
  }

  public async getConflicts(): Promise<ConflictItem[]> {
    return this.storage.getConflicts();
  }

  public async setConflict(conflict: ConflictItem): Promise<void> {
    this.storage.setConflict(conflict);
  }

  public async deleteConflict(path: string): Promise<boolean> {
    this.storage.removeConflict(path);
    return true;
  }

  public async updateSyncMetadata(lastSyncedAt: string, lastCommitSha: string): Promise<void> {
    this.storage.saveConfig({
      last_synced_at: lastSyncedAt,
      last_commit_sha: lastCommitSha,
    });
  }
}
