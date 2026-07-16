import Plot from 'react-plotly.js';
import React, { useState, useEffect, useRef } from 'react';

import { 
  Activity, 
  BarChart3, 
  Battery, 
  Cpu, 
  Database, 
  Download, 
  FileBox, 
  Grid2X2, 
  Settings, 
  Upload, 
  Zap,
  CheckCircle2,
  AlertTriangle,
  FileWarning,
  FileJson,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  Archive,
  Bot,
  Sparkles,
  Key,
  FileText,
  MessageSquare,
  Send,
  Network,
  Moon,
  Sun,
  X,
  Maximize2,
  Minimize2,
  Check,
  Sliders,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GoogleGenAI } from "@google/genai";
import { AIAgentPage } from "./pages/AIAgentPage";
import { DailyEvaluationPage } from "./pages/DailyEvaluationPage";
import { MatFigExportPage } from "./pages/MatFigExportPage";
import { ValidationDebug } from "./components/ValidationDebug";
import { useAIContext } from '../lib/ai-context';
import { useAppStore } from '../store/useAppStore';
import { is20PercentProject } from '../lib/project-detection';
import { 
  hcInitProjects, hcBulkImport, hcAcceptFiles, hcRunExport, getHcActiveProject, setHcActiveProject, 
  hcByProject, HC_PROJECTS, HC_CATS, hcLogHistory, setReactUpdateCb, getHcBusy,
  hcForceStop, hcResetActiveProject, expandZip, extractDataDate
} from './lib/powerflow-audit-engine.js';
import { ess20SharedState, syncCycleHistoryFromDisk } from './lib/ess20-shared-state';
import { SettingsWindow } from '../components/SettingsWindow';


async function traverseFileTree(item: any, path: string): Promise<{file: File, path: string}[]> {
  return new Promise((resolve) => {
    if (item.isFile) {
      item.file((file: File) => {
        resolve([{ file, path: path + file.name }]);
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      dirReader.readEntries(async (entries: any[]) => {
        const promises = [];
        for (let i = 0; i < entries.length; i++) {
          promises.push(traverseFileTree(entries[i], path + item.name + "/"));
        }
        const results = await Promise.all(promises);
        resolve(results.flat());
      });
    } else {
      resolve([]);
    }
  });
}

async function getFilesFromDataTransfer(dt: DataTransfer): Promise<{file: File, path: string}[]> {
  if (dt.items && dt.items.length > 0 && typeof dt.items[0].webkitGetAsEntry === 'function') {
    const promises = [];
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      const entry = item.webkitGetAsEntry();
      if (entry) {
        promises.push(traverseFileTree(entry, ''));
      }
    }
    const results = await Promise.all(promises);
    return results.flat();
  } else {
    return Array.from(dt.files).map(f => ({ file: f, path: f.webkitRelativePath || f.name }));
  }
}

export function PowerFlowMode() {
  const globalProject = useAppStore(state => state.hcActiveProject);
  
  useEffect(() => {
    setHcActiveProject(globalProject);
  }, [globalProject]);

  const [activeTab, setActiveTab] = useState('ess20');
  const project = getHcActiveProject() || 'SNTB';
  const [currentTime, setCurrentTime] = useState(new Date());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsMaximized, setIsSettingsMaximized] = useState(false);
  const [auditStateVersion, setAuditStateVersion] = useState(0);
  const [progress, setProgress] = useState({ pct: 0, active: false, label: '' });

  const archiveInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: string }[]>([]);


  const isDarkMode = theme === 'dark';
  const fontColor = isDarkMode ? '#E0E0E0' : '#111827';
  const gridColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const zeroLineColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const logoUrl = new URL('./assets/SNT-Logo.png', import.meta.url).href;

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const handleResetEvent = () => {
      setUploadedFiles([]);
      setUploadMessage("");
    };
    window.addEventListener("ess-reset", handleResetEvent);
    return () => window.removeEventListener("ess-reset", handleResetEvent);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    // Initialize audit engine
    if (!getHcActiveProject()) {
      hcInitProjects();
    }
    
    // Sync cycle history from physical disk storage on startup
    syncCycleHistoryFromDisk();
    setReactUpdateCb((type?: string, ...args: any[]) => {
      if (type === 'progress') {
        const pct = args[0] !== undefined ? args[0] : 0;
        const active = args[1] !== undefined ? !!args[1] : false;
        const customLabel = args[2] || '';
        const label = customLabel || (getHcBusy() ? 'Compiling and exporting data...' : 'Ingesting and validating files...');
        setProgress({ pct, active, label });
      }
      setAuditStateVersion(v => v + 1);
    });
    
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleString('en-US', {
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false
  });

  const handleIngestFiles = async (filesArray: { file: File; path: string }[]) => {
    setUploadMessage("Unpacking and analyzing archives...");
    try {
      const expanded: { file: File; path: string }[] = [];
      for (const item of filesArray) {
        if (/\.(zip|rar|7z)$/i.test(item.file.name)) {
          try {
            const inner = await expandZip(item.file, item.path);
            expanded.push(...inner);
          } catch (err) {
            console.error("Error expanding archive:", err);
          }
        } else {
          expanded.push(item);
        }
      }
      const filesList = expanded.slice(0, 15).map((f) => ({
        name: f.path || f.file.name,
        size: formatBytes(f.file.size),
      }));
      if (expanded.length > 15) {
        filesList.push({ name: `... and ${expanded.length - 15} more files`, size: "" });
      }
      setUploadedFiles(filesList);
      
      // Keep shared state synchronized!
      ess20SharedState.uploadedFiles = filesList;
      
      setUploadMessage("Dropped files expanded! Auditing...");
      await hcBulkImport(expanded);
      setUploadMessage("Audit complete!");
    } catch (err: any) {
      setUploadMessage(`Error: Failed to process items: ${err.message || String(err)}`);
    }
  };


  // Helper to dynamically calculate KPI values based on uploaded and audited data
  const getDynamicKpis = () => {
    const currentPlants = hcByProject[project] || [];
    
    // Check if there are any uploaded files in this project
    let totalFiles = 0;
    let healthyFiles = 0;
    let totalSignals = 0;
    
    // Project-wide category tallies
    let totPoc = 0;
    let totEss = 0;
    let totSl = 0;
    let totPcs = 0;

    currentPlants.forEach(plant => {
      // Sum categories
      totPoc += plant.files.POC?.length || 0;
      totEss += plant.files.ESS?.length || 0;
      totSl += plant.files.SmartLogger?.length || 0;
      totPcs += plant.files.PCS?.length || 0;

      Object.values(plant.files).forEach((list: any) => {
        list.forEach((item: any) => {
          totalFiles++;
          if (item.report) {
            if (item.report.N) totalSignals += item.report.N;
            if (item.report.status === 'ok') healthyFiles++;
            else if (item.report.status === 'warning') healthyFiles += 0.7;
          }
        });
      });
    });

    if (totalFiles === 0) {
      // Fallback to beautiful Huawei demo mockup values before data is uploaded
      return {
        p1: { name: "Plant 1", value: "842.15", unit: "MW", subtext: "+1.2% Target Deviation", color: "text-green-500", bg: "bg-green-500/5", border: "border-green-500/20 border-t-green-500" },
        p2: { name: "Plant 2", value: "68.4", unit: "%", subtext: "Balancing Required (Δ3.2%)", color: "text-yellow-400", bg: "bg-yellow-400/5", border: "border-yellow-400/20 border-t-yellow-400" },
        p3: { name: "Plant 3", value: "98.2", unit: "%", subtext: "Predictive EOL: 2031-Q4", color: "text-blue-500", bg: "bg-blue-500/5", border: "border-blue-500/20 border-t-blue-500" },
        quality: { value: "99.98", unit: "%", subtext: "Signals Synced: 14,204", color: "text-purple-500", bg: "bg-purple-500/5", border: "border-purple-500/20 border-t-purple-500", totalFiles }
      };
    }

    // Plant 1 Status
    const p1 = currentPlants[0];
    let p1Value = "0";
    let p1Subtext = "No files uploaded";
    let p1SubtextColor = "text-foreground/40";
    let p1Bg = "bg-foreground/5";
    let p1Border = "border-border-v border-t-foreground/30";
    
    if (p1) {
      const poc = p1.files.POC?.length || 0;
      const ess = p1.files.ESS?.length || 0;
      const sl  = p1.files.SmartLogger?.length || 0;
      const pcs = p1.files.PCS?.length || 0;
      const totalP1Files = poc + ess + sl + pcs;
      p1Value = String(totalP1Files);
      
      if (totalP1Files > 0) {
        let criticals = 0;
        let warnings = 0;
        Object.values(p1.files).forEach((list: any) => {
          list.forEach((item: any) => {
            if (item.report) {
              if (item.report.status === 'critical') criticals++;
              else if (item.report.status === 'warning') warnings++;
            }
          });
        });
        
        p1Subtext = `POC: ${poc} | ESS: ${ess} | SL: ${sl} | PCS: ${pcs}`;
        
        if (criticals > 0) {
          p1SubtextColor = "text-red-500 font-semibold";
          p1Bg = "bg-red-500/5";
          p1Border = "border-red-500/20 border-t-red-500";
        } else if (warnings > 0) {
          p1SubtextColor = "text-yellow-400 font-semibold";
          p1Bg = "bg-yellow-400/5";
          p1Border = "border-yellow-400/20 border-t-yellow-400";
        } else {
          p1SubtextColor = "text-green-500 font-semibold";
          p1Bg = "bg-green-500/5";
          p1Border = "border-green-500/20 border-t-green-500";
        }
      }
    }

    // Plant 2 Status
    const p2 = currentPlants[1];
    let p2Value = "0";
    let p2Subtext = "No files uploaded";
    let p2SubtextColor = "text-foreground/40";
    let p2Bg = "bg-foreground/5";
    let p2Border = "border-border-v border-t-foreground/30";
    
    if (p2) {
      const poc = p2.files.POC?.length || 0;
      const ess = p2.files.ESS?.length || 0;
      const sl  = p2.files.SmartLogger?.length || 0;
      const pcs = p2.files.PCS?.length || 0;
      const totalP2Files = poc + ess + sl + pcs;
      p2Value = String(totalP2Files);
      
      if (totalP2Files > 0) {
        let criticals = 0;
        let warnings = 0;
        Object.values(p2.files).forEach((list: any) => {
          list.forEach((item: any) => {
            if (item.report) {
              if (item.report.status === 'critical') criticals++;
              else if (item.report.status === 'warning') warnings++;
            }
          });
        });
        
        p2Subtext = `POC: ${poc} | ESS: ${ess} | SL: ${sl} | PCS: ${pcs}`;
        
        if (criticals > 0) {
          p2SubtextColor = "text-red-500 font-semibold";
          p2Bg = "bg-red-500/5";
          p2Border = "border-red-500/20 border-t-red-500";
        } else if (warnings > 0) {
          p2SubtextColor = "text-yellow-400 font-semibold";
          p2Bg = "bg-yellow-400/5";
          p2Border = "border-yellow-400/20 border-t-yellow-400";
        } else {
          p2SubtextColor = "text-green-500 font-semibold";
          p2Bg = "bg-green-500/5";
          p2Border = "border-green-500/20 border-t-green-500";
        }
      }
    }

    // Plant 3 Status
    const p3 = currentPlants[2];
    let p3Value = "0";
    let p3Subtext = "No files uploaded";
    let p3SubtextColor = "text-foreground/40";
    let p3Bg = "bg-foreground/5";
    let p3Border = "border-border-v border-t-foreground/30";
    
    if (p3) {
      const poc = p3.files.POC?.length || 0;
      const ess = p3.files.ESS?.length || 0;
      const sl  = p3.files.SmartLogger?.length || 0;
      const pcs = p3.files.PCS?.length || 0;
      const totalP3Files = poc + ess + sl + pcs;
      p3Value = String(totalP3Files);
      
      if (totalP3Files > 0) {
        let criticals = 0;
        let warnings = 0;
        Object.values(p3.files).forEach((list: any) => {
          list.forEach((item: any) => {
            if (item.report) {
              if (item.report.status === 'critical') criticals++;
              else if (item.report.status === 'warning') warnings++;
            }
          });
        });
        
        p3Subtext = `POC: ${poc} | ESS: ${ess} | SL: ${sl} | PCS: ${pcs}`;
        
        if (criticals > 0) {
          p3SubtextColor = "text-red-500 font-semibold";
          p3Bg = "bg-red-500/5";
          p3Border = "border-red-500/20 border-t-red-500";
        } else if (warnings > 0) {
          p3SubtextColor = "text-yellow-400 font-semibold";
          p3Bg = "bg-yellow-400/5";
          p3Border = "border-yellow-400/20 border-t-yellow-400";
        } else {
          p3SubtextColor = "text-green-500 font-semibold";
          p3Bg = "bg-green-500/5";
          p3Border = "border-green-500/20 border-t-green-500";
        }
      }
    }

    const qualityPct = totalFiles ? Math.round((healthyFiles / totalFiles) * 10000) / 100 : 100;
    
    return {
      p1: { name: p1?.name?.replace('_', ' ') || "Plant 1", value: p1Value, unit: "Files", subtext: p1Subtext, color: p1SubtextColor, bg: p1Bg, border: p1Border },
      p2: { name: p2?.name?.replace('_', ' ') || "Plant 2", value: p2Value, unit: "Files", subtext: p2Subtext, color: p2SubtextColor, bg: p2Bg, border: p2Border },
      p3: { name: p3?.name?.replace('_', ' ') || "Plant 3", value: p3Value, unit: "Files", subtext: p3Subtext, color: p3SubtextColor, bg: p3Bg, border: p3Border },
      quality: {
        value: String(totalFiles),
        unit: "Excel Files",
        subtext: `Quality: ${qualityPct}% (POC: ${totPoc} | ESS: ${totEss} | SL: ${totSl} | PCS: ${totPcs})`,
        color: qualityPct > 90 ? "text-purple-400 font-semibold" : qualityPct > 70 ? "text-yellow-400 font-semibold" : "text-red-500 font-semibold",
        bg: "bg-purple-500/5",
        border: "border-purple-500/20 border-t-purple-500",
        totalFiles
      }
    };
  };

  const kpis = getDynamicKpis();
  
  // Mock data for the Plotly chart
  const pTotalData = Array.from({ length: 100 }, (_, i) => ({
    x: i,
    y: Math.sin(i / 10) * 100 + 300 + Math.random() * 50
  }));
  const freqBusData = Array.from({ length: 100 }, (_, i) => ({
    x: i,
    y: 50 + Math.random() * 0.2 - 0.1
  }));

  return (
    <div className="flex flex-1 overflow-hidden h-full w-full bg-background text-foreground font-sans">      <div className="flex flex-1 overflow-hidden">        {/* Sidebar */}
        <nav className={cn(
          "bg-panel border-r border-border-v flex flex-col shrink-0 justify-between transition-all duration-300 relative",
          isSidebarCollapsed ? "w-14" : "w-[220px]"
        )}>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {!isSidebarCollapsed && (
              <div className="p-3 text-[10px] uppercase tracking-widest text-foreground/30 font-bold">Main Modules</div>
            )}
            
            {/* Collapsed quick upload button */}
            {isSidebarCollapsed && activeTab === 'ess20' && (
              <div className="flex justify-center py-2 border-b border-border-v/30">
                <button 
                  onClick={() => archiveInputRef.current?.click()}
                  className="flex items-center justify-center p-2 bg-accent-blue/10 hover:bg-accent-blue/20 rounded-md text-accent-blue transition-all cursor-pointer"
                  title="Upload Archive / Spreadsheet"
                >
                  <Upload size={16} />
                </button>
              </div>
            )}

            <div className="flex flex-col">
              <NavItem icon={<BarChart3 size={14} />} label="Daily Evaluation" active={activeTab === 'ess20'} onClick={() => setActiveTab('ess20')} collapsed={isSidebarCollapsed} />
              <NavItem icon={<Bot size={14} />} label="AI Agent" active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} collapsed={isSidebarCollapsed} />
            </div>

            {/* If tab is 'ess20' and sidebar is NOT collapsed, show secondary panel components */}
            {!isSidebarCollapsed && activeTab === 'ess20' && (
              <div className="flex-1 overflow-y-auto px-3 py-2 border-t border-border-v/30 space-y-4 select-text scrollbar-thin">
                {/* 1. Integrated ZIP & Excel File Ingestion Zone */}
                <div 
                  className={cn(
                    "border border-dashed rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer transition-all text-center shrink-0 min-h-[110px]",
                    isDragging ? "bg-accent-blue/10 border-accent-blue/50" : "bg-foreground/[0.02] hover:bg-foreground/[0.04] border-border-v"
                  )}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (!e.dataTransfer.files) return;
                    const filesArray = await getFilesFromDataTransfer(e.dataTransfer);
                    await handleIngestFiles(filesArray);
                  }}
                  onClick={() => zipInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={archiveInputRef} 
                    className="hidden" 
                    multiple 
                    accept=".zip,.rar,.7z,.xlsx,.xls,.csv" 
                    onChange={async (e) => {
                      const rawFiles = [...(e.target.files || [])];
                      const files = rawFiles.map(f => ({ file: f, path: f.name }));
                      await handleIngestFiles(files);
                      e.target.value = "";
                    }} 
                  />
                  <input 
                    type="file" 
                    ref={zipInputRef} 
                    className="hidden" 
                    accept=".zip,.rar,.7z" 
                    onChange={async (e) => {
                      const rawFiles = [...(e.target.files || [])];
                      const files = rawFiles.map(f => ({ file: f, path: f.name }));
                      await handleIngestFiles(files);
                      e.target.value = "";
                    }} 
                  />
                  <Upload size={16} className="mb-1 text-accent-blue opacity-80" />
                  <div className="text-[9px] uppercase font-bold text-foreground/70 mb-2 font-mono">Upload Data</div>
                  <div className="flex gap-1 w-full">
                    <Button 
                      onClick={(e) => { e.stopPropagation(); archiveInputRef.current?.click(); }}
                      className="bg-accent-blue text-white hover:bg-blue-600 h-5 text-[8px] flex-1 font-bold px-0 border-0 cursor-pointer"
                    >
                      File
                    </Button>
                    <Button 
                      onClick={(e) => { e.stopPropagation(); zipInputRef.current?.click(); }}
                      variant="outline" 
                      className="border-border-v hover:bg-foreground/5 h-5 text-[8px] flex-1 text-foreground bg-transparent font-bold px-0 cursor-pointer"
                    >
                      Zip
                    </Button>
                  </div>
                  {uploadMessage && (
                    <div className={cn(
                      "mt-1.5 text-[9px] px-2.5 py-0.5 rounded-full text-center border font-sans font-semibold tracking-wide shadow-sm truncate select-text",
                      uploadMessage.startsWith("Error") 
                        ? "text-red-400 bg-red-500/10 border-red-500/20" 
                        : (uploadMessage === "Audit complete!"
                          ? "text-green-500 bg-green-500/10 border-green-500/20" 
                          : "text-blue-400 bg-blue-500/10 border-blue-500/20")
                    )}>
                      {uploadMessage}
                    </div>
                  )}
                </div>

                {/* 2. Uploaded Archives List */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider flex justify-between items-center px-0.5">
                      <span>Uploaded Archives</span>
                      <span className="bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] px-2 py-0.5 rounded-full text-[9px] font-bold">{uploadedFiles.length}</span>
                    </div>
                    <div className="max-h-20 overflow-y-auto space-y-1 pr-1 scrollbar-thin select-text">
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-[12px] font-mono bg-foreground/[0.02] hover:bg-foreground/[0.06] border border-[var(--border)] rounded p-1.5 transition-colors cursor-default">
                          <span className="truncate flex-1 text-left text-[var(--text-primary)] font-medium" title={f.name}>{f.name}</span>
                          {f.size && <span className="text-[10px] font-mono text-[var(--text-secondary)] bg-foreground/[0.04] px-1.5 py-0.5 rounded shrink-0 ml-2">{f.size}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Loaded Sheets List */}
                {(() => {
                  const currentPlants = hcByProject[project] || [];
                  const allUploadedFiles = currentPlants.flatMap(plant => 
                    HC_CATS.flatMap(cat => 
                      (plant.files[cat.key] || []).map(item => ({
                        plantName: plant.name,
                        catLabel: cat.label,
                        fileName: item.file.name,
                        filePath: item.path,
                        status: item.report?.status || "VALIDATED"
                      }))
                    )
                  );

                  if (allUploadedFiles.length === 0) return null;

                  return (
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider flex justify-between items-center px-0.5">
                        <span>Loaded Sheets</span>
                        <span className="bg-[var(--accent-green)]/15 text-[var(--accent-green)] px-2 py-0.5 rounded-full text-[9px] font-bold">{allUploadedFiles.length}</span>
                      </div>
                      <div className="max-h-24 overflow-y-auto space-y-1 pr-1 scrollbar-thin select-text">
                        {allUploadedFiles.map((f, i) => (
                          <div key={i} className="flex flex-col text-[12px] font-mono bg-foreground/[0.02] hover:bg-foreground/[0.06] border border-[var(--border)] rounded p-1.5 transition-colors">
                            <div className="flex items-center justify-between text-[var(--text-primary)] font-bold gap-2">
                              <span className="truncate flex-1 text-left" title={f.filePath}>{f.fileName}</span>
                              <span className={`text-[9px] font-bold shrink-0 uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                                f.status === "ok" || f.status === "VALIDATED" 
                                  ? "text-[var(--accent-green)] bg-[var(--accent-green)]/10" 
                                  : "text-[var(--accent-red)] bg-[var(--accent-red)]/10"
                              }`}>{f.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* 4. Date/Points/ESS Stats & Processed Files Banner */}
                {ess20SharedState.result && (
                  <div className="space-y-2 select-text">
                    <div className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider px-0.5">Evaluation Stats</div>
                    
                    <div className="bg-panel/40 border border-[var(--border)] p-2.5 rounded-lg flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-foreground/[0.02] border border-[var(--border)] p-1.5 rounded flex flex-col justify-between">
                          <span className="text-[9px] uppercase text-[var(--text-secondary)] font-semibold">Date</span>
                          <span className="text-[11px] font-mono font-bold truncate text-[var(--text-primary)]">{ess20SharedState.result.dataDate}</span>
                        </div>
                        <div className="bg-foreground/[0.02] border border-[var(--border)] p-1.5 rounded flex flex-col justify-between">
                          <span className="text-[9px] uppercase text-[var(--text-secondary)] font-semibold">Points</span>
                          <span className="text-[11px] font-mono font-bold text-[var(--text-primary)]">{ess20SharedState.result.main.times.length}</span>
                        </div>
                        <div className="bg-foreground/[0.02] border border-[var(--border)] p-1.5 rounded flex flex-col justify-between">
                          <span className="text-[9px] uppercase text-[var(--text-secondary)] font-semibold">ESS Today</span>
                          <span className="text-[11px] font-mono font-bold text-[var(--text-primary)]">{ess20SharedState.result.cycle.todayDeviceCount}</span>
                        </div>
                        <div className="bg-foreground/[0.02] border border-[var(--border)] p-1.5 rounded flex flex-col justify-between">
                          <span className="text-[9px] uppercase text-[var(--text-secondary)] font-semibold">ESS Yesterday</span>
                          <span className="text-[11px] font-mono font-bold text-[var(--text-primary)]">{ess20SharedState.result.cycle.yesterdayDeviceCount}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Success compilation banner */}
                    <div className="bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20 text-[var(--accent-green)] p-2.5 rounded-lg text-[10px] font-medium flex items-start gap-2 select-text shadow-xs">
                      <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <span className="font-bold uppercase tracking-wider block text-[8px] opacity-75 mb-0.5">Evaluation Successful</span>
                        Processed {ess20SharedState.result.cycle.todayDeviceCount} ESS telemetry files successfully.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="p-1 border-t border-border-v/30 flex flex-col gap-1 shrink-0">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-left transition-colors font-medium text-[11px] outline-none hover:bg-foreground/5 text-foreground/60 hover:text-foreground rounded-sm w-full",
                isSidebarCollapsed && "justify-center px-0"
              )}
              title="Settings"
            >
              <span className="flex items-center justify-center opacity-70 shrink-0"><Settings size={14} /></span>
              {!isSidebarCollapsed && "Settings"}
            </button>
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-left transition-colors font-medium text-[11px] outline-none hover:bg-foreground/5 text-foreground/60 hover:text-foreground rounded-sm w-full border-t border-border-v/20 pt-2 cursor-pointer hover-btn-micro",
                isSidebarCollapsed && "justify-center px-0"
              )}
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <span className="flex items-center justify-center opacity-70 shrink-0">
                {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </span>
              {!isSidebarCollapsed && "Collapse Sidebar"}
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          


          {/* Daily Evaluation Tab Panel */}
          <div className={cn("flex-1 min-h-0 flex-col", activeTab === 'ess20' ? "flex" : "hidden")}>
            <DailyEvaluationPage theme={theme} project={project} active={activeTab === 'ess20'} progress={progress} setProgress={setProgress} auditStateVersion={auditStateVersion} />
          </div>

          {/* AI Agent Tab Panel */}
          <div className={cn("flex-1 min-h-0 flex-col", activeTab === 'ai' ? "flex" : "hidden")}>
            <AIAgentPage />
          </div>

          {/* Validation Overview Dashboard Fallback */}
          {activeTab !== 'ess20' && activeTab !== 'export' && activeTab !== 'ai' && (
            (() => {
              const currentPlants = hcByProject[project] || [];
              let totPoc = 0, totEss = 0, totSl = 0, totPcs = 0;
              const allFiles: {name: string, type: string, plant: string}[] = [];
              
              currentPlants.forEach(plant => {
                totPoc += plant.files.POC?.length || 0;
                totEss += plant.files.ESS?.length || 0;
                totSl += plant.files.SmartLogger?.length || 0;
                totPcs += plant.files.PCS?.length || 0;

                Object.keys(plant.files).forEach(catKey => {
                  (plant.files[catKey] || []).forEach((f: any) => {
                    allFiles.push({
                      name: f.file?.name || f.path || 'unknown.xlsx',
                      type: catKey,
                      plant: plant.name
                    });
                  });
                });
              });

              const hasFiles = allFiles.length > 0;
              const pieValues = hasFiles ? [totPoc, totEss, totSl, totPcs] : [30, 20, 15, 35];
              const pieLabels = ['POC', 'ESS', 'SmartLogger', 'PCS'];
              
              const displayFiles = hasFiles ? (() => {
                 const rootPaths = new Map<string, { type: string, plant: Set<string>, count: number }>();
                 allFiles.forEach(f => {
                   const pathParts = f.name.includes('/') ? f.name.split('/') : f.name.split('\\');
                   const root = pathParts.length > 1 ? pathParts[0] : f.name;
                   
                   let ext = 'Folder';
                   if (root.toLowerCase().endsWith('.zip')) ext = 'ZIP Archive';
                   else if (root.toLowerCase().endsWith('.rar')) ext = 'RAR Archive';
                   else if (root.toLowerCase().endsWith('.7z')) ext = '7Z Archive';
                   else if (root.toLowerCase().match(/\.(xlsx?|csv)$/)) ext = 'Spreadsheet';
                   
                   if (!rootPaths.has(root)) {
                     rootPaths.set(root, { type: ext, plant: new Set([f.plant]), count: 1 });
                   } else {
                     const curr = rootPaths.get(root)!;
                     curr.plant.add(f.plant);
                     curr.count++;
                   }
                 });
                 return Array.from(rootPaths.entries()).map(([name, data]) => ({
                   name,
                   type: data.type,
                   plant: Array.from(data.plant).join(', '),
                   count: data.count
                 }));
              })() : [
                { name: 'SNTB30MWH_dataset_A.zip', type: 'ZIP Archive', plant: 'PLANT_A_UNIT_01, PLANT_A_UNIT_04', count: 42 },
                { name: 'SNTB30MWH_dataset_B.rar', type: 'RAR Archive', plant: 'CENTRAL_LOGGER_01', count: 15 },
                { name: 'grid_operator_cmd.xlsx', type: 'Spreadsheet', plant: 'PLANT_B_POC', count: 1 },
                { name: 'telemetry_packet_rx.csv', type: 'Spreadsheet', plant: 'PLANT_C_UNIT_02', count: 1 }
              ];

              return (
                <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col relative overflow-hidden">
                  <div className="px-3 py-2 border-b border-border-v flex items-center justify-between bg-surface/50 shrink-0">
                    <div className="font-bold text-[11px] uppercase tracking-wider">
                      Validation File Overview
                    </div>
                  </div>
                  
                  <div className="flex-1 flex flex-col md:flex-row w-full h-full p-4 gap-6">
                    <div className="w-full md:w-1/3 flex flex-col items-center justify-center bg-surface/30 border border-border-v rounded-lg p-2 relative">
                       <h3 className="absolute top-4 left-4 text-[10px] uppercase font-bold text-foreground/50 tracking-widest">File Distribution</h3>
                       <Plot
                          data={[{
                            values: pieValues,
                            labels: pieLabels,
                            type: 'pie',
                            hole: 0.7,
                            marker: { colors: ['#00A3FF', '#22c55e', '#eab308', '#a855f7', '#ef4444'] },
                            textinfo: 'percent',
                            hoverinfo: 'label+value'
                          }]}
                          layout={{
                            autosize: true,
                            margin: { t: 40, r: 20, l: 20, b: 40 },
                            paper_bgcolor: 'transparent',
                            plot_bgcolor: 'transparent',
                            font: { family: 'JetBrains Mono', size: 10, color: fontColor },
                            showlegend: true,
                            legend: { orientation: 'h', y: -0.1 }
                          }}
                          useResizeHandler={true}
                          style={{ width: '100%', height: '100%' }}
                          config={{ displayModeBar: false }}
                        />
                    </div>

                    <div className="w-full md:w-2/3 flex flex-col border border-border-v rounded-lg overflow-hidden bg-surface/30">
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
                       <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                          {displayFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-3 p-2 hover:bg-foreground/5 rounded cursor-pointer border border-transparent hover:border-border-v transition-all">
                               {f.type.includes('Archive') ? (
                                 <Archive size={14} className="text-blue-500 shrink-0" />
                               ) : f.type === 'Folder' ? (
                                 <FileBox size={14} className="text-yellow-500 shrink-0" />
                               ) : (
                                 <FileSpreadsheet size={14} className="text-green-500 shrink-0" />
                               )}
                               <span className="text-[11px] font-mono flex-1 truncate" title={f.name}>
                                 {f.name}
                                 {f.count > 1 && <span className="ml-2 text-[9px] bg-foreground/10 text-foreground/70 px-1.5 py-0.5 rounded">({f.count} files)</span>}
                               </span>
                               <span className="text-[10px] font-mono w-24 opacity-70 bg-foreground/5 px-2 py-0.5 rounded text-center truncate" title={f.type}>{f.type}</span>
                               <span className="text-[10px] font-mono w-40 opacity-70 truncate" title={f.plant}>{f.plant}</span>
                               <button className="w-24 text-[9px] bg-accent-blue/10 hover:bg-accent-blue text-accent-blue hover:text-foreground py-1.5 rounded font-bold transition-colors border border-accent-blue/30">
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

// Subcomponents

function AnimatedValue({ value, duration = 300 }: { value: string; duration?: number }) {
  const numericVal = parseFloat(value);
  const isNumeric = !isNaN(numericVal) && isFinite(numericVal);
  const [displayValue, setDisplayValue] = useState(value);
  const prevValRef = useRef(numericVal);

  useEffect(() => {
    if (!isNumeric) {
      setDisplayValue(value);
      return;
    }

    const startVal = isNaN(prevValRef.current) ? 0 : prevValRef.current;
    const endVal = numericVal;
    prevValRef.current = endVal;

    if (startVal === endVal) {
      setDisplayValue(value);
      return;
    }

    const startTime = performance.now();
    let animationFrameId: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out quad
      const easeProgress = progress * (2 - progress);
      const current = startVal + (endVal - startVal) * easeProgress;
      
      // Keep decimal places of original value if any
      const decimalMatch = value.match(/\.(\d+)/);
      const decimals = decimalMatch ? decimalMatch[1].length : 0;
      setDisplayValue(current.toFixed(decimals));

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(tick);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value, duration, isNumeric]);

  return <>{displayValue}</>;
}

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, collapsed?: boolean }) {
  return (
    <button 
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 px-4 h-9 text-left transition-all font-medium text-[12px] outline-none w-full relative border-l-[3px] cursor-pointer hover-btn-micro",
        active 
          ? "bg-[var(--accent-blue)]/10 border-[var(--accent-blue)] text-[var(--text-primary)] font-semibold" 
          : "hover:bg-foreground/[0.04] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-transparent",
        collapsed && "justify-center px-0"
      )}
    >
      <span className={cn("flex items-center justify-center opacity-70 shrink-0", active && "text-[var(--accent-blue)] opacity-100")}>{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

function KpiCard({ title, value, unit, subtext, subtextColor, borderColor, bgClass }: { title: string, value: string, unit: string, subtext: string, subtextColor: string, borderColor?: string, bgClass?: string }) {
  return (
    <div className={cn(
      "border-l-[3px] border-l-[var(--accent-blue)] bg-panel border border-y border-r border-[var(--border)] p-3 rounded-r-lg flex flex-col justify-between h-20 select-text hover-card-redesign", 
      bgClass, 
      borderColor
    )}>
      <div className="text-[11px] text-[var(--text-secondary)] uppercase font-semibold tracking-wider leading-none">{title}</div>
      <div className="text-[28px] font-semibold font-mono tracking-tight flex items-baseline gap-1 leading-none text-[var(--text-primary)] my-0.5">
        <AnimatedValue value={value} /> <span className="text-[13px] font-normal text-[var(--text-secondary)] ml-1 font-sans">{unit}</span>
      </div>
      <div className={cn("text-[9.5px] font-mono flex items-center gap-1 font-semibold leading-none truncate", subtextColor)} title={subtext}>
        {subtext}
      </div>
    </div>
  );
}


function LogTableRow({ index, time, plant, file, classification, status, statusColor, rowClass }: { index: string, time: string, plant: string, file: string, classification: string, status: string, statusColor: 'green' | 'yellow' | 'red', rowClass?: string }) {
  const dotColor = {
    green: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]",
    yellow: "bg-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.5)]",
    red: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
  }[statusColor];

  const badgeClass = {
    green: "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400",
    yellow: "bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400",
    red: "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
  }[statusColor];

  return (
    <div className={cn("flex border-b border-border-v/30 transition-all duration-200 hover:bg-foreground/5 items-center font-mono py-1.5 text-[10px]", rowClass)}>
      <div className="w-12 p-2 pl-4 border-r border-border-v/30 text-center opacity-40 font-bold">{index}</div>
      <div className="w-36 p-2 border-r border-border-v/30 text-foreground/75">{time}</div>
      <div className="w-36 p-2 border-r border-border-v/30 font-bold text-foreground">{plant}</div>
      <div className="w-56 p-2 border-r border-border-v/30 text-accent-blue truncate hover:underline cursor-pointer font-bold" title={file}>{file}</div>
      <div className="flex-1 p-2 border-r border-border-v/30 truncate text-foreground/80" title={classification}>{classification}</div>
      <div className="w-28 p-2 flex justify-center items-center">
        <span className={cn("border rounded px-2 py-0.5 flex items-center gap-1.5 font-sans font-bold text-[8px] uppercase tracking-widest", badgeClass)}>
          <span className={cn("w-1.5 h-1.5 rounded-full inline-block animate-pulse", dotColor)}></span> 
          {status}
        </span>
      </div>
    </div>
  );
}
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const XLSX = (window as any).XLSX;

interface ESSRow {
  PlantName: string;
  DeviceName: string;
  SACU_Number: number;
  ESS_Number: number;
  StartTime: Date;
  EquivalentNumberOfCycles: number;
}

interface PlantBlock {
  PlantName: string;
  DeviceName: string;
  ESS_Number: number;
  LastEquivalentNumberOfCycle: number;
  AverageCycleOfBlock: number | null;
  AverageCycleOfSPPC: number | null;
}

interface DailyResult {
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

function buildPlantCycleTableJs(rows: ESSRow[], plantLabel: string): PlantBlock[] {
  if (rows.length === 0) return [];
  
  const sorted = [...rows].sort((a, b) => {
    if (a.SACU_Number !== b.SACU_Number) return a.SACU_Number - b.SACU_Number;
    if (a.ESS_Number !== b.ESS_Number) return a.ESS_Number - b.ESS_Number;
    return a.StartTime.getTime() - b.StartTime.getTime();
  });
  
  const uniqueSACUs = Array.from(new Set(sorted.map(r => r.SACU_Number).filter(n => !isNaN(n)))).sort((a, b) => a - b);
  const outTbl: PlantBlock[] = [];
  
  for (const sacuNum of uniqueSACUs) {
    const currentData = sorted.filter(r => r.SACU_Number === sacuNum);
    const existingESS = Array.from(new Set(currentData.map(r => r.ESS_Number).filter(n => !isNaN(n)))).sort((a, b) => a - b);
    
    let essListToUse = [1, 2, 3, 4];
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
  
  const blockAverages = outTbl.map(r => r.AverageCycleOfBlock).filter(v => v !== null && !isNaN(v)) as number[];
  const plantAvg = blockAverages.length > 0 ? blockAverages.reduce((s, a) => s + a, 0) / blockAverages.length : NaN;
  
  if (outTbl.length > 0 && !isNaN(plantAvg)) {
    outTbl[0].AverageCycleOfSPPC = plantAvg;
  }
  
  return outTbl;
}

async function parseCycleExcelFile(file: File, path: string): Promise<ESSRow[] | null> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws['!ref']) return null;
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[];
  if (aoa.length < 4) return null;

  let headerRow = aoa[3] || [];
  let headers = headerRow.map(h => h == null ? '' : String(h).trim());
  let lowerVars = headers.map(h => h.toLowerCase());

  let plantIdx = lowerVars.findIndex(h => h.includes('plant') && h.includes('name'));
  let deviceIdx = lowerVars.findIndex(h => h.includes('device') && h.includes('name'));
  let startIdx = lowerVars.findIndex(h => h.includes('start') && h.includes('time'));
  let eqIdx = headers.findIndex(h => h === 'Equivalent number of cycles');
  if (eqIdx === -1) {
    eqIdx = lowerVars.findIndex(h => h.includes('equivalent') && h.includes('cycle'));
  }

  if (plantIdx === -1 || deviceIdx === -1 || startIdx === -1 || eqIdx === -1) {
    headerRow = aoa[0] || [];
    headers = headerRow.map(h => h == null ? '' : String(h).trim());
    lowerVars = headers.map(h => h.toLowerCase());
    plantIdx = lowerVars.findIndex(h => h.includes('plant') && h.includes('name'));
    deviceIdx = lowerVars.findIndex(h => h.includes('device') && h.includes('name'));
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
    if (tokSACU) {
      sacuNum = parseInt(tokSACU[2], 10);
    }

    const tokESS = dName.match(/ESS[-_ ]?0?(\d+)/i);
    if (tokESS) {
      essNum = parseInt(tokESS[1], 10);
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

const getMockDailyResults = (proj: string): DailyResult[] => {
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
      Average_Total_Plant_Cycle: proj === 'SNTB30MWH' ? (p1 + p2) / 2 : (p1 + p2 + p3) / 3,
      Average_Daily_Cycle: i > 0 ? (proj === 'SNTB30MWH' ? (0.42 + 0.38) / 2 : (0.42 + 0.38 + 0.48) / 3) : null,
      p1Blocks,
      p2Blocks,
      p3Blocks
    });
  }
  return results;
};

function CycleCalculation({ project, theme }: { project: string, theme: 'dark' | 'light' }) {
  const [dailyResults, setDailyResults] = useState<DailyResult[]>([]);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(0);
  const [activePlantTab, setActivePlantTab] = useState<'p1' | 'p2' | 'p3' | 'summary'>('summary');
  
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcProgress, setCalcProgress] = useState(0);
  const [calcStatus, setCalcStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  const customFileInputRef = useRef<HTMLInputElement>(null);
  const customFolderInputRef = useRef<HTMLInputElement>(null);

  // Load beautiful default demo mock data on mount and on project switch
  useEffect(() => {
    setDailyResults(getMockDailyResults(project));
    setSelectedDayIdx(4); // Select last day by default
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
        
        let SPPC1_SACU: number[] = [];
        let SPPC2_SACU: number[] = [];
        let SPPC3_SACU: number[] = [];
        
        const isBessProject = is20PercentProject(project);
        
                if (isBessProject) {
          const pName = typeof project === 'string' ? project : '';
          const numSacu = pName.startsWith('SNTB') ? 13 : pName.startsWith('SNTV') ? 8 : pName.startsWith('SNTD') ? 8 : pName.startsWith('MSGP') ? 4 : pName.startsWith('SNTZ') ? 2 : 10;
          SPPC1_SACU = Array.from({length: numSacu}, (_, i) => i + 1);
        } else if (project === 'SNTL400') {
          SPPC1_SACU = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 19, 20, 23];
          SPPC2_SACU = [7, 11, 13, 14, 15, 16, 17, 21, 22, 24, 25];
        } else if (project === 'SNTL600') {
          SPPC1_SACU = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17];
          SPPC2_SACU = [15, 18, 21, 24, 27, 30, 31, 32, 33, 34];
          SPPC3_SACU = [19, 20, 22, 23, 25, 26, 28, 29, 35, 36, 37];
        } else {
          SPPC1_SACU = Array.from({length: 100}, (_, i) => i + 1);
        }
        
        const p1Rows = allParsedRows.filter(r => SPPC1_SACU.includes(r.SACU_Number));
        const p2Rows = allParsedRows.filter(r => SPPC2_SACU.includes(r.SACU_Number));
        const p3Rows = allParsedRows.filter(r => SPPC3_SACU.includes(r.SACU_Number));
        
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
      
      results.sort((a, b) => a.DataDate.localeCompare(b.DataDate));
      
      // Calculate daily reached
      for (let i = 0; i < results.length; i++) {
        const cur = results[i];
        if (i > 0) {
          const prev = results[i - 1];
          if (cur.SWG01_TotalCycle !== null && prev.SWG01_TotalCycle !== null) {
            cur.SWG01_DailyReached = cur.SWG01_TotalCycle - prev.SWG01_TotalCycle;
          }
          if (cur.SWG02_TotalCycle !== null && prev.SWG02_TotalCycle !== null) {
            cur.SWG02_DailyReached = cur.SWG02_TotalCycle - prev.SWG02_TotalCycle;
          }
          if (cur.SWG03_TotalCycle !== null && prev.SWG03_TotalCycle !== null) {
            cur.SWG03_DailyReached = cur.SWG03_TotalCycle - prev.SWG03_TotalCycle;
          }
        }
        
        const activeTotals: number[] = [];
        if (cur.SWG01_TotalCycle !== null) activeTotals.push(cur.SWG01_TotalCycle);
        if (cur.SWG02_TotalCycle !== null) activeTotals.push(cur.SWG02_TotalCycle);
        if (cur.SWG03_TotalCycle !== null && project !== 'SNTB30MWH') activeTotals.push(cur.SWG03_TotalCycle);
        cur.Average_Total_Plant_Cycle = activeTotals.length > 0 ? activeTotals.reduce((s, v) => s + v, 0) / activeTotals.length : null;
        
        const activeReached: number[] = [];
        if (cur.SWG01_DailyReached !== null) activeReached.push(cur.SWG01_DailyReached);
        if (cur.SWG02_DailyReached !== null) activeReached.push(cur.SWG02_DailyReached);
        if (cur.SWG03_DailyReached !== null && project !== 'SNTB30MWH') activeReached.push(cur.SWG03_DailyReached);
        cur.Average_Daily_Cycle = activeReached.length > 0 ? activeReached.reduce((s, v) => s + v, 0) / activeReached.length : null;
      }
      
      setDailyResults(results);
      setSelectedDayIdx(results.length - 1);
      setCalcStatus(`Successfully processed ${results.length} days of data!`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || String(err));
      setCalcStatus('Failed calculation.');
    } finally {
      setIsCalculating(false);
    }
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
        'SWG02_TotalCycle': r.SWG02_TotalCycle === null || isNaN(r.SWG02_TotalCycle) ? '' : Number(r.SWG02_TotalCycle.toFixed(4)),
        'SWG02_DailyReached': r.SWG02_DailyReached === null || isNaN(r.SWG02_DailyReached) ? '' : Number(r.SWG02_DailyReached.toFixed(4)),
        ...(project !== 'SNTB30MWH' ? {
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
        
        const allBlocks = [...r.p1Blocks, ...r.p2Blocks];
        if (project !== 'SNTB30MWH') {
          allBlocks.push(...r.p3Blocks);
        }
        
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
  const chartDataDates = dailyResults.map(r => r.DataDate);
  const chartP1Total = dailyResults.map(r => r.SWG01_TotalCycle || 0);
  const chartP1Daily = dailyResults.map(r => r.SWG01_DailyReached || 0);
  const chartP2Total = dailyResults.map(r => r.SWG02_TotalCycle || 0);
  const chartP2Daily = dailyResults.map(r => r.SWG02_DailyReached || 0);
  const chartP3Total = dailyResults.map(r => r.SWG03_TotalCycle || 0);
  const chartP3Daily = dailyResults.map(r => r.SWG03_DailyReached || 0);

  const fontColor = theme === 'dark' ? '#E0E0E0' : '#111827';
  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  return (
    <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col relative overflow-hidden">
      {/* Tab Header Toolbar */}
      <div className="px-3 py-2 border-b border-border-v flex items-center justify-between bg-surface/50 shrink-0">
        <div className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
          <Zap size={14} className="text-accent-blue" />
          Cycle Calculation <span className="text-accent-blue opacity-80 pl-1">(BESS Equivalent Cycle Engine)</span>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleValidationTabReuse}
            disabled={isCalculating}
            className="bg-accent-blue/10 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/20 h-7 text-[9px] font-bold flex items-center gap-1.5"
          >
            <Database size={12} />
            Reuse Validation Tab Data
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
            variant="outline"
            className="border-border-v hover:bg-foreground/5 h-7 text-[9px] font-bold text-foreground bg-transparent flex items-center gap-1.5"
          >
            <Upload size={12} />
            Upload Custom Day Folder
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Control and Day List Column */}
        <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-border-v bg-background/20 p-3 flex flex-col gap-4 shrink-0 overflow-y-auto">
          {/* Dropzone Panel */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              if (isCalculating || !e.dataTransfer.files) return;
              const filesArray = Array.from(e.dataTransfer.files).map(f => ({ file: f, path: f.name }));
              setIsCalculating(true);
              setCalcStatus('Processing dropped items...');
              const expanded: { file: File, path: string }[] = [];
              for (const item of filesArray) {
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
            }}
            className="border border-dashed border-border-v/80 hover:border-accent-blue bg-surface/30 rounded p-4 text-center cursor-pointer transition-colors flex flex-col items-center justify-center h-28"
            onClick={() => customFileInputRef.current?.click()}
          >
            <Upload size={20} className="text-accent-blue/70 mb-1" />
            <div className="text-[10px] font-bold uppercase tracking-wider text-foreground/80">Drop Day Zip / Folders</div>
            <div className="text-[8px] text-foreground/40 mt-1 font-mono">Accepts ZIP, RAR, 7Z, and multiple XLSX</div>
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
            <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-foreground/40 mb-2">
              Processed Datasets ({dailyResults.length} Days)
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
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
                    <span>{r.DataDate}</span>
                    <span className="text-accent-blue text-[8px] bg-accent-blue/10 px-1 py-0.5 rounded uppercase">
                      {r.SourceFolder}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[8px] text-foreground/45 border-t border-border-v/20 pt-1.5">
                    <div>P1 Avg: <span className="font-bold text-foreground/75 font-mono">{r.SWG01_TotalCycle !== null ? r.SWG01_TotalCycle.toFixed(2) : '---'}</span></div>
                    <div>P2 Avg: <span className="font-bold text-foreground/75 font-mono">{r.SWG02_TotalCycle !== null ? r.SWG02_TotalCycle.toFixed(2) : '---'}</span></div>
                    {project !== 'SNTB30MWH' && (
                      <div className="col-span-2">P3 Avg: <span className="font-bold text-foreground/75 font-mono">{r.SWG03_TotalCycle !== null ? r.SWG03_TotalCycle.toFixed(2) : '---'}</span></div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Dashboard Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-background/50 overflow-y-auto p-4 space-y-4">
          {/* Plant Top Summary Cards */}
          {selectedDay && (
            <div className={cn(
              "grid gap-4 w-full shrink-0",
              project === 'SNTB30MWH' ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"
            )}>
              {/* Plant 1 Card */}
              <div className="bg-surface border border-border-v rounded-md p-3.5 flex flex-col justify-between relative overflow-hidden shadow-sm hover:border-accent-blue/30 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/5 rounded-full blur-2xl pointer-events-none"></div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-foreground/45 text-[9px] uppercase tracking-widest font-mono">SWG01 (Plant 01)</span>
                  <span className="text-[10px] font-mono font-bold text-green-500">16 SACU Blocks</span>
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
              <div className="bg-surface border border-border-v rounded-md p-3.5 flex flex-col justify-between relative overflow-hidden shadow-sm hover:border-accent-blue/30 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/5 rounded-full blur-2xl pointer-events-none"></div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-foreground/45 text-[9px] uppercase tracking-widest font-mono">SWG02 (Plant 02)</span>
                  <span className="text-[10px] font-mono font-bold text-green-500">10 SACU Blocks</span>
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

              {/* Plant 3 Card (Hidden for SNTB 30MWH) */}
              {project !== 'SNTB30MWH' && (
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
                {project !== 'SNTB30MWH' && (
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
              <div className="flex-1 overflow-auto max-h-[350px] scrollbar-thin">
                {activePlantTab === 'summary' && (
                  <table className="w-full text-[10px] font-mono text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-v/50 text-foreground/45 uppercase text-[9px]">
                        <th className="py-2 px-3 font-semibold">SourceFolder</th>
                        <th className="py-2 px-3 font-semibold">DataDate</th>
                        <th className="py-2 px-3 font-semibold text-right">P1 Avg Total</th>
                        <th className="py-2 px-3 font-semibold text-right text-green-400">P1 Daily Reached</th>
                        <th className="py-2 px-3 font-semibold text-right">P2 Avg Total</th>
                        <th className="py-2 px-3 font-semibold text-right text-green-400">P2 Daily Reached</th>
                        {project !== 'SNTB30MWH' && (
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
                          <td className="py-2 px-3 text-right">{r.SWG01_TotalCycle !== null ? r.SWG01_TotalCycle.toFixed(4) : 'NaN'}</td>
                          <td className="py-2 px-3 text-right text-green-400 font-bold">{r.SWG01_DailyReached !== null ? `+${r.SWG01_DailyReached.toFixed(4)}` : 'NaN'}</td>
                          <td className="py-2 px-3 text-right">{r.SWG02_TotalCycle !== null ? r.SWG02_TotalCycle.toFixed(4) : 'NaN'}</td>
                          <td className="py-2 px-3 text-right text-green-400 font-bold">{r.SWG02_DailyReached !== null ? `+${r.SWG02_DailyReached.toFixed(4)}` : 'NaN'}</td>
                          {project !== 'SNTB30MWH' && (
                            <>
                              <td className="py-2 px-3 text-right">{r.SWG03_TotalCycle !== null ? r.SWG03_TotalCycle.toFixed(4) : 'NaN'}</td>
                              <td className="py-2 px-3 text-right text-green-400 font-bold">{r.SWG03_DailyReached !== null ? `+${r.SWG03_DailyReached.toFixed(4)}` : 'NaN'}</td>
                            </>
                          )}
                          <td className="py-2 px-3 text-right text-accent-blue font-bold">{r.Average_Total_Plant_Cycle !== null ? r.Average_Total_Plant_Cycle.toFixed(4) : 'NaN'}</td>
                          <td className="py-2 px-3 text-right text-accent-blue font-bold">{r.Average_Daily_Cycle !== null ? `+${r.Average_Daily_Cycle.toFixed(4)}` : 'NaN'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activePlantTab === 'p1' && (
                  <PlantDetailTable blocks={selectedDay.p1Blocks} />
                )}

                {activePlantTab === 'p2' && (
                  <PlantDetailTable blocks={selectedDay.p2Blocks} />
                )}

                {activePlantTab === 'p3' && project !== 'SNTB30MWH' && (
                  <PlantDetailTable blocks={selectedDay.p3Blocks} />
                )}
              </div>
            </div>
          )}

          {/* Interactive Plotly Trends Graph */}
          {dailyResults.length > 0 && (
            <div className="border border-border-v bg-surface/30 rounded-md p-4 shrink-0 h-80 flex flex-col">
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
                    {
                      x: chartDataDates,
                      y: chartP2Total,
                      type: 'scatter' as const,
                      mode: 'lines+markers' as const,
                      name: 'Plant 2 Total',
                      line: { color: '#22C55E', width: 2, shape: 'spline' as const },
                      marker: { size: 6 }
                    },
                    ...(project !== 'SNTB30MWH' ? [{
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
          )}
        </div>
      </div>
    </section>
  );
}

function PlantDetailTable({ blocks }: { blocks: PlantBlock[] }) {
  return (
    <table className="w-full text-[10px] font-mono text-left border-collapse">
      <thead>
        <tr className="border-b border-border-v/50 text-foreground/45 uppercase text-[9px]">
          <th className="py-2 px-3 font-semibold">PlantName</th>
          <th className="py-2 px-3 font-semibold">DeviceName</th>
          <th className="py-2 px-3 font-semibold text-center">ESS_Number</th>
          <th className="py-2 px-3 font-semibold text-right">LastEquivalentNumberOfCycle</th>
          <th className="py-2 px-3 font-semibold text-right text-green-400">AverageCycleOfBlock</th>
          <th className="py-2 px-3 font-semibold text-right text-accent-blue">AverageCycleOfSPPC</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-v/20">
        {blocks.length === 0 ? (
          <tr>
            <td colSpan={6} className="py-4 text-center text-foreground/30 font-mono">
              No ESS units parsed for this plant on this day.
            </td>
          </tr>
        ) : (
          blocks.map((b, i) => (
            <tr key={i} className="hover:bg-foreground/[0.02] transition-colors">
              <td className="py-2 px-3 text-foreground/80">{b.PlantName}</td>
              <td className="py-2 px-3 text-foreground font-bold">{b.DeviceName}</td>
              <td className="py-2 px-3 text-center text-foreground/80">{b.ESS_Number}</td>
              <td className="py-2 px-3 text-right">
                {isNaN(b.LastEquivalentNumberOfCycle) ? 'NaN' : b.LastEquivalentNumberOfCycle.toFixed(4)}
              </td>
              <td className="py-2 px-3 text-right text-green-400 font-bold">
                {b.AverageCycleOfBlock === null || isNaN(b.AverageCycleOfBlock)
                  ? ''
                  : b.AverageCycleOfBlock.toFixed(4)}
              </td>
              <td className="py-2 px-3 text-right text-accent-blue font-bold">
                {b.AverageCycleOfSPPC === null || isNaN(b.AverageCycleOfSPPC)
                  ? ''
                  : b.AverageCycleOfSPPC.toFixed(4)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Helper: generate smooth mock daily data ──────────────────────────────────
function getMockEvaluationData(project: string) {
  const numPoints = 288;
  const today = new Date();
  const timestamps: Date[] = [];
  for (let i = 0; i < numPoints; i++) {
    timestamps.push(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, i * 5, 0));
  }

  const makeSoc = (offset = 0) => {
    const arr: number[] = [];
    let soc = 16 + offset;
    for (let i = 0; i < numPoints; i++) {
      // Charge: 0-08:00 (0-96), Discharge: 08:00-23:59 (96-288)
      if (i < 96) { soc = Math.min(95, soc + 0.82); }
      else { soc = Math.max(5, soc - 0.41); }
      arr.push(parseFloat(soc.toFixed(2)));
    }
    return arr;
  };

  const makeP = (sign = 1, scale = 1.0) => Array.from({ length: numPoints }, (_, i) => {
    const base = sign * (Math.sin(i / 18) * 60 + Math.sin(i / 40) * 30) * scale;
    return parseFloat((base + (Math.random() - 0.5) * 8).toFixed(2));
  });

  const makeQ = (scale = 1.0) => Array.from({ length: numPoints }, (_, i) =>
    parseFloat(((Math.cos(i / 22) * 25 + (Math.random() - 0.5) * 6) * scale).toFixed(2))
  );

  const makeFreq = () => Array.from({ length: numPoints }, () =>
    parseFloat((50.0 + (Math.random() - 0.5) * 0.18).toFixed(4))
  );

  const makeVoltage = (base = 22.7) => Array.from({ length: numPoints }, () =>
    parseFloat((base + (Math.random() - 0.5) * 0.4).toFixed(3))
  );

  const soc1 = makeSoc(0);
  const soc2 = makeSoc(2);
  const soc3 = makeSoc(-1);
  const pTotal1 = makeP(1, 1.0);
  const pTotal2 = makeP(1, 0.62);
  const pTotal3 = project === 'SNTB30MWH' ? Array(numPoints).fill(0) : makeP(1, 0.62);

  return {
    timestamps,
    pTotal: { plant1: pTotal1, plant2: pTotal2, plant3: pTotal3 },
    qTotal: { plant1: makeQ(1.0), plant2: makeQ(0.6), plant3: makeQ(0.6) },
    soc: { plant1: soc1, plant2: soc2, plant3: soc3 },
    freq: { plant1: makeFreq(), plant2: makeFreq(), plant3: makeFreq() },
    vab: { plant1: makeVoltage(22.8), plant2: makeVoltage(22.7), plant3: makeVoltage(22.75) },
    vbc: { plant1: makeVoltage(22.76), plant2: makeVoltage(22.72), plant3: makeVoltage(22.78) },
    vca: { plant1: makeVoltage(22.73), plant2: makeVoltage(22.69), plant3: makeVoltage(22.71) },
    cmdP: { plant1: pTotal1.map(v => v + Math.sin(Math.random()) * 5), plant2: pTotal2.map(v => v + 3), plant3: pTotal3.map(v => v + 2) },
    cmdQ: { plant1: makeQ(1.0), plant2: makeQ(0.6), plant3: makeQ(0.6) },
    remoteP: { plant1: pTotal1.map(v => v * 0.97), plant2: pTotal2.map(v => v * 0.98), plant3: pTotal3.map(v => v * 0.96) },
    dispatchP: { plant1: pTotal1.map(v => v * 0.95), plant2: pTotal2.map(v => v * 0.94), plant3: pTotal3.map(v => v * 0.93) },
    dailyCycle: { plant1: 0.812, plant2: 0.768, plant3: 0.450 },
    totalCycle: { plant1: 142.18, plant2: 128.45, plant3: 154.30 },
  };
}