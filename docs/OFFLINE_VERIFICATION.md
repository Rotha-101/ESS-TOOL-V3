# Offline Verification — Release Gate

**Status: NOT PERFORMED.** This must pass on a real machine before the pilot.

---

## Release record

Fill this in when the run happens. A result with no build identity is not a
result — it cannot be reproduced, and it cannot be trusted six months later.

| Field | Value |
|---|---|
| Application version | `________` (Settings → About) |
| Commit hash | `________` |
| Installer file | `Data Visualization Tool Setup ______.exe` |
| Build date | `________` |
| Verification date | `________` |
| Operating system | `________` (e.g. Windows 11 Pro 26200) |
| Machine | `________` |
| Verified by | `________` |

**Overall result:** ☐ PASS ☐ FAIL

| Section | Result |
|---|---|
| A — cold start, no network | ☐ pass ☐ fail |
| B — the paths that broke before | ☐ pass ☐ fail |
| C — the work itself | ☐ pass ☐ fail |
| D — persistence | ☐ pass ☐ fail |
| E — reconnection | ☐ pass ☐ fail |
| F — recovery | ☐ pass ☐ fail |

**If any step fails:** fix the issue, build a new release candidate, and
**restart from Part A**. Do not resume from the failed step — a fix can break
something that already passed, and a partial run gives no evidence that it
did not.

The application version above must match the tagged source. If they differ, the
run is void: it proves something about a build nobody can rebuild.

Offline operation is the product's core promise, and it has broken twice
already — both times silently, both times found by reading code rather than by
using the application. Neither the test suite nor a typecheck can catch it,
because both run with a network available.

---

## Why this is a blocker, not a nice-to-have

Spreadsheet import depended on `cdn.sheetjs.com` in two separate places:

1. The main parsing path used a bare `XLSX` global — fixed in `7bedfdf`.
2. The parser **worker** called `importScripts` against the same CDN, with a
   local `const XLSX` shadowing the bundled import — found and fixed in
   `1e9ef52`, *after* the first fix had been reported as complete.

The same defect, in the same feature, twice. The second was only found by
auditing rather than trusting the first fix. There is no reason to assume a
third does not exist, and the only way to know is to run the application with
the network genuinely off.

**Pull the cable or disable the adapter in Windows.** Do not rely on turning
Wi-Fi off in software — some stacks keep a cached route alive, and a CDN fetch
that succeeds from cache proves nothing.

---

## Procedure

Use the **installed build**, not `npm run dev`. The dev server is itself a
network dependency and will mask exactly what this is testing.

Before starting, note the build version from Settings → About.

### Part A — cold start with no network

| # | Step | Expected | Result |
|---|---|---|---|
| A1 | Disconnect the network adapter | No connectivity at all | ☐ |
| A2 | Launch the application | Opens to Home; no error dialog | ☐ |
| A3 | Check the status indicator | Reads *Working offline* or *Saved* — never a technical error | ☐ |
| A4 | Confirm fonts | Text renders (system fallback is acceptable) | ☐ |

### Part B — the paths that broke before

| # | Step | Expected | Result |
|---|---|---|---|
| B1 | Import a folder of `.xlsx` files | Parses and validates normally | ☐ |
| B2 | Import a `.zip` archive | Extracts and parses | ☐ |
| B3 | Import a `.rar` archive | **Expected to fail** with *"Opening .rar files needs an internet connection…"* — a clear message, not a stack trace | ☐ |
| B4 | Open Cycle Calculation | Parses its spreadsheets | ☐ |
| B5 | Open NCC Data and merge | Works | ☐ |

B1 and B2 are the regression tests for the two CDN defects. B3 documents a
known, accepted limitation — verify the *wording*, not just the failure.

### Part C — the work itself

| # | Step | Expected | Result |
|---|---|---|---|
| C1 | Generate a Daily Evaluation graph | Renders; charts appear (Plotly is bundled) | ☐ |
| C2 | Confirm it auto-saved | Appears in Graph History with a **disk** icon | ☐ |
| C3 | Open a past graph from the date picker | Opens without a network call | ☐ |
| C4 | Export HTML | File written and opens in a browser | ☐ |
| C5 | Copy to clipboard | Image lands in the clipboard | ☐ |
| C6 | Export Excel logs | File written | ☐ |

C4 note: the exported HTML references Plotly from a CDN by design — it is a
portable artifact meant to be opened elsewhere. Verify the *export* succeeds
offline; the exported file needing internet to view is expected.

### Part D — persistence

| # | Step | Expected | Result |
|---|---|---|---|
| D1 | Close the application completely | — | ☐ |
| D2 | Relaunch, still offline | Opens to the last screen used | ☐ |
| D3 | Check Graph History | Every graph from Part C still listed | ☐ |
| D4 | Open one | Renders identically | ☐ |
| D5 | Check the pending count | Shows graphs waiting to publish | ☐ |

### Part E — reconnection

| # | Step | Expected | Result |
|---|---|---|---|
| E1 | Reconnect the network | — | ☐ |
| E2 | Focus the application window | Sync starts within seconds — no button pressed | ☐ |
| E3 | Watch the status | *Syncing…* then *Saved* | ☐ |
| E4 | Confirm server-side | `GET /v1/graphs/ids` lists every graph from Part C | ☐ |
| E5 | Second machine syncs | Receives them, opens them | ☐ |

E2 is the point of the whole design: **no manual action should be required.**
If a user has to press anything, that is a defect.

### Part F — recovery

| # | Step | Expected | Result |
|---|---|---|---|
| F1 | Disconnect mid-sync (during E3) | No crash; status returns to offline | ☐ |
| F2 | Reconnect | Remaining graphs publish | ☐ |
| F3 | Confirm nothing was lost | Local count equals server count | ☐ |

F3 is the regression test for the silent publish-loss defect fixed in `455fa81`.
If a graph is present locally but absent server-side while the app reports
success, that bug has returned.

---

## Recording the result

Note the build version, date, machine, and any step that failed. A failed step
is release-blocking unless it is B3, which is the documented limitation.

If every step passes, offline operation moves from *asserted* to *verified*, and
this document becomes a regression checklist for future releases.

## Known accepted limitations

- `.rar` and `.7z` need a connection — the readers load on demand. ZIP and
  plain folders are the offline path.
- Fonts fall back to system faces without a connection. Cosmetic only.
- Exported HTML files reference Plotly from a CDN. They are portable artifacts,
  not application code.
