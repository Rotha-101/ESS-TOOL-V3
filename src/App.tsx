import Plot from 'react-plotly.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { Config } from 'plotly.js';
import {
  Activity,
  Archive,
  BarChart3,
  Battery,
  Bot,
  Download,
  FileText,
  FileCode,
  FileSpreadsheet,
  Grid2X2,
  Moon,
  Settings,
  Sun,
  Upload,
  Zap,
} from 'lucide-react';
import { ImportChartScript } from './components/ImportChartScript';
import { getProjectPlants } from './lib/project-utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AIAgent } from './components/AIAgent';
import { SmartReport } from './components/SmartReport';
import { HeaderClock } from './components/HeaderClock';
import { WorkbookPreview, type WorkbookPreviewSource } from './components/WorkbookPreview';
import { useAIContext } from './lib/ai-context';
import { useAppStore } from './store/useAppStore';
import {
  hcBuildZip,
  hcByProject,
  HC_CATS,
  hcCurrentPlants,
  hcInitProjectsAsync,
  HC_PROJECTS,
  hcRunExport,
  setHcActiveProject,
  setReactUpdateCb,
  getHcActiveProject,
  getHcBusy,
} from './lib/audit-engine.js';
import { exportAllGraphsToZip } from './lib/exportGraphs';
import { generatePortableViewHtml } from './lib/portable-view-template';
import { getDynamicKpis } from './lib/kpi-utils';
import { PlantBreakdownCards } from './components/PlantBreakdownCards';
import { NavItem } from './components/NavItem';
import { KpiCard } from './components/KpiCard';
import { ValidationDebug } from './components/ValidationDebug';
import { CycleCalculation } from './components/CycleCalculation';
import { DailyEvaluationGraph } from './components/DailyEvaluationGraph';
import { SettingsWindow } from './components/SettingsWindow';
import { GlobalProgressModal } from './components/GlobalProgressModal';
import { ImportMatCodePage } from './powerflow/pages/ImportMatCodePage';

export { DailyEvaluationGraph } from './components/DailyEvaluationGraph';

export default function App() {
  const {
    activeTab, setActiveTab,
    activePreview, setActivePreview,
    theme, setTheme,
    isSettingsOpen, setIsSettingsOpen,
    isSettingsMaximized, setIsSettingsMaximized,
    auditStateVersion, incrementAuditStateVersion,
    progress, setProgress,
    exportSource, setExportSource,
    exportFormat, setExportFormat,
    exportDateRange, setExportDateRange,
    exportAggregation, setExportAggregation,
    exportFilename, setExportFilename,
    exportColumns, setExportColumns,
    exportPreviewMode, setExportPreviewMode,
    evalDataPreview, setEvalDataPreview
  } = useAppStore();

  const project = getHcActiveProject() || 'SNTL1000';
  const { messages } = useAIContext();

  const [alertData, setAlertData] = useState<{ title: string, message: string, type: 'success' | 'error' | 'info' } | null>(null);

  const archiveInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const isDarkMode = theme === 'dark';
  const fontColor = isDarkMode ? '#E0E0E0' : '#111827';
  const gridColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const zeroLineColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    // Initialize audit engine asynchronously
    hcInitProjectsAsync();
    
    setReactUpdateCb((type?: string, ...args: any[]) => {
      if (type === 'progress') {
        const pct = args[0] !== undefined ? args[0] : 0;
        const active = args[1] !== undefined ? !!args[1] : false;
        const customLabel = args[2] || '';
        const label = customLabel || (getHcBusy() ? 'Compiling and exporting data...' : 'Ingesting and validating files...');
        setProgress({ pct, active, label });
      }
      incrementAuditStateVersion();
    });
    
  }, []);

  useEffect(() => {
    if (activeTab === 'export') {
      const request = indexedDB.open('ESS_Toolbox', 1);
      request.onsuccess = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('eval_data')) return;
        try {
          const tx = db.transaction('eval_data', 'readonly');
          const req = tx.objectStore('eval_data').get(`eval_data_${project}`);
          req.onsuccess = () => setEvalDataPreview(req.result);
        } catch(err) {}
      };
    }
  }, [activeTab, project]);



  const switchTab = (tab: string) => {
    setActivePreview(null);
    setActiveTab(tab);
  };

  const openWorkbookPreview = (source: WorkbookPreviewSource) => {
    setActiveTab('dashboard');
    setActivePreview(source);
  };

  const kpis = getDynamicKpis(project);
  
  // Mock data for the Plotly chart
  const pTotalData = useMemo(() => Array.from({ length: 100 }, (_, i) => ({
    x: i,
    y: Math.sin(i / 10) * 100 + 300 + Math.random() * 50
  })), []);
  
  const freqBusData = useMemo(() => Array.from({ length: 100 }, (_, i) => ({
    x: i,
    y: 50 + Math.random() * 0.2 - 0.1
  })), []);


  const handleExportMatlab = async () => {
    try {
      const getEvalData = () => new Promise((resolve) => {
        const cachedData = useAppStore.getState().evalDataCache[project];
        if (cachedData) return resolve(cachedData);
        
        const request = indexedDB.open('ESS_Toolbox', 1);
        const timeout = setTimeout(() => resolve(null), 60000); // 60s timeout for massive datasets
        request.onsuccess = (e: any) => {
          clearTimeout(timeout);
          const db = e.target.result;
          if (!db.objectStoreNames.contains('eval_data')) return resolve(null);
          try {
            const tx = db.transaction('eval_data', 'readonly');
            const req = tx.objectStore('eval_data').get(`eval_data_${project}`);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          } catch (err) { resolve(null); }
        };
        request.onerror = () => {
          clearTimeout(timeout);
          resolve(null);
        };
      });

      if (!(window as any).electronAPI) {
        if (window.confirm("Generating .fig files requires the Desktop App (.exe).\n\nHowever, you can download a ZIP containing the raw MATLAB scripts (.m) and JSON data to run on your own MATLAB instance.\n\nWould you like to download the script bundle instead?")) {
          const evalDataFromDB: any = await getEvalData();
          if (!evalDataFromDB || !evalDataFromDB.timestamps) {
            alert("No evaluation data found. Please load data in Daily Evaluation Graph first.");
            return;
          }
          setProgress({ pct: 20, active: true, label: 'Preparing MATLAB script export...' });
          const { exportMatlabScriptsToZip } = await import('./lib/exportMatlab');
          const zipEntries: {name: string, data: Uint8Array}[] = [];
          await exportMatlabScriptsToZip(project, evalDataFromDB, zipEntries, setProgress);
          setProgress({ pct: 90, active: true, label: `Building ZIP archive...` });
          
          const bytes = hcBuildZip(zipEntries);
          for (const e of zipEntries) (e as any).data = null;
          
          const blob = new Blob([bytes], { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `MATLAB_Scripts_${(evalDataFromDB.dataDate || '').replace(/[^a-zA-Z0-9-]/g, '_')}_${project}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setProgress({ pct: 0, active: false, label: '' });
        }
        return;
      }

      const outputZip = await (window as any).electronAPI.selectZipFile();
      if (!outputZip) return;

      const cachedData = useAppStore.getState().evalDataCache[project];
      if (!cachedData) {
        setProgress({ pct: 10, active: true, label: 'Loading dataset from local storage...' });
      } else {
        setProgress({ pct: 10, active: true, label: 'Loading dataset from memory cache (Fast)...' });
      }
      const evalData: any = await getEvalData();
      if (!evalData || !evalData.timestamps) {
        setProgress({ pct: 0, active: false, label: '' });
        setAlertData({
          type: 'error',
          title: 'No Data Found',
          message: 'No evaluation data found. Please load data in Daily Evaluation Graph first.'
        });
        return;
      }

      setProgress({ pct: 20, active: true, label: 'Preparing MATLAB export...' });
      const { generateAllMatlabScripts } = await import('./lib/exportMatlab');
      const scripts = generateAllMatlabScripts(project, evalData);

      setProgress({ pct: 45, active: true, label: 'Running MATLAB and generating .fig files...' });

      const result = await (window as any).electronAPI.saveMatlabFigures({
        outputZip,
        project,
        evalData,
        scripts
      });

      if (result.success) {
        const fileList = (result.files || []).map((f: string) => `  • ${f}`).join('\n');
        setAlertData({
          type: 'success',
          title: 'MATLAB Export Complete',
          message: `Saved ZIP Archive:\n${outputZip}\n\nGenerated .fig files included:\n${fileList}\n\nExtract the ZIP and open any .fig file directly in MATLAB.`
        });
      } else {
        setAlertData({
          type: 'error',
          title: 'MATLAB Export Failed',
          message: result.error
        });
      }
      setProgress({ pct: 0, active: false, label: '' });

    } catch (err: any) {
      console.error("MATLAB export error:", err);
      setAlertData({
        type: 'error',
        title: 'Export Error',
        message: err.message || String(err)
      });
      setProgress({ pct: 0, active: false, label: '' });
    }
  };

  const handleDownload = async () => {
    if (exportFormat === 'zip') {
      try {
        const zipEntries: {name: string, data: Uint8Array}[] = [];

        const getEvalData = () => new Promise((resolve) => {
          const cachedData = useAppStore.getState().evalDataCache[project];
          if (cachedData) return resolve(cachedData);

          const request = indexedDB.open('ESS_Toolbox', 1);
          const timeout = setTimeout(() => resolve(null), 60000);
          request.onsuccess = (e: any) => {
            clearTimeout(timeout);
            const db = e.target.result;
            if (!db.objectStoreNames.contains('eval_data')) return resolve(null);
            try {
              const tx = db.transaction('eval_data', 'readonly');
              const req = tx.objectStore('eval_data').get(`eval_data_${project}`);
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => resolve(null);
            } catch(err) { resolve(null); }
          };
          request.onerror = () => {
            clearTimeout(timeout);
            resolve(null);
          };
        });

        const cachedData = useAppStore.getState().evalDataCache[project];
        if (!cachedData) {
          setProgress({ pct: 5, active: true, label: 'Loading dataset from local storage...' });
        } else {
          setProgress({ pct: 5, active: true, label: 'Loading dataset from memory cache (Fast)...' });
        }
        const evalData: any = await getEvalData();
        
        if (!evalData || !evalData.timestamps) {
          setProgress({ pct: 0, active: false, label: '' });
          setAlertData({
            type: 'error',
            title: 'No Data Found',
            message: 'No evaluation data found. Please load data in Daily Evaluation Graph first.'
          });
          return;
        }

        const baseDate = evalData.dataDate ? evalData.dataDate.replace(/-/g, '') : 'UnknownDate';
        const rootFolder = `Dataset ${project} ${baseDate}`;
        const dataValFolder = `Dataset ${baseDate}`;
        const cycleFolder = `Cycle calculate ${baseDate}`;
        const matlabFolder = `Mat code and Fig file ${baseDate}`;
        const graphsFolder = `Html Graph`;

        // Ensure directories exist in the ZIP even if they end up being empty
        zipEntries.push({ name: `${dataValFolder}/`, data: new Uint8Array(0) });
        zipEntries.push({ name: `${cycleFolder}/`, data: new Uint8Array(0) });
        zipEntries.push({ name: `${matlabFolder}/`, data: new Uint8Array(0) });
        zipEntries.push({ name: `${graphsFolder}/`, data: new Uint8Array(0) });

        // 1. Gather Validation File Debug Data
        const plants = hcCurrentPlants();
        const allItems: {plant: any, cat: any, item: any}[] = [];
        for (const plant of plants)
          for (const cat of HC_CATS)
            for (const item of (plant.files[cat.key] || []))
              allItems.push({ plant, cat, item });

        const BATCH = 8;
        for (let i = 0; i < allItems.length; i += BATCH) {
          const batch = allItems.slice(i, Math.min(i + BATCH, allItems.length));
          setProgress({ pct: 10 + (i / Math.max(allItems.length, 1)) * 20, active: true,
            label: `Collecting validation file ${i + 1} of ${allItems.length}...` });
          const batchResults = await Promise.all(
            batch.map(async ({ plant, cat, item }) => ({
              name: `${dataValFolder}/${plant.name}/${cat.key}/${item.file.name}`,
              data: new Uint8Array(await item.file.arrayBuffer())
            }))
          );
          zipEntries.push(...batchResults);
          await new Promise(r => setTimeout(r, 0));
        }

        // 2. Add Cycle Summary
        setProgress({ pct: 35, active: true, label: 'Generating Cycle Summary...' });
        let cycleCsv = "Plant,Daily Cycle,Total Cycle\n";
        const cyclePlants = getProjectPlants(project);
        cyclePlants.forEach((pk, i) => {
          cycleCsv += `Plant ${i + 1},${evalData.dailyCycle?.[pk] || 0},${evalData.totalCycle?.[pk] || 0}\n`;
        });
        
        zipEntries.push({
          name: `${cycleFolder}/Cycle_Summary_${baseDate}.csv`,
          data: new TextEncoder().encode(cycleCsv)
        });

        // 3. Generate MATLAB Bundle
        setProgress({ pct: 40, active: true, label: 'Preparing MATLAB script export...' });
        const { exportMatlabScriptsToZip } = await import('./lib/exportMatlab');
        await exportMatlabScriptsToZip(project, evalData, zipEntries, setProgress, matlabFolder);

        // 4. Render and capture Daily Evaluation Graphs
        if (evalData && evalData.timestamps) {
          setProgress({ pct: 60, active: true, label: `Generating Enterprise Portable View...` });
          
          let cfg: any = {
            bgWhite: true, traceVisible: [true,true,true,true,true], lineDash: ['solid','solid','solid','solid','solid'], gridSize: 'small',
            lineWidths: [2, 1.6, 1.6, 1.8, 1.2], markerSize: 6, pinSize: 8, pinBgColor: ''
          };
          try {
            const sc = localStorage.getItem('ess_graph_config');
            if (sc) cfg = { ...cfg, ...JSON.parse(sc) };
          } catch(e) {}
          
          const isBess = project.startsWith('SNTB') || project.startsWith('SNTV') || project.startsWith('SNTD') || project.startsWith('SNTZ') || project.startsWith('MSGP');
          const defaultMetric = isBess ? 'f_p' : 'pf_p1';
          const htmlContent = generatePortableViewHtml(project, evalData, cfg, defaultMetric, 'plant1', []);
          const encoder = new TextEncoder();
          const u8 = encoder.encode(htmlContent);
          zipEntries.push({ name: `${graphsFolder}/Enterprise_Portable_View_${baseDate}.html`, data: u8 });
          await new Promise(r => setTimeout(r, 0));
          
          await exportAllGraphsToZip(project, evalData, zipEntries, setProgress, graphsFolder);
        }

        setProgress({ pct: 90, active: true, label: `Building ZIP archive (${zipEntries.length} files)...` });
        await new Promise(r => setTimeout(r, 0));
        const filename = `${rootFolder}.zip`;
        const bytes = hcBuildZip(zipEntries);
        // Free entry data after building to release memory
        for (const e of zipEntries) (e as any).data = null;
        const blob = new Blob([bytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setProgress({ pct: 0, active: false, label: '' });
        
        setAlertData({
          type: 'success',
          title: 'ZIP Archive Complete',
          message: `Successfully generated and downloaded ${filename} containing ${zipEntries.length} files.`
        });
        return;
      } catch(err: any) {
        console.error("Custom ZIP export error:", err);
        setAlertData({
          type: 'error',
          title: 'ZIP Export Failed',
          message: err.message || String(err)
        });
        setProgress({ pct: 0, active: false, label: '' });
        return;
      }
    }
    
    const prefix = exportFilename || exportSource.replace(/\s+/g, '_');
    const filename = `${prefix}_${Date.now()}`;
    const dummyData = [
      { Timestamp: "2026-05-21 14:10:00", Value: 54.53, Status: "WARNING", "Device ID": "INV-100" },
      { Timestamp: "2026-05-21 14:11:00", Value: 64.90, Status: "OK", "Device ID": "INV-101" }
    ];

    let url = '';
    let ext = exportFormat;

    try {
      if (exportFormat === 'csv') {
        const header = Object.keys(dummyData[0]).join(',');
        const rows = dummyData.map(obj => Object.values(obj).join(',')).join('\n');
        const content = `${header}\n${rows}`;
        const blob = new Blob([content], { type: 'text/csv' });
        url = URL.createObjectURL(blob);
      } else if (exportFormat === 'json') {
        const content = JSON.stringify(dummyData, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        url = URL.createObjectURL(blob);
      } else if (exportFormat === 'excel') {
        ext = 'xlsx';
        try {
          const XLSX = await import('xlsx');
          const ws = XLSX.utils.json_to_sheet(dummyData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Export");
          XLSX.writeFile(wb, `${filename}.xlsx`);
          return; // writeFile handles the download
        } catch (e) {
          const content = `Timestamp\tValue\tStatus\n2026-05-21\t54.53\tWARNING`;
          const blob = new Blob([content], { type: 'application/vnd.ms-excel' });
          url = URL.createObjectURL(blob);
          ext = 'xls';
        }
      } else if (exportFormat === 'png') {
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = 400;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#1e1e2e'; ctx.fillRect(0, 0, 800, 400);
          ctx.fillStyle = '#3b82f6'; ctx.fillRect(50, 100, 700, 200);
          ctx.fillStyle = '#ffffff'; ctx.font = '24px sans-serif';
          ctx.fillText(`Export: ${exportSource}`, 60, 150);
        }
        url = canvas.toDataURL('image/png');
      } else if (exportFormat === 'pdf') {
        const pdfStr = "%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Count 1/Kids[3 0 R]>> endobj\n3 0 obj <</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>> endobj\n4 0 obj <</Length 44>> stream\nBT /F1 24 Tf 100 700 Td (Exported Data PDF)Tj ET\nendstream endobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n0000000179 00000 n \ntrailer <</Size 5/Root 1 0 R>>\nstartxref\n274\n%%EOF";
        const blob = new Blob([pdfStr], { type: 'application/pdf' });
        url = URL.createObjectURL(blob);
      } else if (exportFormat === 'zip') {
        url = "data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==";
      } else if (exportFormat === 'html') {
        const content = `<html><body><h1>Export: ${exportSource}</h1><p>Daily Evaluation Graph and images</p></body></html>`;
        const blob = new Blob([content], { type: 'text/html' });
        url = URL.createObjectURL(blob);
      }

      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to generate export file.");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* Header */}
      <GlobalProgressModal />
      
      {/* Custom Alert Modal */}
      {alertData && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-[10000] transition-all">
          <div className={`bg-[#131B2E] border ${alertData.type === 'success' ? 'border-green-500/50' : 'border-red-500/50'} rounded-xl p-6 w-[32rem] max-w-[90vw] shadow-2xl flex flex-col gap-4`}>
            <h2 className={`font-bold text-lg flex items-center gap-2 ${alertData.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {alertData.type === 'success' ? '✅' : '❌'} {alertData.title}
            </h2>
            <div className="text-sm text-slate-300 font-mono whitespace-pre-wrap max-h-[40vh] overflow-y-auto pr-2 scrollbar-clean">
              {alertData.message}
            </div>
            <div className="flex justify-end mt-2 pt-4 border-t border-slate-800/50">
              <button 
                onClick={() => setAlertData(null)}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold tracking-widest text-[11px] uppercase transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="h-12 border-b border-border-v flex items-center justify-between px-4 shrink-0" style={{ background: '#000000' }}>
        <div className="flex items-center gap-3">
          <img src="./SNT.png" alt="SNT Logo" className="h-4 object-contain" style={{ mixBlendMode: 'screen' }} />
          <div className="h-4 w-px bg-white/20"></div>
          <h1 className="font-bold tracking-tight text-sm text-white flex items-center">
            <span>EMS TOOLBOX <span className="font-normal text-white/50">ENTERPRISE PLATFORM v0.1.1</span></span>
            <span className="font-normal text-[9px] tracking-widest text-white/40 ml-3 pl-3 border-l border-white/20">DEVELOPED BY PERFORMANCE AND ANALYSIS OFFICE</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-white/40 uppercase">Project:</span>
            <Select value={project} onValueChange={setHcActiveProject}>
              <SelectTrigger className="h-6 text-[11px] font-bold text-accent-blue bg-blue-500/10 border-0 rounded px-2 w-[160px] focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Select Project" />
              </SelectTrigger>
              <SelectContent>
                {HC_PROJECTS.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-[11px] font-bold">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse"></span>
            <HeaderClock />
          </div>
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white transition-colors ml-2"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <div className="h-8 px-3 rounded bg-[#FFD700] flex items-center justify-center text-[10px] font-bold tracking-wider text-black shadow-sm">
            ESS DIVISION
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-48 bg-panel border-r border-border-v flex flex-col shrink-0 justify-between">
          <div>
            <div className="p-3 text-[10px] uppercase tracking-widest text-foreground/30 font-bold">Main Modules</div>
            <div className="flex flex-col">
              <NavItem icon={<Grid2X2 size={14} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => switchTab('dashboard')} />
              <NavItem icon={<Activity size={14} />} label="Validation File Debug" active={activeTab === 'signal'} onClick={() => switchTab('signal')} />
              <NavItem icon={<Zap size={14} />} label="Cycle Calculation" active={activeTab === 'power'} onClick={() => switchTab('power')} />
              <NavItem icon={<Battery size={14} />} label="Daily Evaluation Graph" active={activeTab === 'soc'} onClick={() => switchTab('soc')} />
              <NavItem icon={<FileCode size={14} />} label="Import MATCODE" active={activeTab === 'matcode'} onClick={() => switchTab('matcode')} />
              <NavItem icon={<Download size={14} />} label="Report Export" active={activeTab === 'export'} onClick={() => switchTab('export')} />
              <NavItem icon={<Bot size={14} />} label="AI Agent" active={activeTab === 'ai'} onClick={() => switchTab('ai')} />
            </div>
          </div>
          <div className="p-2 border-t border-border-v">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="w-full flex items-center gap-3 px-2 py-2 text-left transition-colors font-medium text-[11px] outline-none hover:bg-foreground/5 text-foreground/60 hover:text-foreground rounded-sm"
            >
              <span className="flex items-center justify-center opacity-70"><Settings size={14} /></span>
              Settings
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          {activePreview ? (
            <WorkbookPreview
              source={activePreview}
              project={project}
              theme={theme}
              onClose={() => setActivePreview(null)}
            />
          ) : (
            <>
          {/* KPI Cards */}
          {activeTab !== 'smart_report' && activeTab !== 'export' && activeTab !== 'soc' && activeTab !== 'ai' && activeTab !== 'jscript' && (() => {
            const isBessProject = typeof project === 'string' && (project.startsWith('SNTB') || project.startsWith('SNTV') || project.startsWith('SNTD') || project.startsWith('SNTZ') || project.startsWith('MSGP'));
            return (
            <section className={`grid ${getProjectPlants(project).length === 2 ? 'grid-cols-5' : (getProjectPlants(project).length === 1 ? 'grid-cols-4' : 'grid-cols-6')} gap-4 shrink-0`}>
              <KpiCard 
                title={kpis.p1.name + " Status"} 
                value={kpis.p1.value} 
                unit={kpis.p1.unit} 
                subtext={kpis.p1.subtext} 
                subtextColor={kpis.p1.color} 
                bgClass={kpis.p1.bg}
                borderColor={kpis.p1.border}
                showFlow
              />
              {!isBessProject && (
                <KpiCard 
                  title={kpis.p2.name + " Status"} 
                  value={kpis.p2.value} 
                  unit={kpis.p2.unit} 
                  subtext={kpis.p2.subtext} 
                  subtextColor={kpis.p2.color} 
                  bgClass={kpis.p2.bg}
                  borderColor={kpis.p2.border}
                  showFlow
                />
              )}
              {getProjectPlants(project).length >= 3 && (
                <KpiCard 
                  title={kpis.p3.name + " Status"} 
                  value={kpis.p3.value} 
                  unit={kpis.p3.unit} 
                  subtext={kpis.p3.subtext} 
                  subtextColor={kpis.p3.color} 
                  bgClass={kpis.p3.bg}
                  borderColor={kpis.p3.border}
                  showFlow
                />
              )}
              <KpiCard 
                title="Data Quality" 
                value={kpis.quality.value} 
                unit={kpis.quality.unit} 
                subtext={kpis.quality.subtext} 
                subtextColor={kpis.quality.color} 
                bgClass={kpis.quality.bg}
                borderColor={kpis.quality.border}
              />
              <div className="col-span-2 border border-t-2 p-3 rounded-sm flex flex-col transition-colors bg-foreground/10 border-border-v border-t-border-v gap-3 justify-between">
                <div className="text-[10px] text-foreground/40 uppercase font-bold w-full text-left">Export Data</div>
                 <div className="grid grid-cols-2 gap-2 w-full">
                  <button onClick={() => hcRunExport(false)} className="bg-blue-600 hover:bg-blue-500 border-0 flex flex-col items-start justify-center p-2.5 transition-all outline-none rounded-sm group relative text-left shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Archive size={14} className="text-white group-hover:scale-110 transition-transform" />
                      <span className="text-[11px] font-bold text-white">Synohq Data ZIP</span>
                    </div>
                    <span className="text-[8px] text-blue-100 font-mono tracking-widest">&gt;10M ARCHIVE</span>
                  </button>
                  <button onClick={() => hcRunExport(true)} className="bg-[#5865F2] hover:bg-[#4752C4] border-0 flex flex-col items-start justify-center p-2.5 transition-all outline-none rounded-sm group relative text-left shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Archive size={14} className="text-white group-hover:scale-110 transition-transform" />
                      <span className="text-[11px] font-bold text-white">Discord Parts ZIP</span>
                    </div>
                    <span className="text-[8px] text-[#E0E2FD] font-mono tracking-widest">&lt;10M SPLIT</span>
                  </button>
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t border-border-v/35">
                  <label className="flex items-center gap-2 cursor-pointer text-[10px] text-foreground/75 hover:text-foreground transition-colors select-none font-mono">
                    <input 
                      type="checkbox" 
                      id="hc-include-mat" 
                      defaultChecked 
                      className="rounded border-border-v bg-background text-accent-blue focus:ring-accent-blue/30 h-3.5 w-3.5 cursor-pointer" 
                    />
                    <span>also generate <code className="text-accent-blue bg-accent-blue/10 px-1 rounded text-[9px]">.mat</code> file</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[10px] text-foreground/75 hover:text-foreground transition-colors select-none font-mono">
                    <input 
                      type="checkbox" 
                      id="opt-include-helper" 
                      defaultChecked 
                      className="rounded border-border-v bg-background text-accent-blue focus:ring-accent-blue/30 h-3.5 w-3.5 cursor-pointer" 
                    />
                    <span>include MATLAB helper script</span>
                  </label>
                </div>
              </div>
            </section>
            );
          })()}
          {activeTab === 'signal' ? (
            <ValidationDebug progress={progress} setProgress={setProgress} />
          ) : activeTab === 'power' ? (
            <CycleCalculation project={project} theme={theme} />
          ) : activeTab === 'soc' ? (
            <DailyEvaluationGraph theme={theme} project={project} onNavigateToAI={() => switchTab('ai')} />
          ) : activeTab === 'matcode' ? (
            <ImportMatCodePage theme={theme as 'dark' | 'light'} project={project} active={true} />
          ) : activeTab === 'export' ? (
            (() => {
              const currentPlants = hcByProject[project] || [];
              const allFiles: any[] = [];
              currentPlants.forEach(plant => {
                Object.keys(plant.files).forEach(catKey => {
                  (plant.files[catKey] || []).forEach((f: any, index: number) => {
                    allFiles.push({
                      id: `${plant.id}-${catKey}-${index}-${f.path || f.file?.name || 'sheet'}`,
                      name: f.file?.name || f.path || 'unknown.xlsx',
                      path: f.path || f.file?.name || 'unknown.xlsx',
                      category: catKey,
                      plant: plant.name,
                      status: f.report?.status || 'ready',
                      file: f.file
                    });
                  });
                });
              });
              
              const exportDisplayFiles = allFiles.length > 0
                ? [...allFiles].sort((left, right) => {
                    if (left.plant !== right.plant) return left.plant.localeCompare(right.plant);
                    return left.name.localeCompare(right.name);
                  })
                : [];

              return (
                <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col relative overflow-hidden">
              <div className="px-3 py-2 border-b border-border-v flex items-center justify-between bg-surface/50 shrink-0">
                <div className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
                  <Download size={14} className="text-accent-blue" />
                  Report Export <span className="text-accent-blue opacity-80 pl-1">(Data Warehouse)</span>
                </div>
              </div>
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col bg-background overflow-hidden relative">
                  
                  {/* Preview Tabs */}
                  <div className="flex items-center justify-between px-5 pt-4 border-b border-border-v bg-background">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setExportPreviewMode('data')}
                        className={`text-[11px] font-bold uppercase tracking-widest pb-3 border-b-2 transition-all ${exportPreviewMode === 'data' ? 'border-accent-blue text-accent-blue' : 'border-transparent text-foreground/40 hover:text-foreground/70'}`}
                      >
                        Data Preview
                      </button>
                      <button 
                        onClick={() => setExportPreviewMode('graph')}
                        className={`text-[11px] font-bold uppercase tracking-widest pb-3 border-b-2 transition-all ${exportPreviewMode === 'graph' ? 'border-accent-blue text-foreground/40' : 'border-transparent text-foreground/40 hover:text-foreground/70'}`}
                      >
                        Graph Preview
                      </button>
                    </div>
                    <div className="pb-3 flex gap-3">
                      <button 
                        onClick={() => {
                          handleExportMatlab();
                        }}
                        className="flex items-center justify-center gap-2 px-6 py-2 rounded transition-all bg-accent-blue/10 text-accent-blue border border-accent-blue/20 hover:bg-accent-blue hover:text-white shadow-sm font-bold group"
                      >
                        <Archive size={14} className="group-hover:-translate-y-1 transition-transform" />
                        <span className="text-[10px] uppercase tracking-wider">
                          Export MATLAB Bundle (ZIP)
                        </span>
                      </button>
                      <button 
                        onClick={() => {
                          setExportFormat('zip');
                          handleDownload();
                        }}
                        className="flex items-center justify-center gap-2 px-6 py-2 rounded transition-all bg-[#00E676] text-background hover:bg-[#00C853] shadow-sm font-bold group"
                      >
                        <Download size={14} className="group-hover:-translate-y-1 transition-transform" />
                        <span className="text-[10px] uppercase tracking-wider">
                          Download ZIP Archive
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Preview Area */}
                  <div className="flex-1 p-5 overflow-auto relative min-h-[400px]">
                    {exportPreviewMode === 'data' ? (
                      <div className="border border-border-v/50 rounded-none overflow-hidden bg-background h-full overflow-y-auto p-4 flex flex-col gap-4">
                        <PlantBreakdownCards project={project} fontColor={fontColor} />
                        <div className="w-full flex flex-col border border-border-v rounded-lg overflow-hidden bg-surface/30 flex-1 min-h-[300px]">
                           <div className="bg-foreground/5 p-3 border-b border-border-v text-[10px] font-bold uppercase shrink-0 flex items-center justify-between">
                              <span>Select Data Source to Preview</span>
                              <span className="bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded text-[9px]">{exportDisplayFiles.length} Sources Available</span>
                           </div>
                           <div className="flex bg-surface border-b border-border-v/50 text-[9px] font-bold uppercase shrink-0 px-3 py-2 opacity-70">
                              <div className="flex-1">Source Name</div>
                              <div className="w-24">Type</div>
                              <div className="w-40">Target Plants</div>
                              <div className="w-24 text-center">Action</div>
                           </div>
                           <div className="flex-1 overflow-y-auto scrollbar-clean p-2 space-y-1">
                              {exportDisplayFiles.length === 0 ? (
                                <div className="p-8 text-center text-[11px] font-mono text-foreground/35 uppercase tracking-widest">
                                  Run validation first, then preview any spreadsheet here.
                                </div>
                              ) : exportDisplayFiles.map((f, i) => (
                                <div key={f.id} className="flex items-center gap-3 p-2 hover:bg-foreground/5 rounded cursor-pointer border border-transparent hover:border-border-v transition-all">
                                   <FileSpreadsheet size={14} className="text-green-500 shrink-0" />
                                   <span className="text-[11px] font-mono flex-1 truncate" title={f.name}>
                                     {f.name}
                                   </span>
                                   <span className="text-[10px] font-mono w-24 opacity-70 bg-foreground/5 px-2 py-0.5 rounded text-center truncate" title={f.category}>Spreadsheet</span>
                                   <span className="text-[10px] font-mono w-40 opacity-70 truncate" title={f.plant}>{f.plant}</span>
                                   <button
                                      onClick={() => openWorkbookPreview(f)}
                                      className="w-24 text-[9px] bg-accent-blue/10 hover:bg-accent-blue text-accent-blue hover:text-foreground py-1.5 rounded font-bold transition-colors border border-accent-blue/30"
                                   >
                                      PREVIEW
                                   </button>
                                </div>
                              ))}
                           </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full w-full bg-background relative overflow-hidden flex flex-col">
                        <DailyEvaluationGraph theme={theme} project={project} isExportPreviewMode={true} />
                      </div>
                    )}
                  </div>

                  {/* Footer / Actions */}
                  <div className="p-3 px-5 border-t border-border-v bg-background flex items-center justify-between shrink-0">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest">Export Metadata</span>
                      <div className="text-[11px] font-mono text-foreground/80 flex items-center gap-4">
                        <span className="flex items-center gap-1"><FileText size={12} className="text-accent-blue" /> Contains All Uploaded Data</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => alert(`Preview refreshed successfully.`)}
                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-foreground/70 hover:text-foreground border border-border-v rounded-none bg-surface/30 hover:bg-surface transition-all"
                      >
                        Refresh Preview
                      </button>
                    </div>
                  </div>

                </div>
              </div>
                </section>
              );
            })()

          ) : activeTab === 'ai' ? (
            <AIAgent />
          ) : activeTab === 'smart_report' ? (
            (() => {
              const lastValidMessage = [...messages].reverse().find(
                m => m.role === 'assistant' && 
                !m.content.includes("Connection established") && 
                !m.content.includes("áž€áž¶ážšážáž—áŸ’áž‡áž¶áž”áŸ‹áž”áž¶áž“áž‡áŸ„áž‚áž‡áŸáž™") && 
                !m.content.includes("Successfully connected") && 
                !m.content.includes("Mock connected")
              );
              const lastAiResponse = lastValidMessage?.content || '';
              return (
                <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col relative overflow-hidden">
                  <SmartReport lastAiResponse={lastAiResponse} project={project} theme={theme} />
                </section>
              );
            })()
          ) : (
            (() => {
              const currentPlants = hcByProject[project] || [];
              let totPoc = 0, totEss = 0, totSl = 0, totEsr = 0, totEsm = 0;
              const allFiles: WorkbookPreviewSource[] = [];
              const chartColors = ['#00A3FF', '#22c55e', '#eab308', '#a855f7', '#ef4444'];
              const pieLabels = ['POC', 'ESS', 'SmartLogger', 'ESR', 'ESM'];
              const legendItems = [
                { key: 'POC', label: 'POC', description: 'Point of connection data', color: chartColors[0] },
                { key: 'ESS', label: 'ESS', description: 'Battery cabinet files', color: chartColors[1] },
                { key: 'SmartLogger', label: 'SmartLogger', description: 'Logger and controller files', color: chartColors[2] },
                { key: 'ESR', label: 'ESR', description: 'Rack-level telemetry files', color: chartColors[3] },
                { key: 'ESM', label: 'ESM', description: 'Module-level telemetry files', color: chartColors[4] },
              ];
              
              currentPlants.forEach(plant => {
                totPoc += plant.files.POC?.length || 0;
                totEss += plant.files.ESS?.length || 0;
                totSl += plant.files.SmartLogger?.length || 0;
                totEsr += plant.files.ESR?.length || 0;
                totEsm += plant.files.ESM?.length || 0;

                Object.keys(plant.files).forEach(catKey => {
                  (plant.files[catKey] || []).forEach((f: any, index: number) => {
                    allFiles.push({
                      id: `${plant.id}-${catKey}-${index}-${f.path || f.file?.name || 'sheet'}`,
                      name: f.file?.name || f.path || 'unknown.xlsx',
                      path: f.path || f.file?.name || 'unknown.xlsx',
                      category: catKey,
                      plant: plant.name,
                      status: f.report?.status || 'ready',
                      file: f.file
                    });
                  });
                });
              });

              const hasFiles = allFiles.length > 0;
              const pieValues = hasFiles ? [totPoc, totEss, totSl, totEsr, totEsm] : [30, 20, 15, 10, 25];
              const totalFileCount = totPoc + totEss + totSl + totEsr + totEsm;
              const pieCustomText = hasFiles
                ? pieValues.map((v, i) => (totalFileCount > 0 && (v / totalFileCount) * 100 > 3) ? `<b>${pieLabels[i]}</b><br>${((v / totalFileCount) * 100).toFixed(1)}%` : '')
                : pieValues.map((_, i) => `<b>${pieLabels[i]}</b>`);
              const plantCharts = currentPlants.map((plant) => {
                const pocActual = plant.files.POC?.length || 0;
                const essActual = plant.files.ESS?.length || 0;
                const slActual  = plant.files.SmartLogger?.length || 0;
                const esrActual = plant.files.ESR?.length || 0;
                const esmActual = plant.files.ESM?.length || 0;

                const values = [pocActual, essActual, slActual, esrActual, esmActual];
                const total = values.reduce((sum, v) => sum + v, 0);

                const exp = plant.expected || {};

                return {
                  id: plant.id,
                  name: plant.name.replace('_', ' '),
                  values: total > 0 ? values : [1],
                  labels: total > 0 ? pieLabels : ['No Data'],
                  colors: total > 0 ? chartColors : ['#334155'],
                  total,
                  hasData: total > 0,
                  breakdown: [
                    { label: 'POC',            actual: pocActual, expected: exp.POC          ?? null, color: chartColors[0] },
                    { label: 'ESS (battery)',  actual: essActual, expected: exp.ESS          ?? null, color: chartColors[1] },
                    { label: 'SmartLogger',    actual: slActual,  expected: exp.SmartLogger  ?? null, color: chartColors[2] },
                    { label: 'ESR (rack)',     actual: esrActual, expected: exp.ESR          ?? null, color: chartColors[3] },
                    { label: 'ESM (module)',   actual: esmActual, expected: exp.ESM          ?? null, color: chartColors[4] },
                  ],
                };
              });
              
              const displayFiles = hasFiles
                ? [...allFiles].sort((left, right) => {
                    if (left.plant !== right.plant) return left.plant.localeCompare(right.plant);
                    return left.name.localeCompare(right.name);
                  })
                : [];

              return (
                <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col relative overflow-hidden">
                  <div className="px-3 py-2 border-b border-border-v flex items-center justify-between bg-surface/50 shrink-0">
                    <div className="font-bold text-[11px] uppercase tracking-wider">
                      Validation File Overview
                    </div>
                  </div>
                  
                  <div className="flex-1 flex flex-col md:flex-row w-full h-full p-4 gap-6">
                    <div className="w-full md:w-[42%] flex flex-col bg-surface/30 border border-border-v rounded-lg p-3 gap-4 overflow-y-auto scrollbar-clean">
                       <div>
                         <h3 className="text-[10px] uppercase font-bold text-foreground/50 tracking-widest">File Distribution</h3>
                         <p className="text-[10px] font-mono text-foreground/35 mt-1">Project total followed by plant-level breakdown.</p>
                       </div>

                       <div className="border border-border-v/70 rounded-lg bg-background/25 p-3">
                         <div className="flex items-center justify-between mb-2">
                           <div className="text-[10px] uppercase tracking-widest text-foreground/45 font-bold">Total Distribution</div>
                           <div className="text-[10px] font-mono text-accent-blue">{totalFileCount.toLocaleString()} files</div>
                         </div>
                         <div className="h-[320px]">
                           <Plot
                              data={[{
                                values: pieValues,
                                labels: pieLabels,
                                type: 'pie',
                                hole: 0.75,
                                pull: pieValues.map(() => 0.015),
                                marker: { 
                                  colors: chartColors,
                                  line: { color: 'transparent', width: 0 } 
                                },
                                text: pieCustomText,
                                textinfo: 'text',
                                textposition: 'outside',
                                hoverinfo: 'label+value+percent'
                              }]}
                              layout={{
                                autosize: true,
                                margin: { t: 30, r: 40, l: 40, b: 30 },
                                paper_bgcolor: 'transparent',
                                plot_bgcolor: 'transparent',
                                font: { family: 'JetBrains Mono', size: 10, color: fontColor },
                                showlegend: false,
                                annotations: [
                                  {
                                    text: `<b>${totalFileCount.toLocaleString()}</b><br><span style="font-size:10px;color:${fontColor};opacity:.7">TOTAL FILES</span>`,
                                    showarrow: false,
                                    font: { size: 14, color: fontColor }
                                  }
                                ]
                              }}
                              useResizeHandler={true}
                              style={{ width: '100%', height: '100%' }}
                              config={{ displayModeBar: false }}
                            />
                         </div>
                         <div className="grid grid-cols-2 gap-2 mt-2">
                            {legendItems.map((item, index) => (
                              <div key={item.key} className="rounded border border-border-v/60 bg-panel/60 px-2.5 py-2 text-[10px] font-mono flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                                  <span className="truncate">{item.label}</span>
                                </div>
                                <span className="text-foreground/60">{pieValues[index]}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Plant Breakdown */}
                        <div className="border border-border-v/70 rounded-lg bg-background/25 p-3">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-[10px] uppercase tracking-widest text-foreground/45 font-bold">Plant Breakdown</div>
                            <div className="text-[9px] font-mono text-foreground/35">{plantCharts.length} plant{plantCharts.length !== 1 ? 's' : ''}</div>
                          </div>
                          <PlantBreakdownCards project={project} fontColor={fontColor} />
                        </div>

                        {/* Legend */}
                        <div className="border border-border-v/70 rounded-lg bg-background/25 p-3">
                          <div className="text-[10px] uppercase tracking-widest text-foreground/45 font-bold mb-3">Legend</div>
                          <div className="grid grid-cols-1 gap-2">
                            {legendItems.map(item => (
                              <div key={item.key} className="flex items-center justify-between gap-3 rounded border border-border-v/60 bg-panel/60 px-3 py-2">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                                  <div className="min-w-0">
                                    <div className="text-[10px] uppercase tracking-widest font-bold">{item.label}</div>
                                    <div className="text-[10px] font-mono text-foreground/50 truncate">{item.description}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                    </div>

                    <div className="w-full md:w-[58%] flex flex-col border border-border-v rounded-lg overflow-hidden bg-surface/30">
                       <div className="bg-foreground/5 p-3 border-b border-border-v text-[10px] font-bold uppercase shrink-0 flex items-center justify-between">
                          <span>Select Data Source to Preview</span>
                          <span className="bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded text-[9px]">{displayFiles.length} Sources Available</span>
                       </div>
                       <div className="flex bg-surface border-b border-border-v/50 text-[9px] font-bold uppercase shrink-0 px-3 py-2 opacity-70">
                          <div className="flex-1">Source Name</div>
                          <div className="w-24">Type</div>
                          <div className="w-40">Target Plants</div>
                          <div className="w-24 text-center">Action</div>
                       </div>
                       <div className="flex-1 overflow-y-auto scrollbar-clean p-2 space-y-1">
                          {displayFiles.length === 0 ? (
                            <div className="p-8 text-center text-[11px] font-mono text-foreground/35 uppercase tracking-widest">
                              Run validation first, then preview any spreadsheet here.
                            </div>
                          ) : displayFiles.map((f, i) => (
                            <div key={f.id} className="flex items-center gap-3 p-2 hover:bg-foreground/5 rounded cursor-pointer border border-transparent hover:border-border-v transition-all">
                               <FileSpreadsheet size={14} className="text-green-500 shrink-0" />
                               <span className="text-[11px] font-mono flex-1 truncate" title={f.name}>
                                 {f.name}
                               </span>
                               <span className="text-[10px] font-mono w-24 opacity-70 bg-foreground/5 px-2 py-0.5 rounded text-center truncate" title={f.category}>Spreadsheet</span>
                               <span className="text-[10px] font-mono w-40 opacity-70 truncate" title={f.plant}>{f.plant}</span>
                               <button
                                  onClick={() => openWorkbookPreview(f)}
                                  className="w-24 text-[9px] bg-accent-blue/10 hover:bg-accent-blue text-accent-blue hover:text-foreground py-1.5 rounded font-bold transition-colors border border-accent-blue/30"
                               >
                                  PREVIEW
                               </button>
                            </div>
                          ))}
                       </div>
                    </div>
                  </div>
                </section>
              );
            })()
          )}
            </>
          )}


        </main>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsWindow
          onClose={() => setIsSettingsOpen(false)}
          isMaximized={isSettingsMaximized}
          onToggleMaximize={() => setIsSettingsMaximized(!isSettingsMaximized)}
        />
      )}
    </div>
  );
}