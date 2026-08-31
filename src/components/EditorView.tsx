import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Note, EditorViewMode, Attachment } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { FrontmatterInspector } from './FrontmatterInspector';
import { api } from '../api/client';
import {
  Bold, Italic, Link as LinkIcon, Image as ImageIcon, CheckSquare,
  List, Hash, Code, Table, Paperclip, Save, Eye, Edit3, Columns, Upload, FileText, PanelRightOpen
} from 'lucide-react';

interface EditorViewProps {
  note: Note;
  allNotes: Note[];
  viewMode: EditorViewMode;
  onChangeViewMode: (mode: EditorViewMode) => void;
  onSaveNote: (updatedNote: Note) => Promise<void>;
  onNavigateToNote: (path: string, heading?: string) => void;
  onRequestCreateNote: (title: string) => void;
  onAttachmentUploaded?: () => void;
  /** Opens the backlinks/graph/outline panel, which collapses into a drawer below `lg`. */
  onOpenBacklinks?: () => void;
}

export const EditorView: React.FC<EditorViewProps> = ({
  note,
  allNotes,
  viewMode,
  onChangeViewMode,
  onSaveNote,
  onNavigateToNote,
  onRequestCreateNote,
  onAttachmentUploaded,
  onOpenBacklinks,
}) => {
  const [body, setBody] = useState(note.body);
  const [title, setTitle] = useState(note.title);
  const [isSaving, setIsSaving] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<'saved' | 'saving' | 'dirty'>('saved');

  // Wikilink autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [autocompleteCursorPos, setAutocompleteCursorPos] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when active note changes
  useEffect(() => {
    setBody(note.body);
    setTitle(note.title);
    setSaveIndicator('saved');
  }, [note.path]);

  // Debounced auto-save (600ms)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerSave = useCallback(
    (newBody: string, newTitle?: string) => {
      setSaveIndicator('dirty');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        setSaveIndicator('saving');
        try {
          const updatedNote: Note = {
            ...note,
            title: newTitle !== undefined ? newTitle : title,
            body: newBody,
            frontmatter: {
              ...note.frontmatter,
              title: newTitle !== undefined ? newTitle : (note.frontmatter.title ? newTitle : undefined),
            },
          };
          await onSaveNote(updatedNote);
          setSaveIndicator('saved');
        } catch (e) {
          console.error('Failed to auto-save:', e);
          setSaveIndicator('dirty');
        } finally {
          setIsSaving(false);
        }
      }, 600);
    },
    [note, title, onSaveNote]
  );

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const cursor = e.target.selectionStart;
    setBody(newText);
    triggerSave(newText);

    // Check for [[ wikilink trigger
    const textBeforeCursor = newText.slice(0, cursor);
    const wikilinkMatch = textBeforeCursor.match(/(?:\[\[)([^\]\n\r]*)$/);

    if (wikilinkMatch) {
      setShowAutocomplete(true);
      setAutocompleteQuery(wikilinkMatch[1]);
      setAutocompleteIndex(0);
      setAutocompleteCursorPos(cursor);
    } else {
      setShowAutocomplete(false);
    }
  };

  // Filter notes for autocomplete
  const autocompleteSuggestions = React.useMemo(() => {
    if (!showAutocomplete) return [];
    const q = autocompleteQuery.toLowerCase().trim();
    return allNotes
      .filter(n => {
        if (!q) return true;
        if (n.title.toLowerCase().includes(q)) return true;
        if (n.path.toLowerCase().includes(q)) return true;
        const aliases = n.frontmatter.aliases;
        if (Array.isArray(aliases)) {
          return aliases.some(a => typeof a === 'string' && a.toLowerCase().includes(q));
        }
        return false;
      })
      .slice(0, 8);
  }, [allNotes, showAutocomplete, autocompleteQuery]);

  const insertWikilinkSuggestion = (selectedNote: Note) => {
    if (!textareaRef.current) return;
    const text = body;
    const beforeWikilink = text.slice(0, autocompleteCursorPos).replace(/(?:\[\[)([^\]\n\r]*)$/, '');
    const afterCursor = text.slice(autocompleteCursorPos);

    const insertion = `[[${selectedNote.title}]]`;
    const newBody = beforeWikilink + insertion + afterCursor;

    setBody(newBody);
    setShowAutocomplete(false);
    triggerSave(newBody);

    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = beforeWikilink.length + insertion.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 50);
  };

  // Keyboard navigation inside textarea (autocomplete & shortcuts)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete && autocompleteSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteIndex(prev => (prev + 1) % autocompleteSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteIndex(prev => (prev - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = autocompleteSuggestions[autocompleteIndex];
        if (selected) insertWikilinkSuggestion(selected);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
        return;
      }
    }

    // Ctrl/Cmd + S to force save immediately
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setIsSaving(true);
      onSaveNote({
        ...note,
        title,
        body,
      }).then(() => {
        setSaveIndicator('saved');
        setIsSaving(false);
      });
    }

    // Ctrl/Cmd + E to toggle view mode
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      onChangeViewMode(viewMode === 'preview' ? 'edit' : 'preview');
    }
  };

  // Toolbar action helpers
  const insertFormatting = (before: string, after: string = '', defaultText: string = '') => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.slice(start, end) || defaultText;

    const newText = body.slice(0, start) + before + selected + after + body.slice(end);
    setBody(newText);
    triggerSave(newText);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 50);
  };

  // Toggle checkbox in preview mode
  const handleToggleTaskCheckbox = (lineIndex: number, newChecked: boolean) => {
    const lines = body.split('\n');
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const line = lines[lineIndex];
      const updatedLine = line.replace(
        /^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/,
        `$1${newChecked ? 'x' : ' '}$3`
      );
      lines[lineIndex] = updatedLine;
      const newBody = lines.join('\n');
      setBody(newBody);
      triggerSave(newBody);
    }
  };

  // Handle Drag & Drop Attachment Files
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length === 0) return;

    for (const file of files) {
      await uploadAndInsertFile(file);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    for (const file of files) {
      await uploadAndInsertFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadAndInsertFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      if (!base64) return;

      try {
        const cleanName = file.name.replace(/\s+/g, '_');
        const uploaded = await api.uploadAttachment(cleanName, base64, file.type);
        const embedTag = `\n\n![[${uploaded.name}]]\n\n`;
        const newBody = body + embedTag;
        setBody(newBody);
        triggerSave(newBody);
        if (onAttachmentUploaded) onAttachmentUploaded();
      } catch (err) {
        console.error('Failed to upload attachment:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  // Synced scroll in Split View
  const handleEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (viewMode !== 'split' || !previewContainerRef.current) return;
    const editor = e.currentTarget;
    const preview = previewContainerRef.current;
    const percentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
    preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#18181b] overflow-hidden">
      {/* Top Note Sub-Header & Controls */}
      <div className="h-12 border-b border-zinc-800/80 bg-zinc-900/60 px-3 sm:px-4 flex items-center justify-between shrink-0 select-none">
        {/* Title / Path info */}
        <div className="flex items-center gap-2 overflow-hidden max-w-[42%] sm:max-w-[50%]">
          <FileText className="w-4 h-4 text-violet-400 shrink-0" />
          <span className="text-sm font-semibold text-zinc-200 truncate" title={note.path}>
            {title || note.title}
          </span>
          <span className="text-xs text-zinc-500 font-mono hidden sm:inline truncate">
            {note.path}
          </span>
        </div>

        {/* Action Controls & Mode Selector */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Save status badge */}
          <div className="flex items-center gap-1.5 text-xs">
            {saveIndicator === 'saving' && (
              <span className="text-amber-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span className="hidden sm:inline">Saving...</span>
              </span>
            )}
            {saveIndicator === 'saved' && (
              <span className="text-zinc-500 flex items-center gap-1 font-mono text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="hidden sm:inline">Saved</span>
              </span>
            )}
            {saveIndicator === 'dirty' && (
              <span className="text-amber-300 font-mono text-[11px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 sm:hidden" />
                <span className="hidden sm:inline">Unsaved changes</span>
              </span>
            )}
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex items-center rounded-lg bg-zinc-950 border border-zinc-800 p-0.5">
            <button
              type="button"
              id="btn-mode-preview"
              onClick={() => onChangeViewMode('preview')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'preview'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Preview / Reading mode (Cmd+E)"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              type="button"
              id="btn-mode-edit"
              onClick={() => onChangeViewMode('edit')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'edit'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Edit source mode (Cmd+E)"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              type="button"
              id="btn-mode-split"
              onClick={() => onChangeViewMode('split')}
              className={`hidden md:flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'split'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Split side-by-side mode (desktop only)"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Split</span>
            </button>
          </div>

          {/* Backlinks/Graph/Outline drawer trigger — panel is inline at lg+ */}
          {onOpenBacklinks && (
            <button
              type="button"
              id="btn-open-backlinks-drawer"
              onClick={onOpenBacklinks}
              className="lg:hidden p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="Backlinks, graph & outline"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Formatting Toolbar (Visible in Edit and Split modes) */}
      {(viewMode === 'edit' || viewMode === 'split') && (
        <div className="h-12 md:h-10 border-b border-zinc-800/80 bg-zinc-950/70 px-3 flex items-center gap-1 shrink-0 overflow-x-auto scroll-touch no-scrollbar text-zinc-400 select-none">
          <button
            type="button"
            onClick={() => insertFormatting('**', '**', 'bold text')}
            className="p-2.5 md:p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 shrink-0"
            title="Bold (**text**)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('*', '*', 'italic text')}
            className="p-2.5 md:p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 shrink-0"
            title="Italic (*text*)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-4 bg-zinc-800 mx-1" />
          <button
            type="button"
            onClick={() => insertFormatting('[[', ']]', 'Note Title')}
            className="flex items-center gap-1 px-2.5 py-2.5 md:py-1 rounded text-xs shrink-0 text-violet-400 hover:bg-violet-950/50 hover:text-violet-300 font-medium"
            title="Insert [[Wikilink]]"
          >
            <span>[[</span>
            <span>Link</span>
            <span>]]</span>
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('![[', ']]', 'attachment.png')}
            className="flex items-center gap-1 px-2.5 py-2.5 md:py-1 rounded text-xs shrink-0 text-cyan-400 hover:bg-cyan-950/50 hover:text-cyan-300 font-medium"
            title="Insert ![[Embed]]"
          >
            <span>![[</span>
            <span>Embed</span>
            <span>]]</span>
          </button>
          <div className="w-[1px] h-4 bg-zinc-800 mx-1" />
          <button
            type="button"
            onClick={() => insertFormatting('## ', '', 'Heading')}
            className="p-2.5 md:p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 shrink-0"
            title="Heading (## )"
          >
            <Hash className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('- [ ] ', '', 'Task item')}
            className="p-2.5 md:p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 shrink-0"
            title="Task Checkbox (- [ ])"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('- ', '', 'List item')}
            className="p-2.5 md:p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 shrink-0"
            title="Bullet List (- )"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('```\n', '\n```', 'code block')}
            className="p-2.5 md:p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 shrink-0"
            title="Code Block (```)"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('\n| Header 1 | Header 2 |\n| :--- | :--- |\n| Cell 1 | Cell 2 |\n')}
            className="p-2.5 md:p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 shrink-0"
            title="Insert Markdown Table"
          >
            <Table className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('> [!NOTE]\n> ', '', 'This is a note callout')}
            className="px-2.5 py-2.5 md:py-1 rounded text-xs shrink-0 text-zinc-300 hover:bg-zinc-800"
            title="Callout Box"
          >
            Callout
          </button>
          <div className="w-[1px] h-4 bg-zinc-800 mx-1" />
          {/* File Attachment Upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            className="hidden"
            accept="image/*,.pdf"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-2.5 md:py-1 rounded text-xs shrink-0 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            title="Upload Attachment (Image, PDF)"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Attach</span>
          </button>
        </div>
      )}

      {/* Main Content Area. Split mode stacks vertically below `md` since two
          side-by-side columns are unusable on a phone-width viewport. */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* EDIT PANE */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div
            className={`flex-1 flex flex-col bg-[#18181b] relative min-h-0 ${
              viewMode === 'split' ? 'border-b md:border-b-0 md:border-r border-zinc-800' : ''
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <textarea
              ref={textareaRef}
              id="markdown-editor-textarea"
              data-selectable-content
              value={body}
              onChange={handleBodyChange}
              onKeyDown={handleKeyDown}
              onScroll={handleEditorScroll}
              placeholder="Write your research notes in markdown with [[wikilinks]], ![[embeds]], and YAML frontmatter..."
              className="flex-1 w-full p-4 md:p-6 bg-transparent text-zinc-200 font-mono text-sm leading-relaxed outline-none resize-none selection:bg-violet-900/60 selection:text-white"
              spellCheck="false"
            />

            {/* Wikilink Autocomplete Dropdown */}
            {showAutocomplete && autocompleteSuggestions.length > 0 && (
              <div className="absolute left-4 sm:left-10 top-16 sm:top-20 w-80 max-w-[90vw] max-h-64 overflow-y-auto rounded-lg border border-violet-700/60 bg-zinc-900/95 shadow-2xl z-50 p-1.5 backdrop-blur-md">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-violet-400 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
                  <span>Link Note</span>
                  <span className="font-mono text-zinc-500">↑↓ to navigate</span>
                </div>
                {autocompleteSuggestions.map((item, idx) => (
                  <div
                    key={item.path}
                    onClick={() => insertWikilinkSuggestion(item)}
                    className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex flex-col gap-0.5 transition-colors ${
                      idx === autocompleteIndex
                        ? 'bg-violet-600 text-white font-medium'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{item.title}</span>
                      {item.frontmatter.status && (
                        <span className="text-[10px] opacity-75 font-mono">
                          {item.frontmatter.status}
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] truncate ${idx === autocompleteIndex ? 'text-violet-200' : 'text-zinc-500'}`}>
                      {item.path}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PREVIEW PANE */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            ref={previewContainerRef}
            data-selectable-content
            className="flex-1 min-h-0 overflow-y-auto scroll-touch p-4 sm:p-6 md:p-8 bg-[#18181b]"
          >
            <div className="max-w-4xl mx-auto pb-16">
              {/* Frontmatter Inspector */}
              <FrontmatterInspector
                frontmatter={note.frontmatter}
                tags={note.tags}
                updatedAt={note.updated_at}
                isEditing={viewMode === 'edit'}
              />

              {/* Rendered Markdown Content */}
              <MarkdownRenderer
                content={body}
                notes={allNotes}
                currentNotePath={note.path}
                onNavigateToNote={onNavigateToNote}
                onRequestCreateNote={onRequestCreateNote}
                onToggleTaskCheckbox={handleToggleTaskCheckbox}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
