# Shared Graph Repository — Architecture

Status: **approved**. Phase 0 and Phase 1 complete; Phase 2 in progress.

---

## Purpose

One company-wide history of generated Daily Evaluation Graphs. Every installation
of the same `.exe` — Engineers and Top Management alike — sees the same list.

Only the **final graph dataset** is stored. Raw imported spreadsheets,
intermediate parse state, and calculation scratch are never written anywhere.

## Storage model — local first

**The shared folder is not the primary storage.** Each computer's own local
history is, and the folder is only the hub records travel through.

```text
1. Engineer A generates a graph          → saved to A's local history immediately
2. A publishes it                        → copied to the shared folder
3. B and the Manager sync                → each downloads it
4. Each saves it into its OWN local history
5. It appears in their Graph Repository
```

Consequences that follow from this, and are what make it worth doing:

- Every computer holds a **complete local copy** of all synchronised graphs.
- A graph is safe on the engineer's machine **before** any network operation.
- If the shared folder is unavailable, everyone keeps working: generating,
  browsing history and opening graphs all use local storage only.
- When it returns, publishing and downloading resume automatically with no
  user action.

Verified end to end by `scripts/test-two-machine.mjs`, which runs two machines
with genuinely separate local storage against one real folder and checks that a
graph plotted on A arrives on B byte-for-byte.

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
             │  SMB                                       │  SMB
             ▼                                            ▼
        ┌───────────────────────────────────────────────────────┐
        │  \\fileserver\ESS-GraphRepository                      │
        │    immutable, content-addressed record files           │
        │    NTFS/AD permissions ARE the role model              │
        └───────────────────────────────────────────────────────┘
```

**No server. No database service. No access keys.** The repository is a folder.

### Why a folder is sufficient

Records are **immutable and append-only** — a generated graph never changes.
That removes every problem a backend would have existed to solve:

| Problem a server solves | Why it does not arise |
|---|---|
| Concurrent write conflicts | Unique filename per record; two engineers on the same plant-day produce two files, both kept |
| Lost updates on a shared index | There is no shared index — the directory listing *is* the index |
| Locking | Nothing is mutated, so nothing needs locking |
| Role enforcement | NTFS/AD enforces it, more strongly than application code could |
| Identity / attribution | AD authenticates the write; NTFS records the file owner |

Measured load is ~10 records/day at 0.84 MB each (~8 MB/day, ~3 GB/year).

---

## Repository layout

```text
<shared folder>\
├─ repository.json                              marker + schema version
└─ v1\
   └─ SNTL600\
      └─ 2026\
         ├─ 2026-06-02__01k3f9x2a8__meta.json      ~1.9 KB
         ├─ 2026-06-02__01k3f9x2a8__data.essg.gz   ~0.84 MB
         └─ …
```

Project/year subfolders keep every `readdir` small. Filenames encode
`dataDate` and record `id`, so a sync pass can diff ids **without opening any
file**.

### Atomic writes

Payload and metadata are written to `.tmp` names, then renamed into place —
payload first, metadata last. A reader therefore never observes a half-written
record, and a record is only visible once *both* halves are complete.

---

## Synchronization

**The cursor is the set of record ids already held locally — not a timestamp.**
This removes all dependence on the file server's clock, workstation clocks, and
timezones.

**Pull** — on startup, on an interval, and on demand:
1. `readdir` each `v1/<project>/<year>` folder
2. diff the ids found against ids already in local history
3. for genuinely new ids only, read the ~1.9 KB metadata sidecar
4. payloads are **not** fetched during sync; they load lazily when a graph is opened

**Push** — no separate outbox is needed, because Phase 1 already writes every
generated graph to local history first. Any local record without a `syncedAt`
stamp is by definition pending; the agent writes those to the share and stamps
them.

**Offline** — if the share is unreachable, generation, local history, and
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
| Graph generated, or Sync Now | immediately |

The longer retry when unreachable is deliberate: an unreachable UNC path can
block for ~20 s inside the OS before failing, so retrying every 5 minutes is the
opposite of low resource usage. The focus trigger closes the resulting gap —
returning to the app after the network comes back syncs at once rather than up
to 15 minutes later.

`navigator.onLine` is deliberately **not** used: it reports internet
connectivity, which says nothing about whether a LAN share is reachable.

The download loop yields to the event loop between records and caps each pass
at 50, so a first sync against years of history cannot make the window
unresponsive; the next pass continues where it left off.

---

## Permissions — roles without an auth system

| AD group | NTFS rights on the share | Role in the app |
|---|---|---|
| Engineers | Read + Create (**Delete denied**) | Generate, publish, view all |
| Management | Read only | View all; ingest UI hidden |
| Admins | Full control | Above + prune/archive |

The app **probes** write access at startup and derives the role from what the
filesystem actually permits. There is nothing to configure in the app and no
keys to issue, rotate, or revoke.

### The rule

`decideReadOnly()` in `src/features/graph-repository/accessMode.ts`, kept pure
and dependency-free so it can be tested directly (`scripts/test-access.mjs`).

Read-only applies **only** when the share has been positively confirmed
reachable but not writable:

| State | Access |
|---|---|
| No folder configured | Full — standalone engineer |
| Sync switched off | Full — deliberate local working, and the recovery path |
| Reachable, writable | Full |
| Reachable, **not** writable | **Read only** |
| Offline / not yet probed | Last confirmed answer, defaulting to full |

Erring permissive matters: locking the app whenever the share is unreachable
would strand an engineer working off the network. Nothing is lost by it,
because the share itself denies the write — this rule decides only what is
worth showing, never what is allowed.

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

This is stronger than an application-level token scheme: a Management user
running a patched build still cannot write, because the denial lives in the file
server. Denying the NTFS *Delete* right makes the repository append-only at the
filesystem level.

Attribution uses the Windows account name and hostname, backed by the NTFS file
owner recorded at write time.

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
  putRecord(meta, payload): Promise<void>
}
```

`FolderTransport` implements it today. An HTTP transport (self-hosted service,
or a cloud API) implements the same five methods if the company later needs
off-network access. Phase 1 code is transport-agnostic.

---

## Accepted limitations

- **No server-side validation.** A corrupt record is detected on read via the
  SHA-256 already in its metadata, and affects only that record.
- **No central audit log.** Provenance is inside each record; IT can enable NTFS
  auditing if more is required.
- **Requires network access to the share.** Confirmed acceptable — all users are
  on the company network.
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
| 2 | Repository format, FolderTransport, Settings, sync service | ✅ complete |
| 3 | Background scheduling, retry, offline recovery | ✅ complete |
| 4 | Role probe, Management read-only experience | ✅ complete |
| 5 | Tests, docs, deployment guide | ✅ complete |

## Verification

```bash
npm run lint    # types + export-template drift check
npm test        # 107 checks: codec, history, repository, sync, access mode
npm run build   # production renderer bundle
```

`npm test` needs no shared folder, no Electron and no network.

| Suite | Covers |
|---|---|
| `test-codec.mjs` | Round-trip precision, NaN placement, timestamp regeneration, empty-plant dropping |
| `test-repository.cjs` | Probe/init, atomic writes, idempotent publish, path-traversal rejection, stray-file tolerance, two machines converging, **read-only NTFS role probe via `icacls`** |
| `test-sync.mjs` | Offline, recovery, id-set cursor, read-only never uploads, checksum rejection, partial failure, download cap |
| `test-access.mjs` | The full read-only decision table |

## Related documents

- `CODEC_SPEC.md` — the essg-v1 payload format
- `DEPLOYMENT.md` — share setup, AD groups, rollout, troubleshooting
