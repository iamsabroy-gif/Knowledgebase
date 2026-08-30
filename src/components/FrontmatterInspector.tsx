import React, { useState } from 'react';
import { NoteFrontmatter } from '../types';
import { Tag, Calendar, Layers, Hash, Info, ChevronDown, ChevronRight, Edit3 } from 'lucide-react';

interface FrontmatterInspectorProps {
  frontmatter: NoteFrontmatter;
  tags: string[];
  updatedAt: string;
  onUpdateFrontmatter?: (updated: NoteFrontmatter) => void;
  isEditing: boolean;
}

export const FrontmatterInspector: React.FC<FrontmatterInspectorProps> = ({
  frontmatter,
  tags,
  updatedAt,
  onUpdateFrontmatter,
  isEditing,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const keys = Object.keys(frontmatter || {});
  if (keys.length === 0 && tags.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-zinc-800/80 bg-zinc-900/50 overflow-hidden text-xs text-zinc-400 select-none">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/80 hover:bg-zinc-800/50 cursor-pointer transition-colors border-b border-zinc-800/60"
      >
        <div className="flex items-center gap-2 text-zinc-300 font-semibold tracking-wide">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
          <span>Properties</span>
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 font-mono">
            {keys.length}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span>Obsidian YAML</span>
        </div>
      </div>

      {isOpen && (
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-zinc-950/40">
          {/* Tags */}
          {tags && tags.length > 0 && (
            <div className="flex items-start gap-2 col-span-full">
              <div className="w-24 shrink-0 flex items-center gap-1.5 text-zinc-400 font-medium">
                <Tag className="w-3.5 h-3.5 text-violet-400" />
                <span>tags</span>
              </div>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {tags.map(t => (
                  <span key={t} className="px-2 py-0.5 rounded-full bg-violet-950/60 border border-violet-800/50 text-violet-300 text-[11px] font-medium">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          {frontmatter.status && (
            <div className="flex items-center gap-2">
              <div className="w-24 shrink-0 flex items-center gap-1.5 text-zinc-400 font-medium">
                <Info className="w-3.5 h-3.5 text-cyan-400" />
                <span>status</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider ${
                frontmatter.status === 'complete'
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                  : 'bg-amber-950/60 text-amber-400 border border-amber-800/50'
              }`}>
                {String(frontmatter.status)}
              </span>
            </div>
          )}

          {/* Spec Version */}
          {frontmatter.spec_version && (
            <div className="flex items-center gap-2">
              <div className="w-24 shrink-0 flex items-center gap-1.5 text-zinc-400 font-medium">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>spec_version</span>
              </div>
              <span className="font-mono text-zinc-300 text-[11px]">
                {String(frontmatter.spec_version)}
              </span>
            </div>
          )}

          {/* Aliases */}
          {frontmatter.aliases && (
            <div className="flex items-center gap-2 col-span-full">
              <div className="w-24 shrink-0 flex items-center gap-1.5 text-zinc-400 font-medium">
                <Hash className="w-3.5 h-3.5 text-amber-400" />
                <span>aliases</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [frontmatter.aliases]).map((a, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]">
                    "{String(a)}"
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Other arbitrary keys */}
          {Object.entries(frontmatter)
            .filter(([k]) => !['tags', 'status', 'spec_version', 'aliases', 'title'].includes(k))
            .map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <div className="w-24 shrink-0 text-zinc-400 font-medium truncate" title={k}>
                  {k}
                </div>
                <div className="font-mono text-zinc-300 text-[11px] truncate flex-1" title={typeof v === 'object' ? JSON.stringify(v) : String(v)}>
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
