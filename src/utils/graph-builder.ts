import { Note } from '../types';
import { extractWikilinks, resolveWikilink, buildNoteLookupIndex, normalizeKey } from './wikilink-engine';

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string; // note path or unresolved target name
  title: string;
  path: string | null; // null if unresolved phantom node
  folder: string;
  tags: string[];
  isResolved: boolean;
  degree: number; // in + out connections
  inDegree: number;
  outDegree: number;
  color: string;
  isCurrent: boolean;
  isNeighbor?: boolean;
  size: number;
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  raw: string;
  isResolved: boolean;
  alias?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  folderColors: Record<string, string>;
  stats: {
    totalNodes: number;
    resolvedNodes: number;
    unresolvedNodes: number;
    totalLinks: number;
    orphanNodes: number;
    maxDegree: number;
  };
}

// Vibrant accessible color palette for folders / categories
const PALETTE = [
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#a855f7', // Purple
  '#6366f1', // Indigo
];

/**
 * Builds full graph data (nodes & links) from vault notes
 */
export function buildGraphData(
  notes: Note[],
  options: {
    includeUnresolved?: boolean;
    currentNotePath?: string | null;
    localOnly?: boolean;
    maxHop?: number; // 1, 2, or 3 hops
    tagFilter?: string | null;
    searchQuery?: string;
  } = {}
): GraphData {
  const {
    includeUnresolved = true,
    currentNotePath = null,
    localOnly = false,
    maxHop = 1,
    tagFilter = null,
    searchQuery = '',
  } = options;

  const noteIndex = buildNoteLookupIndex(notes);
  const nodeMap = new Map<string, GraphNode>();
  const linkList: GraphLink[] = [];
  const folderColors: Record<string, string> = {};

  // Assign consistent colors to folders
  const allFolders = Array.from(
    new Set(
      notes.map(n => {
        const parts = n.path.split('/');
        return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Root';
      })
    )
  ).sort();

  allFolders.forEach((folder, idx) => {
    folderColors[folder] = PALETTE[idx % PALETTE.length];
  });

  // 1. Initialize resolved note nodes
  for (const note of notes) {
    const parts = note.path.split('/');
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Root';
    const color = folderColors[folder] || '#8b5cf6';

    nodeMap.set(note.path, {
      id: note.path,
      title: note.title || note.path.replace(/\.md$/, ''),
      path: note.path,
      folder,
      tags: Array.isArray(note.tags) ? note.tags : [],
      isResolved: true,
      degree: 0,
      inDegree: 0,
      outDegree: 0,
      color,
      isCurrent: note.path === currentNotePath,
      size: 8,
    });
  }

  // 2. Scan wikilinks to construct links & phantom nodes
  const linkKeySet = new Set<string>();

  for (const sourceNote of notes) {
    const rawLinks = extractWikilinks(sourceNote.body);

    for (const link of rawLinks) {
      if (link.isEmbed) continue; // skip embeds from node graph

      const resolved = resolveWikilink(link.target, noteIndex);

      if (resolved) {
        // Link between two existing notes
        const targetPath = resolved.path;
        if (sourceNote.path === targetPath) continue; // ignore self-links for graph clarity

        const linkKey = `${sourceNote.path}->${targetPath}`;
        if (!linkKeySet.has(linkKey)) {
          linkKeySet.add(linkKey);
          linkList.push({
            id: linkKey,
            source: sourceNote.path,
            target: targetPath,
            raw: link.raw,
            isResolved: true,
            alias: link.alias,
          });

          // Increment degrees
          const sNode = nodeMap.get(sourceNote.path);
          const tNode = nodeMap.get(targetPath);
          if (sNode) {
            sNode.degree++;
            sNode.outDegree++;
          }
          if (tNode) {
            tNode.degree++;
            tNode.inDegree++;
          }
        }
      } else if (includeUnresolved) {
        // Phantom / Unresolved link node
        const phantomId = `unresolved:${normalizeKey(link.target)}`;
        if (!nodeMap.has(phantomId)) {
          nodeMap.set(phantomId, {
            id: phantomId,
            title: link.target,
            path: null,
            folder: 'Uncreated Notes',
            tags: ['unresolved'],
            isResolved: false,
            degree: 0,
            inDegree: 0,
            outDegree: 0,
            color: '#71717a', // zinc-500
            isCurrent: false,
            size: 6,
          });
        }

        const linkKey = `${sourceNote.path}->${phantomId}`;
        if (!linkKeySet.has(linkKey)) {
          linkKeySet.add(linkKey);
          linkList.push({
            id: linkKey,
            source: sourceNote.path,
            target: phantomId,
            raw: link.raw,
            isResolved: false,
            alias: link.alias,
          });

          const sNode = nodeMap.get(sourceNote.path);
          const pNode = nodeMap.get(phantomId);
          if (sNode) {
            sNode.degree++;
            sNode.outDegree++;
          }
          if (pNode) {
            pNode.degree++;
            pNode.inDegree++;
          }
        }
      }
    }
  }

  // Calculate node sizes based on degree
  nodeMap.forEach(node => {
    // Dynamic node radius: base 6px + scaling up to 20px
    node.size = Math.min(22, Math.max(6, 6 + Math.sqrt(node.degree) * 4));
  });

  let allNodesList = Array.from(nodeMap.values());
  let allLinksList = linkList;

  // 3. Local Neighborhood Filter if enabled
  if (localOnly && currentNotePath && nodeMap.has(currentNotePath)) {
    const includedNodeIds = new Set<string>([currentNotePath]);
    let currentHopNodeIds = new Set<string>([currentNotePath]);

    for (let hop = 0; hop < maxHop; hop++) {
      const nextHopNodeIds = new Set<string>();
      for (const link of allLinksList) {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;

        if (currentHopNodeIds.has(sourceId)) {
          includedNodeIds.add(targetId);
          nextHopNodeIds.add(targetId);
        }
        if (currentHopNodeIds.has(targetId)) {
          includedNodeIds.add(sourceId);
          nextHopNodeIds.add(sourceId);
        }
      }
      currentHopNodeIds = nextHopNodeIds;
    }

    allNodesList = allNodesList.filter(n => includedNodeIds.has(n.id));
    allLinksList = allLinksList.filter(l => {
      const sId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
      return includedNodeIds.has(sId) && includedNodeIds.has(tId);
    });

    // Mark neighbor status
    allNodesList.forEach(n => {
      n.isNeighbor = n.id !== currentNotePath && includedNodeIds.has(n.id);
    });
  }

  // 4. Tag Filter
  if (tagFilter && tagFilter.trim()) {
    const cleanTag = tagFilter.replace(/^#/, '').toLowerCase();
    const tagMatchingIds = new Set(
      allNodesList
        .filter(n => n.tags.some(t => t.toLowerCase() === cleanTag))
        .map(n => n.id)
    );

    // Keep matching nodes + directly connected nodes
    const finalIds = new Set<string>(tagMatchingIds);
    for (const link of allLinksList) {
      const sId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
      const tId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
      if (tagMatchingIds.has(sId)) finalIds.add(tId);
      if (tagMatchingIds.has(tId)) finalIds.add(sId);
    }

    allNodesList = allNodesList.filter(n => finalIds.has(n.id));
    allLinksList = allLinksList.filter(l => {
      const sId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
      return finalIds.has(sId) && finalIds.has(tId);
    });
  }

  // 5. Search Query Filter
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    const searchMatchingIds = new Set(
      allNodesList
        .filter(n => n.title.toLowerCase().includes(q) || (n.path && n.path.toLowerCase().includes(q)))
        .map(n => n.id)
    );

    // If matches found, keep matches + their links
    if (searchMatchingIds.size > 0) {
      const finalIds = new Set<string>(searchMatchingIds);
      for (const link of allLinksList) {
        const sId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
        const tId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
        if (searchMatchingIds.has(sId)) finalIds.add(tId);
        if (searchMatchingIds.has(tId)) finalIds.add(sId);
      }

      allNodesList = allNodesList.filter(n => finalIds.has(n.id));
      allLinksList = allLinksList.filter(l => {
        const sId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
        const tId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
        return finalIds.has(sId) && finalIds.has(tId);
      });
    }
  }

  // Stats
  const resolvedNodes = allNodesList.filter(n => n.isResolved).length;
  const unresolvedNodes = allNodesList.filter(n => !n.isResolved).length;
  const orphanNodes = allNodesList.filter(n => n.degree === 0).length;
  const maxDegree = allNodesList.reduce((max, n) => Math.max(max, n.degree), 0);

  return {
    nodes: allNodesList,
    links: allLinksList,
    folderColors,
    stats: {
      totalNodes: allNodesList.length,
      resolvedNodes,
      unresolvedNodes,
      totalLinks: allLinksList.length,
      orphanNodes,
      maxDegree,
    },
  };
}
