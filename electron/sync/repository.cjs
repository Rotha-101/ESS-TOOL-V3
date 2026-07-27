// Shared-folder graph repository — every filesystem operation lives here.
//
// The repository is a plain folder on an SMB share. There is no server, no
// database and no lock file, because records are immutable and uniquely named:
// two engineers processing the same plant-day simply write two files and both
// are kept.
//
// Layout:
//   <root>/repository.json
//   <root>/v1/<PROJECT>/<YYYY>/<dataDate>__<id>__meta.json
//   <root>/v1/<PROJECT>/<YYYY>/<dataDate>__<id>__data.essg.gz
//
// Filenames carry dataDate and id, so a sync pass diffs ids straight from
// readdir without opening a single file.

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const SCHEMA_VERSION = 1;
const DATA_DIR = 'v1';
const MARKER = 'repository.json';
const META_SUFFIX = '__meta.json';
const DATA_SUFFIX = '__data.essg.gz';

/** Filenames must survive Windows, SMB and the odd hand-copied folder. */
const SAFE = /^[A-Za-z0-9._-]+$/;

const isSafeSegment = (value) => typeof value === 'string' && value.length > 0 && value.length <= 64 && SAFE.test(value);

function recordBase(dataDate, id) {
  return `${dataDate}__${id}`;
}

/** Reverse of recordBase. Returns null for anything that is not one of ours,
 *  so stray files in the share are ignored rather than breaking a sync. */
function parseMetaFilename(filename) {
  if (!filename.endsWith(META_SUFFIX)) return null;
  const base = filename.slice(0, -META_SUFFIX.length);
  const sep = base.indexOf('__');
  if (sep <= 0) return null;
  const dataDate = base.slice(0, sep);
  const id = base.slice(sep + 2);
  if (!isSafeSegment(dataDate) || !isSafeSegment(id)) return null;
  return { dataDate, id };
}

const recordDir = (root, project, year) => path.join(root, DATA_DIR, project, String(year));

function yearOf(dataDate) {
  const year = Number(String(dataDate).slice(0, 4));
  return Number.isFinite(year) && year > 1970 && year < 3000 ? year : new Date().getFullYear();
}

async function readdirSafe(dir) {
  try {
    return await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    // A missing folder is normal (no records for that project yet); anything
    // else is worth surfacing to the caller.
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return [];
    throw err;
  }
}

/**
 * Is the share reachable, and may this user write to it?
 *
 * Write capability is tested by actually creating and deleting a temp file
 * rather than by inspecting ACLs: effective NTFS permissions through group
 * membership, inheritance and share-level rights are not something to
 * re-implement, and the only answer that matters is whether a write succeeds.
 * This is also how the app derives Engineer vs Management — the role IS the
 * filesystem permission.
 */
async function probe(root) {
  if (!root || typeof root !== 'string') {
    return { reachable: false, writable: false, error: 'No shared folder configured.' };
  }

  try {
    const stat = await fsp.stat(root);
    if (!stat.isDirectory()) {
      return { reachable: false, writable: false, error: 'The configured path is not a folder.' };
    }
  } catch (err) {
    return {
      reachable: false,
      writable: false,
      error:
        err.code === 'ENOENT'
          ? 'Shared folder not found. Check the path and that you are connected to the company network.'
          : err.code === 'EACCES' || err.code === 'EPERM'
            ? 'Access denied. Your Windows account may not have permission to this share.'
            : `Could not reach the shared folder: ${err.message}`,
    };
  }

  let writable = false;
  const probeFile = path.join(root, `.write-probe-${process.pid}-${Date.now()}`);
  try {
    await fsp.writeFile(probeFile, '');
    writable = true;
  } catch {
    writable = false;
  } finally {
    try { await fsp.unlink(probeFile); } catch { /* never existed */ }
  }

  // Read the marker, creating it on first use if we are allowed to.
  let schemaVersion = null;
  const markerPath = path.join(root, MARKER);
  try {
    const parsed = JSON.parse(await fsp.readFile(markerPath, 'utf8'));
    schemaVersion = parsed.schemaVersion ?? null;
    if (parsed.kind !== 'ess-graph-repository') {
      return {
        reachable: true,
        writable,
        error: 'That folder contains a different kind of repository marker. Pick an empty folder or the correct share.',
      };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return { reachable: true, writable, error: `Repository marker unreadable: ${err.message}` };
    }
    if (writable) {
      try {
        await fsp.mkdir(path.join(root, DATA_DIR), { recursive: true });
        await fsp.writeFile(
          markerPath,
          JSON.stringify({ kind: 'ess-graph-repository', schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString() }, null, 2),
        );
        schemaVersion = SCHEMA_VERSION;
      } catch (writeErr) {
        return { reachable: true, writable, error: `Could not initialise the repository: ${writeErr.message}` };
      }
    }
    // Read-only user on an uninitialised share: reachable, just nothing there.
  }

  if (schemaVersion != null && schemaVersion > SCHEMA_VERSION) {
    return {
      reachable: true,
      writable,
      schemaVersion,
      error: `This repository was created by a newer version of the application (schema ${schemaVersion}). Please update to open it.`,
    };
  }

  return { reachable: true, writable, schemaVersion, error: null };
}

/** Every record id in the share, cheaply: two levels of readdir plus one more
 *  per project/year, and no file contents. */
async function listRecordIds(root) {
  const dataRoot = path.join(root, DATA_DIR);
  const refs = [];

  for (const projectEntry of await readdirSafe(dataRoot)) {
    if (!projectEntry.isDirectory()) continue;
    const project = projectEntry.name;

    for (const yearEntry of await readdirSafe(path.join(dataRoot, project))) {
      if (!yearEntry.isDirectory()) continue;
      const year = yearEntry.name;

      for (const fileEntry of await readdirSafe(path.join(dataRoot, project, year))) {
        if (!fileEntry.isFile()) continue;
        const parsed = parseMetaFilename(fileEntry.name);
        if (parsed) refs.push({ id: parsed.id, project, year, dataDate: parsed.dataDate });
      }
    }
  }

  return refs;
}

function pathsFor(root, ref) {
  const dir = recordDir(root, ref.project, ref.year ?? yearOf(ref.dataDate));
  const base = recordBase(ref.dataDate, ref.id);
  return {
    dir,
    meta: path.join(dir, `${base}${META_SUFFIX}`),
    data: path.join(dir, `${base}${DATA_SUFFIX}`),
  };
}

async function fetchMeta(root, ref) {
  const { meta } = pathsFor(root, ref);
  return JSON.parse(await fsp.readFile(meta, 'utf8'));
}

async function fetchPayload(root, ref) {
  const { data } = pathsFor(root, ref);
  return fsp.readFile(data); // Buffer; the renderer converts to Uint8Array
}

/**
 * Publish a record.
 *
 * Written to temp names and renamed into place, payload first and metadata
 * last, so a concurrent reader never sees a half-written record — and never
 * sees metadata pointing at a payload that is not fully there yet. Existing
 * records are never overwritten: ids are unique, and a repeat publish of the
 * same id is treated as already done.
 */
async function putRecord(root, meta, payload) {
  if (!meta || !isSafeSegment(meta.project) || !isSafeSegment(meta.dataDate) || !isSafeSegment(meta.id)) {
    throw new Error('Record rejected: project, dataDate and id must be simple names.');
  }

  const ref = { id: meta.id, project: meta.project, dataDate: meta.dataDate, year: yearOf(meta.dataDate) };
  const target = pathsFor(root, ref);
  await fsp.mkdir(target.dir, { recursive: true });

  if (fs.existsSync(target.meta)) return { status: 'exists', id: meta.id };

  const stamp = `${process.pid}-${Date.now()}`;
  const tmpData = `${target.data}.${stamp}.tmp`;
  const tmpMeta = `${target.meta}.${stamp}.tmp`;

  try {
    await fsp.writeFile(tmpData, Buffer.from(payload));
    await fsp.writeFile(tmpMeta, JSON.stringify(meta, null, 2), 'utf8');
    await fsp.rename(tmpData, target.data);
    await fsp.rename(tmpMeta, target.meta);
    return { status: 'written', id: meta.id };
  } catch (err) {
    for (const leftover of [tmpData, tmpMeta]) {
      try { await fsp.unlink(leftover); } catch { /* nothing to clean */ }
    }
    // A parallel publisher winning the race is success, not failure.
    if (fs.existsSync(target.meta)) return { status: 'exists', id: meta.id };
    throw err;
  }
}

module.exports = {
  SCHEMA_VERSION,
  probe,
  listRecordIds,
  fetchMeta,
  fetchPayload,
  putRecord,
  // exported for tests
  parseMetaFilename,
  recordBase,
  pathsFor,
};
