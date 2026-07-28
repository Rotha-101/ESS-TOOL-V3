# ESS Toolbox — Design System

The reference for every UI contribution. If a screen needs something this
document does not describe, extend the system here first, then use it — not the
other way round.

Status: **foundation for Stage 2 onward.** Supersedes ad-hoc styling.

---

## 1. Principles

**Built for operators, not engineers.** The people using this every day are
plant and office staff. Anything that requires understanding how the software
works internally is a defect, not a feature.

**Guide toward action.** A screen should answer *what do I do next*, not *here
is everything we know*. Statistics earn their place only when they help someone
finish a task.

**Progressive disclosure.** The default view stays clean. Advanced capability
stays reachable, not visible. A control that most users never need does not
belong on the first screen they see.

**Reassure, don't alarm.** Status text exists to tell someone their work is
safe. If nothing is required of the user, the interface must not look like
something is.

**Nothing decorative ships.** A control that changes no behaviour is worse than
a missing one: users cannot tell which of them work, so they trust none of them.
Stage 1 removed 17 such controls. Do not reintroduce the pattern.

**One system, every screen.** No page-specific components where a reusable
pattern fits. If two screens need the same thing twice, it belongs in
`components/ui` or `components/patterns`.

---

## 2. Design tokens

All tokens live in `src/index.css` under `@theme inline`. Nothing else defines a
colour, size, duration or shadow. Arbitrary values (`text-[9px]`, `h-[30px]`) are
not permitted in shell code.

### 2.1 Density knobs

Density is **three variables**, not three stylesheets. Everything else derives
from them, so adding a density mode never means duplicating rules.

```css
[data-density="compact"]     { --d-space: 0.1875rem; --d-text: 0.75rem;   --d-control: 1.875rem; }
[data-density="comfortable"] { --d-space: 0.25rem;   --d-text: 0.8125rem; --d-control: 2.25rem;  }
[data-density="large"]       { --d-space: 0.3125rem; --d-text: 0.9375rem; --d-control: 2.75rem;  }
```

Applied to `document.documentElement` exactly as the theme class is.
**Comfortable is the default.**

> Implementation note: Tailwind v4 compiles spacing utilities to
> `calc(var(--spacing) * N)`, which makes `--spacing` switchable at runtime.
> Verify this in devtools on the first commit — inspect a compiled `h-8` and
> confirm it reads `calc(...)` and not a literal. If the build inlines it,
> fall back to explicit `--size-control-*` tokens applied by hand in shell
> files. Same outcome, more edits, no risk.

### 2.2 Typography

| Token | Compact | Comfortable | Large | Use |
|---|---|---|---|---|
| `--text-xs` | 12px | 12px | 13px | Metadata, timestamps, captions |
| `--text-sm` | 12px | 13px | 15px | **Body default** |
| `--text-base` | 13px | 14px | 16px | Emphasis, card titles |
| `--text-lg` | 15px | 16px | 18px | Page titles |
| `--text-xl` | 18px | 20px | 22px | Welcome, empty states |

**12px is the floor in every mode, including Compact.** Before Stage 2 there
were 731 elements below it and 84 at or above — that ratio is the single largest
accessibility problem in the application.

Families: `--font-sans` (Inter) for everything; `--font-mono` (JetBrains Mono)
for identifiers, codes and numeric columns only — never for prose.

### 2.3 Spacing

`--spacing` derives from `--d-space`, so `p-2`, `gap-3`, `h-8` all scale with
density automatically. Scale steps: 1, 2, 3, 4, 6, 8, 12, 16.

**Scoping.** `.app-shell` carries the density; `.module-surface` resets
`--spacing` to a fixed `0.25rem` for the ten analysis modules, whose Plotly
containers are pixel-tuned and must not move.

### 2.4 Sizing

| Token | Comfortable | Use |
|---|---|---|
| `--size-control-sm` | 28px | Inline chips, table row actions |
| `--size-control-md` | 36px | **Default** — inputs, buttons, selects |
| `--size-control-lg` | 40px | Primary actions, activation screen |
| `--size-icon-sm` | 12px | Inline with `--text-xs` |
| `--size-icon-md` | 16px | **Default** — buttons, nav |
| `--size-icon-lg` | 20px | Card headers, empty states |
| `--size-sidebar` | 224px | Navigation rail |
| `--size-header` | 52px | Application header |

Minimum interactive target is `--size-control-md` (36px). Anything smaller must
sit inside a larger hit area.

### 2.5 Radius

```
--radius-sm   4px    badges, pills
--radius-md   6px    inputs, buttons          ← default
--radius-lg   8px    cards, panels
--radius-xl  12px    modals, activation
--radius-full        avatars, status dots
```

Raised from the previous 2–4px, which read as an engineering console.

### 2.6 Elevation

```
--elevation-0   none                              flat, on-surface
--elevation-1   0 1px 2px rgb(0 0 0 / 0.05)       cards
--elevation-2   0 4px 12px rgb(0 0 0 / 0.08)      dropdowns, popovers
--elevation-3   0 12px 32px rgb(0 0 0 / 0.16)     modals
```

Elevation carries hierarchy so borders do not have to. Prefer raising a surface
over outlining it.

### 2.7 Animation

```
--duration-instant   90ms    hover, focus
--duration-fast     140ms    toggles, tabs        ← default
--duration-normal   220ms    panels, drawers
--duration-slow     320ms    page transitions

--ease-out       cubic-bezier(0.16, 1, 0.3, 1)      entering  ← default
--ease-in-out    cubic-bezier(0.65, 0, 0.35, 1)     moving
```

Nothing exceeds `--duration-slow`. Anything that animates must be disabled under
`prefers-reduced-motion: reduce`.

### 2.8 Semantic and status colours

| Token | Meaning |
|---|---|
| `--status-ok` | Saved, connected, complete |
| `--status-busy` | Syncing, loading, in progress |
| `--status-warn` | Needs attention, retrying, offline |
| `--status-danger` | Failed, destructive action |
| `--status-idle` | Not connected, disabled, unknown |

Status is **never colour alone** — always an icon or text label too. Roughly 1
in 12 men has a colour vision deficiency, and plant staff skew male.

Surfaces: `--background`, `--panel`, `--surface`, `--surface-raised`,
`--border`, `--border-strong`, `--foreground`, `--foreground-muted`,
`--foreground-subtle`, `--accent`, `--accent-foreground`.

### 2.9 Z-index

```
--z-base        0     content
--z-sticky     10     table headers, status bars
--z-dropdown   20     selects, menus
--z-overlay    30     scrims
--z-modal      40     dialogs, settings
--z-toast      50     notifications
--z-tooltip    60     always on top
```

No `z-[9999]`. Ever.

### 2.10 Breakpoints

A desktop application in a resizable window, not a responsive website.

```
--bp-sm    900px    sidebar collapses to icons
--bp-md   1200px    default window
--bp-lg   1600px    Home widens to 4 action cards
```

Must remain usable at **1024×720**, the smallest realistic plant laptop.

---

## 3. Density modes

| Mode | For | Body | Control |
|---|---|---|---|
| Compact | Engineers scanning long tables | 12px | 30px |
| **Comfortable** | **Default — everyone** | **13px** | **36px** |
| Large | Shared screens, 4K, accessibility needs | 15px | 44px |

Chosen in Settings → Appearance. Applied as `data-density` on the root element,
persisted like the theme. Because every size token derives from three variables,
adding a fourth mode is three lines.

---

## 4. Component catalog

Every component must be **reusable, composable, accessible, theme-aware and
density-aware**. A component failing any of the five does not belong here.

### Primitives — `src/components/ui/`

| Component | Notes |
|---|---|
| `Button` | `primary` / `secondary` / `ghost` / `danger`; `sm` `md` `lg`; loading state |
| `Card` | Surface + optional header/footer. Elevation, not border |
| `Input` `Label` `Select` `Switch` | Labelled, focus-visible, 36px default |
| `Badge` `StatusPill` | Icon + text, never colour alone |
| `Alert` | `info` / `warn` / `danger`; a title and one action at most |
| `EmptyState` | Icon, one sentence, one primary action |
| `Spinner` `Skeleton` | Skeleton for known layouts, spinner for unknown waits |
| `Tooltip` `Dialog` `DropdownMenu` | Focus-trapped, Esc closes, returns focus |

Existing `select`, `dialog`, `tooltip`, `button`, `card`, `badge`, `progress`,
`tabs`, `scroll-area`, `separator`, `input`, `skeleton`, `table` are kept and
brought onto tokens. **`sidebar.tsx` (723 lines) and `sheet.tsx` are deleted** —
unused, and built for a responsive web app this is not.

Note the library is **@base-ui/react**, not Radix. `npx shadcn add` emits Radix
imports and must not be used; follow `select.tsx` as the house pattern.

### Shell — `src/components/shell/`

`AppShell` · `AppHeader` · `AppSidebar` · `NavGroup` · `NavItem` · `UserChip` ·
`ProjectPicker` · `StatusIndicator`

### Patterns — `src/components/patterns/`

`PageHeader` · `ActionCard` · `RecentList` · `SectionCard` · `ConfirmDialog`

---

## 5. Navigation philosophy

Organised by **what the user is doing**, never by internal module names.

```
🏠  Home

    DATA          getting information in
    ANALYSIS      turning it into results
    RESULTS       finding and sharing them

    AI
    SETTINGS
    ADMINISTRATION   (role-gated, Stage 3)
```

Rules:

1. **Groups are permanent.** Future features join an existing group. Adding a
   nav group is a design decision, not an implementation detail.
2. **Labels are for users.** "Validation File Debug" → *Import & Validate*.
3. **Internal ids are frozen.** `signal`, `power`, `soc`, `export` are legacy and
   do not match their labels — but `activeTab` is persisted, so renaming them
   puts existing users on a blank screen. Ids are a private key; labels are the
   product.
4. **Unknown id falls back to Home.** Guards a stale or hand-edited value.
5. **Role filtering is declarative**, one predicate over the config — never
   conditional JSX.

### Landing behaviour

| Situation | Opens |
|---|---|
| First launch ever | **Home** |
| Returning user | Last opened screen |
| Unknown / invalid saved tab | **Home** |
| Read-only account | Graph History |

---

## 6. Accessibility

First-class, not polish. Verified, not eyeballed.

**Keyboard.** Every action reachable without a mouse. Logical tab order. Arrow
keys within the sidebar. `Esc` closes any overlay and returns focus to whatever
opened it. No keyboard trap anywhere.

**Focus.** A visible ring on every interactive element, minimum 2px, contrasting
against both themes. `outline-none` without a replacement is a defect — several
exist in the current code.

**Screen readers.** Every icon-only control carries `aria-label`. Status regions
use `aria-live="polite"`. Decorative icons are `aria-hidden`. Inputs have real
`<label>` associations, not adjacent text.

**Contrast.** WCAG AA: 4.5:1 for body, 3:1 for large text and UI boundaries. The
current muted greys (`foreground/30`–`/45`) must be audited; several likely fail.

**Scaling.** Usable at **100%, 125%, 150% and 200%** Windows display scaling, and
at browser zoom to 200%. Layouts must reflow, not clip. This is not optional —
plant laptops commonly run 125% or 150%.

**Both themes.** Every state checked in dark and light. Dark is the default;
light is currently under-tested.

**Motion.** Honour `prefers-reduced-motion: reduce`.

---

## 7. Status language

Users need three facts: is my work safe, is something happening, can I carry on.

| State | Say | Never say |
|---|---|---|
| Saved locally, synced | **Saved** | Synced · phase: ok |
| Pass running | **Syncing…** | Probing · fetching refs |
| No connection | **Working offline** | Transport unreachable |
| Failures, retrying | **Retrying…** | Sync error · 3 failed |
| Sync off | **This computer only** | Sync disabled |
| Not activated | **Not connected** | No access key configured |

Rules:

- **Never expose** repository, payload, probe, schema, transport, phase,
  writable, HTTP status codes, tokens or stack traces.
- **If nothing is required of the user, do not alarm them.** Automatic retry is
  not an error state.
- **Every error names the next action**, or says none is needed:
  *"Unable to connect right now. Your work is saved and will sync automatically."*

This is enforced mechanically: `scripts/test-appstate.mjs` fails the build if a
forbidden term appears in any user-facing message across all state combinations.
Extend that guard rather than trusting review.

---

## 8. Interaction principles

**One primary action per screen**, visually unmistakable. Secondary actions are
`ghost` or `secondary` and never compete.

**Destructive actions** are `danger`, always confirmed, and the confirmation
names what will happen — *"Remove this graph from this computer"*, not
*"Are you sure?"*

**Loading.** Under ~200ms show nothing — a flash is worse than a wait. Skeletons
where the layout is known; spinners where it is not. Long operations report
progress and what they are doing, in plain words.

**Empty states** always offer the action that fills them. *"No graphs yet"* plus
an Import button, never a bare message.

**Optimistic where safe.** Local work appears saved immediately, because it is —
local storage is written before any network call.

**Never block on the network.** Every analysis feature works offline. The
interface must never wait on a request to become usable.

---

## 9. Performance

**Lazy load every module.** Stage 2 baseline: 8.15 MB in a single chunk, zero
code splitting, `React.lazy` used nowhere. Plotly, XLSX and the AI SDK all load
before first paint. Each module becomes its own chunk.

**Predictive preload.** When a module opens, begin fetching the likely next one
during idle time:

```
Import & Validate  →  Daily Evaluation
Daily Evaluation   →  Reports & Export, Graph History
Graph History      →  Daily Evaluation
```

Use `requestIdleCallback`; never contend with the module the user is actually
waiting for.

**Rendering.** Subscribe to narrow store slices, not whole objects. Memoise list
rows. `activeTab` currently re-renders the entire tree.

**Targets.** First paint under 1.5s on a plant laptop; module switch under
300ms once cached; startup chunk under 1 MB.

---

## 10. Contributing

Before adding UI:

1. Does a primitive or pattern already exist? Use it.
2. Does it need a new token? Add it here first.
3. Does it work in all three densities, both themes, and at 200% scaling?
4. Is it keyboard reachable with a visible focus ring?
5. Does any new user-facing string pass the status-language rules in §7?

If a screen needs something this document does not cover, extend the document.
The system is the product; screens are just arrangements of it.
