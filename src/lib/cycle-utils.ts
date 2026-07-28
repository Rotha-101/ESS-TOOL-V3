import * as XLSX from 'xlsx';
export interface ESSRow {
  PlantName: string;
  DeviceName: string;
  SACU_Number: number;
  ESS_Number: number;
  StartTime: Date;
  EquivalentNumberOfCycles: number;
}

export interface PlantBlock {
  PlantName: string;
  DeviceName: string;
  ESS_Number: number;
  LastEquivalentNumberOfCycle: number;
  AverageCycleOfBlock: number | null;
  AverageCycleOfSPPC: number | null;
}

export interface DailyResult {
  SourceFolder: string;
  DataDate: string;
  SWG01_TotalCycle: number | null;
  SWG01_DailyReached: number | null;
  SWG02_TotalCycle: number | null;
  SWG02_DailyReached: number | null;
  SWG03_TotalCycle: number | null;
  SWG03_DailyReached: number | null;
  Average_Total_Plant_Cycle: number | null;
  Average_Daily_Cycle: number | null;
  p1Blocks: PlantBlock[];
  p2Blocks: PlantBlock[];
  p3Blocks: PlantBlock[];
}

export function buildPlantCycleTableJs(rows: ESSRow[], plantLabel: string): PlantBlock[] {
  if (rows.length === 0) return [];
  
  const sorted = [...rows].sort((a, b) => {
    if (a.SACU_Number !== b.SACU_Number) return a.SACU_Number - b.SACU_Number;
    if (a.ESS_Number !== b.ESS_Number) return a.ESS_Number - b.ESS_Number;
    return a.StartTime.getTime() - b.StartTime.getTime();
  });

  // Format for the UI tables
  const uniqueSACUs = Array.from(new Set(sorted.map(r => r.SACU_Number).filter(n => !isNaN(n)))).sort((a, b) => a - b);
  const outTbl: PlantBlock[] = [];
  
  for (const sacuNum of uniqueSACUs) {
    const currentData = sorted.filter(r => r.SACU_Number === sacuNum);
    const existingESS = Array.from(new Set(currentData.map(r => r.ESS_Number).filter(n => !isNaN(n)))).sort((a, b) => a - b);
    
    let essListToUse = [1, 2, 3, 4];
    if (existingESS.length > 0) {
      const maxEss = Math.max(4, ...existingESS);
      if (maxEss > 4) {
        essListToUse = Array.from({length: maxEss}, (_, i) => i + 1);
      }
    }
    if (sacuNum === 37 && existingESS.length === 3) {
      essListToUse = existingESS;
    }
    
    const lastCycles: number[] = [];
    const blockRows: PlantBlock[] = [];
    
    for (let j = 0; j < essListToUse.length; j++) {
      const essNum = essListToUse[j];
      const essData = currentData.filter(r => r.ESS_Number === essNum);
      
      let lastCycle = NaN;
      if (essData.length > 0) {
        essData.sort((a, b) => a.StartTime.getTime() - b.StartTime.getTime());
        lastCycle = essData[essData.length - 1].EquivalentNumberOfCycles;
      }
      lastCycles.push(lastCycle);
      
      blockRows.push({
        PlantName: plantLabel,
        DeviceName: `SACU-${String(sacuNum).padStart(2, '0')}`,
        ESS_Number: essNum,
        LastEquivalentNumberOfCycle: lastCycle,
        AverageCycleOfBlock: null,
        AverageCycleOfSPPC: null
      });
    }
    
    const valid = lastCycles.filter(c => !isNaN(c));
    const avgBlock = valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : NaN;
    
    if (blockRows.length > 0 && !isNaN(avgBlock)) {
      blockRows[0].AverageCycleOfBlock = avgBlock;
    }
    
    outTbl.push(...blockRows);
  }
  
  const validCycles = outTbl.map(b => b.LastEquivalentNumberOfCycle).filter(v => v !== null && !isNaN(v));
  const truePlantAvg = validCycles.length > 0 ? validCycles.reduce((s, c) => s + c, 0) / validCycles.length : NaN;
  
  if (outTbl.length > 0 && !isNaN(truePlantAvg)) {
    outTbl[0].AverageCycleOfSPPC = truePlantAvg;
  }
  
  return outTbl;
}

export async function parseCycleExcelFile(file: File, path: string): Promise<ESSRow[] | null> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws['!ref']) return null;
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[];
  if (aoa.length < 4) return null;

  let headerRow = aoa[3] || [];
  let headers = headerRow.map(h => h == null ? '' : String(h).trim());
  let lowerVars = headers.map(h => h.toLowerCase());

  let plantIdx = lowerVars.findIndex(h => (h.includes('plant') || h.includes('site')) && h.includes('name'));
  let deviceIdx = lowerVars.findIndex(h => (h.includes('device') && h.includes('name')) || h.includes('manageobject'));
  let startIdx = lowerVars.findIndex(h => h.includes('start') && h.includes('time'));
  let eqIdx = headers.findIndex(h => h === 'Equivalent number of cycles');
  if (eqIdx === -1) {
    eqIdx = lowerVars.findIndex(h => h.includes('equivalent') && h.includes('cycle'));
  }

  if (plantIdx === -1 || deviceIdx === -1 || startIdx === -1 || eqIdx === -1) {
    headerRow = aoa[0] || [];
    headers = headerRow.map(h => h == null ? '' : String(h).trim());
    lowerVars = headers.map(h => h.toLowerCase());
    plantIdx = lowerVars.findIndex(h => (h.includes('plant') || h.includes('site')) && h.includes('name'));
    deviceIdx = lowerVars.findIndex(h => (h.includes('device') && h.includes('name')) || h.includes('manageobject'));
    startIdx = lowerVars.findIndex(h => h.includes('start') && h.includes('time'));
    eqIdx = headers.findIndex(h => h === 'Equivalent number of cycles');
    if (eqIdx === -1) {
      eqIdx = lowerVars.findIndex(h => h.includes('equivalent') && h.includes('cycle'));
    }
  }

  if (plantIdx === -1 || deviceIdx === -1 || startIdx === -1 || eqIdx === -1) {
    return null;
  }

  const dataRows = aoa.slice(4);
  const parsedRows: ESSRow[] = [];

  for (const r of dataRows) {
    if (!r || r.length === 0) continue;
    const pName = r[plantIdx] != null ? String(r[plantIdx]) : '';
    const dName = r[deviceIdx] != null ? String(r[deviceIdx]) : '';
    const sTimeRaw = r[startIdx];
    const eqCycleRaw = r[eqIdx];

    if (!dName || eqCycleRaw == null) continue;

    const eqCycle = parseFloat(String(eqCycleRaw));
    if (isNaN(eqCycle)) continue;

    let sacuNum = NaN;
    let essNum = NaN;

    const tokSACU = dName.match(/(SACU|STS)-?(\d+)/i);
    const tokB = dName.match(/B(\d+)/i);
    const blockMatch = dName.match(/Block\s*([A-Z])/i);

    if (tokSACU) {
      sacuNum = parseInt(tokSACU[2], 10);
    } else if (tokB) {
      sacuNum = parseInt(tokB[1], 10);
    } else if (blockMatch) {
      sacuNum = blockMatch[1].toUpperCase().charCodeAt(0) - 64; // A=1, B=2, C=3...
    }

    const tokESS = dName.match(/(?:ESS|BESS|BEES)[-_ ]?0?(\d+)/i);
    if (tokESS) {
      essNum = parseInt(tokESS[1], 10);
    }

    // Default for 20% projects if not standard SACU:
    if (isNaN(sacuNum) && !isNaN(essNum)) {
      if (dName.includes('STS_BESS')) {
        sacuNum = 0; // Distinct from Block A/B/C
      } else {
        sacuNum = 1; // Default
      }
    }

    let startTime = null;
    if (sTimeRaw instanceof Date) {
      startTime = sTimeRaw;
    } else if (typeof sTimeRaw === 'number') {
      startTime = new Date(Math.round((sTimeRaw - 25569) * 86400000));
    } else {
      startTime = new Date(String(sTimeRaw));
    }

    parsedRows.push({
      PlantName: pName,
      DeviceName: dName,
      SACU_Number: sacuNum,
      ESS_Number: essNum,
      StartTime: startTime,
      EquivalentNumberOfCycles: eqCycle
    });
  }

  return parsedRows;
}

export const getMockDailyResults = (proj: string): DailyResult[] => {
  const dates = ['2026-05-08', '2026-05-09', '2026-05-10', '2026-05-11', '2026-05-12'];
  const baseP1 = 122.40;
  const baseP2 = 116.30;
  const baseP3 = 129.80;
  
  const results: DailyResult[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const p1 = baseP1 + i * 0.42;
    const p2 = baseP2 + i * 0.38;
    const p3 = baseP3 + i * 0.48;
    
    const p1Blocks: PlantBlock[] = [];
    const p2Blocks: PlantBlock[] = [];
    const p3Blocks: PlantBlock[] = [];
    
    const p1Sacus = [1, 2, 3, 4, 5];
    for (const sacu of p1Sacus) {
      const lastCycles = [p1 - 0.05, p1 + 0.02, p1 - 0.01, p1 + 0.04];
      const avg = lastCycles.reduce((s, v) => s + v, 0) / 4;
      
      for (let ess = 1; ess <= 4; ess++) {
        p1Blocks.push({
          PlantName: "SWG01 (Plant 01)",
          DeviceName: `SACU-${String(sacu).padStart(2, '0')}`,
          ESS_Number: ess,
          LastEquivalentNumberOfCycle: lastCycles[ess-1],
          AverageCycleOfBlock: ess === 1 ? avg : null,
          AverageCycleOfSPPC: null
        });
      }
    }
    if (p1Blocks.length > 0) p1Blocks[0].AverageCycleOfSPPC = p1;

    const p2Sacus = [15, 18, 21];
    for (const sacu of p2Sacus) {
      const lastCycles = [p2 - 0.04, p2 + 0.03, p2 - 0.02, p2 + 0.01];
      const avg = lastCycles.reduce((s, v) => s + v, 0) / 4;
      
      for (let ess = 1; ess <= 4; ess++) {
        p2Blocks.push({
          PlantName: "SWG02 (Plant 02)",
          DeviceName: `SACU-${String(sacu).padStart(2, '0')}`,
          ESS_Number: ess,
          LastEquivalentNumberOfCycle: lastCycles[ess-1],
          AverageCycleOfBlock: ess === 1 ? avg : null,
          AverageCycleOfSPPC: null
        });
      }
    }
    if (p2Blocks.length > 0) p2Blocks[0].AverageCycleOfSPPC = p2;

    const p3Sacus = [19, 20, 22];
    for (const sacu of p3Sacus) {
      const lastCycles = [p3 - 0.03, p3 + 0.05, p3 - 0.01, p3 + 0.02];
      const avg = lastCycles.reduce((s, v) => s + v, 0) / 4;
      
      for (let ess = 1; ess <= 4; ess++) {
        p3Blocks.push({
          PlantName: "SWG03 (Plant 03)",
          DeviceName: `SACU-${String(sacu).padStart(2, '0')}`,
          ESS_Number: ess,
          LastEquivalentNumberOfCycle: lastCycles[ess-1],
          AverageCycleOfBlock: ess === 1 ? avg : null,
          AverageCycleOfSPPC: null
        });
      }
    }
    if (p3Blocks.length > 0) p3Blocks[0].AverageCycleOfSPPC = p3;
    
    results.push({
      SourceFolder: `day_${String(i+1).padStart(2, '0')}`,
      DataDate: date,
      SWG01_TotalCycle: p1,
      SWG01_DailyReached: i > 0 ? 0.42 : null,
      SWG02_TotalCycle: p2,
      SWG02_DailyReached: i > 0 ? 0.38 : null,
      SWG03_TotalCycle: p3,
      SWG03_DailyReached: i > 0 ? 0.48 : null,
      Average_Total_Plant_Cycle: proj === 'SNTL400' ? (p1 + p2) / 2 : (p1 + p2 + p3) / 3,
      Average_Daily_Cycle: i > 0 ? (proj === 'SNTL400' ? (0.42 + 0.38) / 2 : (0.42 + 0.38 + 0.48) / 3) : null,
      p1Blocks,
      p2Blocks,
      p3Blocks
    });
  }
  return results;
};
