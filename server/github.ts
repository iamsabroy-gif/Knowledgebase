import { VaultStorage } from './storage';
import { Note, Attachment, ConflictItem, SyncStatusSummary } from '../src/types';
import { parseObsidianNote, serializeObsidianNote } from '../src/utils/markdown-parser';

interface GitHubApiRateLimit {
  remaining: number | null;
  reset: number | null;
}

export class GitHubSyncService {
  private storage: VaultStorage;
  private lastRateLimit: GitHubApiRateLimit = { remaining: null, reset: null };

  constructor(storage: VaultStorage) {
    this.storage = storage;
  }

  private getHeaders(token: string) {
    return {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Obsidian-GitHub-Sync-Applet',
    };
  }

  private updateRateLimitFromHeaders(headers: Headers) {
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    if (remaining !== null) {
      this.lastRateLimit.remaining = parseInt(remaining, 10);
    }
    if (reset !== null) {
      this.lastRateLimit.reset = parseInt(reset, 10);
    }
  }

  public getRateLimit(): GitHubApiRateLimit {
    return { ...this.lastRateLimit };
  }

  /**
   * Test repository access, branch existence, and token validity
   */
  public async testConnection(token: string, owner: string, repo: string, branch: string) {
    if (!token) throw new Error('Personal Access Token (PAT) is required');
    if (!owner || !repo) throw new Error('Repository owner and name are required');

    const cleanBranch = branch.trim() || 'main';
    const url = `https://api.github.com/repos/${owner}/${repo}/branches/${cleanBranch}`;

    const res = await fetch(url, {
      headers: this.getHeaders(token),
    });

    this.updateRateLimitFromHeaders(res.headers);

    if (res.status === 401) {
      throw new Error('Authentication failed (401). Your GitHub Personal Access Token may be invalid or expired.');
    }
    if (res.status === 404) {
      throw new Error(`Repository "${owner}/${repo}" or branch "${cleanBranch}" not found (404). Check permissions or branch name.`);
    }
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      if (body.message && body.message.includes('rate limit')) {
        throw new Error('GitHub API rate limit exceeded. Please wait or check your PAT permissions.');
      }
      throw new Error(`Access forbidden (403): ${body.message || 'Check PAT scope (Contents: Read/Write)'}`);
    }
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`GitHub API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return {
      success: true,
      repo: `${owner}/${repo}`,
      branch: cleanBranch,
      latest_commit_sha: data.commit?.sha || null,
    };
  }

  /**
   * Pull repository changes from GitHub
   */
  public async pull() {
    const config = this.storage.getConfig();
    const token = this.storage.getToken();

    if (!token || !config.owner || !config.repo) {
      throw new Error('GitHub configuration or PAT is incomplete. Please configure GitHub settings first.');
    }

    const { owner, repo, branch, subfolder } = config;
    const cleanBranch = branch.trim() || 'main';
    const cleanSubfolder = subfolder.trim().replace(/^\/+|\/+$/g, '');

    // 1. Get branch ref -> commit sha
    const refUrl = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${cleanBranch}`;
    const refRes = await fetch(refUrl, { headers: this.getHeaders(token) });
    this.updateRateLimitFromHeaders(refRes.headers);

    if (refRes.status === 401) {
      throw new Error('GitHub token expired or revoked (401). Please update your PAT in settings.');
    }
    if (!refRes.ok) {
      const text = await refRes.text();
      throw new Error(`Failed to fetch branch ref "${cleanBranch}": ${text}`);
    }
    const refData = await refRes.json();
    const latestCommitSha = refData.object?.sha;
    if (!latestCommitSha) {
      throw new Error(`Could not find latest commit for branch "${cleanBranch}".`);
    }

    // 2. Get commit -> tree sha
    const commitUrl = `https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`;
    const commitRes = await fetch(commitUrl, { headers: this.getHeaders(token) });
    this.updateRateLimitFromHeaders(commitRes.headers);
    if (!commitRes.ok) throw new Error('Failed to fetch commit object from GitHub.');
    const commitData = await commitRes.json();
    const treeSha = commitData.tree?.sha;

    // 3. Get recursive tree
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
    const treeRes = await fetch(treeUrl, { headers: this.getHeaders(token) });
    this.updateRateLimitFromHeaders(treeRes.headers);
    if (!treeRes.ok) throw new Error('Failed to fetch repository tree from GitHub.');
    const treeData = await treeRes.json();

    const remoteTreeItems: Array<{ path: string; mode: string; type: string; sha: string; size?: number }> = treeData.tree || [];

    // Filter by subfolder if specified
    const matchedItems = remoteTreeItems.filter(item => {
      if (item.type !== 'blob') return false;
      if (cleanSubfolder) {
        return item.path.startsWith(`${cleanSubfolder}/`);
      }
      return true;
    });

    const remoteFilesMap = new Map<string, { path: string; vaultRelativePath: string; sha: string }>();

    for (const item of matchedItems) {
      const vaultRelativePath = cleanSubfolder
        ? item.path.slice(cleanSubfolder.length + 1)
        : item.path;
      remoteFilesMap.set(vaultRelativePath, {
        path: item.path,
        vaultRelativePath,
        sha: item.sha,
      });
    }

    let notesUpdated = 0;
    let notesAdded = 0;
    let notesDeleted = 0;
    let attachmentsUpdated = 0;
    let conflictsCount = 0;

    // Process Notes (.md files)
    const localNotes = this.storage.getNotes();
    const localNotesMap = new Map<string, Note>();
    for (const n of localNotes) {
      localNotesMap.set(n.path, n);
    }

    for (const [relPath, remoteFile] of remoteFilesMap.entries()) {
      if (relPath.endsWith('.md')) {
        const localNote = localNotesMap.get(relPath);

        // Fetch remote blob content
        const blobUrl = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${remoteFile.sha}`;
        
        if (localNote) {
          // Check if remote changed
          if (localNote.git_sha !== remoteFile.sha) {
            // Fetch blob content
            const blobRes = await fetch(blobUrl, { headers: this.getHeaders(token) });
            this.updateRateLimitFromHeaders(blobRes.headers);
            const blobData = await blobRes.json();
            const rawContent = Buffer.from(blobData.content, 'base64').toString('utf-8');

            if (localNote.sync_status === 'local_changes') {
              // Conflict! Both local and remote changed
              const conflictItem: ConflictItem = {
                path: relPath,
                type: 'note',
                local_content: serializeObsidianNote(localNote),
                remote_content: rawContent,
                local_frontmatter: localNote.frontmatter,
                remote_frontmatter: parseObsidianNote(rawContent, relPath).frontmatter,
                local_sha: localNote.git_sha,
                remote_sha: remoteFile.sha,
                base_sha: localNote.git_sha,
              };
              this.storage.setConflict(conflictItem);
              localNote.sync_status = 'conflict';
              this.storage.updateNoteDirect(localNote);
              conflictsCount++;
            } else {
              // Safe to update
              const parsed = parseObsidianNote(rawContent, relPath, remoteFile.sha, 'synced');
              this.storage.updateNoteDirect(parsed);
              notesUpdated++;
            }
          }
        } else {
          // New file from remote
          const blobRes = await fetch(blobUrl, { headers: this.getHeaders(token) });
          this.updateRateLimitFromHeaders(blobRes.headers);
          const blobData = await blobRes.json();
          const rawContent = Buffer.from(blobData.content, 'base64').toString('utf-8');
          const parsed = parseObsidianNote(rawContent, relPath, remoteFile.sha, 'synced');
          this.storage.updateNoteDirect(parsed);
          notesAdded++;
        }
      } else {
        // Binary or Attachment (images, pdfs, etc.)
        const isAttachment = relPath.startsWith('attachments/') || /\.(png|jpe?g|gif|svg|pdf|webp)$/i.test(relPath);
        if (isAttachment) {
          const localAtt = this.storage.getAttachment(relPath);
          if (!localAtt || localAtt.meta.git_sha !== remoteFile.sha) {
            const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${remoteFile.sha}`, { headers: this.getHeaders(token) });
            this.updateRateLimitFromHeaders(blobRes.headers);
            const blobData = await blobRes.json();
            const buffer = Buffer.from(blobData.content, 'base64');
            const mimeType = getMimeType(relPath);
            this.storage.saveAttachment(relPath, buffer, mimeType, remoteFile.sha, 'synced');
            attachmentsUpdated++;
          }
        }
      }
    }

    // Check for remote deletions: if local was 'synced' with git_sha but no longer exists on remote
    for (const [pathStr, note] of localNotesMap.entries()) {
      if (note.git_sha && note.sync_status === 'synced' && !remoteFilesMap.has(pathStr)) {
        this.storage.deleteNote(pathStr);
        notesDeleted++;
      }
    }

    // Save sync state
    this.storage.saveConfig({
      last_synced_at: new Date().toISOString(),
      last_commit_sha: latestCommitSha,
    });

    return {
      success: true,
      notes_updated: notesUpdated,
      notes_added: notesAdded,
      notes_deleted: notesDeleted,
      attachments_updated: attachmentsUpdated,
      conflicts_count: conflictsCount,
      latest_commit_sha: latestCommitSha,
      total_remote_files: remoteFilesMap.size,
    };
  }

  /**
   * Push local changes to GitHub via Git Data API (Blobs -> Tree -> Commit -> Ref)
   */
  public async push(commitMessage: string = 'Update notes from Obsidian web vault') {
    const config = this.storage.getConfig();
    const token = this.storage.getToken();

    if (!token || !config.owner || !config.repo) {
      throw new Error('GitHub configuration or PAT is missing.');
    }

    // Abort if unresolved conflicts exist
    const conflicts = this.storage.getConflicts();
    if (conflicts.length > 0) {
      throw new Error(`Cannot push while ${conflicts.length} unresolved conflict(s) exist. Please resolve them first.`);
    }

    const { owner, repo, branch, subfolder } = config;
    const cleanBranch = branch.trim() || 'main';
    const cleanSubfolder = subfolder.trim().replace(/^\/+|\/+$/g, '');

    // 1. Get latest remote branch commit SHA & tree SHA
    const refUrl = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${cleanBranch}`;
    const refRes = await fetch(refUrl, { headers: this.getHeaders(token) });
    this.updateRateLimitFromHeaders(refRes.headers);
    if (!refRes.ok) throw new Error(`Could not fetch branch reference for ${cleanBranch}`);
    const refData = await refRes.json();
    const currentCommitSha = refData.object.sha;

    const commitUrl = `https://api.github.com/repos/${owner}/${repo}/git/commits/${currentCommitSha}`;
    const commitRes = await fetch(commitUrl, { headers: this.getHeaders(token) });
    this.updateRateLimitFromHeaders(commitRes.headers);
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // Collect pending notes & attachments
    const notes = this.storage.getNotes();
    const attachments = this.storage.getAttachments();
    const deletedPaths = this.storage.getDeletedPaths();

    const pendingNotes = notes.filter(n => n.sync_status === 'local_changes');
    const pendingAttachments = attachments.filter(a => a.sync_status === 'local_changes');

    if (pendingNotes.length === 0 && pendingAttachments.length === 0 && deletedPaths.length === 0) {
      return {
        success: true,
        message: 'Everything is up to date. No pending local changes to push.',
        files_pushed: 0,
      };
    }

    const treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
    const updatedNoteBlobs = new Map<string, string>();
    const updatedAttachmentBlobs = new Map<string, string>();

    // Create blobs for pending notes
    for (const note of pendingNotes) {
      const rawSerialized = serializeObsidianNote(note);
      const fullRepoPath = cleanSubfolder ? `${cleanSubfolder}/${note.path}` : note.path;

      const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: this.getHeaders(token),
        body: JSON.stringify({
          content: rawSerialized,
          encoding: 'utf-8',
        }),
      });
      this.updateRateLimitFromHeaders(blobRes.headers);

      if (!blobRes.ok) {
        const err = await blobRes.text();
        throw new Error(`Failed to create blob for ${note.path}: ${err}`);
      }

      const blobData = await blobRes.json();
      treeEntries.push({
        path: fullRepoPath,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      });
      updatedNoteBlobs.set(note.path, blobData.sha);
    }

    // Create blobs for pending attachments
    for (const att of pendingAttachments) {
      const attData = this.storage.getAttachment(att.path);
      if (!attData) continue;

      const fullRepoPath = cleanSubfolder ? `${cleanSubfolder}/${att.path}` : att.path;
      const base64Content = attData.buffer.toString('base64');

      const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: this.getHeaders(token),
        body: JSON.stringify({
          content: base64Content,
          encoding: 'base64',
        }),
      });
      this.updateRateLimitFromHeaders(blobRes.headers);

      if (!blobRes.ok) {
        const err = await blobRes.text();
        throw new Error(`Failed to create blob for attachment ${att.path}: ${err}`);
      }

      const blobData = await blobRes.json();
      treeEntries.push({
        path: fullRepoPath,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      });
      updatedAttachmentBlobs.set(att.path, blobData.sha);
    }

    // Add deleted files to tree with sha: null
    for (const delPath of deletedPaths) {
      const fullRepoPath = cleanSubfolder ? `${cleanSubfolder}/${delPath}` : delPath;
      treeEntries.push({
        path: fullRepoPath,
        mode: '100644',
        type: 'blob',
        sha: null,
      });
    }

    // Create new Git Tree
    const createTreeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    });
    this.updateRateLimitFromHeaders(createTreeRes.headers);

    if (!createTreeRes.ok) {
      const err = await createTreeRes.text();
      throw new Error(`Failed to create Git tree: ${err}`);
    }
    const createTreeData = await createTreeRes.json();
    const newTreeSha = createTreeData.sha;

    // Create Git Commit
    const createCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        message: commitMessage.trim() || 'Update notes from Obsidian web vault',
        tree: newTreeSha,
        parents: [currentCommitSha],
      }),
    });
    this.updateRateLimitFromHeaders(createCommitRes.headers);

    if (!createCommitRes.ok) {
      const err = await createCommitRes.text();
      throw new Error(`Failed to create Git commit: ${err}`);
    }
    const createCommitData = await createCommitRes.json();
    const newCommitSha = createCommitData.sha;

    // Update branch reference
    const updateRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${cleanBranch}`, {
      method: 'PATCH',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        sha: newCommitSha,
        force: false,
      }),
    });
    this.updateRateLimitFromHeaders(updateRefRes.headers);

    if (updateRefRes.status === 409 || updateRefRes.status === 422) {
      throw new Error('Conflict (409): Remote repository has newer commits. Please pull before pushing.');
    }
    if (!updateRefRes.ok) {
      const err = await updateRefRes.text();
      throw new Error(`Failed to update branch reference "${cleanBranch}": ${err}`);
    }

    // Update local database states
    for (const [notePath, newSha] of updatedNoteBlobs.entries()) {
      const note = this.storage.getNote(notePath);
      if (note) {
        note.git_sha = newSha;
        note.sync_status = 'synced';
        this.storage.updateNoteDirect(note);
      }
    }

    for (const [attPath, newSha] of updatedAttachmentBlobs.entries()) {
      const attData = this.storage.getAttachment(attPath);
      if (attData) {
        this.storage.saveAttachment(attPath, attData.buffer, attData.meta.mime_type, newSha, 'synced');
      }
    }

    this.storage.clearDeletedPaths();
    this.storage.saveConfig({
      last_synced_at: new Date().toISOString(),
      last_commit_sha: newCommitSha,
    });

    return {
      success: true,
      commit_sha: newCommitSha,
      files_pushed: treeEntries.length,
      message: `Pushed ${treeEntries.length} change(s) successfully to ${owner}/${repo} (${cleanBranch})`,
    };
  }

  /**
   * Resolve a conflicting file
   */
  public resolveConflict(filePath: string, resolution: 'keep_local' | 'take_remote' | 'manual', mergedContent?: string) {
    const conflicts = this.storage.getConflicts();
    const conflict = conflicts.find(c => c.path === filePath);
    if (!conflict) throw new Error(`No active conflict found for ${filePath}`);

    const existingNote = this.storage.getNote(filePath);

    if (resolution === 'keep_local') {
      if (existingNote) {
        existingNote.sync_status = 'local_changes';
        this.storage.updateNoteDirect(existingNote);
      }
    } else if (resolution === 'take_remote') {
      const parsed = parseObsidianNote(conflict.remote_content, filePath, conflict.remote_sha, 'synced');
      this.storage.updateNoteDirect(parsed);
    } else if (resolution === 'manual') {
      if (!mergedContent) throw new Error('Merged content must be provided for manual resolution.');
      const parsed = parseObsidianNote(mergedContent, filePath, conflict.remote_sha, 'local_changes');
      this.storage.updateNoteDirect(parsed);
    }

    this.storage.removeConflict(filePath);

    return { success: true, path: filePath, resolution };
  }

  public getSyncSummary(): SyncStatusSummary {
    const config = this.storage.getConfig();
    const notes = this.storage.getNotes();
    const attachments = this.storage.getAttachments();
    const deleted = this.storage.getDeletedPaths();
    const conflicts = this.storage.getConflicts();

    const pendingNotes = notes.filter(n => n.sync_status === 'local_changes').length;
    const pendingAtts = attachments.filter(a => a.sync_status === 'local_changes').length;
    const totalPending = pendingNotes + pendingAtts + deleted.length;

    return {
      configured: config.has_token && !!config.owner && !!config.repo,
      repo_name: (config.owner && config.repo) ? `${config.owner}/${config.repo}` : undefined,
      branch: config.branch,
      last_synced_at: config.last_synced_at,
      last_commit_sha: config.last_commit_sha,
      pending_notes_count: pendingNotes,
      pending_attachments_count: pendingAtts,
      total_pending_count: totalPending,
      conflicts_count: conflicts.length,
      is_syncing: false,
      rate_limit_remaining: this.lastRateLimit.remaining,
      rate_limit_reset: this.lastRateLimit.reset,
    };
  }
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    case 'pdf': return 'application/pdf';
    default: return 'application/octet-stream';
  }
}
