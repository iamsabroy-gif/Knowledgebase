# Mobile Layout Remediation — why `9850295` didn't fix it, and what will

Supersedes the open items in `docs/mobile-layout-optimization-plan.md`.
That plan was sound; the implementation in commit `9850295` was verified by a method
that structurally could not observe the bugs that matter. This document lists only
**confirmed defects**, each verified by reading the current tree.

---

## Root cause: three systemic errors, not a scatter of small misses

1. **`100vh` is the app's only height source, and the shell is `overflow-hidden`.**
   `MobileTabBar` is the last *in-flow* flex child, so on any mobile browser it renders
   below the visible viewport, behind the URL bar. The entire mobile navigation model is
   off-screen on first paint. This is almost certainly the reported symptom.
2. **`viewport-fit=cover` was added without the matching insets.** The page opted into the
   display-cutout area; `.pt-safe` / `.pl-safe` / `.pr-safe` are defined in `index.css`
   and used by **nothing**. Only `pb-safe` is applied. Net effect: notch handling is worse
   than before the commit.
3. **The `useMediaQuery` hook has zero consumers.** All responsive behavior is CSS-only,
   so both the inline *and* drawer copies of `Sidebar` and `BacklinksPanel` mount and run
   at every breakpoint.

Two bugs that were suspected and are **not** present: there is no md/`767px` off-by-one
(the hook is unused, so there is no dual source of truth), and there is no hydration flash
(client-only SPA, and `useMediaQuery` initializes synchronously from `matchMedia`).

---

## Confirmed defects, ranked

### P0-1 — Tab bar below the fold on every mobile browser
`src/App.tsx:579`
```
flex flex-col h-screen w-screen … overflow-hidden
```
`100vh` is the *large* viewport (URL bar collapsed); the visible viewport is 60–110px
shorter. The tab bar is clipped off the bottom and, because the root is `overflow-hidden`,
cannot be scrolled to — touch scrolls are captured by the nested `overflow-y-auto`
preview pane at `EditorView.tsx:556`.

**Fix:** `h-[100dvh] w-full overflow-hidden overscroll-none`. Drop `w-screen` (`100vw`
ignores the scrollbar and causes horizontal overflow on desktop). `src/index.css` has no
`html`/`body` rules at all — add them.

### P0-2 — Drawer backdrop covers the tab bar, whose `z-index` is inert
`src/components/MobileTabBar.tsx:29` — `md:hidden shrink-0 … z-30`
`src/App.tsx:644` and `:813` — `fixed inset-0 z-[45]`

`z-index` has no effect on a `position: static` element. With the Files drawer open, the
tab bar sits under the `bg-black/60` backdrop: taps on "Note" or "Graph" hit the backdrop.
The bar still *renders* highlighted (`activeMobileTab`, `App.tsx:535`), so it photographs
perfectly and is dead under a finger.

**Fix:** `fixed bottom-0 inset-x-0 z-50` on the nav; reserve its space with
`pb-[var(--tabbar-h)] md:pb-0` on the main region.

### P0-3 — `viewport-fit=cover` with no top/left/right insets
`index.html:5`, and unused utilities at `src/index.css:4-15`.
Portrait: header renders under the status bar. Landscape on a notched iPhone: header and
sidebar drawer are clipped by the cutout.

**Fix:** `pt-safe` on `Header.tsx:95` (and `h-14` → `min-h-14`; fixed height and padding
fight each other), `pl-safe pr-safe` on the root.

### P1-4 — Duplicate panel mounts run vault-wide scans twice
`<Sidebar>` at `App.tsx:611` (`hidden md:flex`) and `:657` (`md:hidden`).
`<BacklinksPanel>` at `App.tsx:785` (`hidden lg:flex`) and `:826` (`lg:hidden`).

`display:none` hides them in CSS; React still mounts and re-renders them.
`BacklinksPanel.tsx:33` runs `computeLinkGraph(allNotes)` and `:39` runs
`findUnlinkedMentions(...)` — vault-wide scans — **twice per note change**, on the slowest
device. `BacklinksPanel.tsx:187` embeds a `<GraphView compact>`, so an invisible drawer
copy can be running a D3 force simulation.

**Fix:** give the hook its first consumer. Render one instance, choose the wrapper off
`useIsCompact()`. Hoist `computeLinkGraph(notes)` into `App.tsx` as a `useMemo` and pass
it down so it runs once regardless.

### P1-5 — Editor text is not selectable
`select-none` at `App.tsx:579` was never removed (Phase 0 item 4 of the original plan).
The `[data-selectable-content]` escape hatch (`index.css:35`) is on the preview pane only
(`EditorView.tsx:555`); the `<textarea>` at `EditorView.tsx:511` inherits it.
Long-press to copy fails on iOS.

**Fix:** add `data-selectable-content` to the textarea and the Gemini message list. The
cascade already works — Tailwind v4 puts `.select-none` in `@layer utilities`, and the
unlayered attribute rule beats any layered rule.

### P1-6 — Hover-only affordances gated on width, breaking tablets
`Sidebar.tsx:190` and `:265` — `opacity-100 md:opacity-0 md:group-hover:opacity-100`.
On iPad (≥768px, touch, no hover) the per-note "⋯" and "+" buttons are permanently
invisible. The commit fixed phones and broke tablets in the same line.

**Fix:** `@media (hover: hover) and (pointer: fine)` instead of the `md:` prefix.

### P1-7 — Touch sizing keyed to `sm` while layout is keyed to `md`
`EditorView.tsx:384,387,556`, `Header.tsx:95`, `GraphView.tsx:396`, `ConflictModal.tsx:205`.
iPhone SE landscape (667px) and 8 Plus landscape (736px) fall in the 640–767px dead zone:
`md:hidden` still shows the mobile tab bar, but `sm:` has already shrunk every toolbar
button back to a ~24px desktop tap target.

**Fix:** move touch-sizing `sm:` prefixes to `md:`.

### P2-8 — Magic-number coupling
`GeminiChatbot.tsx:255-256` hardcodes `bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`
(72px) against `MobileTabBar.tsx:42`'s `min-h-[52px]`. ~20px dead gap that will diverge
silently on any tab bar edit.

**Fix:** `--tabbar-h: calc(52px + env(safe-area-inset-bottom, 0px))` on `:root`, consumed
by both. Also `h-[70vh] max-h-[85vh]` → `dvh`.

### P2-9 — Landscape phone chrome budget
Header 56 + editor sub-header 48 + toolbar 48 + tab bar 52 = **204px of chrome** against a
375px-tall landscape viewport, leaving 171px of note. Compounded by P0-1.

**Fix:** collapse the sub-header and toolbar into one row under `(max-height: 480px)`.

### Suspected — needs device verification
- **iOS virtual keyboard vs. `position: fixed`.** `GeminiChatbot.tsx:253`,
  `QuickSwitcherModal.tsx:76` (`pt-24` + `max-h-96` list on a 667px screen),
  `CreateNoteModal.tsx:48` (`items-center`). iOS does not shrink the layout viewport for
  the keyboard. Fix is the `visualViewport` API, not more Tailwind.
- **No body-scroll lock behind open drawers.** `.scroll-touch` (`index.css:18-21`) has
  `overscroll-behavior: contain` but is applied only in `EditorView`, not to the drawer
  panels at `Sidebar.tsx:392` / `BacklinksPanel.tsx:200`.
- **Long unbroken strings.** `<pre>` and tables handle overflow, but no
  `break-words` on paragraph/inline-code text; with root `overflow-hidden` a 200-char URL
  is clipped rather than scrollable.
- **Graph pinch-zoom.** `GraphView.tsx:553` uses `touch-none`, correctly handing gestures
  to `d3-zoom`. Needs a real two-finger test.

---

## Why the original verification passed everything

`tsc --noEmit` + `vite build` + headless Playwright at 375/820/1440 exercises none of the
above. Headless Chromium at 375px has `100vh === visualViewport.height` (P0-1 invisible),
resolves every `env(safe-area-inset-*)` to `0px` (P0-3 invisible), fires hover from a
mouse cursor (P1-6 invisible), has no 44px finger (P1-7 invisible), and no virtual
keyboard. Screenshots do not exercise tap targets at all — **P0-2 photographs perfectly.**

Of the three widths, one was mobile, portrait only. Nothing tested 320px, nothing tested
landscape, nothing tested the 640–767px band where P1-7 lives.

---

## Execution order

| # | Step | Effort | Fixes |
|---|---|---|---|
| 1 | `index.css`: `html, body { height: 100%; overscroll-behavior: none; }` + `:root { --tabbar-h }`. `App.tsx:579` → `h-[100dvh] w-full … pl-safe pr-safe`. `Header.tsx:95` → `min-h-14 pt-safe`. | 45 min | P0-1, P0-3 |
| 2 | `MobileTabBar.tsx:29` → `fixed bottom-0 inset-x-0 z-50`. Main region gets `pb-[var(--tabbar-h)] md:pb-0`. `GeminiChatbot.tsx:255` → `bottom-[calc(var(--tabbar-h)+0.75rem)]`, `vh`→`dvh`. | 30 min | P0-2, P2-8 |
| 3 | Single-mount `Sidebar` / `BacklinksPanel` via `useIsCompact()`; hoist `computeLinkGraph` to `App.tsx`. | 1.5 h | P1-4 |
| 4 | `data-selectable-content` on textarea + chat list; `(hover: hover)` for Sidebar affordances; sweep `sm:`→`md:` for sizing; `scroll-touch` on drawer panels. | 1 h | P1-5/6/7 |
| 5 | Playwright WebKit + 3 tests (see below). | 2 h | locks 1, 2, 7 |
| 6 | Real-device pass on iOS Safari. **Non-negotiable.** | 1 h | keyboard, rubber-band, long-press, pinch, rotate |

**~1 focused day.** Steps 1–2 (75 min) will most likely resolve the reported complaint on
their own — do them first and re-check on the phone before continuing.

---

## Testing

The repo has **zero test files**; `npm run lint` is `tsc --noEmit`. Do not build a suite.
Add `@playwright/test`, one config with the `iPhone 13` **WebKit** project, and one spec
with three tests (~120 lines):

1. **Overflow fence** — loop widths 320/360/375/390/414/430/667/736/768/1024 and assert
   `documentElement.scrollWidth <= clientWidth` in each of: empty state, note open, drawer
   open, graph open, chat open.
2. **Tap-not-screenshot** — open the Files drawer, then `page.tap('#mobile-tab-note')` and
   assert the state changed. This is P0-2 exactly, and the highest-value test here.
3. **Tap-target sweep** — every `button` below `md` has a bounding rect ≥ 44×44.

Safe-area insets cannot be simulated in Playwright — verify on a real device, or
temporarily override `env()` with a debug CSS variable to prove the wiring.

---

## Risk

Step 3 is the only one that can regress desktop. Moving from CSS-visibility to conditional
mounting means a desktop→mobile resize now unmounts `BacklinksPanel`, discarding its local
`activeTab` / `filterQuery` state (`BacklinksPanel.tsx:29-30`) and tearing down a D3
simulation. Lift that state into `App.tsx` in the same step, or accept the reset and
document it. Steps 1, 2, 4, 5 carry essentially no desktop risk.
