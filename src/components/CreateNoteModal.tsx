import React, { useState, useEffect } from 'react';
import { FileText, Folder, X, Plus } from 'lucide-react';

interface CreateNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTitle?: string;
  defaultFolder?: string;
  onCreateNote: (title: string, folder: string, tags: string[]) => void;
}

export const CreateNoteModal: React.FC<CreateNoteModalProps> = ({
  isOpen,
  onClose,
  defaultTitle = '',
  defaultFolder = '',
  onCreateNote,
}) => {
  const [title, setTitle] = useState(defaultTitle);
  const [folder, setFolder] = useState(defaultFolder);
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle(defaultTitle);
      setFolder(defaultFolder);
      setTagsInput('');
    }
  }, [isOpen, defaultTitle, defaultFolder]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const tags = tagsInput
      .split(/[\s,]+/)
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    onCreateNote(title.trim(), folder.trim(), tags);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-violet-950/60 border border-violet-800/50 text-violet-300">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Create New Note</h2>
              <p className="text-xs text-zinc-400">Obsidian markdown note with YAML frontmatter</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Note Title / Filename <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              id="new-note-title-input"
              required
              autoFocus
              placeholder="e.g. Cardholder Verification Rules"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Folder (Optional)
            </label>
            <input
              type="text"
              id="new-note-folder-input"
              placeholder="e.g. EMV Architecture or leave blank for root"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Tags (Comma or space separated)
            </label>
            <input
              type="text"
              id="new-note-tags-input"
              placeholder="emv, security, cvm"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:border-violet-500 outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-confirm-create-note"
              className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md transition-colors"
            >
              Create Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
