import { Note, LinkReference, UnlinkedMention } from '../types';

export interface ParsedWikilink {
  raw: string; // e.g. "[[CVM List#Signature|PIN & Sig]]" or "![[emv.png]]"
  target: string; // "CVM List"
  heading?: string; // "Signature"
  alias?: string; // "PIN & Sig"
  isEmbed: boolean; // true for ![[...]]
  startIndex: number;
  endIndex: number;
}

/**
 * Parses all [[wikilinks]] and ![[embeds]] in raw markdown text
 */
export function extractWikilinks(text: string): ParsedWikilink[] {
  const links: ParsedWikilink[] = [];
  // Matches ![[target#heading|alias]] or [[target#heading|alias]]
  const regex = /(!?\[\[)([^\]|#\n\r]+)(?:#([^\]|\n\r]+))?(?:\|([^\]\n\r]+))?\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const isEmbed = match[1] === '![[';
    const target = (match[2] || '').trim();
    const heading = match[3] ? match[3].trim() : undefined;
    const alias = match[4] ? match[4].trim() : undefined;

    links.push({
      raw: match[0],
      target,
      heading,
      alias,
      isEmbed,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return links;
}

/**
 * Normalizes a string for case-insensitive lookup
 */
export function normalizeKey(str: string): string {
  return str.trim().toLowerCase().replace(/\.md$/i, '').replace(/\\/g, '/');
}

/**
 * Builds a lookup index from an array of notes
 */
export function buildNoteLookupIndex(notes: Note[]): Map<string, Note> {
  const index = new Map<string, Note>();

  for (const note of notes) {
    // 1. By exact path
    index.set(normalizeKey(note.path), note);

    // 2. By title
    index.set(normalizeKey(note.title), note);

    // 3. By filename without directory
    const filename = note.path.split('/').pop() || '';
    index.set(normalizeKey(filename), note);

    // 4. By frontmatter aliases
    const aliases = note.frontmatter?.aliases;
    if (Array.isArray(aliases)) {
      aliases.forEach(a => {
        if (typeof a === 'string' && a.trim()) {
          index.set(normalizeKey(a), note);
        }
      });
    } else if (typeof aliases === 'string' && aliases.trim()) {
      aliases.split(/[\s,]+/).forEach(a => {
        if (a.trim()) {
          index.set(normalizeKey(a), note);
        }
      });
    }
  }

  return index;
}

/**
 * Resolves a wikilink target to a Note if it exists
 */
export function resolveWikilink(target: string, index: Map<string, Note>): Note | null {
  const key = normalizeKey(target);
  return index.get(key) || null;
}

/**
 * Extracts a readable surrounding context snippet around a position in text
 */
export function extractContextSnippet(text: string, startIndex: number, length: number): string {
  // Find surrounding line or sentence
  const beforeText = text.slice(0, startIndex);
  const afterText = text.slice(startIndex + length);

  const lastNewline = beforeText.lastIndexOf('\n');
  const nextNewline = afterText.indexOf('\n');

  let snippetStart = lastNewline !== -1 ? lastNewline + 1 : Math.max(0, startIndex - 60);
  let snippetEnd = nextNewline !== -1 ? startIndex + length + nextNewline : Math.min(text.length, startIndex + length + 60);

  let snippet = text.slice(snippetStart, snippetEnd).trim();
  if (snippetStart > 0) snippet = '...' + snippet;
  if (snippetEnd < text.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Computes all incoming backlinks and outgoing links for all notes in the vault
 */
export function computeLinkGraph(notes: Note[]): {
  backlinksByPath: Record<string, LinkReference[]>;
  outgoingByPath: Record<string, LinkReference[]>;
} {
  const index = buildNoteLookupIndex(notes);
  const backlinksByPath: Record<string, LinkReference[]> = {};
  const outgoingByPath: Record<string, LinkReference[]> = {};

  // Initialize empty arrays
  for (const note of notes) {
    backlinksByPath[note.path] = [];
    outgoingByPath[note.path] = [];
  }

  for (const sourceNote of notes) {
    const rawLinks = extractWikilinks(sourceNote.body);

    for (const link of rawLinks) {
      if (link.isEmbed) continue; // skip embeds from backlinks graph

      const resolved = resolveWikilink(link.target, index);
      const snippet = extractContextSnippet(sourceNote.body, link.startIndex, link.raw.length);

      const ref: LinkReference = {
        sourcePath: sourceNote.path,
        sourceTitle: sourceNote.title,
        targetRaw: link.raw,
        targetTitle: link.target,
        targetHeading: link.heading,
        alias: link.alias,
        contextSnippet: snippet,
        resolvedPath: resolved ? resolved.path : null,
        isResolved: !!resolved,
      };

      if (!outgoingByPath[sourceNote.path]) {
        outgoingByPath[sourceNote.path] = [];
      }
      outgoingByPath[sourceNote.path].push(ref);

      if (resolved) {
        if (!backlinksByPath[resolved.path]) {
          backlinksByPath[resolved.path] = [];
        }
        backlinksByPath[resolved.path].push(ref);
      }
    }
  }

  return { backlinksByPath, outgoingByPath };
}

/**
 * Searches for unlinked mentions of a note's title or aliases in other notes
 */
export function findUnlinkedMentions(currentNote: Note, allNotes: Note[]): UnlinkedMention[] {
  const mentions: UnlinkedMention[] = [];
  const searchTerms = new Set<string>();

  if (currentNote.title && currentNote.title.length > 2) {
    searchTerms.add(currentNote.title.toLowerCase());
  }

  const aliases = currentNote.frontmatter?.aliases;
  if (Array.isArray(aliases)) {
    aliases.forEach(a => {
      if (typeof a === 'string' && a.trim().length > 2) {
        searchTerms.add(a.trim().toLowerCase());
      }
    });
  } else if (typeof aliases === 'string' && aliases.trim().length > 2) {
    searchTerms.add(aliases.trim().toLowerCase());
  }

  if (searchTerms.size === 0) return mentions;

  for (const note of allNotes) {
    if (note.path === currentNote.path) continue;

    const lowerBody = note.body.toLowerCase();
    for (const term of searchTerms) {
      // Find occurrences of term not already inside [[...]] or `...`
      const regex = new RegExp(`\\b(${escapeRegExp(term)})\\b`, 'gi');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(note.body)) !== null) {
        const start = match.index;
        const matchedText = match[1];

        // Check if inside a wikilink [[...]]
        const before = note.body.slice(Math.max(0, start - 200), start);
        const after = note.body.slice(start, Math.min(note.body.length, start + matchedText.length + 200));

        const lastOpenBracket = before.lastIndexOf('[[');
        const lastCloseBracket = before.lastIndexOf(']]');
        const isInsideWikilink = lastOpenBracket > lastCloseBracket && after.indexOf(']]') !== -1;

        if (!isInsideWikilink) {
          const snippet = extractContextSnippet(note.body, start, matchedText.length);
          mentions.push({
            sourcePath: note.path,
            sourceTitle: note.title,
            matchedText,
            contextSnippet: snippet,
          });
          break; // One match per note per term is enough
        }
      }
    }
  }

  return mentions;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
