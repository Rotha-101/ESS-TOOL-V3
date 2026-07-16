import type { EvalData } from '@/types/eval-data';
import { forwardFillArray } from '../utils/interpolation';
import { parseFlexDate } from '../utils/parsing';

const XLSX = (window as any).XLSX;

// Merge an NCC/EMS command spreadsheet (SWG01-03 P/Q/SOC columns) into an
// existing dataset. Moved verbatim from DailyEvaluationGraph.tsx; returns a
// new EvalData (cmdP/cmdQ/soc arrays cloned). Throws on unusable input.
export const mergeNccFile = async (file: File, evalData: EvalData): Promise<EvalData> => {
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
      const nccSOC1Idx = headerRow.findIndex((h: string) => /swg01.+soc/i.test(h));
      const nccP2Idx = headerRow.findIndex((h: string) => /swg02.+p\(/i.test(h));
      const nccQ2Idx = headerRow.findIndex((h: string) => /swg02.+q\(/i.test(h));
      const nccSOC2Idx = headerRow.findIndex((h: string) => /swg02.+soc/i.test(h));
      const nccP3Idx = headerRow.findIndex((h: string) => /swg03.+p\(/i.test(h));
      const nccQ3Idx = headerRow.findIndex((h: string) => /swg03.+q\(/i.test(h));
      const nccSOC3Idx = headerRow.findIndex((h: string) => /swg03.+soc/i.test(h));

      const safeNum = (v) => {
        if (v == null || v === '--' || v === 'N/A' || v === '') return NaN;
        const n = parseFloat(String(v));
        return isNaN(n) ? NaN : n;
      };

      const newData = {
        ...evalData,
        cmdP: { ...evalData.cmdP },
        cmdQ: { ...evalData.cmdQ },
        soc: { ...evalData.soc }
      };

      for (const p of ['plant1', 'plant2', 'plant3'] as const) {
        if (newData.cmdP[p]) newData.cmdP[p] = [...newData.cmdP[p]];
        if (newData.cmdQ[p]) newData.cmdQ[p] = [...newData.cmdQ[p]];
        if (newData.soc[p]) newData.soc[p] = [...newData.soc[p]];
      }

      for (const row of aoa.slice(headerRowIdx + 1)) {
        if (!row || row.length === 0) continue;
        const rawTime = row[timeIdx];
        if (rawTime == null) continue;
        const tStr = String(rawTime).trim();
        if (['average', 'max', 'min', 'total'].some(k => tStr.toLowerCase().startsWith(k))) continue;
        const t = parseFlexDate(rawTime);
        if (!t) continue;

        const sec = t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds();
        const ti = Math.min(86400 - 1, Math.max(0, sec));

        const p1 = safeNum(row[nccP1Idx]);
        const q1 = safeNum(row[nccQ1Idx]);
        const p2 = safeNum(row[nccP2Idx]);
        const q2 = safeNum(row[nccQ2Idx]);
        const p3 = safeNum(row[nccP3Idx]);
        const q3 = safeNum(row[nccQ3Idx]);

        if (!isNaN(p1)) newData.cmdP.plant1[ti] = p1;
        if (!isNaN(q1)) newData.cmdQ.plant1[ti] = q1;
        if (!isNaN(p2)) newData.cmdP.plant2[ti] = p2;
        if (!isNaN(q2)) newData.cmdQ.plant2[ti] = q2;
        if (!isNaN(p3)) newData.cmdP.plant3[ti] = p3;
        if (!isNaN(q3)) newData.cmdQ.plant3[ti] = q3;
      }

      const plants: ('plant1' | 'plant2' | 'plant3')[] = ['plant1', 'plant2', 'plant3'];
      for (const p of plants) {
        forwardFillArray(newData.cmdP[p], true);
        forwardFillArray(newData.cmdQ[p], true);
        forwardFillArray(newData.soc[p]);
      }

      return newData as EvalData;
};
