import React, { useState } from 'react';
import { Note } from '../types';
import { resolveWikilink, buildNoteLookupIndex } from '../utils/wikilink-engine';
import { ExternalLink, Plus, Copy, Check, FileText, AlertCircle, Info, Lightbulb, AlertTriangle, ShieldAlert } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  notes: Note[];
  currentNotePath: string;
  onNavigateToNote: (path: string, heading?: string) => void;
  onRequestCreateNote: (targetTitle: string) => void;
  onToggleTaskCheckbox?: (lineIndex: number, newChecked: boolean) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  notes,
  currentNotePath,
  onNavigateToNote,
  onRequestCreateNote,
  onToggleTaskCheckbox,
}) => {
  const noteIndex = React.useMemo(() => buildNoteLookupIndex(notes), [notes]);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const handleCopyCode = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  // Render markdown line by line or by blocks
  const renderFormattedMarkdown = (raw: string) => {
    const lines = raw.split('\n');
    const elements: React.ReactNode[] = [];

    let inCodeBlock = false;
    let codeLanguage = '';
    let codeContent: string[] = [];
    let codeBlockIndex = 0;

    let inTable = false;
    let tableRows: string[][] = [];
    let tableAlignments: string[] = [];

    let inBlockquote = false;
    let blockquoteLines: string[] = [];
    let blockquoteCalloutType: string | null = null;
    let blockquoteCalloutTitle: string | null = null;

    const flushCodeBlock = () => {
      if (inCodeBlock) {
        const fullCode = codeContent.join('\n');
        const currentId = `code-${codeBlockIndex++}`;
        elements.push(
          <div key={currentId} className="my-4 rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden font-mono text-sm shadow-sm group relative">
            <div className="flex items-center justify-between px-3.5 py-1.5 bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 text-xs select-none">
              <span className="font-semibold tracking-wide text-zinc-400">{codeLanguage || 'text'}</span>
              <button
                type="button"
                id={`btn-copy-${currentId}`}
                onClick={() => handleCopyCode(fullCode, currentId)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                title="Copy code"
              >
                {copiedCodeId === currentId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-zinc-200 leading-relaxed font-mono">
              <code>{fullCode}</code>
            </pre>
          </div>
        );
        inCodeBlock = false;
        codeLanguage = '';
        codeContent = [];
      }
    };

    const flushTable = () => {
      if (inTable && tableRows.length > 0) {
        const header = tableRows[0];
        const bodyRows = tableRows.slice(1);
        elements.push(
          <div key={`table-${elements.length}`} className="my-4 overflow-x-auto rounded-lg border border-zinc-800 shadow-sm">
            <table className="w-full text-left text-sm text-zinc-300 border-collapse">
              <thead className="bg-zinc-900/90 text-zinc-200 border-b border-zinc-800 font-semibold">
                <tr>
                  {header.map((col, idx) => (
                    <th key={idx} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-300 border-r border-zinc-800/60 last:border-r-0">
                      {renderInlineElements(col.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/40 font-mono text-xs md:font-sans md:text-sm">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-zinc-800/40 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-4 py-2.5 border-r border-zinc-800/60 last:border-r-0 text-zinc-300">
                        {renderInlineElements(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        inTable = false;
        tableRows = [];
        tableAlignments = [];
      }
    };

    const flushBlockquote = () => {
      if (inBlockquote && blockquoteLines.length > 0) {
        const textBody = blockquoteLines.join('\n');
        const callout = blockquoteCalloutType;

        let borderClass = 'border-l-4 border-violet-500 bg-violet-950/20 text-zinc-300';
        let icon = <Info className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />;
        let titleColor = 'text-violet-300';

        if (callout === 'NOTE' || callout === 'INFO') {
          borderClass = 'border-l-4 border-blue-500 bg-blue-950/20 text-zinc-300';
          icon = <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />;
          titleColor = 'text-blue-300';
        } else if (callout === 'TIP') {
          borderClass = 'border-l-4 border-emerald-500 bg-emerald-950/20 text-zinc-300';
          icon = <Lightbulb className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />;
          titleColor = 'text-emerald-300';
        } else if (callout === 'WARNING') {
          borderClass = 'border-l-4 border-amber-500 bg-amber-950/20 text-zinc-300';
          icon = <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />;
          titleColor = 'text-amber-300';
        } else if (callout === 'CAUTION' || callout === 'DANGER') {
          borderClass = 'border-l-4 border-rose-500 bg-rose-950/20 text-zinc-300';
          icon = <ShieldAlert className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />;
          titleColor = 'text-rose-300';
        }

        elements.push(
          <div key={`bq-${elements.length}`} className={`my-4 p-4 rounded-r-lg ${borderClass}`}>
            {callout && (
              <div className={`flex items-center gap-2 font-semibold text-sm mb-1.5 ${titleColor}`}>
                {icon}
                <span>{blockquoteCalloutTitle || callout}</span>
              </div>
            )}
            <div className="text-sm leading-relaxed space-y-1">
              {blockquoteLines.map((bline, bidx) => (
                <p key={bidx}>{renderInlineElements(bline)}</p>
              ))}
            </div>
          </div>
        );

        inBlockquote = false;
        blockquoteLines = [];
        blockquoteCalloutType = null;
        blockquoteCalloutTitle = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks ```
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          flushCodeBlock();
        } else {
          flushTable();
          flushBlockquote();
          inCodeBlock = true;
          codeLanguage = line.trim().replace(/^```/, '').trim();
          codeContent = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      // Tables | col1 | col2 |
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        flushBlockquote();
        const cells = line.trim().slice(1, -1).split('|');
        // Check if it's a separator line like |---|:---|
        if (cells.every(c => /^[\s:-]+$/.test(c.trim()))) {
          inTable = true;
          continue;
        }
        if (!inTable) {
          flushTable();
          inTable = true;
        }
        tableRows.push(cells);
        continue;
      } else {
        if (inTable) flushTable();
      }

      // Blockquotes and Callouts > [!NOTE]
      if (line.trim().startsWith('>')) {
        flushTable();
        const quoteContent = line.replace(/^>\s?/, '');
        const calloutMatch = quoteContent.match(/^\[!([a-zA-Z]+)\]\s*(.*)$/);

        if (!inBlockquote) {
          inBlockquote = true;
          if (calloutMatch) {
            blockquoteCalloutType = calloutMatch[1].toUpperCase();
            blockquoteCalloutTitle = calloutMatch[2] || calloutMatch[1];
          } else {
            blockquoteLines.push(quoteContent);
          }
        } else {
          if (calloutMatch && !blockquoteCalloutType) {
            blockquoteCalloutType = calloutMatch[1].toUpperCase();
            blockquoteCalloutTitle = calloutMatch[2] || calloutMatch[1];
          } else {
            blockquoteLines.push(quoteContent);
          }
        }
        continue;
      } else {
        if (inBlockquote) flushBlockquote();
      }

      // Blank line
      if (!line.trim()) {
        continue;
      }

      // Headings
      if (line.startsWith('#')) {
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const text = headingMatch[2];
          const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

          const headingClasses: Record<number, string> = {
            1: 'text-2xl font-bold text-zinc-100 mt-8 mb-4 pb-2 border-b border-zinc-800 tracking-tight',
            2: 'text-xl font-bold text-zinc-100 mt-6 mb-3 pb-1 border-b border-zinc-800/60 tracking-tight',
            3: 'text-lg font-semibold text-zinc-200 mt-5 mb-2.5',
            4: 'text-base font-semibold text-zinc-200 mt-4 mb-2',
            5: 'text-sm font-semibold text-zinc-300 mt-3 mb-1.5',
            6: 'text-xs font-semibold uppercase tracking-wider text-zinc-400 mt-3 mb-1',
          };

          const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : level === 4 ? 'h4' : level === 5 ? 'h5' : 'h6';
          elements.push(
            <Tag key={`h-${i}`} id={id} className={`group flex items-center gap-2 ${headingClasses[level]}`}>
              <span>{renderInlineElements(text)}</span>
              <a href={`#${id}`} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 text-sm ml-1.5 transition-opacity" title="Direct link">
                #
              </a>
            </Tag>
          );
          continue;
        }
      }

      // Horizontal Rule
      if (/^(\*\*\*|---|___)$/.test(line.trim())) {
        elements.push(<hr key={`hr-${i}`} className="my-6 border-zinc-800" />);
        continue;
      }

      // Task Checkboxes (- [ ] or - [x])
      const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
      if (taskMatch) {
        const indent = taskMatch[1].length;
        const isChecked = taskMatch[2].toLowerCase() === 'x';
        const taskText = taskMatch[3];
        const lineIdx = i;

        elements.push(
          <div key={`task-${i}`} className="flex items-start gap-2.5 my-1.5 text-sm" style={{ paddingLeft: `${indent * 12}px` }}>
            <input
              type="checkbox"
              id={`checkbox-task-${i}`}
              checked={isChecked}
              onChange={() => onToggleTaskCheckbox && onToggleTaskCheckbox(lineIdx, !isChecked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-violet-600 focus:ring-violet-500 focus:ring-offset-zinc-900 cursor-pointer"
            />
            <span className={`text-zinc-300 leading-relaxed ${isChecked ? 'line-through text-zinc-500' : ''}`}>
              {renderInlineElements(taskText)}
            </span>
          </div>
        );
        continue;
      }

      // Bullet Lists (- or * or +)
      const listMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
      if (listMatch) {
        const indent = listMatch[1].length;
        const itemText = listMatch[3];
        elements.push(
          <div key={`li-${i}`} className="flex items-start gap-2.5 my-1 text-sm" style={{ paddingLeft: `${indent * 12 + 8}px` }}>
            <span className="text-violet-400 select-none mt-1.5 text-xs font-bold leading-none">•</span>
            <div className="text-zinc-300 leading-relaxed flex-1">
              {renderInlineElements(itemText)}
            </div>
          </div>
        );
        continue;
      }

      // Numbered Lists (1. 2.)
      const numListMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
      if (numListMatch) {
        const indent = numListMatch[1].length;
        const num = numListMatch[2];
        const itemText = numListMatch[3];
        elements.push(
          <div key={`nli-${i}`} className="flex items-start gap-2.5 my-1 text-sm" style={{ paddingLeft: `${indent * 12 + 4}px` }}>
            <span className="text-zinc-400 select-none font-mono text-xs mt-0.5 shrink-0">{num}.</span>
            <div className="text-zinc-300 leading-relaxed flex-1">
              {renderInlineElements(itemText)}
            </div>
          </div>
        );
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={`p-${i}`} className="my-2.5 text-sm leading-relaxed text-zinc-300">
          {renderInlineElements(line)}
        </p>
      );
    }

    // Flush remaining blocks
    flushCodeBlock();
    flushTable();
    flushBlockquote();

    return elements;
  };

  /**
   * Parses inline markdown elements:
   * - Wikilinks [[Title#Heading|Alias]] and ![[embeds]]
   * - Standard links [alt](url) and images ![alt](url)
   * - Bold **text**, Italic *text*, Code `code`
   * - Tags #tag
   */
  const renderInlineElements = (text: string): React.ReactNode => {
    if (!text) return null;

    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;

    // Combined regex for all inline tokens
    // 1: Wikilink / Embed: (!?\[\[)([^\]|#\n]+)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]
    // 2: Standard Image: !\[([^\]]*)\]\(([^)]+)\)
    // 3: Standard Link: \[([^\]]+)\]\(([^)]+)\)
    // 4: Inline Code: `([^`]+)`
    // 5: Bold: \*\*([^*]+)\*\*
    // 6: Italic: \*([^*]+)\*
    // 7: Hashtag: (?<=^|\s)#([a-zA-Z0-9_\-\/]+)
    const inlineRegex = /(!?\[\[)([^\]|#\n]+)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|(?<=^|\s)#([a-zA-Z0-9_\-\/]+)/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = inlineRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }

      // 1. Wikilink or Embed
      if (match[1]) {
        const isEmbed = match[1] === '![[';
        const target = match[2].trim();
        const heading = match[3]?.trim();
        const alias = match[4]?.trim();
        const displayText = alias || (heading ? `${target} > ${heading}` : target);

        if (isEmbed) {
          // Check if it's an image or PDF attachment embed
          const isImage = /\.(png|jpe?g|gif|svg|webp)$/i.test(target);
          const isPdf = /\.pdf$/i.test(target);

          if (isImage) {
            const rawUrl = `/api/attachments/raw?path=${encodeURIComponent(target.startsWith('attachments/') ? target : `attachments/${target}`)}`;
            parts.push(
              <span key={`embed-img-${keyIdx++}`} className="block my-3">
                <img
                  src={rawUrl}
                  alt={target}
                  referrerPolicy="no-referrer"
                  className="rounded-lg border border-zinc-800 max-h-96 max-w-full object-contain mx-auto shadow-md hover:scale-[1.01] transition-transform bg-zinc-950 cursor-pointer"
                  onClick={() => window.open(rawUrl, '_blank')}
                  onError={(e) => {
                    // Fallback to placeholder if attachment not found
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="block text-center text-xs text-zinc-500 mt-1">{target}</span>
              </span>
            );
          } else if (isPdf) {
            const rawUrl = `/api/attachments/raw?path=${encodeURIComponent(target.startsWith('attachments/') ? target : `attachments/${target}`)}`;
            parts.push(
              <div key={`embed-pdf-${keyIdx++}`} className="my-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-red-400" />
                  <div>
                    <div className="text-sm font-medium text-zinc-200">{target}</div>
                    <div className="text-xs text-zinc-400">PDF Document</div>
                  </div>
                </div>
                <a
                  href={rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open PDF</span>
                </a>
              </div>
            );
          } else {
            // Note transclusion embed
            const resolved = resolveWikilink(target, noteIndex);
            if (resolved) {
              parts.push(
                <div key={`transclude-${keyIdx++}`} className="my-3 p-3 rounded-lg border border-violet-800/40 bg-zinc-900/80">
                  <div className="text-xs font-semibold text-violet-400 flex items-center gap-1.5 mb-1.5 pb-1 border-b border-zinc-800">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Embedded: {resolved.title}</span>
                  </div>
                  <div className="text-xs text-zinc-300 line-clamp-4 leading-relaxed font-sans">
                    {resolved.body.slice(0, 300)}...
                  </div>
                </div>
              );
            } else {
              parts.push(
                <span key={`unresolved-embed-${keyIdx++}`} className="text-xs text-zinc-500 italic">
                  ![[{target}]] (not found)
                </span>
              );
            }
          }
        } else {
          // Standard Wikilink [[...]]
          const resolved = resolveWikilink(target, noteIndex);
          if (resolved) {
            parts.push(
              <button
                key={`wikilink-${keyIdx++}`}
                type="button"
                id={`wikilink-${encodeURIComponent(target)}`}
                onClick={() => onNavigateToNote(resolved.path, heading)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-violet-300 hover:text-violet-100 bg-violet-950/40 hover:bg-violet-900/60 border border-violet-800/50 hover:border-violet-700 font-medium text-sm transition-all duration-150 cursor-pointer align-baseline group"
                title={`Open "${resolved.title}" (${resolved.path})`}
              >
                <span>{displayText}</span>
              </button>
            );
          } else {
            // Unresolved wikilink -> render with dashed underline & create action
            parts.push(
              <button
                key={`unresolved-wikilink-${keyIdx++}`}
                type="button"
                id={`unresolved-link-${encodeURIComponent(target)}`}
                onClick={() => onRequestCreateNote(target)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-zinc-400 hover:text-violet-300 bg-zinc-900 hover:bg-violet-950/30 border border-dashed border-zinc-700 hover:border-violet-600 text-sm transition-all duration-150 cursor-pointer align-baseline"
                title={`Note "${target}" does not exist yet. Click to create it.`}
              >
                <span>{displayText}</span>
                <Plus className="w-3 h-3 text-violet-400 opacity-70" />
              </button>
            );
          }
        }
      }
      // 2. Standard Markdown Image ![alt](url)
      else if (match[5] !== undefined && match[6] !== undefined) {
        const alt = match[5];
        let src = match[6];
        if (!src.startsWith('http') && !src.startsWith('/')) {
          src = `/api/attachments/raw?path=${encodeURIComponent(src.startsWith('attachments/') ? src : `attachments/${src}`)}`;
        }
        parts.push(
          <span key={`md-img-${keyIdx++}`} className="block my-3">
            <img
              src={src}
              alt={alt}
              referrerPolicy="no-referrer"
              className="rounded-lg border border-zinc-800 max-h-96 max-w-full object-contain mx-auto shadow-md"
            />
            {alt && <span className="block text-center text-xs text-zinc-500 mt-1">{alt}</span>}
          </span>
        );
      }
      // 3. Standard Markdown Link [label](url)
      else if (match[7] !== undefined && match[8] !== undefined) {
        const label = match[7];
        const href = match[8];
        const isExternal = href.startsWith('http');
        parts.push(
          <a
            key={`md-link-${keyIdx++}`}
            href={href}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-700/60 hover:decoration-cyan-400 transition-colors inline-flex items-center gap-0.5"
          >
            <span>{label}</span>
            {isExternal && <ExternalLink className="w-3 h-3 text-cyan-500" />}
          </a>
        );
      }
      // 4. Inline Code `code`
      else if (match[9] !== undefined) {
        parts.push(
          <code key={`inline-code-${keyIdx++}`} className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-300/90 font-mono text-xs">
            {match[9]}
          </code>
        );
      }
      // 5. Bold **text**
      else if (match[10] !== undefined) {
        parts.push(
          <strong key={`bold-${keyIdx++}`} className="font-semibold text-zinc-100">
            {renderInlineElements(match[10])}
          </strong>
        );
      }
      // 6. Italic *text*
      else if (match[11] !== undefined) {
        parts.push(
          <em key={`italic-${keyIdx++}`} className="italic text-zinc-200">
            {renderInlineElements(match[11])}
          </em>
        );
      }
      // 7. Hashtag #tag
      else if (match[12] !== undefined) {
        const tag = match[12];
        parts.push(
          <span
            key={`tag-${keyIdx++}`}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors border border-zinc-700 cursor-pointer align-baseline"
          >
            #{tag}
          </span>
        );
      }

      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  return <div className="markdown-body space-y-1 text-zinc-300">{renderFormattedMarkdown(content)}</div>;
};
