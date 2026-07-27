# Deployment & Operations Guide

Shared Graph Repository — setup, rollout and troubleshooting.

Audience: whoever administers the file server and distributes the `.exe`.
There is no server to install, no database to configure and no accounts to
create. Setup is a folder and two permission groups.

---

## 1. Create the shared folder

On the file server, create one folder — for example:

```
D:\ESS\GraphRepository        shared as   \\fileserver\ESS\GraphRepository
```

Nothing needs to be put inside it. The first engineer whose app connects with
write access creates `repository.json` and the `v1\` folder automatically.

**Sizing:** ~0.84 MB per graph. At one graph per project per day across ten
projects that is ~8 MB/day, ~3 GB/year. Five years fits comfortably in 20 GB.

---

## 2. Permissions — this is the access control

There is no role setting inside the application. **What the folder allows is
what the user can do.** The app probes write access at startup and configures
itself accordingly.

Create two AD groups and apply them to the share:

| Group | Share rights | NTFS rights | Result in the app |
|---|---|---|---|
| `ESS-Engineers` | Change | **Modify** | Generate, publish, view all, export |
| `ESS-Management` | Read | **Read & execute** | View all, search, open, export. No import, no publish, no delete |
| `ESS-Admins` | Full Control | Full control | Above, plus pruning and archiving |

### Do NOT deny Delete to engineers

An earlier draft of this guide recommended denying the NTFS *Delete* right to
make the share append-only. **That breaks publishing** and must not be applied.

Publishing writes a `.tmp` file and renames it into place so readers never see
a half-written record. On Windows, renaming a file requires the DELETE right on
the source, and an explicit Deny overrides every Allow — so a Deny-Delete share
accepts the file creation and then fails the rename with `EPERM`, leaving `.tmp`
debris behind on every attempt.

Append-only is instead guaranteed by the application: **nothing in the app ever
deletes from the share.** The delete button in the Graph Repository removes only
that computer's local copy. Combined with normal file-server backups, that is
sufficient, and engineers are trusted internal users.

The app detects this misconfiguration if it is applied anyway — `probe()`
exercises create, rename and delete, so such a share reports *Read only* rather
than claiming write access it does not have.

### Applying it

```powershell
# Run on the file server as administrator. Replace DOMAIN.
$P = 'D:\ESS\GraphRepository'

icacls $P /inheritance:d
icacls $P /remove:g "BUILTIN\Users" "Everyone" "NT AUTHORITY\Authenticated Users"
icacls $P /grant "DOMAIN\ESS-Admins:(OI)(CI)(F)"
icacls $P /grant "DOMAIN\ESS-Engineers:(OI)(CI)(M)"
icacls $P /grant "DOMAIN\ESS-Management:(OI)(CI)(RX)"

New-SmbShare -Name 'GraphRepository' -Path $P `
  -FullAccess   'DOMAIN\ESS-Admins' `
  -ChangeAccess 'DOMAIN\ESS-Engineers' `
  -ReadAccess   'DOMAIN\ESS-Management'
```

Share and NTFS permissions combine as the **most restrictive** of the two, so
both layers must allow what you intend.

### Verifying

Log in as a test member of each group and use **Settings → Shared Graph
Repository → Test Connection**. It reports exactly one of:

- *Connected — Read & write* → the user is an Engineer
- *Connected — Read only* → the user is Top Management
- *Not connected* → with the reason (not found, access denied, wrong folder)

---

## 3. Configure the application

Same installer, same `.exe`, for everyone.

1. Install the application.
2. Open **Settings → Shared Graph Repository**.
3. Enter the UNC path (or use **Browse**). Always use the UNC form
   `\\fileserver\ESS\GraphRepository`, never a mapped drive letter — drive
   letters are per-user and may not be mounted when the app starts.
4. Click **Test Connection**.
5. Set **Engineer Name** under General Settings (engineers only; it appears on
   every graph they publish).

The path is stored per user. To roll it out centrally, pre-seed the
`ess-toolbox-storage` key in each user's browser-profile local storage, or
simply have each user paste it once.

---

## 4. What gets stored

**Only the final graph dataset.** Raw imported spreadsheets are never copied,
uploaded or retained anywhere — only their file *names*, as provenance.

Each record is two files:

```
v1\SNTL600\2026\2026-06-02__01k3f9x2a8__meta.json    ~1.9 KB
v1\SNTL600\2026\2026-06-02__01k3f9x2a8__data.essg.gz ~0.84 MB
```

The metadata holds project, data date, engineer, timestamps, the full graph
configuration (title, labels, legend, axis ranges, line styles, pins) and the
cycle/SOC summary. The payload holds the compressed series. Together they
redraw the graph exactly as the engineer saw it.

---

## 5. Backup

Back the folder up with whatever already protects your file shares. Points in
its favour:

- Records are **immutable** — an incremental backup only ever copies new files
- No database means no consistency window and no dump step
- Every engineer's machine also keeps a local copy of what it has synced, so
  the share is not a single point of data loss

Restore is a plain file copy back into place.

---

## 6. Rollout

1. **Pilot** — two engineers and one manager for a week. Confirm graphs
   generated on one machine appear on the others, and that the manager sees
   *View only*.
2. **Verify permissions** — have the manager confirm no import controls are
   visible and the header shows the **VIEW ONLY** badge.
3. **Fleet** — distribute the installer and the UNC path.

Existing installations lose nothing: graphs already in local history publish
automatically on first successful connection.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| *Shared folder not found* | Path wrong, or off the network | Check the UNC path; confirm the share is reachable in Explorer |
| *Access denied* | Account not in either AD group | Add to `ESS-Engineers` or `ESS-Management` |
| *That folder contains a different kind of repository marker* | Pointed at the wrong folder | Point at the repository root, not a parent or unrelated share |
| Engineer sees **VIEW ONLY** unexpectedly | Share grants read only to their account | Check group membership and the *Deny* entries; both share and NTFS must allow writing |
| Status shows *Offline*, graphs still work | Share unreachable | Expected. Local history continues; pending graphs publish on reconnect |
| *n waiting to publish* stays stuck | Write permission lost | Run Test Connection; check the engineer is still in `ESS-Engineers` |
| Graph missing on another machine | Not yet synced | Sync runs every 5 min, on window focus, and on demand. Click **Sync Now** |
| *checksum mismatch* on one record | Truncated or damaged file | That record is skipped, not stored. Re-publish it from the originating machine |

**Recovering an engineer locked into read-only by a misconfigured share:**
Settings → turn off **Automatic Synchronization**. Full local functionality
returns immediately. This is not a security hole — the share still refuses the
write; the UI gating is convenience, and the filesystem is the enforcement.

---

## 8. Maintenance

**Adding a project** — nothing to do. Folders are created on first publish.

**Archiving old records** — an admin can move whole year folders elsewhere.
Clients tolerate records disappearing. Given the size, there is rarely a reason.

**Upgrading the application** — decoders read every codec version ever shipped,
so mixed versions across the fleet are safe. Upgrade at your own pace.

**Moving the share** — copy the folder, then update the path in each client's
Settings. Because records are immutable, a copy is always consistent.

---

## 9. Verification commands

```bash
npm run lint     # types + export-template drift check
npm test         # codec, repository, sync and access-mode guards (86 checks)
npm run build    # production renderer bundle
```

`npm test` needs no shared folder, no Electron and no network — it uses temp
folders and fakes throughout.
