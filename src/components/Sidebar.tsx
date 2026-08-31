import React, { useState, useMemo } from 'react';
import { Note, TreeNode, Attachment } from '../types';
import {
  Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Plus, Search,
  Tag, Paperclip, MoreVertical, Trash2, Edit2, Copy, RefreshCw, Layers, X
} from 'lucide-react';

interface SidebarProps {
  notes: Note[];
  attachments: Attachment[];
  activeNotePath: string | null;
  onSelectNote: (path: string) => void;
  onCreateNewNote: (folderPath?: string) => void;
  onCreateNewFolder: () => void;
  onDeleteNote: (path: string) => void;
  onRenameNote: (oldPath: string, newPath: string) => void;
  onSelectAttachment?: (path: string) => void;
  onUploadAttachment?: (file: File) => Promise<void>;
  onDeleteAttachment?: (path: string) => Promise<void>;
  /** Present only when rendered inside the mobile slide-over drawer. */
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  attachments,
  activeNotePath,
  onSelectNote,
  onCreateNewNote,
  onCreateNewFolder,
  onDeleteNote,
  onRenameNote,
  onSelectAttachment,
  onUploadAttachment,
  onDeleteAttachment,
  onCloseMobile,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'search' | 'tags' | 'attachments'>('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [contextMenuPath, setContextMenuPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');

  // Build recursive tree from note paths
  const treeRoot = useMemo(() => {
    const root: TreeNode = { name: 'root', path: '', isFolder: true, children: [] };

    for (const note of notes) {
      const parts = note.path.split('/');
      let currentNode = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join('/');

        if (isFile) {
          currentNode.children = currentNode.children || [];
          currentNode.children.push({
            name: part,
            path: note.path,
            isFolder: false,
            note,
          });
        } else {
          currentNode.children = currentNode.children || [];
          let folder = currentNode.children.find(c => c.isFolder && c.name === part);
          if (!folder) {
            folder = {
              name: part,
              path: currentPath,
              isFolder: true,
              children: [],
            };
            currentNode.children.push(folder);
          }
          currentNode = folder;
        }
      }
    }

    // Sort folders first, then alphabetical
    const sortTree = (node: TreeNode) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortTree);
      }
    };
    sortTree(root);

    return root;
  }, [notes]);

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders(prev => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  // Collect tag stats
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of notes) {
      for (const t of note.tags) {
        map.set(t, (map.get(t) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [notes]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() && !selectedTagFilter) return [];
    const q = searchQuery.toLowerCase().trim();

    return notes.filter(n => {
      // Tag filter
      if (selectedTagFilter && !n.tags.includes(selectedTagFilter)) {
        return false;
      }
      if (!q) return true;

      // Match in title, body, path, tags
      if (n.title.toLowerCase().includes(q)) return true;
      if (n.path.toLowerCase().includes(q)) return true;
      if (n.body.toLowerCase().includes(q)) return true;
      if (n.tags.some(t => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [notes, searchQuery, selectedTagFilter]);

  const handleStartRename = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingPath(note.path);
    setRenamingValue(note.path);
    setContextMenuPath(null);
  };

  const handleFinishRename = () => {
    if (renamingPath && renamingValue.trim() && renamingValue !== renamingPath) {
      let finalNewPath = renamingValue.trim();
      if (!finalNewPath.endsWith('.md')) finalNewPath += '.md';
      onRenameNote(renamingPath, finalNewPath);
    }
    setRenamingPath(null);
  };

  // Render tree recursively
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    if (node.name === 'root') {
      return node.children?.map(child => renderTreeNode(child, depth));
    }

    if (node.isFolder) {
      const isCollapsed = !!collapsedFolders[node.path];
      return (
        <div key={node.path} className="select-none">
          <div
            onClick={() => toggleFolder(node.path)}
            className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-zinc-800/60 text-zinc-300 text-xs font-medium cursor-pointer transition-colors group"
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            <div className="flex items-center gap-1.5 truncate">
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
              )}
              {isCollapsed ? (
                <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
              <span className="truncate">{node.name}</span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCreateNewNote(node.path);
              }}
              className="hover-affordance p-1.5 -m-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-opacity"
              title="New note in this folder"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {!isCollapsed && node.children && (
            <div>{node.children.map(child => renderTreeNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    // Is File Note
    const isSelected = activeNotePath === node.path;
    const isRenamingThis = renamingPath === node.path;
    const note = node.note!;

    return (
      <div
        key={node.path}
        onClick={() => onSelectNote(node.path)}
        className={`flex items-center justify-between px-2 py-1.5 my-0.5 rounded-md text-xs cursor-pointer transition-colors group select-none relative ${
          isSelected
            ? 'bg-violet-950/60 text-violet-200 font-medium border border-violet-800/50'
            : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100'
        }`}
        style={{ paddingLeft: `${depth * 14 + 14}px` }}
      >
        {isRenamingThis ? (
          <input
            type="text"
            value={renamingValue}
            onChange={(e) => setRenamingValue(e.target.value)}
            onBlur={handleFinishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFinishRename();
              if (e.key === 'Escape') setRenamingPath(null);
            }}
            autoFocus
            className="w-full bg-zinc-900 border border-violet-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="flex items-center gap-1.5 truncate flex-1 mr-2">
            <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-violet-400' : 'text-zinc-500'}`} />
            <span className="truncate" title={note.path}>
              {note.title || node.name.replace(/\.md$/, '')}
            </span>
          </div>
        )}

        {/* Status indicator badge (local change / conflict) */}
        <div className="flex items-center gap-1 shrink-0">
          {note.sync_status === 'local_changes' && (
            <span
              className="w-2 h-2 rounded-full bg-amber-400"
              title="Local changes pending commit"
            />
          )}
          {note.sync_status === 'conflict' && (
            <span
              className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"
              title="Merge conflict needing attention"
            />
          )}

          {/* Context menu button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setContextMenuPath(contextMenuPath === node.path ? null : node.path);
            }}
            className="hover-affordance p-1.5 -m-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-opacity"
            title="Note options"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dropdown context menu */}
        {contextMenuPath === node.path && (
          <div
            className="absolute right-2 top-7 w-36 rounded-md bg-zinc-900 border border-zinc-700 shadow-xl z-50 p-1 text-xs select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => handleStartRename(note, e)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white text-left"
            >
              <Edit2 className="w-3 h-3" />
              <span>Rename</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onDeleteNote(note.path);
                setContextMenuPath(null);
              }}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-rose-950 text-rose-400 hover:text-rose-300 text-left"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-72 max-w-[85vw] h-full border-r border-zinc-800/80 bg-zinc-950 flex flex-col shrink-0 select-none text-zinc-300">
      {/* Top Header & New Note/Folder controls */}
      <div className="h-12 border-b border-zinc-800/80 px-3 flex items-center justify-between shrink-0 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
            Vault Explorer
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            id="btn-new-note"
            onClick={() => onCreateNewNote()}
            className="p-2 md:p-1.5 rounded-md hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
            title="Create New Note"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            id="btn-new-folder"
            onClick={() => onCreateNewFolder()}
            className="p-2 md:p-1.5 rounded-md hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
            title="Create New Folder"
          >
            <Folder className="w-4 h-4" />
          </button>
          {onCloseMobile && (
            <button
              type="button"
              id="btn-close-sidebar-drawer"
              onClick={onCloseMobile}
              className="p-2 rounded-md hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors md:hidden"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* View Tabs: Files, Search, Tags, Attachments */}
      <div className="grid grid-cols-4 p-1.5 bg-zinc-950 border-b border-zinc-800/60 gap-1 text-[11px]">
        <button
          type="button"
          id="tab-files"
          onClick={() => setActiveTab('files')}
          className={`py-2 rounded text-center font-medium transition-colors ${
            activeTab === 'files' ? 'bg-zinc-800 text-violet-300 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Files
        </button>
        <button
          type="button"
          id="tab-search"
          onClick={() => setActiveTab('search')}
          className={`py-2 rounded text-center font-medium transition-colors ${
            activeTab === 'search' ? 'bg-zinc-800 text-violet-300 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Search
        </button>
        <button
          type="button"
          id="tab-tags"
          onClick={() => setActiveTab('tags')}
          className={`py-2 rounded text-center font-medium transition-colors ${
            activeTab === 'tags' ? 'bg-zinc-800 text-violet-300 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Tags
        </button>
        <button
          type="button"
          id="tab-attachments"
          onClick={() => setActiveTab('attachments')}
          className={`py-2 rounded text-center font-medium transition-colors ${
            activeTab === 'attachments' ? 'bg-zinc-800 text-violet-300 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Media
        </button>
      </div>

      {/* Main Tab Views */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* 1. FILE TREE TAB */}
        {activeTab === 'files' && (
          <div className="space-y-0.5">
            {renderTreeNode(treeRoot)}
          </div>
        )}

        {/* 2. FULL-TEXT SEARCH TAB */}
        {activeTab === 'search' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                id="vault-search-input"
                placeholder="Search notes, body, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-violet-600"
              />
            </div>

            {selectedTagFilter && (
              <div className="flex items-center justify-between p-1.5 rounded bg-violet-950/40 border border-violet-800/40 text-xs text-violet-300">
                <span>Filter: #{selectedTagFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedTagFilter(null)}
                  className="text-zinc-400 hover:text-white text-[10px]"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
              Results ({searchResults.length})
            </div>

            <div className="space-y-1.5">
              {searchResults.map(n => (
                <div
                  key={n.path}
                  onClick={() => onSelectNote(n.path)}
                  className={`p-2 rounded-lg border border-zinc-800/80 cursor-pointer transition-all ${
                    activeNotePath === n.path
                      ? 'bg-violet-950/60 border-violet-700/60 text-white'
                      : 'bg-zinc-900/40 hover:bg-zinc-800/60 text-zinc-300'
                  }`}
                >
                  <div className="text-xs font-semibold truncate flex items-center justify-between">
                    <span>{n.title}</span>
                    {n.frontmatter.status && (
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {n.frontmatter.status}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate font-mono mt-0.5">
                    {n.path}
                  </div>
                  {/* Matching snippet */}
                  {searchQuery && (
                    <div className="text-[11px] text-zinc-400 line-clamp-2 mt-1 font-sans">
                      {n.body.slice(0, 120)}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. TAGS TAB */}
        {activeTab === 'tags' && (
          <div className="space-y-2">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
              Tags in Vault ({tagCounts.length})
            </div>
            <div className="space-y-1">
              {tagCounts.map(([tag, count]) => (
                <div
                  key={tag}
                  onClick={() => {
                    setSelectedTagFilter(tag);
                    setActiveTab('search');
                  }}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-zinc-800/70 cursor-pointer text-xs transition-colors group"
                >
                  <div className="flex items-center gap-1.5 text-violet-300 group-hover:text-violet-200">
                    <Tag className="w-3 h-3 text-violet-400" />
                    <span>#{tag}</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-mono">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. ATTACHMENTS TAB */}
        {activeTab === 'attachments' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
              <span>Attachments ({attachments.length})</span>
            </div>

            {attachments.length === 0 ? (
              <div className="text-xs text-zinc-500 italic py-4 text-center">
                No attachments uploaded yet. Drag & drop images into the editor or note body.
              </div>
            ) : (
              <div className="space-y-1.5">
                {attachments.map(att => (
                  <div
                    key={att.path}
                    className="flex items-center justify-between p-2 rounded-lg border border-zinc-800 bg-zinc-900/40 text-xs hover:bg-zinc-800/50 group"
                  >
                    <div className="flex items-center gap-2 truncate mr-1">
                      <Paperclip className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate text-zinc-200" title={att.name}>
                        {att.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`![[${att.name}]]`);
                        }}
                        className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-violet-900 text-zinc-300 text-[10px] transition-colors"
                        title="Copy ![[embed]] tag"
                      >
                        Copy Tag
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
