# Deployment & Operations Guide

Shared Graph Repository — deploying the service, issuing access keys, rollout
and troubleshooting.

**Applies to version 1.2.0 and later.** 1.2.0 replaced the Windows shared
folder with an online service. Builds 1.1.x sync only to a shared folder and
ignore these settings entirely; 1.0.x has no Graph Repository at all. Installer:
`Data Visualization Tool Setup 1.2.0.exe`.

Audience: whoever deploys the service and distributes the `.exe`. There is no
server to patch and no VM to keep running — the service is a Cloudflare Worker
with two storage bindings. Setup is roughly fifteen minutes, once.

---

## 1. What you are deploying

```text
   Desktop app (many)  ──HTTPS──▶  Cloudflare Worker  ──▶  D1    metadata
                                                       └──▶  R2    graph payloads
```

Everything lives in `server/`. It deploys independently of the desktop app;
they share only the `/v1` API contract.

**Sizing:** ~0.84 MB per graph. At one graph per project per day across ten
projects that is ~8 MB/day, ~3 GB/year — comfortably inside R2's free tier for
the first few years, and D1 stores only metadata.

**Prerequisites:** a Cloudflare account, Node.js, and `wrangler` (installed by
`npm install` inside `server/`).

---

## 2. Deploy the service

All commands run from `server/`.

```bash
cd server
npm install
wrangler login
```

### 2.1 Create the storage

```bash
wrangler d1 create ess-graph-repository
wrangler r2 bucket create ess-graph-payloads
```

`d1 create` prints a `database_id`. Put it in `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_D1_ID`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ess-graph-repository"
database_id = "the-uuid-just-printed"
```

### 2.2 Create the tables

```bash
npm run migrate          # applies migrations/0001_init.sql to the remote D1
```

Use `npm run migrate:local` to seed a local development database instead.

### 2.3 Deploy

```bash
npm run deploy
```

Wrangler prints the URL — for example
`https://ess-graph-repository.<your-subdomain>.workers.dev`. **That URL is what
every user pastes into Settings.** A custom domain works equally well if you
prefer one.

### 2.4 Confirm it is up

```bash
curl https://ess-graph-repository.<your-subdomain>.workers.dev/v1/health
# {"status":"ok","schemaVersion":1,"db":true,"bucket":true}
```

`/v1/health` is the only unauthenticated route. It exists so an admin can tell
*the service is down* from *my key is wrong* without holding a valid key.

---

## 3. Access keys — this is the access control

There is no role setting inside the application and no login screen. **The key
determines who someone is and what they may do.** The app calls `/v1/me` at
startup and configures itself from the answer.

| Role | May publish | Result in the app |
|---|---|---|
| `engineer` | yes | Generate, publish, view all, export |
| `viewer` | no | View all, search, open, export. No import, no publish, no delete |
| `admin` | yes | Above, plus issuing and revoking keys |

Keys are never stored — only their SHA-256 — so a copy of the database does not
hand over working credentials. A key is shown **once**, at issue. If it is lost,
issue a new one and revoke the old.

### 3.1 The first admin key

There is deliberately **no bootstrap endpoint**: an unauthenticated way to mint
an admin key would be the weakest point in the whole system. So the first key is
inserted by hand, once.

```bash
node scripts/make-key.mjs "CHEA Rotha" admin rotha@example.com
```

It prints the key and the exact `wrangler d1 execute …` command that registers
it. Run that command, then store the key somewhere durable — it is your only
way to issue the rest.

### 3.2 Every other key

Issued over the API using the admin key:

```bash
ADMIN_KEY=<your admin key>
SERVICE=https://ess-graph-repository.<your-subdomain>.workers.dev

# An engineer
curl -X POST $SERVICE/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H 'content-type: application/json' \
  -d '{"userName":"Engineer Name","userEmail":"eng@example.com","role":"engineer"}'

# A Top Management viewer
curl -X POST $SERVICE/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H 'content-type: application/json' \
  -d '{"userName":"Manager Name","role":"viewer"}'
```

The response contains `key` — hand it to that person over something private.
It is not recoverable afterwards.

`scripts/make-key.mjs` can also mint engineer and viewer keys directly against
the database if you would rather not use the API; the API route is simply more
convenient once an admin key exists.

### 3.3 Seeing and revoking keys

```bash
curl $SERVICE/v1/admin/keys -H "Authorization: Bearer $ADMIN_KEY"

curl -X DELETE $SERVICE/v1/admin/keys/<id> -H "Authorization: Bearer $ADMIN_KEY"
```

`lastUsedAt` (hourly resolution) is how you spot a stale or leaked key.
Revoking takes effect on the next request. It sets a flag rather than deleting
the row, so graphs already published stay attributed to that person. You cannot
revoke the key you are currently using.

**`userName` is the attribution.** It is written onto every graph that person
publishes, overriding whatever the client sent, so use their real name.

---

## 4. Configure the application

Same installer, same `.exe`, for everyone.

1. Install the application (`Data Visualization Tool Setup 1.2.0.exe` or later).
2. Open **Settings → Graph Repository**.
3. Enter the **Server URL** from step 2.3.
4. Paste the **Access Key** you were issued and click **Save Key**.
5. Click **Test Connection**. It reports exactly one of:
   - *Connected as `<name>` — Read & write* → an Engineer
   - *Connected as `<name>` — Read only* → Top Management
   - *Not connected* → with the reason
6. Set **Engineer Name** under General Settings if you like — but note the
   server overwrites the published name from the access key, so this is a local
   display convenience only.

The key is encrypted with Electron `safeStorage` (DPAPI-backed on Windows), so
the stored ciphertext is bound to that Windows user account and is useless if
copied elsewhere. The application can tell you a key is stored; it cannot show
it to you.

The server URL is stored per user. To roll it out centrally, pre-seed the
`ess-toolbox-storage` key in each user's browser-profile local storage, or
simply have each user paste it once. The access key must always be entered per
machine — it is never written to that store.

---

## 5. What gets stored

**Only the final graph dataset.** Raw imported spreadsheets are never copied,
uploaded or retained anywhere — only their file *names*, as provenance.

| Where | What | Size |
|---|---|---|
| D1 `graphs` | project, data date, engineer, timestamps, full graph configuration (title, labels, legend, axis ranges, line styles, pins), cycle/SOC summary | ~1.9 KB |
| R2 `graphs/<project>/<dataDate>/<id>.essg.gz` | the compressed series | ~0.84 MB |
| D1 `access_keys` | name, email, role, SHA-256 of the key, timestamps | tiny |

Together the metadata and payload redraw the graph exactly as the engineer saw
it.

Every upload is verified server-side before it is stored: structure, safe
names, a 32 MB ceiling, and a **SHA-256 recomputed over the bytes that actually
arrived**. A truncated upload is rejected rather than stored and discovered
later by whoever opens it.

---

## 6. Backup

- **D1** — `wrangler d1 export ess-graph-repository --remote --output backup.sql`.
  Small, fast, and worth putting on a schedule.
- **R2** — records are immutable, so any incremental copy only ever transfers
  new objects. `rclone` or the S3-compatible API both work.
- **Every engineer's machine also keeps a local copy of everything it has
  synced**, so the service is not a single point of data loss.

Restore is an import of the SQL dump plus a copy of the objects back into the
bucket. Because records are immutable, a copy is always consistent — there is
no consistency window to coordinate.

---

## 7. Rollout

1. **Pilot** — two engineers and one manager for a week. Confirm graphs
   generated on one machine appear on the others, and that the manager sees
   *View only*.
2. **Verify roles** — have the manager confirm no import controls are visible
   and the header shows the **VIEW ONLY** badge.
3. **Fleet** — distribute the installer, the service URL, and one key per
   person.

Existing installations lose nothing: graphs already in local history publish
automatically on first successful connection.

**Upgrading from 1.1.x (shared folder):** the folder setting is ignored from
1.2.0 on. Point each client at the service URL and give each user a key; their
local history republishes to the service by itself. If a 1.1.x share holds
graphs that exist on no current machine, keep it read-only until the fleet has
synced.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| *No access key configured* | Key never entered, or cleared | Settings → Graph Repository → paste the key → Save Key |
| *Access key rejected. Check the key in Settings* | Wrong key, or it was revoked | Confirm with `GET /v1/admin/keys`; issue a new one if needed |
| *Server not found. Check the server URL and your internet connection* | Wrong URL, or DNS/offline | Compare against the URL `wrangler deploy` printed; try `/v1/health` in a browser |
| *Server URL must start with https://* | A bare hostname was pasted | Include the scheme |
| *The server did not respond in time* | 60 s timeout — very slow link, or an outage | Check `/v1/health`; sync retries by itself |
| *Your account has read-only access and cannot publish graphs* | Role is `viewer` | Intended for management. If wrong, issue an `engineer` key and revoke the old one |
| Engineer sees **VIEW ONLY** unexpectedly | They were issued a `viewer` key | `GET /v1/admin/keys` to check the role; reissue |
| Status shows *Offline*, graphs still work | Service unreachable | Expected. Local history continues; pending graphs publish on reconnect |
| *n waiting to publish* stays stuck | Key revoked, or role changed to viewer | Run Test Connection; check the key is still active |
| Graph missing on another machine | Not yet synced | Sync runs every 5 min, on window focus, on regaining connectivity, and on demand. Click **Sync Now** |
| *Payload checksum does not match the metadata* | Upload was truncated in transit | The record is rejected, not stored. It retries on the next pass |
| *Graph repository sync is only available in the desktop application* | Running the dev server in a browser | Expected — network I/O lives in the Electron main process |
| `/v1/health` reports `"db": false` | Migration never ran, or the binding is wrong | `npm run migrate`; check `database_id` in `wrangler.toml` |

**Recovering an engineer locked into read-only by a wrong key:** Settings → turn
off **Automatic Synchronization**. Full local functionality returns immediately.
This is not a security hole — the server still refuses the write; the UI gating
is convenience, and the role check on `POST /v1/graphs` is the enforcement.

---

## 9. Maintenance

**Adding a project** — nothing to do. R2 keys are created on first publish.

**Adding a person** — issue a key (§3.2). No group membership, no directory.

**Someone leaves** — revoke their key. Their published graphs stay, correctly
attributed.

**Archiving old records** — delete the R2 objects and the matching D1 rows for a
year. Clients tolerate records disappearing. Given the size, there is rarely a
reason.

**Upgrading the application** — decoders read every codec version ever shipped,
so mixed versions across the fleet are safe. Upgrade at your own pace. Machines
still on 1.1.x or older simply do not talk to the service.

**Upgrading the service** — `npm run deploy`. Records are immutable and the API
is versioned under `/v1`, so a deploy is not a migration. Add new routes rather
than changing existing ones while older clients are still in the field.

**Rotating a key** — issue the new one, have the user save it, then revoke the
old. Doing it in that order means no downtime.

---

## 10. Verification commands

```bash
npm run lint     # types + export-template drift check
npm test         # 165 checks: codec, history, API, sync, access mode, end-to-end
npm run build    # production renderer bundle
```

`npm test` needs no Cloudflare account, no Electron, no `wrangler` and no
network. The Worker under test runs against `node:sqlite` executing the real
migration and an in-memory R2, so the routing, auth, roles, validation and SQL
being exercised are the code that will be deployed.
