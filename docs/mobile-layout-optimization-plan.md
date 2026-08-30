# Mobile Browser Layout Optimization — Implementation Plan

_KnowledgeBase (React 19 + Vite + Tailwind v4). An Obsidian-style markdown vault with a fixed three-pane desktop shell._

## 1. Problem summary

The app is built exclusively for wide desktop viewports. The root shell (`src/App.tsx`)
renders a permanent three-column layout — **Sidebar (fixed `w-72`) │ Editor (`flex-1`) │
Backlinks (fixed `w-80`)** — with every column marked `shrink-0`. On a 375–430px phone
the two side panels alone consume 288 + 320 = **608px of fixed width**, leaving the editor
with negative space. The result is horizontal overflow, a crushed editor, and controls that
are impossible to tap.

Secondary issues compound this:

- The **header** (`Header.tsx`, `h-14`) packs ~8 action buttons in one non-wrapping row.
  Labels collapse via `hidden sm:inline`, but the icon buttons themselves never collapse, so
  the row still overflows on narrow screens.
- Several core features are **keyboard-only** (`Cmd/Ctrl+K` quick switcher, `+G` graph, `+J`
  Gemini, `+E` mode toggle). The quick-switcher entry bar is `hidden md:block`, so on a phone
  there is *no touch affordance* to reach search.
- The editor offers a **Split** mode (side-by-side edit/preview) that is unusable below
  ~700px.
- The root element carries `select-none`, which blocks text selection of note content on
  touch devices (can't long-press to copy).
- No **safe-area-inset** handling — the floating Gemini launcher (`bottom-5 right-5`) and
  header collide with iOS notches / home indicators.
- Tap targets are `p-0.5`–`p-1.5` icon buttons (~24–28px), below the 44px accessibility
  minimum.

The viewport meta tag in `index.html` is already correct (`width=device-width,
initial-scale=1.0`), and modals already use `max-w-* w-full p-4`, so those need only minor
polish rather than rework.

## 2. Goals & non-goals

**Goals**
- Usable single-pane experience on phones (≤640px) with drawer access to file tree and
  backlinks.
- No horizontal page scroll at any width from 320px up.
- Every desktop feature reachable by touch (search, graph, Gemini, note actions).
- Tablet (641–1024px) shows a two-pane layout; desktop (≥1025px) is unchanged.
- Meet 44px tap targets and iOS safe-area padding.

**Non-goals**
- No visual redesign of the dark theme or component styling beyond what responsiveness needs.
- No change to data/sync/auth logic.
- Not a PWA / offline effort (can be a follow-up).

## 3. Breakpoint strategy

Use Tailwind's default breakpoints, driving layout off `md` (768px) and `lg` (1024px):

| Range | Name | Layout |
|-------|------|--------|
| < 768px (`base`) | Mobile | Single active pane. Sidebar & backlinks become slide-over drawers. Bottom tab bar for pane switching. |
| 768–1023px (`md`) | Tablet | Sidebar visible (collapsible), editor `flex-1`, backlinks as a toggle drawer. |
| ≥ 1024px (`lg`) | Desktop | Current three-pane layout, unchanged. |

A small `useMediaQuery`/`useIsMobile` hook (in `src/utils/`) backs the JS-level decisions
(which pane is active, whether a drawer or inline panel renders). Pure show/hide is done with
Tailwind classes where possible to avoid layout-shift on hydration.

## 4. Phased implementation

### Phase 0 — Foundations (low risk, do first)
1. **`index.html`** — add `viewport-fit=cover` to the viewport meta to enable
   `env(safe-area-inset-*)`.
2. **`src/index.css`** — beyond the current `@import "tailwindcss";`, add:
   - Safe-area utilities (`.pb-safe`, `.pt-safe`) using `env(safe-area-inset-*)`.
   - `-webkit-overflow-scrolling: touch` / `overscroll-behavior: contain` on scroll panes.
   - A `@media (max-width: 767px)` rule to re-enable text selection inside note content
     (`.select-text-mobile` or scope: `main [data-note-content] { user-select: text; }`).
3. **`src/utils/use-media-query.ts`** — add `useIsMobile()` / `useIsTablet()` hooks
   (matchMedia + resize listener, SSR-safe default).
4. **`src/App.tsx`** — remove the blanket `select-none` from the root `<div>` (line ~510);
   re-apply `select-none` only on chrome (header, sidebar, tab bar), not on the editor/preview.

### Phase 1 — Responsive app shell (`src/App.tsx`) — core of the work
Introduce mobile pane state and restructure the main region (lines ~537–685):

- Add state: `mobilePane: 'files' | 'note' | 'backlinks'` (default `'note'`) and
  `isSidebarDrawerOpen` for tablet.
- **Sidebar**: on mobile render as a left slide-over drawer (fixed, `translate-x` transition,
  backdrop, `w-[85vw] max-w-xs`); on `md` inline as today. Close on note select.
- **Editor/Graph center**: always `flex-1`; on mobile it is the default full-width pane.
- **BacklinksPanel**: on mobile render as a right slide-over drawer or bottom sheet, opened
  from a button in the editor sub-header; hide the inline `w-80` column below `lg`.
- **Mobile bottom tab bar** (new small component, `pb-safe`): Files · Note · Links · Graph ·
  Ask — gives touch access to everything the keyboard shortcuts do. Shown only `< md`.
- Wrap drawers/overlays with backdrop click-to-close and `Esc` handling.

### Phase 2 — Header (`src/components/Header.tsx`)
- Below `md`: show only vault switcher (left) + a **hamburger/overflow menu** (right)
  collecting Share, Graph, Gemini, Admin, Settings, and Sync actions into a dropdown sheet.
- Keep the Google auth avatar visible.
- Add a compact **search icon button** (opens quick switcher) visible on mobile to replace the
  `hidden md:block` search bar.
- Ensure the header never exceeds one row: `flex-wrap` guard or the overflow menu.

### Phase 3 — Editor (`src/components/EditorView.tsx`)
- Force **preview** as the default mobile view; hide the **Split** toggle below `md` (split is
  unusable on narrow screens) — keep Preview/Edit only.
- Reduce content padding on mobile: `p-4` instead of `p-6/md:p-8` for textarea and preview
  panes.
- The formatting toolbar already uses `overflow-x-auto`; verify momentum scroll + add
  `shrink-0` tap-sized buttons (min `w-9 h-9` / `p-2` on mobile).
- Add the backlinks-drawer trigger button to the editor sub-header (mobile/tablet only).
- Autocomplete popover (`absolute left-10 top-20 w-80`) — constrain to `max-w-[90vw]` so it
  never overflows on mobile.

### Phase 4 — Overlays: Graph, Chatbot, Modals
- **GraphView** (`src/components/GraphView.tsx`): the D3 `<svg>` is already `w-full h-full`;
  reflow the floating control clusters (`absolute top-3 …`) to wrap/stack on mobile and shrink
  the search input (`w-36`). Ensure pinch-zoom/drag still works alongside page scroll
  (`touch-action` on the svg container).
- **GeminiChatbot** (`src/components/GeminiChatbot.tsx`): already responsive
  (`w-[92vw] … inset-4 sm:inset-10`). Add `pb-safe` to the input row and confirm the launcher
  button clears the new bottom tab bar (raise its `bottom-*` above the tab bar on mobile).
- **Modals**: most use `max-w-* w-full p-4` and are fine. Two need attention:
  - **ConflictModal** (`max-w-5xl h-[85vh]`, side-by-side diff) — stack the two diff columns
    vertically below `md`.
  - Tall modals (`max-h-[90vh]`) — confirm internal scroll and add `pb-safe` to sticky
    footers/action rows.
  - Convert the most-used small modals (QuickSwitcher, CreateNote) to a **bottom-sheet**
    presentation on mobile (slide up from bottom) for reachability — optional polish.

### Phase 5 — Touch & a11y polish
- Bump all icon-only chrome buttons to ≥44px hit area on mobile (`p-2.5`/`min-w-11`).
- Add `:active` feedback and remove hover-only reveals (`opacity-0 group-hover:opacity-100`
  in Sidebar note actions never appear on touch — show a persistent `⋯` button on mobile, or
  use long-press → context menu).
- Verify focus-visible rings and that drawers trap focus.

## 5. Files to change

| File | Change |
|------|--------|
| `index.html` | `viewport-fit=cover` |
| `src/index.css` | safe-area + scroll + selection utilities |
| `src/utils/use-media-query.ts` | **new** hook |
| `src/App.tsx` | responsive shell, pane state, drawers, bottom tab bar, `select-none` scoping |
| `src/components/Header.tsx` | mobile overflow menu + search button |
| `src/components/Sidebar.tsx` | drawer mode, persistent note-action button on touch |
| `src/components/BacklinksPanel.tsx` | drawer/bottom-sheet mode below `lg` |
| `src/components/EditorView.tsx` | hide split on mobile, padding, toolbar tap targets, backlinks trigger, autocomplete width |
| `src/components/GraphView.tsx` | control reflow, touch-action |
| `src/components/GeminiChatbot.tsx` | safe-area, launcher offset |
| `src/components/ConflictModal.tsx` | stacked diff on mobile |
| `src/components/*Modal.tsx` | optional bottom-sheet + `pb-safe` footers |
| `src/components/MobileTabBar.tsx` | **new** bottom navigation |

## 6. Testing

- **Manual**: Chrome/Safari DevTools device toolbar at 320 / 375 / 390 / 430 / 768 / 1024px;
  real iOS Safari + Android Chrome pass for safe-area and momentum scroll.
- **Checks**: no horizontal scroll at any width; drawers open/close/backdrop/Esc; every
  keyboard-shortcut feature reachable by tap; editor typing + autocomplete on-screen keyboard;
  graph pinch-zoom; modal scroll on short viewports; text selection works in preview.
- **Regression**: desktop (≥1025px) layout pixel-unchanged.
- **Lint/type**: `bun run lint` (`tsc --noEmit`) must pass; `bun run build` succeeds.

## 7. Rollout order & effort

1. Phase 0 + Phase 1 (shell) — the highest-impact change; makes the app usable on a phone. **~1.5 days**
2. Phase 2 (header) + Phase 3 (editor). **~1 day**
3. Phase 4 (overlays) + Phase 5 (polish). **~1 day**

Each phase is independently shippable and gated behind breakpoints, so desktop is never at
risk. Recommend landing Phase 0+1 as the first PR for early validation on-device.
