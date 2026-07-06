import Plot from 'react-plotly.js';
import React, { useEffect, useRef, useState } from 'react';

import { Activity, AlertTriangle, BarChart3, Database, Download, FileSpreadsheet, Trash2, Upload, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getDBItem, setDBItem, removeDBItem } from '../lib/db';
import { buildPlantCycleTableJs, getMockDailyResults, parseCycleExcelFile, type DailyResult, type ESSRow } from '../lib/cycle-utils';
import { getFilesFromDataTransfer } from '../lib/file-utils';
import { expandZip, extractDataDate, hcByProject } from '../lib/audit-engine.js';
import { PlantDetailTable } from './PlantDetailTable';
import { getProjectPlants } from '../lib/project-utils';

const XLSX = (window as any).XLSX;

export function CycleCalculation({ project, theme }: { project: string, theme: 'dark' | 'light' }) {
  const [dailyResults, setDailyResults] = useState<DailyResult[]>([]);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(0);
  const [activePlantTab, setActivePlantTab] = useState<'p1' | 'p2' | 'p3' | 'summary'>('summary');
  
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcProgress, setCalcProgress] = useState(0);
  const [calcStatus, setCalcStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [yesterdayFiles, setYesterdayFiles] = useState<{file: File, path: string}[]>([]);
  const [todayFiles, setTodayFiles] = useState<{file: File, path: string}[]>([]);

  const customFileInputRef = useRef<HTMLInputElement>(null);
  const customFolderInputRef = useRef<HTMLInputElement>(null);
  const yesterdayInputRef = useRef<HTMLInputElement>(null);
  const todayInputRef = useRef<HTMLInputElement>(null);

  // Load persisted history on mount and on project switch
  useEffect(() => {
    (async () => {
      const parsed = await getDBItem<any[]>(`cycle_history_${project}`);
      if (parsed) {
        setDailyResults(parsed);
        if (parsed.length > 0) setSelectedDayIdx(parsed.length - 1);
      } else {
        setDailyResults([]);
        setSelectedDayIdx(0);
      }
    })();
    
    // Clear out queued files when switching projects
    setYesterdayFiles([]);
    setTodayFiles([]);
  }, [project]);

  const parseAndCalculateCycle = async (files: { file: File, path: string }[]) => {
    setIsCalculating(true);
    setCalcProgress(0);
    setCalcStatus('Initializing Cycle Calculation...');
    setErrorMessage('');
    
    try {
      const filtered = files.filter(f => /\.xlsx?$/i.test(f.file.name) && !f.file.name.startsWith('~$'));
      if (filtered.length === 0) {
        throw new Error('No valid ESS spreadsheets found in the uploaded selection.');
      }
      
      const dayGroups: { [dateStr: string]: { file: File, path: string }[] } = {};
      
      for (const entry of filtered) {
        let dateStr = extractDataDate(entry.path, entry.file.name);
        if (!dateStr) {
          dateStr = 'Unknown';
        }
        if (!dayGroups[dateStr]) {
          dayGroups[dateStr] = [];
        }
        dayGroups[dateStr].push(entry);
      }
      
      const results: DailyResult[] = [];
      const dates = Object.keys(dayGroups).sort();
      let totalFilesProcessed = 0;
      
      for (let dIdx = 0; dIdx < dates.length; dIdx++) {
        const dateStr = dates[dIdx];
        const entries = dayGroups[dateStr];
        
        setCalcStatus(`Reading Excel Sheets for Date: ${dateStr}...`);
        
        const allParsedRows: ESSRow[] = [];
        for (let fIdx = 0; fIdx < entries.length; fIdx++) {
          const entry = entries[fIdx];
          totalFilesProcessed++;
          setCalcProgress((totalFilesProcessed / filtered.length) * 100);
          
          const parsed = await parseCycleExcelFile(entry.file, entry.path);
          if (parsed && parsed.length > 0) {
            allParsedRows.push(...parsed);
          }
        }
        
        if (allParsedRows.length === 0) continue;
        
        let finalDateStr = dateStr;
        if (dateStr === 'Unknown') {
          const firstTime = allParsedRows.find(r => r.StartTime instanceof Date)?.StartTime;
          if (firstTime) {
            const y = firstTime.getFullYear();
            const m = String(firstTime.getMonth() + 1).padStart(2, '0');
            const d = String(firstTime.getDate()).padStart(2, '0');
            finalDateStr = `${y}-${m}-${d}`;
          }
        }
        
        // SACU project groups
        let SPPC1_SACU: number[] = [];
        let SPPC2_SACU: number[] = [];
        let SPPC3_SACU: number[] = [];
        
        if (getProjectPlants(project).length === 2) {
          SPPC1_SACU = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 19, 20, 23];
          SPPC2_SACU = [7, 11, 13, 14, 15, 16, 17, 21, 22, 24, 25];
        } else if (project === 'SNTL600') {
          SPPC1_SACU = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17];
          SPPC2_SACU = [15, 18, 21, 24, 27, 30, 31, 32, 33, 34];
          SPPC3_SACU = [19, 20, 22, 23, 25, 26, 28, 29, 35, 36, 37];
        } else {
          // Fallback for BESS / generic projects
          SPPC1_SACU = Array.from({length: 100}, (_, i) => i + 1);
        }
        
        let p1Rows = allParsedRows.filter(r => SPPC1_SACU.includes(r.SACU_Number));
        let p2Rows = allParsedRows.filter(r => SPPC2_SACU.includes(r.SACU_Number));
        let p3Rows = allParsedRows.filter(r => SPPC3_SACU.includes(r.SACU_Number));
        
        const p1Blocks = buildPlantCycleTableJs(p1Rows, "SWG01 (Plant 01)");
        const p2Blocks = buildPlantCycleTableJs(p2Rows, "SWG02 (Plant 02)");
        const p3Blocks = buildPlantCycleTableJs(p3Rows, "SWG03 (Plant 03)");
        
        const p1Avg = p1Blocks.length > 0 && p1Blocks[0].AverageCycleOfSPPC !== null ? p1Blocks[0].AverageCycleOfSPPC : null;
        const p2Avg = p2Blocks.length > 0 && p2Blocks[0].AverageCycleOfSPPC !== null ? p2Blocks[0].AverageCycleOfSPPC : null;
        const p3Avg = p3Blocks.length > 0 && p3Blocks[0].AverageCycleOfSPPC !== null ? p3Blocks[0].AverageCycleOfSPPC : null;
        
        results.push({
          SourceFolder: finalDateStr,
          DataDate: finalDateStr,
          SWG01_TotalCycle: p1Avg,
          SWG01_DailyReached: null,
          SWG02_TotalCycle: p2Avg,
          SWG02_DailyReached: null,
          SWG03_TotalCycle: p3Avg,
          SWG03_DailyReached: null,
          Average_Total_Plant_Cycle: null,
          Average_Daily_Cycle: null,
          p1Blocks,
          p2Blocks,
          p3Blocks
        });
      }
      
      if (results.length === 0) {
        throw new Error('No cycle datasets could be computed from the files. Check that column names contains "Equivalent number of cycles" and device names match "SACU-XX".');
      }
      
      // Load existing history to combine with new data
      let combinedResults: DailyResult[] = [];
      const parsed = await getDBItem<any[]>(`cycle_history_${project}`);
      if (parsed && Array.isArray(parsed)) combinedResults = parsed;
      
      // Update or append new results
      for (const newResult of results) {
        const existingIdx = combinedResults.findIndex(r => r.DataDate === newResult.DataDate);
        if (existingIdx >= 0) {
          combinedResults[existingIdx] = newResult;
        } else {
          combinedResults.push(newResult);
        }
      }
      
      combinedResults.sort((a, b) => a.DataDate.localeCompare(b.DataDate));
      
      // Calculate daily reached over the entire combined history
      for (let i = 0; i < combinedResults.length; i++) {
        const cur = combinedResults[i];
        if (i > 0) {
          const prev = combinedResults[i - 1];
          if (cur.SWG01_TotalCycle !== null && prev.SWG01_TotalCycle !== null) {
            cur.SWG01_DailyReached = cur.SWG01_TotalCycle - prev.SWG01_TotalCycle;
          }
          if (cur.SWG02_TotalCycle !== null && prev.SWG02_TotalCycle !== null) {
            cur.SWG02_DailyReached = cur.SWG02_TotalCycle - prev.SWG02_TotalCycle;
          }
          if (cur.SWG03_TotalCycle !== null && prev.SWG03_TotalCycle !== null) {
            cur.SWG03_DailyReached = cur.SWG03_TotalCycle - prev.SWG03_TotalCycle;
          }
        } else {
           cur.SWG01_DailyReached = null;
           cur.SWG02_DailyReached = null;
           cur.SWG03_DailyReached = null;
        }
        
        const validP1 = cur.p1Blocks ? cur.p1Blocks.filter(b => b.LastEquivalentNumberOfCycle !== null && !isNaN(b.LastEquivalentNumberOfCycle)) : [];
        const validP2 = cur.p2Blocks ? cur.p2Blocks.filter(b => b.LastEquivalentNumberOfCycle !== null && !isNaN(b.LastEquivalentNumberOfCycle)) : [];
        const validP3 = cur.p3Blocks ? cur.p3Blocks.filter(b => b.LastEquivalentNumberOfCycle !== null && !isNaN(b.LastEquivalentNumberOfCycle)) : [];
        
        let allValid = [...validP1];
        if (getProjectPlants(project).length >= 2) allValid = [...allValid, ...validP2];
        if (getProjectPlants(project).length >= 3) allValid = [...allValid, ...validP3];
        
        if (allValid.length > 0) {
          cur.Average_Total_Plant_Cycle = allValid.reduce((s, b) => s + b.LastEquivalentNumberOfCycle, 0) / allValid.length;
        } else {
          cur.Average_Total_Plant_Cycle = null;
        }
        
        let sumD = 0;
        let countD = 0;
        if (cur.SWG01_DailyReached !== null) { sumD += cur.SWG01_DailyReached * validP1.length; countD += validP1.length; }
        if (getProjectPlants(project).length >= 2 && cur.SWG02_DailyReached !== null) { sumD += cur.SWG02_DailyReached * validP2.length; countD += validP2.length; }
        if (getProjectPlants(project).length >= 3 && cur.SWG03_DailyReached !== null) { sumD += cur.SWG03_DailyReached * validP3.length; countD += validP3.length; }
        
        cur.Average_Daily_Cycle = countD > 0 ? sumD / countD : null;
      }
      
      await setDBItem(`cycle_history_${project}`, combinedResults);
      setDailyResults(combinedResults);
      setSelectedDayIdx(combinedResults.length - 1);
      setCalcStatus(`Successfully processed and accumulated ${combinedResults.length} days of data!`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || String(err));
      setCalcStatus('Failed calculation.');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleClearHistory = () => {
    if (!confirm('Are you sure you want to clear the entire cycle calculation history for this project? This cannot be undone.')) return;
    removeDBItem(`cycle_history_${project}`);
    setDailyResults([]);
    setSelectedDayIdx(0);
    setCalcStatus('Cycle history cleared.');
  };

  const handleValidationTabReuse = async () => {
    const currentPlants = hcByProject[project] || [];
    const essFiles: { file: File, path: string }[] = [];
    
    for (const plant of currentPlants) {
      const list = plant.files?.ESS || [];
      for (const item of list) {
        essFiles.push({ file: item.file, path: item.path });
      }
    }
    
    if (essFiles.length === 0) {
      setErrorMessage(`No ESS (battery) spreadsheets found in the Validation tab. Please upload your BESS spreadsheets first or drop them directly below.`);
      return;
    }
    
    await parseAndCalculateCycle(essFiles);
  };

  const handleUploadZipOrXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const rawFiles = Array.from(e.target.files);
    e.target.value = '';
    
    setIsCalculating(true);
    setCalcStatus('Unpacking archives if present...');
    
    const finalFiles: { file: File, path: string }[] = [];
    for (const f of rawFiles) {
      if (/\.(zip|rar|7z)$/i.test(f.name)) {
        try {
          const unpacked = await expandZip(f, f.name);
          finalFiles.push(...unpacked);
        } catch (err) {
          console.error(`Failed to unpack ${f.name}:`, err);
        }
      } else {
        finalFiles.push({ file: f, path: f.name });
      }
    }
    
    await parseAndCalculateCycle(finalFiles);
  };

  const isBessProject = typeof project === 'string' && (project.startsWith('SNTB') || project.startsWith('SNTV') || project.startsWith('SNTD') || project.startsWith('SNTZ') || project.startsWith('MSGP'));


  const handleDownloadWorkbook = () => {
    if (dailyResults.length === 0) return;
    
    try {
      const wb = XLSX.utils.book_new();
      
      // Sheet 1: Daily_SWG_Cycle_Result
      const summaryRows = dailyResults.map(r => ({
        'SourceFolder': r.SourceFolder,
        'DataDate': r.DataDate,
        'SWG01_TotalCycle': r.SWG01_TotalCycle === null || isNaN(r.SWG01_TotalCycle) ? '' : Number(r.SWG01_TotalCycle.toFixed(4)),
        'SWG01_DailyReached': r.SWG01_DailyReached === null || isNaN(r.SWG01_DailyReached) ? '' : Number(r.SWG01_DailyReached.toFixed(4)),
        ...(getProjectPlants(project).length >= 2 ? {
          'SWG02_TotalCycle': r.SWG02_TotalCycle === null || isNaN(r.SWG02_TotalCycle) ? '' : Number(r.SWG02_TotalCycle.toFixed(4)),
          'SWG02_DailyReached': r.SWG02_DailyReached === null || isNaN(r.SWG02_DailyReached) ? '' : Number(r.SWG02_DailyReached.toFixed(4)),
        } : {}),
        ...(getProjectPlants(project).length >= 3 ? {
          'SWG03_TotalCycle': r.SWG03_TotalCycle === null || isNaN(r.SWG03_TotalCycle) ? '' : Number(r.SWG03_TotalCycle.toFixed(4)),
          'SWG03_DailyReached': r.SWG03_DailyReached === null || isNaN(r.SWG03_DailyReached) ? '' : Number(r.SWG03_DailyReached.toFixed(4))
        } : {}),
        'Average_Total_Plant_Cycle': r.Average_Total_Plant_Cycle === null || isNaN(r.Average_Total_Plant_Cycle) ? '' : Number(r.Average_Total_Plant_Cycle.toFixed(4)),
        'Average_Daily_Cycle': r.Average_Daily_Cycle === null || isNaN(r.Average_Daily_Cycle) ? '' : Number(r.Average_Daily_Cycle.toFixed(4))
      }));
      
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Daily_SWG_Cycle_Result');
      
      // Individual tabs for each day
      for (const r of dailyResults) {
        const aoa = [
          ['Info', 'Value'],
          ['Source Folder', r.SourceFolder],
          ['Data Date', r.DataDate],
          [],
          ['PlantName', 'DeviceName', 'ESS_Number', 'LastEquivalentNumberOfCycle', 'AverageCycleOfBlock', 'AverageCycleOfSPPC']
        ];
        
        const allBlocks = [...(r.p1Blocks || [])];
        if (getProjectPlants(project).length >= 2) allBlocks.push(...(r.p2Blocks || []));
        if (getProjectPlants(project).length >= 3) allBlocks.push(...(r.p3Blocks || []));
        
        for (const b of allBlocks) {
          aoa.push([
            b.PlantName,
            b.DeviceName,
            String(b.ESS_Number),
            isNaN(b.LastEquivalentNumberOfCycle) ? '' : String(b.LastEquivalentNumberOfCycle),
            b.AverageCycleOfBlock === null || isNaN(b.AverageCycleOfBlock) ? '' : String(b.AverageCycleOfBlock),
            b.AverageCycleOfSPPC === null || isNaN(b.AverageCycleOfSPPC) ? '' : String(b.AverageCycleOfSPPC)
          ]);
        }
        
        const wsDay = XLSX.utils.aoa_to_sheet(aoa);
        
        // Clean day sheet name to be under 31 characters
        let sName = r.SourceFolder.replace(/[:\\/?*\[\]]/g, '_');
        if (sName.length > 30) sName = sName.slice(0, 30);
        
        XLSX.utils.book_append_sheet(wb, wsDay, sName);
      }
      
      const latestDateStr = dailyResults[dailyResults.length - 1]?.DataDate || 'export';
      const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `SPPC_Extracted_EquivalentCycles_AllDays_${latestDateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
    } catch (err: any) {
      alert(`Export failed: ${err.message || String(err)}`);
    }
  };

  const selectedDay = dailyResults[selectedDayIdx];
  const previousDay = selectedDayIdx > 0 ? dailyResults[selectedDayIdx - 1] : null;
  const chartDataDates = dailyResults.map(r => r.DataDate);
  const chartP1Total = dailyResults.map(r => r.SWG01_TotalCycle || 0);
  const chartP1Daily = dailyResults.map(r => r.SWG01_DailyReached || 0);
  const chartP2Total = dailyResults.map(r => r.SWG02_TotalCycle || 0);
  const chartP2Daily = dailyResults.map(r => r.SWG02_DailyReached || 0);
  const chartP3Total = dailyResults.map(r => r.SWG03_TotalCycle || 0);
  const chartP3Daily = dailyResults.map(r => r.SWG03_DailyReached || 0);

  const fontColor = theme === 'dark' ? '#E0E0E0' : '#111827';
  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const projectBlockCount = getProjectPlants(project).length === 2 ? 24 : (isBessProject ? 'Total' : 37);

  const formatCycleMetric = (value: number | null | undefined, signed = false) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '---.----';
    }
    return `${signed && value >= 0 ? '+' : ''}${value.toFixed(4)}`;
  };

  const renderCycleSummaryCard = ({
    title,
    blockLabel,
    totalYesterday,
    yesterdayCycle,
    totalToday,
    todayCycle,
    accentClass = 'text-accent-blue',
  }: {
    title: string;
    blockLabel: string;
    totalYesterday: number | null | undefined;
    yesterdayCycle: number | null | undefined;
    totalToday: number | null | undefined;
    todayCycle: number | null | undefined;
    accentClass?: string;
  }) => (
    <div className="bg-surface border border-border-v rounded-md p-4 flex flex-col relative overflow-hidden shadow-sm hover:border-accent-blue/30 transition-all min-h-[170px]">
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/5 rounded-full blur-2xl pointer-events-none"></div>
      <div className="flex justify-between items-start mb-4 relative gap-3">
        <div>
          <div className={cn("text-[14px] uppercase tracking-widest font-mono font-bold leading-none mb-1.5", accentClass)}>
            {title}
          </div>
          <div className="text-[10px] font-mono text-foreground/50">{selectedDay.DataDate}</div>
        </div>
        <span className="text-[9px] font-mono font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
          {blockLabel}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mt-auto border-t border-border-v/50 pt-4 relative">
        <div className="flex flex-col">
          <span className="text-[9px] text-foreground/50 uppercase tracking-widest mb-1 font-bold">Total Yesterday Cycle</span>
          <span className="text-[15px] font-mono font-bold text-foreground/75">
            {formatCycleMetric(totalYesterday)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-foreground/50 uppercase tracking-widest mb-1 font-bold">Yesterday Cycle</span>
          <span className={cn(
            "text-[15px] font-mono font-bold",
            yesterdayCycle !== null && yesterdayCycle !== undefined && !Number.isNaN(yesterdayCycle)
              ? "text-foreground/90"
              : "text-foreground/45"
          )}>
            {formatCycleMetric(yesterdayCycle, true)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-foreground/50 uppercase tracking-widest mb-1 font-bold">Total Today Cycle</span>
          <span className="text-[15px] font-mono font-bold text-foreground">
            {formatCycleMetric(totalToday)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-foreground/50 uppercase tracking-widest mb-1 font-bold">Today Cycle</span>
          <span className={cn(
            "text-[15px] font-mono font-bold",
            todayCycle !== null && todayCycle !== undefined && !Number.isNaN(todayCycle)
              ? "text-green-400"
              : "text-foreground/45"
          )}>
            {formatCycleMetric(todayCycle, true)}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col relative overflow-hidden">
      {/* Tab Header Toolbar */}
      <div className="px-3 py-2 border-b border-border-v flex items-center justify-between bg-surface/50 shrink-0">
        <div className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
          <Zap size={14} className="text-accent-blue" />
          Cycle Calculation <span className="text-accent-blue opacity-80 pl-1">(BESS Equivalent Cycle Engine)</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={handleValidationTabReuse}
            disabled={isCalculating}
            className="bg-blue-600 text-white hover:bg-blue-500 h-7 text-[10px] font-bold shadow-none px-5 transition-all border-none flex items-center gap-1.5"
          >
            <Database size={12} />
            Reuse Validation Tab Data
          </Button>
          <Button
            onClick={handleClearHistory}
            disabled={isCalculating || dailyResults.length === 0}
            className="bg-red-600 text-white hover:bg-red-500 h-7 text-[10px] font-bold shadow-none px-5 transition-all border-none flex items-center gap-1.5"
          >
            <Trash2 size={12} />
            Clear History
          </Button>
          <input
            type="file"
            multiple
            ref={customFileInputRef}
            className="hidden"
            accept=".zip,.rar,.7z,.xlsx,.xls"
            onChange={handleUploadZipOrXlsx}
          />
          <Button
            onClick={() => customFileInputRef.current?.click()}
            disabled={isCalculating}
            className="bg-slate-700 text-white hover:bg-slate-600 h-7 text-[10px] font-bold shadow-none px-5 transition-all border-none flex items-center gap-1.5"
          >
            <Upload size={12} />
            Upload Custom Day Folder
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Control and Day List Column */}
        <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-border-v bg-background/20 p-3 flex flex-col gap-4 shrink-0 overflow-y-auto scrollbar-clean">
          {/* Dropzone Panel - 3 Step Calculator */}
          <div className="flex flex-col gap-3">
            <input 
              type="file" 
              className="hidden" 
              ref={yesterdayInputRef} 
              {...({webkitdirectory: "", directory: ""} as any)} 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setYesterdayFiles(Array.from(e.target.files).map(f => ({ file: f, path: f.webkitRelativePath || f.name })));
                }
                e.target.value = '';
              }}
            />
            <input 
              type="file" 
              className="hidden" 
              ref={todayInputRef} 
              {...({webkitdirectory: "", directory: ""} as any)} 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setTodayFiles(Array.from(e.target.files).map(f => ({ file: f, path: f.webkitRelativePath || f.name })));
                }
                e.target.value = '';
              }}
            />

            <div
              onClick={() => yesterdayInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                if (isCalculating || !e.dataTransfer) return;
                const filesArray = await getFilesFromDataTransfer(e.dataTransfer);
                setYesterdayFiles(filesArray);
              }}
              className={cn("border border-dashed rounded p-3 text-center transition-colors flex flex-col items-center justify-center h-20 cursor-pointer", yesterdayFiles.length > 0 ? "border-green-500/50 bg-green-500/10" : "border-border-v/80 hover:border-accent-blue bg-surface/30")}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: yesterdayFiles.length > 0 ? '#4ade80' : 'var(--foreground)' }}>
                {yesterdayFiles.length > 0 ? 'âœ“' : '1.'} Drop Yesterday Data
              </div>
              <div className="text-[8px] mt-1.5 font-mono opacity-60">
                {yesterdayFiles.length > 0 ? `${yesterdayFiles.length} files loaded` : "Accepts ZIP, RAR, 7Z, Folders"}
              </div>
            </div>

            <div
              onClick={() => todayInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                if (isCalculating || !e.dataTransfer) return;
                const filesArray = await getFilesFromDataTransfer(e.dataTransfer);
                setTodayFiles(filesArray);
              }}
              className={cn("border border-dashed rounded p-3 text-center transition-colors flex flex-col items-center justify-center h-20 cursor-pointer", todayFiles.length > 0 ? "border-green-500/50 bg-green-500/10" : "border-border-v/80 hover:border-accent-blue bg-surface/30")}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: todayFiles.length > 0 ? '#4ade80' : 'var(--foreground)' }}>
                {todayFiles.length > 0 ? 'âœ“' : '2.'} Drop Today Data
              </div>
              <div className="text-[8px] mt-1.5 font-mono opacity-60">
                {todayFiles.length > 0 ? `${todayFiles.length} files loaded` : "Accepts ZIP, RAR, 7Z, Folders"}
              </div>
            </div>

            <Button 
              className="bg-accent-blue hover:bg-blue-600 text-white font-bold h-10 shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all flex items-center justify-center gap-2 w-full mt-1"
              disabled={isCalculating || (yesterdayFiles.length === 0 && todayFiles.length === 0)}
              onClick={async () => {
                setIsCalculating(true);
                setCalcStatus('Processing queued items...');
                const expanded: { file: File, path: string }[] = [];
                for (const item of [...yesterdayFiles, ...todayFiles]) {
                  if (/\.(zip|rar|7z)$/i.test(item.file.name)) {
                    try {
                      const unpacked = await expandZip(item.file, item.file.name);
                      expanded.push(...unpacked);
                    } catch (e) {}
                  } else {
                    expanded.push(item);
                  }
                }
                await parseAndCalculateCycle(expanded);
                setYesterdayFiles([]);
                setTodayFiles([]);
              }}
            >
              <Zap size={14} />
              3. CALCULATE
            </Button>
          </div>

          {/* Progress panel */}
          {isCalculating && (
            <div className="bg-accent-blue/5 border border-accent-blue/20 rounded p-2.5 text-[9px] font-mono">
              <div className="flex justify-between font-bold text-foreground/80 mb-1.5">
                <span className="truncate pr-2">{calcStatus}</span>
                <span className="text-accent-blue">{calcProgress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-foreground/5 h-1 rounded-full overflow-hidden border border-border-v/25">
                <div className="bg-accent-blue h-full transition-all" style={{ width: `${calcProgress}%` }}></div>
              </div>
            </div>
          )}

          {/* Status Message or Error */}
          {errorMessage && (
            <div className="p-2 border border-red-500/25 bg-red-500/10 text-red-400 text-[9px] font-mono rounded break-words">
              <AlertTriangle size={12} className="inline mr-1" />
              {errorMessage}
            </div>
          )}

          {/* Days Selection List */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-foreground/40 mb-2 flex justify-between items-center">
              <span>Processed Datasets ({dailyResults.length} Days)</span>
              <button 
                onClick={() => {
                  removeDBItem(`cycle_history_${project}`);
                  setDailyResults([]);
                  setSelectedDayIdx(0);
                  setCalcStatus('History cleared.');
                }}
                className="text-red-400 hover:text-red-300 px-1 py-0.5 rounded border border-red-500/20 hover:border-red-500/50 transition-colors uppercase tracking-widest text-[8px]"
              >
                Clear
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto scrollbar-clean space-y-1.5 pr-1">
              {dailyResults.map((r, idx) => (
                <button
                  key={r.DataDate}
                  onClick={() => setSelectedDayIdx(idx)}
                  className={cn(
                    "w-full text-left p-2 rounded border font-mono transition-all flex flex-col gap-1.5",
                    idx === selectedDayIdx
                      ? "bg-accent-blue/10 border-accent-blue/45 shadow-[0_0_8px_rgba(59,130,246,0.15)]"
                      : "bg-surface/30 border-border-v/50 hover:bg-surface/50"
                  )}
                >
                  <div className="flex justify-between items-center text-[10px] font-bold text-foreground/95">
                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const newResults = [...dailyResults];
                          newResults.splice(idx, 1);
                          setDailyResults(newResults);
                          setDBItem(`cycle_history_${project}`, newResults);
                          if (selectedDayIdx >= idx && selectedDayIdx > 0) {
                            setSelectedDayIdx(selectedDayIdx - 1);
                          }
                          setCalcStatus(`Removed ${r.DataDate}`);
                        }}
                        className="text-red-400 hover:bg-red-500/20 hover:text-red-300 w-4 h-4 flex items-center justify-center rounded transition-colors"
                        title="Remove this day"
                      >
                        ✕
                      </button>
                      <span>{r.DataDate}</span>
                    </div>
                    <span className="text-accent-blue text-[8px] bg-accent-blue/10 px-1 py-0.5 rounded uppercase">
                      {r.SourceFolder}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[8px] text-foreground/45 border-t border-border-v/20 pt-1.5">
                    <div>P1 Avg: <span className="font-bold text-foreground/75 font-mono">{r.SWG01_TotalCycle !== null ? r.SWG01_TotalCycle.toFixed(2) : '---'}</span></div>
                    <div>P2 Avg: <span className="font-bold text-foreground/75 font-mono">{r.SWG02_TotalCycle !== null ? r.SWG02_TotalCycle.toFixed(2) : '---'}</span></div>
                    {getProjectPlants(project).length >= 3 && (
                      <div className="col-span-2">P3 Avg: <span className="font-bold text-foreground/75 font-mono">{r.SWG03_TotalCycle !== null ? r.SWG03_TotalCycle.toFixed(2) : '---'}</span></div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Dashboard Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-background/50 overflow-y-auto scrollbar-clean p-4 space-y-4">
          {/* Plant Top Summary Cards */}
          {selectedDay && (
            <div className={cn(
              "grid gap-4 w-full shrink-0",
              getProjectPlants(project).length === 2 ? "grid-cols-1 md:grid-cols-2" : getProjectPlants(project).length >= 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"
            )}>
              {/* Plant 1 Card */}
              <div className="bg-surface border border-border-v rounded-md p-3.5 flex flex-col justify-between relative overflow-hidden shadow-sm hover:border-accent-blue/30 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/5 rounded-full blur-2xl pointer-events-none"></div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-foreground/45 text-[9px] uppercase tracking-widest font-mono">SWG01 (Plant 01)</span>
                  <span className="text-[10px] font-mono font-bold text-green-500">{getProjectPlants(project).length === 2 ? 13 : (isBessProject ? 'Total' : 16)} SACU Blocks</span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-2xl font-mono font-bold text-foreground/90">
                    {selectedDay.SWG01_TotalCycle !== null ? selectedDay.SWG01_TotalCycle.toFixed(4) : '---.----'}
                  </span>
                  <span className={cn(
                    "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                    selectedDay.SWG01_DailyReached !== null && selectedDay.SWG01_DailyReached >= 0 
                      ? "bg-green-500/10 text-green-400"
                      : "bg-foreground/5 text-foreground/45"
                  )}>
                    {selectedDay.SWG01_DailyReached !== null 
                      ? `+${selectedDay.SWG01_DailyReached.toFixed(4)}` 
                      : '---.----'}
                  </span>
                </div>
              </div>

              {/* Plant 2 Card */}
              {!isBessProject && (
                <div className="bg-surface border border-border-v rounded-md p-3.5 flex flex-col justify-between relative overflow-hidden shadow-sm hover:border-accent-blue/30 transition-all">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/5 rounded-full blur-2xl pointer-events-none"></div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-foreground/45 text-[9px] uppercase tracking-widest font-mono">SWG02 (Plant 02)</span>
                    <span className="text-[10px] font-mono font-bold text-green-500">{getProjectPlants(project).length === 2 ? 11 : 10} SACU Blocks</span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-mono font-bold text-foreground/90">
                      {selectedDay.SWG02_TotalCycle !== null ? selectedDay.SWG02_TotalCycle.toFixed(4) : '---.----'}
                    </span>
                    <span className={cn(
                      "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                      selectedDay.SWG02_DailyReached !== null && selectedDay.SWG02_DailyReached >= 0 
                        ? "bg-green-500/10 text-green-400"
                        : "bg-foreground/5 text-foreground/45"
                    )}>
                      {selectedDay.SWG02_DailyReached !== null 
                        ? `+${selectedDay.SWG02_DailyReached.toFixed(4)}` 
                        : '---.----'}
                    </span>
                  </div>
                </div>
              )}

              {/* Plant 3 Card (Hidden for SNTL400!) */}
              {getProjectPlants(project).length >= 3 && (
                <div className="bg-surface border border-border-v rounded-md p-3.5 flex flex-col justify-between relative overflow-hidden shadow-sm hover:border-accent-blue/30 transition-all">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/5 rounded-full blur-2xl pointer-events-none"></div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-foreground/45 text-[9px] uppercase tracking-widest font-mono">SWG03 (Plant 03)</span>
                    <span className="text-[10px] font-mono font-bold text-green-500">11 SACU Blocks</span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-mono font-bold text-foreground/90">
                      {selectedDay.SWG03_TotalCycle !== null ? selectedDay.SWG03_TotalCycle.toFixed(4) : '---.----'}
                    </span>
                    <span className={cn(
                      "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                      selectedDay.SWG03_DailyReached !== null && selectedDay.SWG03_DailyReached >= 0 
                        ? "bg-green-500/10 text-green-400"
                        : "bg-foreground/5 text-foreground/45"
                    )}>
                      {selectedDay.SWG03_DailyReached !== null 
                        ? `+${selectedDay.SWG03_DailyReached.toFixed(4)}` 
                        : '---.----'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table Tab Deck and Excel Exporter */}
          {selectedDay && (
            <div className="border border-border-v bg-surface/30 rounded-md p-4 flex flex-col flex-1 min-h-[300px]">
              {/* Tab switching */}
              <div className="flex flex-wrap items-center gap-2 border-b border-border-v/50 pb-2 mb-3">
                <button
                  onClick={() => setActivePlantTab('summary')}
                  className={cn(
                    "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono border transition-all",
                    activePlantTab === 'summary'
                      ? "bg-accent-blue text-foreground border-accent-blue shadow-[0_0_8px_rgba(59,130,246,0.25)]"
                      : "bg-foreground/5 border-foreground/10 text-foreground/60 hover:text-foreground hover:bg-foreground/10"
                  )}
                >
                  Daily SWG Cycle Result
                </button>
                <button
                  onClick={() => setActivePlantTab('p1')}
                  className={cn(
                    "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono border transition-all",
                    activePlantTab === 'p1'
                      ? "bg-accent-blue text-foreground border-accent-blue shadow-[0_0_8px_rgba(59,130,246,0.25)]"
                      : "bg-foreground/5 border-foreground/10 text-foreground/60 hover:text-foreground hover:bg-foreground/10"
                  )}
                >
                  SWG01 (Plant 01)
                </button>
                {!isBessProject && (
                  <button
                    onClick={() => setActivePlantTab('p2')}
                    className={cn(
                      "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono border transition-all",
                      activePlantTab === 'p2'
                        ? "bg-accent-blue text-foreground border-accent-blue shadow-[0_0_8px_rgba(59,130,246,0.25)]"
                        : "bg-foreground/5 border-foreground/10 text-foreground/60 hover:text-foreground hover:bg-foreground/10"
                    )}
                  >
                    SWG02 (Plant 02)
                  </button>
                )}
                {getProjectPlants(project).length >= 3 && (
                  <button
                    onClick={() => setActivePlantTab('p3')}
                    className={cn(
                      "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono border transition-all",
                      activePlantTab === 'p3'
                        ? "bg-accent-blue text-foreground border-accent-blue shadow-[0_0_8px_rgba(59,130,246,0.25)]"
                        : "bg-foreground/5 border-foreground/10 text-foreground/60 hover:text-foreground hover:bg-foreground/10"
                    )}
                  >
                    SWG03 (Plant 03)
                  </button>
                )}

                <Button
                  onClick={handleDownloadWorkbook}
                  className="bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 text-green-400 h-7 text-[9px] font-bold ml-auto flex items-center gap-1.5"
                >
                  <FileSpreadsheet size={12} />
                  Download Combined Workbook (.xlsx)
                </Button>
              </div>

              {/* Tab Content Tables */}
              <div className="flex-1 overflow-auto scrollbar-clean max-h-[350px]">
                {activePlantTab === 'summary' && (
                  <table className="w-full text-[10px] font-mono text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-v/50 text-foreground/45 uppercase text-[9px]">
                        <th className="py-2 px-3 font-semibold">SourceFolder</th>
                        <th className="py-2 px-3 font-semibold">DataDate</th>
                        <th className="py-2 px-3 font-semibold text-right">P1 Avg Total</th>
                        <th className="py-2 px-3 font-semibold text-right text-green-400">P1 Daily Reached</th>
                        {!isBessProject && (
                          <>
                            <th className="py-2 px-3 font-semibold text-right">P2 Avg Total</th>
                            <th className="py-2 px-3 font-semibold text-right text-green-400">P2 Daily Reached</th>
                          </>
                        )}
                        {getProjectPlants(project).length >= 3 && (
                          <>
                            <th className="py-2 px-3 font-semibold text-right">P3 Avg Total</th>
                            <th className="py-2 px-3 font-semibold text-right text-green-400">P3 Daily Reached</th>
                          </>
                        )}
                        <th className="py-2 px-3 font-semibold text-right text-accent-blue">Global Avg Total</th>
                        <th className="py-2 px-3 font-semibold text-right text-accent-blue">Global Avg Daily</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-v/20">
                      {dailyResults.map((r, i) => (
                        <tr key={i} className="hover:bg-foreground/[0.02] transition-colors">
                          <td className="py-2 px-3 text-foreground/80 truncate max-w-[100px]">{r.SourceFolder}</td>
                          <td className="py-2 px-3 text-foreground/80">{r.DataDate}</td>
                          <td className="py-2 px-3 text-right">{r.SWG01_TotalCycle !== null ? r.SWG01_TotalCycle.toFixed(4) : '---'}</td>
                          <td className="py-2 px-3 text-right text-green-400 font-bold">{r.SWG01_DailyReached !== null ? `+${r.SWG01_DailyReached.toFixed(4)}` : '---'}</td>
                          {!isBessProject && (
                            <>
                              <td className="py-2 px-3 text-right">{r.SWG02_TotalCycle !== null ? r.SWG02_TotalCycle.toFixed(4) : '---'}</td>
                              <td className="py-2 px-3 text-right text-green-400 font-bold">{r.SWG02_DailyReached !== null ? `+${r.SWG02_DailyReached.toFixed(4)}` : '---'}</td>
                            </>
                          )}
                          {getProjectPlants(project).length >= 3 && (
                            <>
                              <td className="py-2 px-3 text-right">{r.SWG03_TotalCycle !== null ? r.SWG03_TotalCycle.toFixed(4) : '---'}</td>
                              <td className="py-2 px-3 text-right text-green-400 font-bold">{r.SWG03_DailyReached !== null ? `+${r.SWG03_DailyReached.toFixed(4)}` : '---'}</td>
                            </>
                          )}
                          <td className="py-2 px-3 text-right text-accent-blue font-bold">{r.Average_Total_Plant_Cycle !== null ? r.Average_Total_Plant_Cycle.toFixed(4) : '---'}</td>
                          <td className="py-2 px-3 text-right text-accent-blue font-bold">{r.Average_Daily_Cycle !== null ? `+${r.Average_Daily_Cycle.toFixed(4)}` : '---'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activePlantTab === 'p1' && (
                  <PlantDetailTable blocks={selectedDay.p1Blocks} />
                )}

                {!isBessProject && activePlantTab === 'p2' && (
                  <PlantDetailTable blocks={selectedDay.p2Blocks} />
                )}

                {!isBessProject && activePlantTab === 'p3' && getProjectPlants(project).length >= 3 && (
                  <PlantDetailTable blocks={selectedDay.p3Blocks} />
                )}
              </div>
            </div>
          )}

          {/* Entire Project Summary */}
          {selectedDay && (
            <div className="w-full shrink-0">
              {renderCycleSummaryCard({
                title: 'Entire Project',
                blockLabel: `${projectBlockCount} SACU Blocks`,
                totalYesterday: previousDay?.Average_Total_Plant_Cycle,
                yesterdayCycle: previousDay?.Average_Daily_Cycle,
                totalToday: selectedDay.Average_Total_Plant_Cycle,
                todayCycle: selectedDay.Average_Daily_Cycle,
                accentClass: 'text-yellow-300',
              })}
            </div>
          )}

          {/* SPPC Large Status Cards (Below Table) */}
          {selectedDay && (
            <div className={cn(
              "grid gap-4 w-full shrink-0",
              getProjectPlants(project).length === 2 ? "grid-cols-1 md:grid-cols-2" : getProjectPlants(project).length >= 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"
            )}>
              {renderCycleSummaryCard({
                title: 'SPPC 1',
                blockLabel: `${getProjectPlants(project).length === 2 ? 13 : (isBessProject ? 'Total' : 16)} SACU Blocks`,
                totalYesterday: previousDay?.SWG01_TotalCycle,
                yesterdayCycle: previousDay?.SWG01_DailyReached,
                totalToday: selectedDay.SWG01_TotalCycle,
                todayCycle: selectedDay.SWG01_DailyReached,
              })}

              {getProjectPlants(project).length >= 2 && renderCycleSummaryCard({
                title: 'SPPC 2',
                blockLabel: `${getProjectPlants(project).length === 2 ? 11 : 10} SACU Blocks`,
                totalYesterday: previousDay?.SWG02_TotalCycle,
                yesterdayCycle: previousDay?.SWG02_DailyReached,
                totalToday: selectedDay.SWG02_TotalCycle,
                todayCycle: selectedDay.SWG02_DailyReached,
              })}

              {getProjectPlants(project).length >= 3 && (
                renderCycleSummaryCard({
                  title: 'SPPC 3',
                  blockLabel: '11 SACU Blocks',
                  totalYesterday: previousDay?.SWG03_TotalCycle,
                  yesterdayCycle: previousDay?.SWG03_DailyReached,
                  totalToday: selectedDay.SWG03_TotalCycle,
                  todayCycle: selectedDay.SWG03_DailyReached,
                })
              )}
            </div>
          )}

          {/* Charts Row */}
          {dailyResults.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
              {/* Interactive Plotly Trends Graph */}
              <div className="border border-border-v bg-surface/30 rounded-md p-4 h-80 flex flex-col lg:col-span-2">
                <div className="text-[10px] uppercase font-mono tracking-widest text-foreground/45 border-b border-border-v/50 pb-2 mb-2 font-bold flex items-center gap-1.5">
                  <Activity size={14} className="text-accent-blue" />
                  Equivalent Cycle Trend over Days
                </div>
                <div className="flex-1 w-full h-full">
                  <Plot
                    data={[
                      {
                        x: chartDataDates,
                        y: chartP1Total,
                        type: 'scatter' as const,
                        mode: 'lines+markers' as const,
                        name: 'Plant 1 Total',
                        line: { color: '#00A3FF', width: 2, shape: 'spline' as const },
                        marker: { size: 6 }
                      },
                      ...(isBessProject ? [] : [{
                        x: chartDataDates,
                        y: chartP2Total,
                        type: 'scatter' as const,
                        mode: 'lines+markers' as const,
                        name: 'Plant 2 Total',
                        line: { color: '#22C55E', width: 2, shape: 'spline' as const },
                        marker: { size: 6 }
                      }]),
                      ...(getProjectPlants(project).length >= 3 ? [{
                        x: chartDataDates,
                        y: chartP3Total,
                        type: 'scatter' as const,
                        mode: 'lines+markers' as const,
                        name: 'Plant 3 Total',
                        line: { color: '#EAB308', width: 2, shape: 'spline' as const },
                        marker: { size: 6 }
                      }] : [])
                    ]}
                    layout={{
                      autosize: true,
                      margin: { t: 15, r: 40, l: 40, b: 35 },
                      paper_bgcolor: 'transparent',
                      plot_bgcolor: 'transparent',
                      font: { family: 'JetBrains Mono', size: 9, color: fontColor },
                      xaxis: {
                        showgrid: true,
                        gridcolor: gridColor,
                        zerolinecolor: 'transparent'
                      },
                      yaxis: {
                        title: { text: 'Cycles' },
                        showgrid: true,
                        gridcolor: gridColor,
                        zerolinecolor: 'transparent'
                      },
                      showlegend: true,
                      legend: { font: { color: fontColor, size: 8 } }
                    }}
                    useResizeHandler={true}
                    style={{ width: '100%', height: '100%' }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              </div>

              {/* Bar Graph: Today vs Yesterday */}
              <div className="border border-border-v bg-surface/30 rounded-md p-4 h-80 flex flex-col">
                <div className="text-[10px] uppercase font-mono tracking-widest text-foreground/45 border-b border-border-v/50 pb-2 mb-2 font-bold flex items-center gap-1.5">
                  <BarChart3 size={14} className="text-accent-blue" />
                  Today vs Yesterday (Total Cycle)
                </div>
                <div className="flex-1 w-full h-full">
                  {(() => {
                    const yestP1 = selectedDayIdx > 0 ? (dailyResults[selectedDayIdx - 1].SWG01_TotalCycle || 0) : 0;
                    const yestP2 = selectedDayIdx > 0 ? (dailyResults[selectedDayIdx - 1].SWG02_TotalCycle || 0) : 0;
                    const yestP3 = selectedDayIdx > 0 ? (dailyResults[selectedDayIdx - 1].SWG03_TotalCycle || 0) : 0;
                    
                    const todayP1 = selectedDay?.SWG01_TotalCycle || 0;
                    const todayP2 = selectedDay?.SWG02_TotalCycle || 0;
                    const todayP3 = selectedDay?.SWG03_TotalCycle || 0;

                    const yDataYest = isBessProject ? [yestP1] : getProjectPlants(project).length === 2 ? [yestP1, yestP2] : [yestP1, yestP2, yestP3];
                    const yDataToday = isBessProject ? [todayP1] : getProjectPlants(project).length === 2 ? [todayP1, todayP2] : [todayP1, todayP2, todayP3];
                    
                    const allVals = [...yDataYest, ...yDataToday].filter(v => v > 0);
                    const minY = allVals.length > 0 ? Math.min(...allVals) : 0;
                    const maxY = allVals.length > 0 ? Math.max(...allVals) : 100;

                    return (
                      <Plot
                        data={[
                          {
                            x: isBessProject ? ['SPPC 1'] : getProjectPlants(project).length === 2 ? ['SPPC 1', 'SPPC 2'] : ['SPPC 1', 'SPPC 2', 'SPPC 3'],
                            y: yDataYest,
                            type: 'bar',
                            name: 'Yesterday',
                            marker: { color: '#8B5CF6', opacity: 0.85 }
                          },
                          {
                            x: isBessProject ? ['SPPC 1'] : getProjectPlants(project).length === 2 ? ['SPPC 1', 'SPPC 2'] : ['SPPC 1', 'SPPC 2', 'SPPC 3'],
                            y: yDataToday,
                            type: 'bar',
                            name: 'Today',
                            marker: { color: '#0EA5E9', opacity: 0.95 }
                          }
                        ]}
                        layout={{
                          barmode: 'group',
                          autosize: true,
                          margin: { t: 15, r: 10, l: 35, b: 35 },
                          paper_bgcolor: 'transparent',
                          plot_bgcolor: 'transparent',
                          font: { family: 'JetBrains Mono', size: 9, color: fontColor },
                          xaxis: {
                            showgrid: false,
                            zerolinecolor: 'transparent'
                          },
                          yaxis: {
                            showgrid: true,
                            gridcolor: gridColor,
                            zerolinecolor: 'transparent',
                            range: minY > 0 ? [Math.max(0, minY - 1.5), maxY + 0.5] : undefined
                          },
                          showlegend: true,
                          legend: { font: { color: fontColor, size: 8 }, orientation: 'h', y: -0.2, x: 0.5, xanchor: 'center' }
                        }}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false }}
                      />
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}