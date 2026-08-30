import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Note } from '../types';
import { buildGraphData, GraphNode, GraphLink } from '../utils/graph-builder';
import {
  ZoomIn, ZoomOut, Maximize2, RotateCcw, Sliders, Filter,
  Layers, Search, Share2, Compass, Tag, FileText, Plus,
  Info, Eye, EyeOff, Sparkles, Check, ChevronDown
} from 'lucide-react';

interface GraphViewProps {
  notes: Note[];
  currentNotePath?: string | null;
  onNavigateToNote: (path: string, heading?: string) => void;
  onRequestCreateNote?: (title: string) => void;
  compact?: boolean; // When true, optimized for sidebars / compact panels
  defaultLocal?: boolean;
}

export const GraphView: React.FC<GraphViewProps> = ({
  notes,
  currentNotePath = null,
  onNavigateToNote,
  onRequestCreateNote,
  compact = false,
  defaultLocal = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Filter & Graph Configuration States
  const [isLocal, setIsLocal] = useState(defaultLocal);
  const [localHop, setLocalHop] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [includeUnresolved, setIncludeUnresolved] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  // Physics tuning state
  const [chargeStrength, setChargeStrength] = useState(-140);
  const [linkDistance, setLinkDistance] = useState(70);
  const [collisionRadius, setCollisionRadius] = useState(12);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      if (Array.isArray(n.tags)) {
        n.tags.forEach(t => t && set.add(t));
      }
    }
    return Array.from(set).sort();
  }, [notes]);

  // Build graph data
  const graphData = useMemo(() => {
    return buildGraphData(notes, {
      includeUnresolved,
      currentNotePath,
      localOnly: isLocal,
      maxHop: localHop,
      tagFilter: selectedTag,
      searchQuery,
    });
  }, [notes, includeUnresolved, currentNotePath, isLocal, localHop, selectedTag, searchQuery]);

  // Keep references for D3 simulation
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);

  // Initialize and update D3 Force Simulation
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 600;
    const height = containerRef.current.clientHeight || 450;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    // Setup SVG Definitions (Gradients, Glow Filters, Arrow markers)
    const defs = svg.append('defs');

    // Glowing filter for active / hovered nodes
    const glowFilter = defs.append('filter')
      .attr('id', 'node-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Marker for directional arrowheads
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#52525b')
      .attr('opacity', 0.6);

    defs.append('marker')
      .attr('id', 'arrow-highlight')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#a855f7');

    // Container Group for Zoom and Pan
    const g = svg.append('g').attr('class', 'graph-container');
    gRef.current = g;

    // Setup Zoom Behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Prepare Node & Link Data
    const nodes: GraphNode[] = graphData.nodes.map(d => ({ ...d }));
    const links: GraphLink[] = graphData.links.map(d => ({ ...d }));

    // Setup Force Simulation
    const simulation = d3.forceSimulation<GraphNode, GraphLink>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id((d: any) => d.id).distance(linkDistance))
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d: any) => d.size + collisionRadius).iterations(2))
      .alphaDecay(0.028);

    simulationRef.current = simulation;

    // Render Links (Lines)
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (d) => (d.isResolved ? '#3f3f46' : '#27272a'))
      .attr('stroke-width', (d) => (d.isResolved ? 1.2 : 1))
      .attr('stroke-dasharray', (d) => (d.isResolved ? 'none' : '3 3'))
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrow)');

    // Render Node Elements Group
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node-item')
      .attr('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Node Circles
    node.append('circle')
      .attr('r', d => d.size)
      .attr('fill', d => {
        if (d.isCurrent) return '#c084fc'; // Bright purple for current active note
        return d.isResolved ? d.color : '#3f3f46';
      })
      .attr('stroke', d => {
        if (d.isCurrent) return '#ffffff';
        if (!d.isResolved) return '#71717a';
        return '#18181b';
      })
      .attr('stroke-width', d => (d.isCurrent ? 2.5 : d.isResolved ? 1.5 : 1))
      .attr('stroke-dasharray', d => (!d.isResolved ? '2 2' : 'none'))
      .attr('filter', d => (d.isCurrent ? 'url(#node-glow)' : 'none'));

    // Node Labels
    const labels = node.append('text')
      .text(d => d.title)
      .attr('x', d => d.size + 4)
      .attr('y', 4)
      .attr('font-size', d => (d.isCurrent ? '12px' : compact ? '10px' : '11px'))
      .attr('font-weight', d => (d.isCurrent ? '600' : '400'))
      .attr('fill', d => (d.isCurrent ? '#f4f4f5' : d.isResolved ? '#d4d4d8' : '#71717a'))
      .attr('font-style', d => (!d.isResolved ? 'italic' : 'normal'))
      .attr('pointer-events', 'none')
      .attr('opacity', showLabels ? (compact ? 0.85 : 0.95) : 0);

    // Simulation Tick Updates
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Node Interaction Events
    node
      .on('mouseover', (_event, d) => {
        setHoveredNode(d);

        // Find connected node IDs
        const neighborIds = new Set<string>([d.id]);
        links.forEach(l => {
          const sId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
          const tId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
          if (sId === d.id) neighborIds.add(tId);
          if (tId === d.id) neighborIds.add(sId);
        });

        // Highlight connected nodes & dim others
        node.select('circle')
          .transition().duration(150)
          .attr('opacity', (n: GraphNode) => (neighborIds.has(n.id) ? 1 : 0.15))
          .attr('stroke', (n: GraphNode) => (n.id === d.id ? '#ffffff' : neighborIds.has(n.id) ? '#a855f7' : '#18181b'))
          .attr('stroke-width', (n: GraphNode) => (neighborIds.has(n.id) ? 2 : 1));

        node.select('text')
          .transition().duration(150)
          .attr('opacity', (n: GraphNode) => (neighborIds.has(n.id) ? 1 : 0.1));

        link
          .transition().duration(150)
          .attr('stroke', (l: any) => {
            const sId = typeof l.source === 'string' ? l.source : l.source.id;
            const tId = typeof l.target === 'string' ? l.target : l.target.id;
            return sId === d.id || tId === d.id ? '#a855f7' : '#27272a';
          })
          .attr('stroke-width', (l: any) => {
            const sId = typeof l.source === 'string' ? l.source : l.source.id;
            const tId = typeof l.target === 'string' ? l.target : l.target.id;
            return sId === d.id || tId === d.id ? 2 : 0.8;
          })
          .attr('stroke-opacity', (l: any) => {
            const sId = typeof l.source === 'string' ? l.source : l.source.id;
            const tId = typeof l.target === 'string' ? l.target : l.target.id;
            return sId === d.id || tId === d.id ? 1 : 0.1;
          })
          .attr('marker-end', (l: any) => {
            const sId = typeof l.source === 'string' ? l.source : l.source.id;
            const tId = typeof l.target === 'string' ? l.target : l.target.id;
            return sId === d.id || tId === d.id ? 'url(#arrow-highlight)' : 'url(#arrow)';
          });
      })
      .on('mouseout', () => {
        setHoveredNode(null);

        // Reset visual styling
        node.select('circle')
          .transition().duration(200)
          .attr('opacity', 1)
          .attr('stroke', (n: GraphNode) => (n.isCurrent ? '#ffffff' : !n.isResolved ? '#71717a' : '#18181b'))
          .attr('stroke-width', (n: GraphNode) => (n.isCurrent ? 2.5 : n.isResolved ? 1.5 : 1));

        node.select('text')
          .transition().duration(200)
          .attr('opacity', showLabels ? (compact ? 0.85 : 0.95) : 0);

        link
          .transition().duration(200)
          .attr('stroke', (l) => (l.isResolved ? '#3f3f46' : '#27272a'))
          .attr('stroke-width', (l) => (l.isResolved ? 1.2 : 1))
          .attr('stroke-opacity', 0.6)
          .attr('marker-end', 'url(#arrow)');
      })
      .on('click', (_event, d) => {
        setSelectedNode(d);
        if (d.isResolved && d.path) {
          onNavigateToNote(d.path);
        } else if (!d.isResolved && onRequestCreateNote) {
          onRequestCreateNote(d.title);
        }
      });

    // Auto-fit initial view
    const initialTransform = d3.zoomIdentity.translate(0, 0).scale(1);
    svg.call(zoom.transform, initialTransform);

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [
    graphData,
    linkDistance,
    chargeStrength,
    collisionRadius,
    showLabels,
    compact,
    onNavigateToNote,
    onRequestCreateNote,
  ]);

  // Handle Zoom In / Out / Reset
  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(250)
      .call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(350)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  const handleFitGraph = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current || graphData.nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const nodes = graphData.nodes;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    nodes.forEach(n => {
      if (n.x !== undefined && n.y !== undefined) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
    });

    if (minX === Infinity) return;

    const dx = maxX - minX || 100;
    const dy = maxY - minY || 100;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const scale = Math.min(2, Math.max(0.3, 0.8 / Math.max(dx / width, dy / height)));
    const translate = [width / 2 - scale * midX, height / 2 - scale * midY];

    d3.select(svgRef.current)
      .transition()
      .duration(400)
      .call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
  }, [graphData.nodes]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-[#101012] flex flex-col select-none overflow-hidden ${
        compact ? 'rounded-none' : 'rounded-lg'
      }`}
    >
      {/* Top Header Controls Bar — stacks vertically on narrow screens instead of
          overflowing horizontally; each cluster wraps independently. */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pointer-events-none">
        {/* Left: Mode Switcher & Stats */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* Local vs Global Toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-900/90 border border-zinc-800 backdrop-blur-md shadow-lg">
            <button
              type="button"
              id="btn-graph-global-mode"
              onClick={() => setIsLocal(false)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                !isLocal
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Vault Graph
            </button>
            <button
              type="button"
              id="btn-graph-local-mode"
              onClick={() => setIsLocal(true)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                isLocal
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Local Graph
            </button>
          </div>

          {/* Hop Selector in Local Mode */}
          {isLocal && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 backdrop-blur-md text-xs text-zinc-300">
              <span className="text-[11px] text-zinc-500 font-medium">Depth:</span>
              {[1, 2, 3].map(hop => (
                <button
                  key={hop}
                  type="button"
                  onClick={() => setLocalHop(hop)}
                  className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-mono transition-colors ${
                    localHop === hop
                      ? 'bg-violet-950 text-violet-300 border border-violet-700/60 font-bold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {hop}
                </button>
              ))}
            </div>
          )}

          {/* Node & Link Count Badge */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900/80 border border-zinc-800 backdrop-blur-md text-[11px] text-zinc-400 font-mono">
            <span className="text-zinc-200 font-semibold">{graphData.stats.totalNodes}</span> notes
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-200 font-semibold">{graphData.stats.totalLinks}</span> links
          </div>
        </div>

        {/* Right: Search, Filter & View Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 pointer-events-auto">
          {/* Quick Search */}
          {!compact && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Filter graph notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-28 sm:w-36 md:w-48 pl-8 pr-2 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-violet-600 backdrop-blur-md"
              />
            </div>
          )}

          {/* Tag Filter Dropdown */}
          {allTags.length > 0 && !compact && (
            <div className="relative">
              <select
                value={selectedTag || ''}
                onChange={(e) => setSelectedTag(e.target.value || null)}
                className="px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-300 outline-none focus:border-violet-600 backdrop-blur-md cursor-pointer"
              >
                <option value="">All Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Toggle Labels */}
          <button
            type="button"
            onClick={() => setShowLabels(prev => !prev)}
            className={`p-2 sm:p-1.5 rounded-lg border text-xs transition-colors backdrop-blur-md ${
              showLabels
                ? 'bg-zinc-800/90 border-zinc-700 text-violet-300'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title={showLabels ? 'Hide labels' : 'Show labels'}
          >
            {showLabels ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          {/* Toggle Unresolved Notes */}
          <button
            type="button"
            onClick={() => setIncludeUnresolved(prev => !prev)}
            className={`p-2 sm:p-1.5 rounded-lg border text-xs transition-colors backdrop-blur-md ${
              includeUnresolved
                ? 'bg-zinc-800/90 border-zinc-700 text-amber-300'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
            title={includeUnresolved ? 'Hide uncreated / phantom notes' : 'Show uncreated notes'}
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          {/* Settings / Physics Controls Toggle */}
          <button
            type="button"
            id="btn-graph-physics-controls"
            onClick={() => setIsControlsOpen(prev => !prev)}
            className={`p-2 sm:p-1.5 rounded-lg border text-xs transition-colors backdrop-blur-md ${
              isControlsOpen
                ? 'bg-violet-950/80 border-violet-700 text-violet-300'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Graph Physics & Tuning"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          {/* Folder Colors Legend Toggle */}
          <button
            type="button"
            onClick={() => setIsLegendOpen(prev => !prev)}
            className={`p-2 sm:p-1.5 rounded-lg border text-xs transition-colors backdrop-blur-md ${
              isLegendOpen
                ? 'bg-violet-950/80 border-violet-700 text-violet-300'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Color Legend"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* D3 SVG Canvas. touch-none hands all touch gestures here to d3-zoom's own
          pan/pinch handling instead of letting the browser try to scroll the page. */}
      <svg
        ref={svgRef}
        className="w-full h-full touch-none cursor-grab active:cursor-grabbing focus:outline-none"
        tabIndex={0}
      />

      {/* Floating Bottom-Right Zoom Controls */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5 bg-zinc-900/90 border border-zinc-800 backdrop-blur-md rounded-lg p-1 shadow-xl">
        <button
          type="button"
          onClick={() => handleZoom(1.25)}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(0.8)}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleFitGraph}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          title="Fit Graph to Viewport"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          title="Reset Zoom & Pan"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Bottom-Left Hover / Selection Tooltip HUD */}
      {(hoveredNode || selectedNode) && (
        <div className="absolute bottom-4 left-4 z-10 max-w-xs p-3 rounded-xl bg-zinc-900/95 border border-zinc-700/80 shadow-2xl backdrop-blur-md text-xs text-zinc-200 space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
          {(() => {
            const active = hoveredNode || selectedNode!;
            return (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-sm truncate text-white">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: active.color }}
                    />
                    <span className="truncate">{active.title}</span>
                  </div>
                  {active.isResolved ? (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 text-[10px] font-mono shrink-0">
                      Resolved
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800/40 text-[10px] font-mono shrink-0">
                      Uncreated
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-zinc-400 truncate">
                  <span className="text-zinc-500">Folder:</span> {active.folder}
                </div>

                <div className="flex items-center gap-3 pt-1 border-t border-zinc-800 text-[11px] text-zinc-400 font-mono">
                  <div>
                    <span className="text-zinc-200 font-bold">{active.inDegree}</span> incoming
                  </div>
                  <div>
                    <span className="text-zinc-200 font-bold">{active.outDegree}</span> outgoing
                  </div>
                  <div>
                    <span className="text-violet-300 font-bold">{active.degree}</span> total
                  </div>
                </div>

                {active.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {active.tags.slice(0, 4).map((t, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 text-[10px]"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-1.5 text-[10px] text-violet-400 font-medium flex items-center gap-1">
                  {active.isResolved ? (
                    <>
                      <FileText className="w-3 h-3" />
                      <span>Click to open note in editor</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3" />
                      <span>Click to create this missing note</span>
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Physics Tuning Controls Drawer */}
      {isControlsOpen && (
        <div className="absolute top-14 right-3 z-20 w-64 p-3.5 rounded-xl bg-zinc-900/95 border border-zinc-700/80 shadow-2xl backdrop-blur-md text-xs text-zinc-300 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-violet-400" />
              Force Simulation Controls
            </span>
            <button
              type="button"
              onClick={() => setIsControlsOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Repulsion Strength</span>
              <span className="font-mono">{Math.abs(chargeStrength)}</span>
            </div>
            <input
              type="range"
              min={-300}
              max={-30}
              step={10}
              value={chargeStrength}
              onChange={(e) => setChargeStrength(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg appearance-none"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Link Distance</span>
              <span className="font-mono">{linkDistance}px</span>
            </div>
            <input
              type="range"
              min={30}
              max={180}
              step={5}
              value={linkDistance}
              onChange={(e) => setLinkDistance(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg appearance-none"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Node Collision Radius</span>
              <span className="font-mono">{collisionRadius}px</span>
            </div>
            <input
              type="range"
              min={4}
              max={30}
              step={2}
              value={collisionRadius}
              onChange={(e) => setCollisionRadius(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg appearance-none"
            />
          </div>

          <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-[10px] text-zinc-500">
            <button
              type="button"
              onClick={() => {
                setChargeStrength(-140);
                setLinkDistance(70);
                setCollisionRadius(12);
              }}
              className="hover:text-zinc-300 underline"
            >
              Reset Physics Defaults
            </button>
          </div>
        </div>
      )}

      {/* Legend Drawer */}
      {isLegendOpen && (
        <div className="absolute top-14 right-3 z-20 w-60 p-3.5 rounded-xl bg-zinc-900/95 border border-zinc-700/80 shadow-2xl backdrop-blur-md text-xs text-zinc-300 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              Folder Color Legend
            </span>
            <button
              type="button"
              onClick={() => setIsLegendOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
            >
              ✕
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {Object.entries(graphData.folderColors).map(([folder, color]) => (
              <div key={folder} className="flex items-center gap-2 text-[11px]">
                <span
                  className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="text-zinc-300 truncate">{folder}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-zinc-800">
              <span className="w-3 h-3 rounded-full shrink-0 border border-dashed border-zinc-400 bg-zinc-700" />
              <span className="text-zinc-400 italic">Uncreated / Dangling</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-3 h-3 rounded-full shrink-0 bg-purple-400 ring-2 ring-white" />
              <span className="text-purple-300 font-medium">Current Active Note</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
