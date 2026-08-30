import * as yaml from 'js-yaml';
import { Note, NoteFrontmatter } from '../types';

/**
 * Normalizes tags from frontmatter and body into a deduplicated array
 */
export function extractTags(frontmatterTags?: string[] | string, body: string = ''): string[] {
  const tagsSet = new Set<string>();

  if (Array.isArray(frontmatterTags)) {
    frontmatterTags.forEach(t => {
      if (typeof t === 'string') {
        const cleaned = t.trim().replace(/^#/, '');
        if (cleaned) tagsSet.add(cleaned);
      }
    });
  } else if (typeof frontmatterTags === 'string') {
    // Handle comma or space separated
    const parts = frontmatterTags.split(/[\s,]+/);
    parts.forEach(p => {
      const cleaned = p.trim().replace(/^#/, '');
      if (cleaned) tagsSet.add(cleaned);
    });
  }

  // Also parse inline hashtags from body (e.g. #emv #cryptography)
  // Avoid matching inside code blocks or URLs
  const tagRegex = /(?:^|\s)#([a-zA-Z0-9_\-\/]+)(?=\s|$|[.,;:!?])/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(body)) !== null) {
    const tag = match[1].trim();
    if (tag && !/^\d+$/.test(tag)) { // Ignore pure numbers like #123
      tagsSet.add(tag);
    }
  }

  return Array.from(tagsSet);
}

/**
 * Parses raw .md file content with YAML frontmatter into Note fields
 */
export function parseObsidianNote(
  rawContent: string,
  filePath: string,
  gitSha: string = '',
  syncStatus: Note['sync_status'] = 'synced'
): Note {
  let body = rawContent;
  let frontmatter: NoteFrontmatter = {};

  // Normalize newlines
  const normalized = rawContent.replace(/\r\n/g, '\n');

  // Match YAML frontmatter at the start of the file
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (frontmatterMatch) {
    const yamlString = frontmatterMatch[1];
    body = frontmatterMatch[2] || '';
    try {
      const loaded = yaml.load(yamlString);
      if (loaded && typeof loaded === 'object') {
        frontmatter = loaded as NoteFrontmatter;
      }
    } catch (e) {
      console.warn(`Error parsing YAML frontmatter for ${filePath}:`, e);
      frontmatter = {};
    }
  }

  // Filename derived title
  const filename = filePath.split('/').pop() || filePath;
  const filenameWithoutExt = filename.replace(/\.md$/i, '');
  const title = (frontmatter.title && typeof frontmatter.title === 'string' && frontmatter.title.trim())
    ? frontmatter.title.trim()
    : filenameWithoutExt;

  const tags = extractTags(frontmatter.tags, body);

  const now = new Date().toISOString();

  return {
    path: filePath,
    title,
    body,
    frontmatter,
    tags,
    created_at: frontmatter.created || now,
    updated_at: frontmatter.updated || now,
    git_sha: gitSha,
    sync_status: syncStatus,
  };
}

/**
 * Serializes a Note back to Obsidian byte-compatible file format:
 * ---
 * yaml frontmatter
 * ---
 * body
 */
export function serializeObsidianNote(note: { frontmatter?: NoteFrontmatter; body: string }): string {
  const { frontmatter, body } = note;

  // Clean frontmatter: strip app-only fields if any sneaked in
  const cleanFrontmatter: Record<string, any> = {};
  if (frontmatter && typeof frontmatter === 'object') {
    for (const [key, value] of Object.entries(frontmatter)) {
      if (key !== 'git_sha' && key !== 'sync_status' && value !== undefined) {
        cleanFrontmatter[key] = value;
      }
    }
  }

  const hasFrontmatter = Object.keys(cleanFrontmatter).length > 0;
  if (!hasFrontmatter) {
    return body || '';
  }

  try {
    const yamlStr = yaml.dump(cleanFrontmatter, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    }).trim();

    const normalizedBody = (body || '').replace(/^\n+/, '');
    return `---\n${yamlStr}\n---\n\n${normalizedBody}`;
  } catch (e) {
    console.error('Failed to dump frontmatter YAML:', e);
    return body || '';
  }
}
