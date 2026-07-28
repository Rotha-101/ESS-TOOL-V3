# Shared Graph Repository — Architecture

Status: **in production design**. Phases 0–6 complete.

Version 1.2.0 replaced the original Windows shared folder with an
internet-reachable service. The section [From folder to
service](#from-folder-to-service) records why, and what did *not* change.

---

## Purpose

One company-wide history of generated Daily Evaluation Graphs. Every
installation of the same `.exe` — Engineers and Top Management alike — sees the
same list, from anywhere.

Only the **final graph dataset** is stored. Raw imported spreadsheets,
intermediate parse state, and calculation scratch are never written anywhere.

## Storage model — local first

**The service is not the primary storage.** Each computer's own local history
is, and the service is only the hub records travel through.

```text
1. Engineer A generates a graph          → saved to A's local history immediately
2. A publishes it                        → uploaded to the service
3. B and the Manager sync                → each downloads it
4. Each saves it into its OWN local history
5. It appears in their Graph Repository
```

Consequences that follow from this, and are what make it worth doing:

- Every computer holds a **complete local copy** of all synchronised graphs.
- A graph is safe on the engineer's machine **before** any network operation.
- If the service is unavailable, everyone keeps working: generating, browsing
  history and opening graphs all use local storage only.
- When it returns, publishing and downloading resume automatically with no
  user action.

Verified end to end by `scripts/test-two-machine.mjs`, which runs two machines
with genuinely separate local storage against one real Worker over HTTP and
checks that a graph plotted on A arrives on B byte-for-byte.

---

## Problem this solves

`useEvalData` persists the working dataset to a **single slot per project**
(`eval_data_${project}`). Generating today's graph therefore destroyed
yesterday's: there was no history to share, locally or otherwise.

---

## Architecture

```text
   Engineer A .exe                              Top Management .exe
   ┌────────────────────┐                       ┌────────────────────┐
   │ generate graph     │                       │ (read-only)        │
   │   ↓                │                       │                    │
   │ local history      │  ← always written     │ local history      │
   │   ↓                │     first, works      │   ↑                │
   │ sync agent (main)  │     offline           │ sync agent (main)  │
   └─────────┬──────────┘                       └─────────┬──────────┘
             │  HTTPS + Bearer key                        │  HTTPS
             ▼                                            ▼
        ┌───────────────────────────────────────────────────────┐
        │  Cloudflare Worker — /v1                              │
        │    D1 (SQLite)  metadata, listed on every sync        │
        │    R2           gzipped payloads, no egress charge    │
        │    access keys ARE the role model                     │
        └───────────────────────────────────────────────────────┘
```

The server lives in `server/` and deploys separately from the desktop app. It
is deliberately small: no framework, no ORM, ~500 lines of routing over two
bindings.

### Why this shape

| Choice | Reason |
|---|---|
| Worker, not a VM | Nothing to patch, nothing to keep running; the load is ~10 uploads/day |
| D1 for metadata | Sync lists metadata constantly; SQLite indexes it and costs nothing at this size |
| R2 for payloads | 0.84 MB each, fetched rarely, and **R2 charges no egress** — clients re-download freely |
| Access keys, not OAuth | No identity provider exists to federate with; a key is one paste into Settings |
| Records immutable | A generated graph never changes, so there is no update path, no locking and no conflict resolution |

Measured load is ~10 records/day at 0.84 MB each (~8 MB/day, ~3 GB/year).

---

## API surface

Every route except `/v1/health` requires a valid access key
(`Authorization: Bearer <key>`). There is no public read — graph history is
company data. Errors are RFC 7807, and `detail` is written to be shown to a
user directly.

| Route | Purpose |
|---|---|
| `GET /v1/health` | Liveness, **unauthenticated** — distinguishes *service down* from *my key is wrong* |
| `GET /v1/me` | `probe()`: identity, role, and `writable` |
| `GET /v1/graphs/ids` | The sync cursor — every id, unpaginated |
| `GET /v1/graphs/:id` | Record metadata |
| `GET /v1/graphs/:id/payload` | The gzipped `essg-v1` block |
| `POST /v1/graphs` | Publish (multipart: `meta` + `payload`) |
| `POST /v1/admin/keys` | Issue a key — admin only, plaintext returned once |
| `GET /v1/admin/keys` | Who has access — admin only, hashes never returned |
| `DELETE /v1/admin/keys/:id` | Revoke — admin only |

`GET /v1/graphs/:id/payload` deliberately does **not** set `Content-Encoding`.
The payload is gzipped by the codec and the client gunzips it itself; declaring
the encoding would make `fetch` transparently decompress it, and the decoder
would then be handed bytes it cannot read.

### Storage layout

```text
D1   graphs        one row per record, including the full meta_json as sent
     access_keys   id, key_hash, user_name, role, created_at, last_used_at, revoked_at

R2   graphs/<project>/<dataDate>/<id>.essg.gz     ~0.84 MB
```

`meta_json` is stored whole so a client receives exactly the shape it stores
locally, rather than a reassembly that could drift from it.

### Server-side validation

Every upload is checked before anything is stored:

1. `id`, `project` and `dataDate` must each be a safe segment
   (`[A-Za-z0-9._-]{1,64}`) — they end up in an R2 object key.
2. `payload.sha256`, `payload.codec` and `provenance.generatedAt` must be present.
3. The payload must be non-empty and ≤ 32 MB.
4. **SHA-256 is recomputed over the bytes that actually arrived** and compared
   against the metadata. A truncated upload is rejected, not stored.

Step 4 is the check the folder design could not make, because it had no server.

Publishing is **idempotent on (project, dataDate, sha256)** — and on `id` — so
a client retrying after an interrupted upload gets `{status: 'exists'}` rather
than creating a duplicate. If the D1 insert fails after the R2 put, the object
is deleted rather than left orphaned: metadata is the record of truth, and an
object no row points at would be served to no one.

---

## Synchronization

**The cursor is the set of record ids already held locally — not a timestamp.**
This removes all dependence on the server's clock, workstation clocks, and
timezones.

**Pull** — on startup, on an interval, and on demand:
1. `GET /v1/graphs/ids`
2. diff the ids returned against ids already in local history
3. for genuinely new ids only, fetch the ~1.9 KB metadata
4. payloads are **not** fetched during sync (see [Lazy payloads](#lazy-payloads))

Returning every id unpaginated is deliberate. At ~40 bytes per row a decade of
history is a few hundred KB before compression, and it keeps the cursor
clock-free.

### Lazy payloads

A sync pass moves **metadata only**. The ~0.84 MB series block is fetched by
`ensurePayload` the first time somebody opens that graph, and cached locally
from then on.

The difference is the whole cost model. Metadata is ~1.9 KB against ~0.84 MB, so
a machine catching up on a month of company history moves a few hundred KB
rather than gigabytes — and almost none of it would have been looked at.

What each state gives you:

| Local state | Listed, dated, searchable | Opens offline |
|---|---|---|
| Metadata only (just synced) | yes | no — needs one fetch |
| Payload cached (opened once) | yes | yes, forever |
| Generated on this machine | yes | yes, from the moment it was made |

`GraphHistoryEntry.payloadCached` records which, and the repository list and
date picker both show it — a disk icon for local, a cloud icon for
downloads-on-open.

Checksum verification moved with the fetch. Sync no longer downloads series
blocks, so a truncated transfer can only be caught when one is actually pulled;
`ensurePayload` verifies SHA-256 before caching and caches nothing on failure,
so a bad transfer simply retries on the next open. `scripts/test-sync.mjs`
covers exactly this.

An earlier version of this document claimed payloads were already lazy. They
were not — `downloadRecord` fetched every one during the pass. The claim is now
true, and the test suite holds it that way.

**Push** — no separate outbox is needed, because Phase 1 already writes every
generated graph to local history first. Any local record without a `syncedAt`
stamp is by definition pending; the agent uploads those and stamps them.

**Offline** — if the service is unreachable, generation, local history, and
viewing already-downloaded graphs all keep working. The next successful probe
drains the pending records automatically.

### Scheduling

`useBackgroundSync` is mounted once, in `App`, and is the only thing that
schedules a pass. Everything else — the Sync Now button, auto-save after a
graph is generated — calls `requestSync()` on the store. One owner makes
duplicate passes impossible by construction.

A chained `setTimeout` (not `setInterval`) lets each pass choose its own next
delay, so backing off needs no extra state:

| Situation | Next pass |
|---|---|
| Connected | 5 minutes |
| Unreachable / error | 15 minutes |
| Window regains focus | immediately, if the last attempt was > 1 min ago |
| Machine regains connectivity (`online`) | immediately |
| Graph generated, or Sync Now | immediately |

The longer retry when unreachable is deliberate: a failed request can sit
through DNS and TCP timeouts before giving up, and retrying that every 5 minutes
wastes battery and metered data for nothing. The focus and `online` triggers
close the resulting gap.

`navigator.onLine` is treated as a **hint, not truth** — it can fire behind a
captive portal — so it merely schedules a pass and `probe()` still decides. It
was deliberately *not* used by the folder transport, where internet
connectivity said nothing about whether a LAN share was reachable; over HTTP it
is exactly the right signal.

Requests time out at 60 s: long enough for a 0.84 MB payload on a poor
plant-site link, short enough that a black-holed connection cannot hang the
sync loop indefinitely.

The receive loop yields to the event loop between records and caps each pass at
500, so a first sync against years of history cannot make the window
unresponsive; the next pass continues where it left off. The cap is
metadata-sized — it was 50 when each record meant an ~0.84 MB download.

---

## Permissions — roles without a login

| Role | May publish | Role in the app |
|---|---|---|
| `engineer` | yes | Generate, publish, view all, export |
| `viewer` | no | View all, search, open, export. No import, no publish, no delete |
| `admin` | yes | Above, plus issuing and revoking keys |

There is no role setting inside the application and no login screen. The key
*is* the identity: the app calls `GET /v1/me` at startup and derives everything
from the answer.

The key itself is never stored server-side — only its SHA-256 — so a copy of
the database does not yield working credentials. `last_used_at` is written at
most hourly, because a write per poll would cost far more than the question is
worth.

### The rule

`decideReadOnly()` in `src/features/graph-repository/accessMode.ts`, kept pure
and dependency-free so it can be tested directly (`scripts/test-access.mjs`).

Read-only applies **only** when the service has been positively confirmed
reachable but not writable:

| State | Access |
|---|---|
| No server configured | Full — standalone engineer |
| Sync switched off | Full — deliberate local working, and the recovery path |
| Reachable, writable | Full |
| Reachable, **not** writable | **Read only** |
| Offline / not yet probed | Last confirmed answer, defaulting to full |

Erring permissive matters: locking the app whenever the service is unreachable
would strand an engineer working offline. Nothing is lost by it, because the
server itself refuses the write — this rule decides only what is worth showing,
never what is allowed.

The last confirmed answer is persisted purely so a Management user does not see
the full engineer UI flash on every launch before the first probe completes.

### What read-only users see

The Graph Repository is the whole product for them: every other module exists
to import, generate or transform imported data. So the nav is filtered to the
repository, a **VIEW ONLY** badge appears in the header, and the delete action
is hidden. They keep full search, filtering, figure switching, inspection, and
**export** (HTML and clipboard, reusing the Daily Evaluation export services
unchanged, so an exported graph is identical whoever produced it).

Same `.exe`, same components, same nav — only filtered. No second application
and no duplicated UI.

The UI gating is convenience, not the enforcement: a viewer running a patched
build still cannot publish, because `POST /v1/graphs` checks the role and
returns 403. `test-two-machine.mjs` proves exactly that, by having the manager
attempt a direct publish and asserting the **server** refuses it.

### Attribution

`engineerName` is **overwritten server-side** from the access key on every
upload. An engineer cannot publish under someone else's name by editing local
settings. Revoking a key is a flag rather than a delete, so records already
published stay attributed to that person.

### Credential storage on the client

The access key lives in the Electron **main process only**
(`electron/sync/credentials.cjs`). It is never sent to the renderer, never
written to localStorage, and never included in renderer-persisted state — the
renderer can ask *whether* a key is set, and set or clear one, but cannot read
it back.

It is encrypted with Electron `safeStorage`, which is DPAPI-backed on Windows:
the ciphertext is bound to the Windows user account, so copying the file to
another machine or user yields nothing. If decryption fails the key is treated
as absent and the user is asked for it again.

---

## Browsing history by date

Stored graphs are reachable from two places, and both resolve a record the same
way — `ensureGraphRecord`: local payload, else fetch and cache, else say which.

- **Graph Repository tab** — the full table: every project, search, filtering,
  provenance, delete.
- **Daily Evaluation toolbar** — a date picker for the project in hand, so
  yesterday's graph is one click from where the engineer already is.

The date picker reads the local index only, which is what makes eager metadata
sync worth it: every graph the company has ever published is already listed on
every machine, and opening one is what costs a download.

### Why history does not go through `useEvalData`

`useEvalData` persists to `eval_data_${project}` — the live working set. Loading
a stored graph through it would overwrite whatever the engineer is working on,
and `useGraphAutoSave` watches the same value, so it would then re-encode the
restored dataset as a **new revision of a graph that already exists** (a decoded
payload has a different sampled signature from the parse it came from).

So `useHistoricalGraph` holds the stored graph beside the working set, and the
substitution happens at exactly one point — the props handed to `GraphPanels`:

```text
selectedDate = live  →  GraphPanels(evalData,        graphConfig,        showNccPCommand)
selectedDate = past  →  GraphPanels(record.evalData, record.graphConfig, record.view.showNccPCommand)
```

Three props. Figure switching, pins, customization, clipboard and export keep
running off existing state, because they already act on whatever `GraphPanels`
was given. Generation, parsing, calculation and plotting are untouched — this is
the same restore path `GraphViewer` has always used, which is also why a stored
graph and a fresh one cannot drift apart.

Generating or importing new data returns the view to the working set, on the
assumption that an engineer who just made a graph wants to see it.

---

## Transport abstraction

The sync agent talks to a five-method interface so the backing store can change
without touching the application:

```ts
interface SyncTransport {
  probe(): Promise<TransportStatus>            // reachable? writable? schema?
  listRecordIds(): Promise<RecordRef[]>
  fetchMeta(ref): Promise<GraphRecordMeta>
  fetchPayload(ref): Promise<Uint8Array>
  putRecord(meta, payload): Promise<PutOutcome>
}
```

`RemoteTransport` implements it today, forwarding over IPC to
`electron/sync/apiClient.cjs`. The renderer holds no credentials and opens no
sockets; it passes the configured server URL on every call, which keeps the
main process stateless and means changing the URL in Settings takes effect
immediately.

---

## From folder to service

The original design was a Windows shared folder: no server, no database, no
access keys, with NTFS/AD permissions as the role model. It was replaced in
1.2.0.

**Why.** The requirement changed. Engineers and Top Management both needed to
sync from anywhere, and cloud storage became approved. An SMB share cannot
serve users off the network, so no amount of tuning would have met it.

**Why it was cheap.** `SyncTransport` was built for exactly this, and the pilot
had not run, so there was no production data to migrate.

**What did not change:** the `essg-v1` codec, `history-db`, `syncService`,
`useBackgroundSync`, the Graph Repository tab, export, and the read-only UI
gating. `decideReadOnly()` needed no change at all — it consumes `writable`
from `probe()`, which now comes from the account's role instead of NTFS
permissions.

**What improved:** uploads are validated at write time against a recomputed
checksum, attribution cannot be spoofed, keys can be revoked centrally, and the
role model no longer depends on Active Directory.

**Retired:** `electron/sync/repository.cjs`, `src/lib/sync/folderTransport.ts`,
`scripts/test-repository.cjs`.

---

## Accepted limitations

- **Depends on a third party.** Cloudflare outages stop synchronisation. Local
  history is unaffected, which is what bounds the damage.
- **Access keys are bearer tokens.** A leaked key works until revoked; there is
  no device binding beyond DPAPI-at-rest. `last_used_at` is the signal for
  spotting one.
- **The first admin key is inserted by hand.** There is deliberately no
  bootstrap endpoint — an unauthenticated way to mint an admin key would be the
  weakest point in the system.
- **No key-management UI.** Issuing and revoking are HTTP calls; there are few
  enough users that a UI would be premature.
- **`revision` is per-originator.** With several engineers, two records for the
  same plant-day may both say revision 1. The list disambiguates by engineer and
  generation time, which are unambiguous.
- Not real-time; propagation is bounded by the sync interval.

---

## Record format

See `src/lib/graph-codec/types.ts`. A record is metadata (JSON, ~1.9 KB) plus a
gzipped `essg-v1` series block (~0.84 MB).

Measured on real SNTL600 telemetry, 3 plants, 2.94 M samples:

| Encoding | Size |
|---|---|
| Naive `JSON.stringify` | 31.84 MB |
| JSON + gzip | 5.29 MB |
| Float32 + gzip | 4.78 MB |
| **essg-v1 + gzip** | **0.84 MB** |

Round-trip is verified against declared per-field precision, with timestamps
regenerated bit-identically rather than stored. See `CODEC_SPEC.md`.

---

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Codec spike + sizing | ✅ all gates passed |
| 1 | Local history, Graph Repository tab, auto-save | ✅ complete |
| 2 | Repository format, transport, Settings, sync service | ✅ complete |
| 3 | Background scheduling, retry, offline recovery | ✅ complete |
| 4 | Role probe, Management read-only experience | ✅ complete |
| 5 | Tests, docs, deployment guide | ✅ complete |
| 6 | Online service (Worker + D1 + R2), access keys | ✅ complete |
| 7 | Lazy payloads, date browsing in Daily Evaluation | ✅ complete |

## Verification

```bash
npm run lint    # types + export-template drift check
npm test        # 200 checks: codec, history, API, sync, access mode, end-to-end
npm run build   # production renderer bundle
```

`npm test` needs no Cloudflare account, no Electron, no `wrangler` and no
network. The Worker runs against `node:sqlite` executing the real migration and
an in-memory R2, so the routing, auth, roles, validation and SQL under test are
the code that will be deployed.

| Suite | Checks | Covers |
|---|---|---|
| `test-codec.mjs` | 8 | Round-trip precision, NaN placement, timestamp regeneration, empty-plant dropping |
| `test-history.mjs` | 33 | Concurrent read-modify-write on the local index; metadata-only records, payload caching, size accounting |
| `test-api.mjs` | 46 | Routing, auth, role enforcement, upload validation, checksum rejection, idempotency, key issue/revoke |
| `test-sync.mjs` | 48 | Offline, recovery, id-set cursor, **metadata-only pull**, **lazy payload fetch and caching**, read-only never uploads, checksum rejection at open, partial failure, download cap |
| `test-access.mjs` | 14 | The full read-only decision table |
| `test-two-machine.mjs` | 51 | End-to-end over HTTP: A plots → B receives metadata → B opens → payload arrives and matches identically; Management receives all, publishes none, refused by the server, can still download to read |

## Related documents

- `CODEC_SPEC.md` — the essg-v1 payload format
- `DEPLOYMENT.md` — deploying the service, issuing keys, rollout, troubleshooting
