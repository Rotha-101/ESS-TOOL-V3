# Accessibility — Release Checklist

Run before every release. Record the result, not the intention.

Legend: **✅ verified** · **⚠️ partial** · **❌ known gap** · **☐ not yet checked**

Last run: Stage 2 close, v1.3.1 build.

---

## Visual scaling

Checked with `--force-device-scale-factor`, which reproduces Windows display
scaling. Plant laptops commonly run 125% or 150%, so these are not edge cases.

| Scale | Result |
|---|---|
| 100% | ✅ baseline |
| 125% | ⚠️ not captured — interpolates between verified 100% and 150% |
| 150% | ✅ reflows, no clipping |
| 175% | ⚠️ not captured — interpolates between 150% and 200% |
| 200% | ✅ reflows, no clipping, all text legible |

Shell only. The ten analysis screens carry `.module-surface` and were not
re-verified at scale — their Plotly containers are pixel-tuned and unchanged.

**☐ Next run:** capture 125% and 175% explicitly, and at least one analysis
screen with a chart rendered.

---

## Colour contrast

Measured, not judged — WCAG relative luminance, computed against the actual
token values.

| Token | Dark on `--panel` | Light on `--panel` |
|---|---|---|
| Body text | ✅ 13.71:1 | ✅ 16.98:1 |
| `--accent-blue` | ✅ 6.62:1 | ✅ 4.59:1 *(was 2.62:1)* |
| `--foreground-muted` | ✅ 6.36:1 | ✅ 6.42:1 |
| `--foreground-subtle` | ✅ 5.59:1 | ✅ 4.61:1 |
| `--status-ok` | ✅ 10.39:1 | ✅ 4.80:1 |
| `--status-warn` | ✅ 10.84:1 | ✅ 4.81:1 |
| `--status-danger` | ✅ 6.54:1 | ✅ 6.19:1 |
| `--status-busy` | ✅ 8.45:1 | ✅ 5.68:1 |

**Fixed this run.** Light-theme `--accent-blue` was `#00A3FF` at **2.62:1**,
well under the 4.5 threshold, and it is the primary colour for links, active nav
and buttons. Now `#0277BD`. Dark keeps `#00A3FF`, which passes.

**❌ Known gap.** The `text-foreground/45` and `/50` opacity utilities used
throughout the older screens measure **3.36–4.28:1** and fail AA. New shell code
uses `--foreground-muted` / `--foreground-subtle`; the analysis modules still use
the opacity utilities.

**Never colour alone.** Every status carries an icon or text label. Roughly one
man in twelve has a colour vision deficiency, and plant staff skew male.

---

## Interaction

| Check | Result |
|---|---|
| Keyboard-only workflow | ⚠️ shell verified by code review, not driven end to end |
| Focus order | ✅ follows DOM order; no `tabindex > 0` anywhere |
| Focus visibility | ✅ global `:focus-visible` ring, 2px, both themes |
| Escape closes dialogs | ⚠️ activation screen ✅; Settings modal ☐ |
| Arrow navigation | ✅ sidebar: ↑↓ move, Home/End jump |
| Enter/Space activation | ✅ all controls are real `<button>` elements |

**Roving tabindex** makes the sidebar one tab stop instead of eleven, so a
keyboard user reaches content in two presses.

**❌ Known gap.** No end-to-end keyboard walkthrough of a full workflow
(import → generate → export). That needs a human at a keyboard.

---

## Assistive technology

| Check | Result |
|---|---|
| Accessible names on icon-only controls | ✅ theme toggle, dismiss, nav all labelled |
| Decorative icons hidden | ✅ `aria-hidden` on all ornamental icons |
| Live regions | ✅ status uses `aria-live="polite"` |
| Current page announced | ✅ `aria-current="page"` in nav |
| Grouping | ✅ `role="group"` + labelled headings per nav group |
| Form labels | ⚠️ shell uses `<Label>`; older screens use adjacent `<span>` |
| Screen reader pass | ❌ never run with NVDA or Narrator |

**❌ Known gap.** No real screen-reader session has been performed. Everything
above is structural verification, which is necessary but not sufficient.

---

## Motion and rendering

| Check | Result |
|---|---|
| `prefers-reduced-motion` | ✅ honoured globally, covers Plotly |
| High DPI | ✅ verified at 200% device scale factor |
| Dark theme | ✅ default, verified |
| Light theme | ⚠️ contrast now passes by measurement; not visually swept |

---

## Layout

| Check | Result |
|---|---|
| Window resizing | ✅ flex layout, sidebar fixed, content fluid |
| Minimum resolution | ⚠️ 1024×720 target — not explicitly verified |
| Large monitors | ✅ content max-width prevents over-stretched lines |
| Small laptop screens | ⚠️ see minimum resolution |

Breakpoints are `--breakpoint-sm/md/lg` at 900/1200/1600px. Note these are
**not** Tailwind defaults — `lg:` means ≥1600px in this codebase, which has
already caused one layout bug.

---

## Density

| Mode | Body | Control | Result |
|---|---|---|---|
| Compact | 12px | 30px | ✅ 12px floor holds |
| Comfortable | 13px | 36px | ✅ default |
| Large | 15px | 44px | ✅ |

---

## Summary

**Verified:** contrast (computed), scaling at 100/150/200%, focus visibility,
sidebar keyboard navigation, ARIA structure, reduced motion, density.

**Not yet verified:** screen-reader session, end-to-end keyboard workflow,
125%/175% capture, 1024×720 minimum, light-theme visual sweep, analysis screens
at scale.

**Known gaps:** opacity-based muted text in the analysis modules fails AA; form
labelling in older screens; Escape handling in the Settings modal.

None of the gaps are in the activation or Home paths, which are what a new user
meets first.
