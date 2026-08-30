import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../types';
import { Search, FileText, ArrowRight, Tag, Hash, X } from 'lucide-react';

interface QuickSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  onSelectNote: (path: string) => void;
}

export const QuickSwitcherModal: React.FC<QuickSwitcherModalProps> = ({
  isOpen,
  onClose,
  notes,
  onSelectNote,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredNotes = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return notes.slice(0, 10);

    return notes
      .filter(n => {
        if (n.title.toLowerCase().includes(q)) return true;
        if (n.path.toLowerCase().includes(q)) return true;
        if (n.tags.some(t => t.toLowerCase().includes(q))) return true;
        const aliases = n.frontmatter.aliases;
        if (Array.isArray(aliases)) {
          return aliases.some(a => typeof a === 'string' && a.toLowerCase().includes(q));
        }
        return false;
      })
      .slice(0, 10);
  }, [notes, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredNotes]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredNotes.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredNotes.length) % Math.max(1, filteredNotes.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredNotes[selectedIndex];
      if (selected) {
        onSelectNote(selected.path);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center pt-24 px-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input header */}
        <div className="p-3.5 border-b border-zinc-800 flex items-center gap-3">
          <Search className="w-5 h-5 text-violet-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            id="quick-switcher-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type note title, alias, or path to jump..."
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filteredNotes.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-500">
              No matching notes found for "{query}"
            </div>
          ) : (
            filteredNotes.map((note, idx) => (
              <div
                key={note.path}
                onClick={() => {
                  onSelectNote(note.path);
                  onClose();
                }}
                className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                  idx === selectedIndex
                    ? 'bg-violet-600 text-white'
                    : 'text-zinc-300 hover:bg-zinc-800/80'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate mr-2">
                  <FileText className={`w-4 h-4 shrink-0 ${idx === selectedIndex ? 'text-white' : 'text-violet-400'}`} />
                  <div className="truncate">
                    <div className="text-xs font-semibold truncate">{note.title}</div>
                    <div className={`text-[10px] truncate font-mono ${idx === selectedIndex ? 'text-violet-200' : 'text-zinc-500'}`}>
                      {note.path}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {note.tags.slice(0, 2).map(t => (
                    <span
                      key={t}
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        idx === selectedIndex
                          ? 'bg-violet-700 text-violet-100'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      #{t}
                    </span>
                  ))}
                  <ArrowRight className={`w-3.5 h-3.5 opacity-60 ${idx === selectedIndex ? 'text-white' : 'text-zinc-500'}`} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-3.5 py-2 bg-zinc-950/80 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
          <span>Obsidian Quick Switcher</span>
        </div>
      </div>
    </div>
  );
};
