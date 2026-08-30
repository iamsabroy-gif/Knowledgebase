import React, { useState } from 'react';
import { Note, LinkReference } from '../types';
import { computeLinkGraph, findUnlinkedMentions, extractWikilinks } from '../utils/wikilink-engine';
import { GraphView } from './GraphView';
import {
  Link2, ArrowUpRight, ArrowDownLeft, FileText, Search,
  Plus, Check, ChevronDown, ChevronRight, Hash, Compass, Network, X
} from 'lucide-react';

interface BacklinksPanelProps {
  currentNote: Note;
  allNotes: Note[];
  onNavigateToNote: (path: string, heading?: string) => void;
  onRequestCreateNote: (title: string) => void;
  onConvertUnlinkedMention?: (sourcePath: string, matchedText: string, noteTitle: string) => void;
  onOpenGlobalGraph?: () => void;
  /** Present only when rendered inside the mobile/tablet slide-over drawer. */
  onCloseMobile?: () => void;
}

export const BacklinksPanel: React.FC<BacklinksPanelProps> = ({
  currentNote,
  allNotes,
  onNavigateToNote,
  onRequestCreateNote,
  onConvertUnlinkedMention,
  onOpenGlobalGraph,
  onCloseMobile,
}) => {
  const [activeTab, setActiveTab] = useState<'backlinks' | 'outgoing' | 'graph' | 'outline'>('backlinks');
  const [filterQuery, setFilterQuery] = useState('');

  // Compute graph
  const linkGraph = React.useMemo(() => computeLinkGraph(allNotes), [allNotes]);
  const backlinks = linkGraph.backlinksByPath[currentNote.path] || [];
  const outgoing = linkGraph.outgoingByPath[currentNote.path] || [];

  // Compute unlinked mentions
  const unlinkedMentions = React.useMemo(
    () => findUnlinkedMentions(currentNote, allNotes),
    [currentNote, allNotes]
  );

  // Extract headings for outline
  const headings = React.useMemo(() => {
    const lines = currentNote.body.split('\n');
    const list: Array<{ level: number; text: string; id: string }> = [];
    for (const line of lines) {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        const text = m[2].replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1');
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        list.push({ level: m[1].length, text, id });
      }
    }
    return list;
  }, [currentNote.body]);

  const filteredBacklinks = backlinks.filter(b =>
    b.sourceTitle.toLowerCase().includes(filterQuery.toLowerCase()) ||
    b.contextSnippet.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const filteredOutgoing = outgoing.filter(o =>
    o.targetTitle.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <aside className="w-80 max-w-[88vw] h-full border-l border-zinc-800/80 bg-zinc-950 flex flex-col shrink-0 select-none text-zinc-300">
      {/* Tab Navigation */}
      <div className="h-12 border-b border-zinc-800/80 pl-2 pr-1 flex items-center justify-between shrink-0 bg-zinc-900/60">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button
            type="button"
            id="tab-backlinks"
            onClick={() => setActiveTab('backlinks')}
            className={`flex-1 py-2 px-2 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'backlinks'
                ? 'bg-zinc-800 text-violet-300 border border-violet-800/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>Backlinks</span>
            {backlinks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-violet-950 text-violet-400 text-[10px] font-mono">
                {backlinks.length}
              </span>
            )}
          </button>

          <button
            type="button"
            id="tab-outgoing"
            onClick={() => setActiveTab('outgoing')}
            className={`flex-1 py-2 px-2 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'outgoing'
                ? 'bg-zinc-800 text-cyan-300 border border-cyan-800/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Outgoing</span>
            {outgoing.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-400 text-[10px] font-mono">
                {outgoing.length}
              </span>
            )}
          </button>

          <button
            type="button"
            id="tab-graph"
            onClick={() => setActiveTab('graph')}
            className={`flex-1 py-2 px-2 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'graph'
                ? 'bg-zinc-800 text-purple-300 border border-purple-800/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Local Link Graph"
          >
            <Network className="w-3.5 h-3.5" />
            <span>Graph</span>
          </button>

          <button
            type="button"
            id="tab-outline"
            onClick={() => setActiveTab('outline')}
            className={`py-2 px-2.5 rounded text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
              activeTab === 'outline'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Table of Contents"
          >
            <Hash className="w-3.5 h-3.5" />
          </button>
        </div>

        {onCloseMobile && (
          <button
            type="button"
            id="btn-close-backlinks-drawer"
            onClick={onCloseMobile}
            className="ml-2 p-2 rounded-md hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors lg:hidden shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter bar for links */}
      {(activeTab === 'backlinks' || activeTab === 'outgoing') && (
        <div className="p-2 border-b border-zinc-800/60 bg-zinc-900/30">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Filter links..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-violet-600"
            />
          </div>
        </div>
      )}

      {/* Tab Content Container */}
      {activeTab === 'graph' ? (
        <div className="flex-1 flex flex-col relative overflow-hidden bg-[#101012]">
          <div className="p-2 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5 text-purple-400" />
              Local Graph View
            </span>
            {onOpenGlobalGraph && (
              <button
                type="button"
                onClick={onOpenGlobalGraph}
                className="text-[11px] text-violet-400 hover:text-violet-300 underline"
              >
                Expand Vault Graph
              </button>
            )}
          </div>
          <div className="flex-1 relative">
            <GraphView
              notes={allNotes}
              currentNotePath={currentNote.path}
              onNavigateToNote={onNavigateToNote}
              onRequestCreateNote={onRequestCreateNote}
              compact={true}
              defaultLocal={true}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* BACKLINKS TAB */}
          {activeTab === 'backlinks' && (
          <div className="space-y-4">
            {/* Linked Mentions */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                <span>Linked Mentions ({filteredBacklinks.length})</span>
              </div>

              {filteredBacklinks.length === 0 ? (
                <div className="text-xs text-zinc-500 italic py-2">
                  No incoming links to this note yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredBacklinks.map((link, idx) => (
                    <div
                      key={idx}
                      onClick={() => onNavigateToNote(link.sourcePath)}
                      className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-violet-700/60 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-300 group-hover:text-violet-200">
                        <FileText className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        <span className="truncate">{link.sourceTitle}</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-sans mt-1 line-clamp-3 leading-relaxed border-l border-zinc-800 pl-2">
                        {link.contextSnippet}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unlinked Mentions */}
            {unlinkedMentions.length > 0 && (
              <div className="pt-3 border-t border-zinc-800/80">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-amber-400/90 mb-2">
                  <span>Unlinked Mentions ({unlinkedMentions.length})</span>
                </div>
                <div className="space-y-2">
                  {unlinkedMentions.map((mention, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-amber-900/30 bg-amber-950/10"
                    >
                      <div className="flex items-center justify-between gap-1 text-xs">
                        <span
                          onClick={() => onNavigateToNote(mention.sourcePath)}
                          className="font-semibold text-zinc-300 hover:text-amber-300 cursor-pointer truncate"
                        >
                          {mention.sourceTitle}
                        </span>
                        {onConvertUnlinkedMention && (
                          <button
                            type="button"
                            onClick={() => onConvertUnlinkedMention(mention.sourcePath, mention.matchedText, currentNote.title)}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-900/40 hover:bg-amber-800/60 text-amber-300 text-[10px] font-medium transition-colors shrink-0"
                            title={`Convert "${mention.matchedText}" to [[${currentNote.title}]]`}
                          >
                            <Link2 className="w-2.5 h-2.5" />
                            <span>Link</span>
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-sans mt-1 line-clamp-2 leading-relaxed border-l border-amber-900/40 pl-2">
                        {mention.contextSnippet}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* OUTGOING LINKS TAB */}
        {activeTab === 'outgoing' && (
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              <span>Outgoing Links ({filteredOutgoing.length})</span>
            </div>

            {filteredOutgoing.length === 0 ? (
              <div className="text-xs text-zinc-500 italic py-2">
                No outgoing wikilinks in this note.
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredOutgoing.map((out, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg border border-zinc-800 bg-zinc-900/40 text-xs"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Link2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span
                        onClick={() => {
                          if (out.resolvedPath) {
                            onNavigateToNote(out.resolvedPath, out.targetHeading);
                          } else {
                            onRequestCreateNote(out.targetTitle);
                          }
                        }}
                        className={`truncate cursor-pointer hover:underline ${
                          out.isResolved ? 'text-zinc-200' : 'text-zinc-400 italic'
                        }`}
                        title={out.targetTitle}
                      >
                        {out.alias ? `${out.targetTitle} (${out.alias})` : out.targetTitle}
                      </span>
                    </div>

                    {out.isResolved ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                        Resolved
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRequestCreateNote(out.targetTitle)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-violet-900 text-zinc-300 hover:text-violet-200 text-[10px] transition-colors"
                        title="Create note"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Create</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* OUTLINE TAB */}
        {activeTab === 'outline' && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              <span>Table of Contents</span>
            </div>

            {headings.length === 0 ? (
              <div className="text-xs text-zinc-500 italic py-2">
                No headings in this note.
              </div>
            ) : (
              <div className="space-y-1">
                {headings.map((h, idx) => (
                  <a
                    key={idx}
                    href={`#${h.id}`}
                    className="block py-1 px-2 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs truncate transition-colors"
                    style={{ paddingLeft: `${(h.level - 1) * 10 + 8}px` }}
                  >
                    <span className="text-zinc-500 font-mono text-[10px] mr-1.5">
                      {'#'.repeat(h.level)}
                    </span>
                    <span>{h.text}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      )}
    </aside>
  );
};
