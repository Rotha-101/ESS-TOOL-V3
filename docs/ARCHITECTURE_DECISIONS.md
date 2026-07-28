# Architecture Decisions

Why the code is shaped the way it is. Each entry records the decision, what it
rules out, and what would justify revisiting it.

Read this before changing anything it describes. Several of these look like
inconvenient choices until you know what they prevent — the persisted tab ids in
particular look like sloppy naming and are load-bearing.

---

## 1. The application is offline-first

**Decision.** Every analysis feature works with no network. Local storage is
written before any network call. Synchronisation is a background convenience,
never a precondition.

**Why.** Users are plant and office staff, frequently on machines with poor or
no connectivity. A tool that stops working when the link drops is not usable
where it is needed most.

**Only these may require the network:** activation, synchronisation, AI
services, update checks. Everything else must degrade to local operation.

**What this has already caught.** Spreadsheet import silently depended on
`cdn.sheetjs.com` — twice. Once on the main thread, and again inside the parser
worker via `importScripts`, where a local `const XLSX` shadowed the bundled
import so the first fix looked complete when it was not. Both are now bundled.

**Known exception.** `.rar` and `.7z` still fetch their readers on demand
(`audit-engine.js`), because bundling two WASM archive libraries costs more than
the feature is worth. ZIP and plain folders work offline. The error message says
so plainly rather than surfacing a fetch failure.

**Accepted degradation.** Fonts load from Google Fonts. Offline they fall back
to system fonts — visually different, functionally fine.

**Revisit if:** RAR becomes a common input format, or a deployment requires a
fully air-gapped build.

---

## 2. Activation is provider-based

**Decision.** `ActivationProvider` is an interface. `codeProvider` implements it
today. The shell only calls `status()` and `activate()`.

**Why.** There is no Active Directory (machines are WORKGROUP), so real SSO had
nothing to authenticate against. But that will not be true forever, and the cost
of the seam is one interface.

**What it enables without touching the workflow:** Entra ID, Google Workspace,
LDAP, OAuth, QR enrolment, hardware certificates. Each is one more provider and
one more branch in the factory.

**Precedent.** `SyncTransport` proved the pattern here: the backend moved from a
Windows file share to Cloudflare without the application noticing.

**Do not** let UI code reach past the provider to the credential store or the
transport. That is what keeps the swap cheap.

---

## 3. Credentials never reach the renderer

**Decision.** The activation credential lives in the Electron main process,
encrypted with `safeStorage` (DPAPI on Windows). The renderer can ask whether a
credential exists, and set or clear one — there is deliberately no `get`.

**Why.** DPAPI binds the ciphertext to the Windows account, so copying the file
to another machine yields nothing. Keeping the plaintext out of the renderer
keeps it out of devtools, crash dumps and anything the renderer persists.

**Note.** The credential itself is a bearer token with no machine binding — it
works from anywhere if someone reads it. The protection is at rest, not in
transit. Revocation is the control.

---

## 4. Server configuration is centralised

**Decision.** `src/lib/config/serverConfig.ts` is the only module that knows an
endpoint. Resolution order: administrator override, then build-time default,
then nothing.

**Why.** Users must never type a URL. But a fleet still has to be repointable
without a rebuild, and an enterprise deployment may need to inject its own.

**Why it takes an injected reader instead of importing the store.**
Synchronisation runs outside React — background passes, the Electron bridge — so
a hook dependency would make the endpoint unreachable from exactly the code that
needs it most.

**`getMediaStorageUrl()` exists deliberately** even though it returns the same
origin today. Moving payloads to dedicated object storage later is then a change
in this file and nowhere else.

---

## 5. Application state is one derived value

**Decision.** `decideAppState()` collapses activation, sync toggle, phase and
failures into a single state plus an explicit policy — whether the shell renders,
whether uploads and downloads are allowed, what the user is told, and how loudly.

**Why.** The scattered-boolean version produced contradictions. `writable` was
forced false while offline, and a separate piece of UI read it without that
context — so engineers were told "View only" the moment their network dropped.
Reading several booleans correctly, every time, in every component, is not
something code does reliably.

**The priority order is the design.** Activation outranks sync; a deliberate
local mode outranks any network condition. Someone who chose to work unconnected
is never told they are offline as though something broke.

**Enforced.** `scripts/test-appstate.mjs` fails the build if a technical term
reaches a user-facing message in any state combination.

---

## 6. Navigation ids are frozen

**Decision.** The tab ids `signal`, `power`, `soc`, `export` keep their legacy
names. Only the labels changed — *Import & Validate*, *Cycle Calculation*,
*Daily Evaluation*, *Reports & Export*.

**Why.** `activeTab` is persisted to localStorage and the body dispatch matches
these exact strings. Renaming `soc` to `daily_evaluation` puts every existing
user on a blank screen, with no error and no way back except clearing storage.

**The id is a private key; the label is the product.** The mismatch is the price
of not breaking people, and it is cheap.

**Also fixed here.** An unknown or stale id used to render nothing at all.
`resolveInitialTab` now falls back to Home.

**Revisit only** with a migration that rewrites persisted state, and only if
there is a real benefit beyond tidiness.

---

## 7. Density is tokens, not stylesheets

**Decision.** Three CSS variables — `--d-space`, `--d-text`, `--d-control` —
change per density mode. Every spacing, typography and control-size token derives
from them.

**Why.** Adding a mode is three lines rather than a parallel set of rules that
drift apart.

**Verified before relying on it.** Tailwind v4 compiles spacing utilities to
`calc(var(--spacing) * N)`, so `--spacing` is switchable at runtime. Confirmed in
the built CSS: `.h-8{height:calc(var(--spacing) * 8)}`. Had it inlined literals,
the fallback was explicit per-control tokens.

**12px is the floor in every mode, compact included.** Before this there were 731
elements below 12px against 84 at or above.

---

## 8. Analysis modules opt out of shell density

**Decision.** `.module-surface` resets `--spacing` to a fixed value for the ten
analysis screens.

**Why.** Those screens are pixel-tuned around Plotly containers, whose layout
maths does not respond to a CSS variable. A user changing their display-size
preference must never move a chart.

**This is the boundary that makes the shell redesignable.** The shell can evolve
freely because it cannot reach into the modules.

---

## 9. Home is workflow-oriented, not a dashboard

**Decision.** Home answers three questions: what should I do next, what was I
working on, is everything okay. Nothing else.

**Explicitly excluded:** storage usage, byte counts, graph totals, module
statistics, system information.

**Why.** The previous Dashboard displayed plant file counters and quality
percentages that told an operator nothing actionable. Every element on Home must
help someone start, continue, recover or understand — not inform for its own
sake.

**Structural guard.** The plant/quality KPI strip used to be gated by a growing
*blacklist* of tab names, so every new screen inherited it by default — which is
how Home briefly became the dashboard it was replacing. It is a whitelist now.

**Test before adding a widget:** does this help the user start or continue work?

---

## 10. Manual chunks for Plotly and XLSX

**Decision.** `vite.config.ts` names `plotly` and `xlsx` as explicit manual
chunks.

**Why automatic splitting was not enough.** Making all ten screens `React.lazy`
only brought startup from 8.16 MB to 6.11 MB. Several screens share Plotly, and
Rollup hoists a shared dependency into its common ancestor — the entry chunk. So
the library came straight back into the startup path.

**Result:** blocking JS 8.16 MB → 0.98 MB (−88%). Plotly is a 4.65 MB chunk
fetched when a chart first renders.

**Do not remove these** while multiple lazy screens import Plotly. If chart usage
ever consolidates into one module, they become unnecessary — measure before
deciding.

---

## 11. Preloading is predictive, never eager

**Decision.** Hovering or focusing a sidebar item warms that chunk.
`PRELOAD_AFTER` warms the likely next screen during `requestIdleCallback`.

**Why.** Startup cost and perceived speed pull in opposite directions.
Preloading during idle time buys responsiveness without paying for it at launch.

**Never** preload in a way that competes with the module the user is waiting for.

---

## 12. Sync is metadata-first, payloads lazy

**Decision.** A sync pass moves ~1.9 KB of metadata per record. The ~0.84 MB
series block is fetched on first open and cached.

**Why.** A machine catching up on a month of history moves a few hundred KB
rather than gigabytes, almost none of which anyone would look at.

**Consequence.** Checksum verification moved with the fetch, so a truncated
transfer is caught at open time rather than during sync.

---

## 13. A record is never marked synced without an upload

**Decision.** If a payload cannot be read, the record stays pending and reports
a failure. Reconciliation compares local records against the server's id set and
re-queues anything that claims to be published but is not.

**Why.** The original code marked such records synced and moved on —
permanently, silently, while reporting success. Observed in production: local
history said "1 graph, Synced, up to date" while the service held nothing.

**Reconciliation runs only after a listing that succeeded**, and only for
locally generated records. Otherwise one offline pass would re-queue the entire
history, and viewers would try to upload metadata-only records they cannot
publish.

---

## 14. Settings only contains controls that work

**Decision.** A setting that changes no behaviour does not ship.

**Why.** 17 of 20 controls were wired to nothing — including an AI model tier
whose own config file documented that it was never connected. A non-technical
user cannot tell which controls work, so dead ones cost trust in all of them.

**Store fields were kept** where the UI was removed, so nothing breaks if a
feature is implemented later.

---

## 15. Identity is server-owned

**Decision.** The name on a published graph comes from the activation
credential. The application displays it and never lets a user edit it.

**Why.** The server overwrites `engineerName` on upload, so the old editable
field was decorative — and worse, implied a control the user did not have.
Attribution cannot be spoofed by editing local settings.

---

## 16. The store owns the active project

**Decision.** `useAppStore` is the single writer. `audit-engine` keeps a mirror,
pushed via `syncActiveProject()`, and is wired through `connectProjectStore()` —
the same injection pattern as `connectServerConfig`, so it stays free of a React
or store import.

**What was wrong.** Not two competing live values, which would have been easier
to spot. `audit-engine` owned the project and persisted it to its own
`hcActiveProject` localStorage key, while the store held a **second persisted
field of the same name that nothing read and nothing wrote**. Dormant state
representing a live domain concept — the kind that survives for months and
surfaces the moment someone adds a feature and reaches for the obvious-looking
store field.

**Why the mirror rather than rewriting the reads.** ~20 internal read sites
inside 2,250 lines of untyped legacy JS. Inverting ownership is the safe change;
rewriting those reads is not.

**Migration.** The old localStorage key is adopted once at startup if the store
has no value, then removed.

**Do not** add another writer. If a new caller needs to change the project, it
goes through `useAppStore().setHcActiveProject`.

---

## 17. Constraints that must survive into the Operations Platform

Recorded here because both are easy to get wrong in a UI, and getting them wrong
would mislead an administrator about live systems.

**`last_used_at` is activity history, not presence.** The write is throttled to
one hour (`server/src/lib/auth.ts`), so it cannot distinguish "app open and
idle" from "closed 55 minutes ago". Render it as a date — *"Last seen 12 Jul"* —
never a green dot, never "online". Real presence needs a heartbeat table and a
write on the hot request path, which was deliberately not built.

**Storage per user is bytes first introduced, not bytes pushed.** Publishing is
deduplicated on `(project, dataDate, sha256)`, so re-publishing an identical
graph credits the *first* uploader and the second is credited nothing. A column
labelled "storage used" without that caveat will be read as "how much this
person costs us", which is not what it measures.

**Total storage is an estimate.** KV usage is not readable from inside a Worker;
`SUM(payload_bytes)` from D1 is the only in-app figure and excludes per-key
overhead and anything pruned out of band.

---

## Technical debt register

Known, deliberate, and scheduled — not forgotten.

| Item | Why it stands | Remove when |
|---|---|---|
| `hcRenderProjectTabs` and the pre-React DOM renderers in `audit-engine.js` | Guarded and unreachable; several callers inside untyped legacy code | audit-engine modernisation |
| `App.tsx` 430-line body ternary, 180-line inline Report Export | Works; extracting it is a large diff with no user-visible gain | Report Export gets its own feature module |
| `audit-engine.js` — 2,250 lines, untyped | Owns validation, projects and archive handling; the highest-risk file to touch | Incremental, behind tests |
| Opacity-based muted text in analysis modules | Fails AA (3.36–4.28:1); shell uses `--foreground-muted` | Analysis screens get a visual pass |
| No UI component tests | Every bug this stage was found by looking, not testing | Before the shell grows further |
| `setHcActiveProject` export on `audit-engine` | Deprecated shim routing to the store | All callers use the store directly |

---

## Contributing

Adding an entry: state the decision, why it was made, what it rules out, and
what would justify changing it. An entry that only says what the code does is
not worth writing — the code already says that.
