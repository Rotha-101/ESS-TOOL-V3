import * as XLSX from 'xlsx';
import type { EvalData } from '@/types/eval-data';
import type { EmsRecord } from '@/features/telegram-ncc/types';
import { getProjectPlants } from '@/lib/project-utils';
import { forwardFillArray } from '../utils/interpolation';
import { parseFlexDate } from '../utils/parsing';
type PlantKey = 'plant1' | 'plant2' | 'plant3';
const ALL_PLANTS: PlantKey[] = ['plant1', 'plant2', 'plant3'];

/** One NCC sample, already split per plant. `time` is whatever the source gave
 *  us (Excel serial, Date, or string) — parseFlexDate sorts it out. */
type NccRow = {
  time: unknown;
  p: Partial<Record<PlantKey, number>>;
  q: Partial<Record<PlantKey, number>>;
};

const safeNum = (v: any) => {
  if (v == null || v === '--' || v === 'N/A' || v === '') return NaN;
  const n = parseFloat(String(v));
  return isNaN(n) ? NaN : n;
};

// Shared merge core for both NCC entry points (uploaded spreadsheet and records
// reused from the Telegram NCC Data tab), so the two paths cannot drift.
// Returns a new EvalData; cmdP/cmdQ/soc arrays are cloned, never mutated in place.
function mergeNccRows(rows: NccRow[], evalData: EvalData, project: string): EvalData {
  // Only touch plants this project actually has. The Telegram export always
  // emits SWG01-03 columns regardless of project, so without this a 2-plant
  // SNTL400 would take a zero-filled plant3 and draw a flat command trace.
  const plants = getProjectPlants(project).filter(
    (p): p is PlantKey => (ALL_PLANTS as string[]).includes(p),
  );

  const newData = {
    ...evalData,
    cmdP: { ...evalData.cmdP },
    cmdQ: { ...evalData.cmdQ },
    soc: { ...evalData.soc },
  };

  for (const p of ALL_PLANTS) {
    if (newData.cmdP[p]) newData.cmdP[p] = [...newData.cmdP[p]];
    if (newData.cmdQ[p]) newData.cmdQ[p] = [...newData.cmdQ[p]];
    if (newData.soc[p]) newData.soc[p] = [...newData.soc[p]];
  }

  for (const row of rows) {
    const t = parseFlexDate(row.time);
    if (!t) continue;

    // Keyed on seconds-of-day: a multi-day source collapses onto one 24h axis.
    const sec = t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds();
    const ti = Math.min(86400 - 1, Math.max(0, sec));

    for (const p of plants) {
      const pv = row.p[p];
      const qv = row.q[p];
      if (pv != null && !isNaN(pv) && newData.cmdP[p]) newData.cmdP[p][ti] = pv;
      if (qv != null && !isNaN(qv) && newData.cmdQ[p]) newData.cmdQ[p][ti] = qv;
    }
  }

  for (const p of ALL_PLANTS) {
    if (newData.cmdP[p]) forwardFillArray(newData.cmdP[p], true);
    if (newData.cmdQ[p]) forwardFillArray(newData.cmdQ[p], true);
    if (newData.soc[p]) forwardFillArray(newData.soc[p]);
  }

  return newData as EvalData;
}

// Merge an NCC/EMS command spreadsheet (SWG01-03 P/Q/SOC columns) into an
// existing dataset. Throws on unusable input.
export const mergeNccFile = async (
  file: File,
  evalData: EvalData,
  project: string,
): Promise<EvalData> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet || !sheet['!ref']) throw new Error("Empty spreadsheet");

  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as any[];
  if (aoa.length < 2) throw new Error("Not enough rows");

  let headerRowIdx = -1;
  let headerRow: string[] = [];
  for (let ri = 0; ri < Math.min(8, aoa.length); ri++) {
    const row = aoa[ri];
    if (!row) continue;
    const rowStrs = row.map((c: any) => c == null ? '' : String(c).trim());
    if (rowStrs.some((s: string) => /^(time|datetime|date\/time|starttime)$/i.test(s.replace(/\s+/g, '')))) {
      headerRowIdx = ri;
      headerRow = rowStrs;
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error("Could not find header row (Time/Datetime)");

  const timeIdx = headerRow.findIndex((h: string) => /^(time|datetime|date\/time|starttime)$/i.test(h.replace(/\s+/g, '')));
  const nccP1Idx = headerRow.findIndex((h: string) => /swg01.+p\(/i.test(h));
  const nccQ1Idx = headerRow.findIndex((h: string) => /swg01.+q\(/i.test(h));
  const nccP2Idx = headerRow.findIndex((h: string) => /swg02.+p\(/i.test(h));
  const nccQ2Idx = headerRow.findIndex((h: string) => /swg02.+q\(/i.test(h));
  const nccP3Idx = headerRow.findIndex((h: string) => /swg03.+p\(/i.test(h));
  const nccQ3Idx = headerRow.findIndex((h: string) => /swg03.+q\(/i.test(h));

  const rows: NccRow[] = [];
  for (const row of aoa.slice(headerRowIdx + 1)) {
    if (!row || row.length === 0) continue;
    const rawTime = row[timeIdx];
    if (rawTime == null) continue;
    const tStr = String(rawTime).trim();
    if (['average', 'max', 'min', 'total'].some(k => tStr.toLowerCase().startsWith(k))) continue;

    rows.push({
      time: rawTime,
      p: { plant1: safeNum(row[nccP1Idx]), plant2: safeNum(row[nccP2Idx]), plant3: safeNum(row[nccP3Idx]) },
      q: { plant1: safeNum(row[nccQ1Idx]), plant2: safeNum(row[nccQ2Idx]), plant3: safeNum(row[nccQ3Idx]) },
    });
  }

  return mergeNccRows(rows, evalData, project);
};

// Merge EMS records straight from the Telegram NCC Data tab — the in-memory
// equivalent of exporting XLSX there and re-uploading it here. EmsParser always
// backfills all three units, so the unit lookups are safe.
export const mergeNccRecords = (
  records: EmsRecord[],
  evalData: EvalData,
  project: string,
): EvalData => {
  const rows: NccRow[] = records.map(r => ({
    time: r.datetime,
    p: { plant1: r.units.SWG01?.p, plant2: r.units.SWG02?.p, plant3: r.units.SWG03?.p },
    q: { plant1: r.units.SWG01?.q, plant2: r.units.SWG02?.q, plant3: r.units.SWG03?.q },
  }));

  return mergeNccRows(rows, evalData, project);
};
