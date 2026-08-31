export interface NoteFrontmatter {
  title?: string;
  tags?: string[] | string;
  status?: string;
  source?: string;
  spec_version?: string;
  aliases?: string[] | string;
  author?: string;
  created?: string;
  updated?: string;
  [key: string]: any;
}

export type SyncStatus = 'synced' | 'local_changes' | 'remote_changes' | 'conflict';

export interface Note {
  path: string; // Unique, mirrors repo file path e.g. "EMV Book 4/CVM List.md"
  title: string; // from filename, overridable via frontmatter.title
  body: string; // raw markdown, excluding YAML frontmatter
  frontmatter: NoteFrontmatter; // arbitrary keys preserved
  tags: string[]; // indexed tags array
  created_at: string; // ISO string
  updated_at: string; // ISO string
  git_sha: string; // blob SHA from git, or empty if new/untracked
  sync_status: SyncStatus; // app-only state, not saved in markdown file
}

export interface Attachment {
  path: string; // e.g. "attachments/emv-apdu-flow.png"
  name: string;
  mime_type: string;
  size: number;
  data_base64?: string;
  git_sha: string;
  sync_status: SyncStatus;
  updated_at: string;
}

export interface VaultGitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  subfolder: string;
  lastSyncedAt?: string | null;
  lastCommitSha?: string | null;
  connectedByUid?: string;
}

export interface GitHubConnectionStatus {
  connected: boolean;
  githubLogin?: string;
  needsReauth?: boolean;
}

export interface GitHubRepoItem {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  default_branch: string;
  private: boolean;
}

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  subfolder: string; // e.g. "" or "vault"
  has_token: boolean;
  last_synced_at: string | null;
  last_commit_sha: string | null;
}

export interface SyncStatusSummary {
  configured: boolean;
  repo_name?: string;
  branch?: string;
  last_synced_at: string | null;
  last_commit_sha: string | null;
  pending_notes_count: number;
  pending_attachments_count: number;
  total_pending_count: number;
  conflicts_count: number;
  is_syncing: boolean;
  rate_limit_remaining: number | null;
  rate_limit_reset: number | null;
}

export interface LinkReference {
  sourcePath: string;
  sourceTitle: string;
  targetRaw: string;
  targetTitle: string;
  targetHeading?: string;
  alias?: string;
  contextSnippet: string;
  resolvedPath: string | null;
  isResolved: boolean;
}

export interface UnlinkedMention {
  sourcePath: string;
  sourceTitle: string;
  matchedText: string;
  contextSnippet: string;
}

export interface ConflictItem {
  path: string;
  type: 'note' | 'attachment';
  local_content: string;
  remote_content: string;
  local_frontmatter?: any;
  remote_frontmatter?: any;
  local_sha: string;
  remote_sha: string;
  base_sha: string;
  resolved?: boolean;
}

export interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: TreeNode[];
  note?: Note;
}

export type EditorViewMode = 'preview' | 'edit' | 'split';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  created_at: string;
  last_login_at: string;
}

export type VaultRole = 'owner' | 'editor' | 'viewer';

export interface VaultShareMember {
  userId?: string;
  email: string;
  displayName?: string;
  role: VaultRole;
  addedAt: string;
}

export interface SharedVaultInfo {
  id: string; // Firestore document ID or 'local'
  name: string;
  description?: string;
  ownerId: string;
  ownerEmail: string;
  ownerName?: string;
  memberUids: string[];
  sharedWith: VaultShareMember[];
  shareCode?: string;
  allowPublicRead?: boolean;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  github?: VaultGitHubConfig | null;
}

export type GeminiAccessScope = 'all' | 'authenticated_only' | 'admin_only';

export interface GeminiAdminConfig {
  gemini_chat_enabled: boolean;
  allowed_access: GeminiAccessScope;
  disabled_message: string;
  model_name: string;
  updated_at: string;
  updated_by?: string;
}

export interface AdminAuthState {
  isAdmin: boolean;
  adminEmail?: string;
  loginMethod: 'passcode' | 'google_admin' | 'none';
  sessionToken?: string;
}
