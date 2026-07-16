import React, { useEffect, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
// @ts-ignore - distribution bundle avoids node polyfill issues in Vite
import Plotly from 'plotly.js/dist/plotly.js';
import type { Config } from 'plotly.js';
import { Battery, Bot, Copy, Database, Download, Maximize2, Sliders, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAIContext } from '../lib/ai-context';
import { expandZip, hcByProject } from '../lib/audit-engine.js';
import { getProjectPlants } from '../lib/project-utils';
import { useAppStore } from '../store/useAppStore';
import { DraggableOverlay } from './DraggableOverlay';
import type { EvalData } from '../types/eval-data';
import type { ActiveMetric, GraphConfig, PinnedPoint } from '../types/graph';
import { parseEvaluationFiles } from '../features/daily-evaluation/services/evaluationParser';
import { mergeNccFile } from '../features/daily-evaluation/services/nccMerge';
import { downloadExcelLogs } from '../features/daily-evaluation/services/excelLogExport';
import { copyChartsToClipboard } from '../features/daily-evaluation/services/clipboardExport';
import { exportSingleGraphHtml } from '../features/daily-evaluation/services/htmlExportSingle';
import { exportAllGraphsHtml } from '../features/daily-evaluation/services/htmlExportAll';
import { getStatusHTML, getStatusJSX } from '../features/daily-evaluation/utils/status';
import { defaultGraphConfig } from '../features/daily-evaluation/config/defaultGraphConfig';
import { useSelection } from '../features/daily-evaluation/hooks/useSelection';
import { useEvalData } from '../features/daily-evaluation/hooks/useEvalData';
import { useGraphConfig } from '../features/daily-evaluation/hooks/useGraphConfig';
import { usePinnedPoints } from '../features/daily-evaluation/hooks/usePinnedPoints';
import { GraphPanels } from '../features/daily-evaluation/components/GraphPanels';
import { CustomizationDrawer } from '../features/daily-evaluation/components/CustomizationDrawer';



export function DailyEvaluationGraph({
  theme,
  project,
  isAIAgentMode = false,
  isExportPreviewMode = false,
  externalPlant,
  onPlantChange,
  onNavigateToAI
}: {
  theme: 'dark' | 'light';
  project: string;
  isAIAgentMode?: boolean;
  isExportPreviewMode?: boolean;
  externalPlant?: 'plant1' | 'plant2' | 'plant3';
  onPlantChange?: (plant: 'plant1' | 'plant2' | 'plant3') => void;
  onNavigateToAI?: () => void;
}) {
  const { importedGraph, setImportedGraph } = useAIContext();

  const chartContainerRef = useRef<HTMLDivElement>(null);

  const { selectedPlant, setSelectedPlant, activeMetric, setActiveMetric } = useSelection({
    project, isAIAgentMode, importedGraph, externalPlant, onPlantChange,
  });

  const { evalData, setEvalData } = useEvalData(
    project,
    isAIAgentMode && importedGraph ? importedGraph.evalData : null
  );

  const [isCalculating, setIsCalculating] = useState(false);
  const [calcProgress, setCalcProgress] = useState(0);
  const [calcStatus, setCalcStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const showNccPCommand = useAppStore(state => state.showNccPCommand);
  const setShowNccPCommand = useAppStore(state => state.setShowNccPCommand);

  const {
    graphConfig, setGraphConfig, updateConfig, resetConfig,
    configTab, setConfigTab, showCustomization, setShowCustomization,
  } = useGraphConfig(isAIAgentMode && importedGraph ? importedGraph.graphConfig : null);

  const {
    pinnedPoints, setPinnedPoints,
    handleHover, handleUnhover, handleRelayout, handleClickAnnotation,
  } = usePinnedPoints({
    initial: isAIAgentMode && importedGraph ? importedGraph.pinnedPoints : null,
    activeMetric,
    selectedPlant,
  });

  // Push local UI state back into the imported graph snapshot (AI mode)
  useEffect(() => {
    if (isAIAgentMode && importedGraph) {
      setImportedGraph((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          activeMetric,
          selectedPlant,
          graphConfig,
          pinnedPoints,
        };
      });
    }
  }, [isAIAgentMode, activeMetric, selectedPlant, graphConfig, pinnedPoints]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const nccFileInputRef = useRef<HTMLInputElement>(null);

  // Parse custom spreadsheets (pipeline lives in services/evaluationParser)
  const parseEvaluationExcelFiles = async (files: { file: File, path: string, plantId?: string }[]) => {
    setIsCalculating(true);
    setCalcProgress(0);
    setCalcStatus('Analyzing files...');
    setErrorMessage('');

    try {
      const parsedData = await parseEvaluationFiles(files, project, { setCalcStatus, setCalcProgress });
      setEvalData(parsedData);
      setCalcStatus('Processing completed!');
    } catch (err: any) {
      setErrorMessage(err.message || String(err));
      setCalcStatus('Failed calculation.');
    } finally {
      setIsCalculating(false);
    }
  };

  // Reuse files loaded in the Health Check tab
  const handleReuseValidationData = async () => {
    const currentPlants = hcByProject[project] || [];
    const files: { file: File, path: string, plantId?: string }[] = [];

    for (const plant of currentPlants) {
      const categories = ['POC', 'ESS', 'SmartLogger'];
      for (const cat of categories) {
        const list = plant.files?.[cat] || [];
        for (const item of list) {
          files.push({ file: item.file, path: item.path, plantId: plant.name || plant.id });
        }
      }
    }

    if (files.length === 0) {
      setErrorMessage(`No spreadsheets found in the active Validation tab. Please upload your files or drop folders/zips below first.`);
      return;
    }

    await parseEvaluationExcelFiles(files);
  };

  // Handle manual file uploads (files only â€” no folder)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const rawFiles = Array.from(e.target.files);
    e.target.value = '';

    setIsCalculating(true);
    setCalcStatus('Reading files...');

    const unpacked: { file: File, path: string }[] = [];
    for (const f of rawFiles) {
      if (/\.(zip|rar|7z)$/i.test(f.name)) {
        try {
          const files = await expandZip(f, f.name);
          unpacked.push(...files);
        } catch (err) { console.error(err); }
      } else {
        // webkitRelativePath preserves folder structure (e.g. Data_600/2. Voltage.../1. Plant_01/file.xlsx)
        const relPath = (f as any).webkitRelativePath || f.name;
        unpacked.push({ file: f, path: relPath });
      }
    }

    await parseEvaluationExcelFiles(unpacked);
  };

  // Handle folder selection (webkitdirectory â€” recursively picks every file inside)
  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const rawFiles = Array.from(e.target.files);
    e.target.value = '';

    setIsCalculating(true);
    setCalcStatus(`Found ${rawFiles.length} files in folder â€” parsing...`);

    // All files already have webkitRelativePath set by the browser
    const collected: { file: File, path: string }[] = rawFiles.map(f => ({
      file: f,
      path: (f as any).webkitRelativePath || f.name
    }));

    await parseEvaluationExcelFiles(collected);
  };

  const handleNCCFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!evalData) {
      alert("Please load the main data folder first before adding NCC data.");
      e.target.value = '';
      return;
    }
    const file = e.target.files[0];
    e.target.value = '';

    setIsCalculating(true);
    setCalcStatus('Parsing NCC file...');
    setErrorMessage('');

    try {
      const newData = await mergeNccFile(file, evalData);
      setEvalData(newData); (window as any).DEBUG_EVAL_DATA = newData;
      setCalcStatus('NCC Data merged successfully!');
    } catch (err: any) {
      setErrorMessage(err.message || String(err));
      setCalcStatus('Failed to parse NCC data.');
    } finally {
      setIsCalculating(false);
    }
  };

  // Export processed data as a real Excel file matching MATLAB logs
  const handleDownloadExcelLogs = () => {
    if (!evalData) return;
    downloadExcelLogs(evalData, project);
  };

  const handleCopyClipboard = async () => {
    if (!evalData || !chartContainerRef.current) return;
    await copyChartsToClipboard({ container: chartContainerRef.current, evalData, project, activeMetric, graphConfig });
  };

  const handleExportHtml = async () => {
    await exportSingleGraphHtml({ evalData, project, showNccPCommand, graphConfig, activeMetric, selectedPlant, pinnedPoints });
  };

  const handleExportAllHtml = async () => {
    await exportAllGraphsHtml({ evalData, project, showNccPCommand, graphConfig, activeMetric, selectedPlant, pinnedPoints });
  };

  const exportRefs = useRef({ handleExportHtml, handleExportAllHtml, evalData });
  useEffect(() => {
    exportRefs.current = { handleExportHtml, handleExportAllHtml, evalData };
  });

  useEffect(() => {
    (window as any).isGraphMounted = true;
    const handleSingle = () => {
      if (exportRefs.current.evalData) exportRefs.current.handleExportHtml();
    };
    const handleAll = () => {
      if (exportRefs.current.evalData) exportRefs.current.handleExportAllHtml();
    };
    document.addEventListener('export-html-single', handleSingle);
    document.addEventListener('export-html-all', handleAll);
    return () => {
      (window as any).isGraphMounted = false;
      document.removeEventListener('export-html-single', handleSingle);
      document.removeEventListener('export-html-all', handleAll);
    };
  }, []);

  return (
    <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col relative overflow-hidden">



      {/* Header Toolbar */}
      {(isAIAgentMode || isExportPreviewMode) ? (
        <div className="px-3 py-1.5 border-b border-border-v flex items-center justify-between bg-surface/50 shrink-0 gap-2">
          <div className="flex items-center gap-2 text-[11px] font-mono font-bold tracking-wider">
            <span className="text-foreground/50 uppercase">ACTIVE GRAPH:</span>
            <Select value={activeMetric} onValueChange={(val) => setActiveMetric(val)}>
              <SelectTrigger className="h-7 text-[11px] bg-panel border-border-v text-foreground font-bold focus:ring-0 focus:ring-offset-0 w-[240px]">
                <SelectValue placeholder="Select Figure" />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const p = getProjectPlants(typeof project === 'string' ? project : '');
                  const isBess = typeof project === 'string' && (project.startsWith('SNTB') || project.startsWith('SNTV') || project.startsWith('SNTD') || project.startsWith('SNTZ') || project.startsWith('MSGP'));
                  if (isBess) {
                    return (
                      <>
                        <SelectItem value="fig4" className="text-[11px]">Figure 1: Daily Evaluation</SelectItem>
                      </>
                    );
                  }
                  return (
                    <>
                      {p.map((pk, i) => (
                        <SelectItem key={pk} value={`pf_p${i + 1}`} className="text-[11px]">Figure {i + 1}: SWG0{i + 1} Powerflow Check</SelectItem>
                      ))}
                      <SelectItem value="fig5" className="text-[11px]">Figure {p.length + 1}: Active Power & SOC All Plants</SelectItem>
                      <SelectItem value="fig6" className="text-[11px]">Figure {p.length + 2}: Volt & Reactive Power All Plants</SelectItem>
                    </>
                  );
                })()}
              </SelectContent>
            </Select>
            {pinnedPoints.length > 0 && (
              <span className="flex items-center gap-1 ml-2 animate-in fade-in duration-200">
                <span className="bg-accent-blue/10 text-accent-blue border border-accent-blue/30 px-1.5 py-0.5 rounded text-[8px] font-bold">
                  {pinnedPoints.length} pin{pinnedPoints.length > 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setPinnedPoints([])}
                  className="text-[8px] font-mono text-foreground/40 hover:text-red-400 border border-foreground/10 hover:border-red-400/30 px-1.5 py-0.5 rounded transition-colors"
                  title="Clear all pins"
                >
                  Clear
                </button>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAIAgentMode && (
              <Button
                onClick={() => window.dispatchEvent(new CustomEvent('reset-pane-width'))}
                className="h-6 px-2 text-[9px] rounded transition-colors flex items-center gap-1 font-bold font-mono shadow-sm bg-slate-700 text-white hover:bg-slate-600"
                title="Reset layout to default size"
              >
                <Maximize2 size={10} />
                <span>RESET VIEW</span>
              </Button>
            )}
            <Button
              onClick={handleCopyClipboard}
              disabled={!evalData}
              className="h-6 px-2 text-[9px] rounded transition-colors flex items-center gap-1 font-bold font-mono bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none shadow-sm"
              title="Capture all subplots as a single 1920×1080 image and copy to clipboard"
            >
              <Copy size={10} />
              <span>COPY AS CLIPBOARD</span>
            </Button>
            {!isExportPreviewMode && (
              <Button
                onClick={handleExportHtml}
                disabled={!evalData}
                className="h-6 px-2 text-[9px] rounded transition-colors flex items-center gap-1 font-bold font-mono bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 disabled:pointer-events-none shadow-sm"
              >
                <Download size={10} />
                <span>EXPORT HTML</span>
              </Button>
            )}
            <Button
              onClick={() => setShowCustomization(!showCustomization)}
              className={cn("h-6 px-2 text-[9px] rounded transition-colors flex items-center gap-1 font-bold font-mono shadow-sm", showCustomization ? "bg-accent-blue text-white hover:bg-blue-600" : "bg-slate-700 text-white hover:bg-slate-600")}
            >
              <Sliders size={10} />
              <span>CUSTOMIZE</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 border-b border-border-v flex items-center justify-between bg-surface/50 shrink-0 flex-wrap gap-2">
          <div className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
            <Battery size={14} className="text-accent-blue animate-pulse" />
            Daily Evaluation Graph <span className="text-accent-blue opacity-80 pl-1 hidden sm:inline">(Interactive Power & Voltage Analytical Engine)</span>
          </div>

          <div className="flex gap-2">
            {evalData && onNavigateToAI && (
              <Button
                onClick={() => {
                  setImportedGraph({
                    evalData,
                    activeMetric,
                    selectedPlant,
                    graphConfig,
                    pinnedPoints,
                    project
                  });
                  onNavigateToAI();
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white h-7 text-[9px] font-bold flex items-center gap-1.5 border-0 shadow-sm animate-pulse"
              >
                <Bot size={12} />
                ANALYZE IN AI AGENT
              </Button>
            )}
            <Button
              onClick={handleReuseValidationData}
              disabled={isCalculating}
              className="bg-accent-blue hover:bg-blue-600 text-white h-7 text-[9px] font-bold flex items-center gap-1.5 border-0 shadow-sm"
            >
              <Database size={12} />
              Reuse Validation Tab Data
            </Button>
            {/* Hidden: individual files */}
            <input
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              accept=".zip,.rar,.7z,.xlsx,.xls"
              onChange={handleFileUpload}
            />
            {/* Hidden: whole folder (webkitdirectory) */}
            <input
              type="file"
              ref={folderInputRef}
              className="hidden"
              onChange={handleFolderUpload}
              {...({ webkitdirectory: '', mozdirectory: '', directory: '' } as any)}
            />
            <Button
              onClick={() => folderInputRef.current?.click()}
              disabled={isCalculating}
              className="bg-accent-blue hover:bg-blue-600 text-white h-7 text-[9px] font-bold flex items-center gap-1.5 border-0 shadow-sm"
            >
              <Upload size={12} />
              Select Data Folder
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isCalculating}
              className="bg-slate-700 hover:bg-slate-600 text-white h-7 text-[9px] font-bold flex items-center gap-1.5 border-0 shadow-sm"
            >
              <Upload size={12} />
              Upload Files
            </Button>
            <input
              type="file"
              ref={nccFileInputRef}
              className="hidden"
              accept=".xlsx,.xls"
              onChange={handleNCCFileUpload}
            />
            <Button
              onClick={() => nccFileInputRef.current?.click()}
              disabled={isCalculating || !evalData}
              className="bg-green-700 hover:bg-green-600 text-white h-7 text-[9px] font-bold flex items-center gap-1.5 border-0 shadow-sm"
            >
              <Upload size={12} />
              NCC Data
            </Button>
            {(project === 'SNTL400' || project === 'SNTL600') && (
              <Button
                onClick={() => setShowNccPCommand(!showNccPCommand)}
                className={cn("h-7 text-[9px] font-bold flex items-center gap-1.5 border-0 shadow-sm transition-colors", showNccPCommand ? "bg-amber-600 hover:bg-amber-500 text-white" : "bg-purple-800 hover:bg-purple-700 text-white")}
                title="Toggle between P Remote Active Power and P Command (NCC)"
              >
                <Sliders size={12} />
                {showNccPCommand ? "Mode: P Command (NCC)" : "Mode: P Remote Active"}
              </Button>
            )}

          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Control Column */}
        {!(isAIAgentMode || isExportPreviewMode) && (
          <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-border-v bg-background/20 p-3 flex flex-col gap-4 shrink-0 overflow-y-auto">
            {/* Dropzone â€” supports recursive folder drag-and-drop */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-foreground/50 border-b border-border-v/50 pb-1 mb-1">
                1. Drop Data Folder
              </label>
              <div
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={async (e) => {
                  e.preventDefault();
                  if (isCalculating) return;
                  setIsCalculating(true);
                  setCalcStatus('Scanning dropped items...');
                  setErrorMessage('');

                  // Recursive folder traversal using FileSystemEntry API
                  const collected: { file: File, path: string }[] = [];
                  const readEntry = async (entry: any, prefix: string): Promise<void> => {
                    if (entry.isFile) {
                      await new Promise<void>(res => entry.file((f: File) => {
                        collected.push({ file: f, path: prefix + f.name });
                        res();
                      }));
                    } else if (entry.isDirectory) {
                      const reader = entry.createReader();
                      await new Promise<void>(res => {
                        reader.readEntries(async (entries: any[]) => {
                          for (const child of entries) {
                            await readEntry(child, prefix + entry.name + '/');
                          }
                          res();
                        });
                      });
                    }
                  };

                  const items = Array.from(e.dataTransfer.items);
                  for (const item of items) {
                    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                    if (entry) {
                      await readEntry(entry, '');
                    } else if (item.kind === 'file') {
                      const f = item.getAsFile();
                      if (f) collected.push({ file: f, path: f.name });
                    }
                  }

                  // Expand any zip archives found
                  const expanded: { file: File, path: string }[] = [];
                  for (const item of collected) {
                    if (/\.(zip|rar|7z)$/i.test(item.file.name)) {
                      try { expanded.push(...await expandZip(item.file, item.path)); } catch (e) { }
                    } else {
                      expanded.push(item);
                    }
                  }

                  await parseEvaluationExcelFiles(expanded);
                }}
                className="border-2 border-dashed border-border-v/80 hover:border-accent-blue bg-surface/30 rounded p-4 text-center cursor-pointer transition-colors flex flex-col items-center justify-center min-h-[100px] group"
                onClick={() => folderInputRef.current?.click()}
              >
                <Upload size={24} className="text-accent-blue/70 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-[10px] font-bold uppercase tracking-wider text-foreground/80">Drop Folder Here</div>
                <div className="text-[8px] text-foreground/40 mt-1 font-mono leading-relaxed">Accepts ZIP, RAR, Folders</div>
              </div>

              <Button
                onClick={() => folderInputRef.current?.click()}
                disabled={isCalculating}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-sm text-[10px] uppercase font-bold tracking-wider h-8 rounded transition-all"
              >
                Or Browse Folder
              </Button>

              {evalData && (
                <Button
                  onClick={() => setEvalData(null)}
                  className="w-full bg-red-600 hover:bg-red-500 text-white border-0 shadow-sm text-[10px] uppercase font-bold tracking-wider h-8 rounded mt-2 transition-all"
                >
                  Clear Data
                </Button>
              )}
            </div>

            {/* Progress bar */}
            {isCalculating && (
              <div className="bg-accent-blue/5 border border-accent-blue/20 rounded p-2.5 text-[9px] font-mono">
                <div className="flex justify-between items-center font-bold text-accent-blue mb-1 gap-2">
                  <span className="truncate" title={calcStatus}>{calcStatus}</span>
                  <span className="shrink-0">{Math.round(calcProgress)}%</span>
                </div>
                <div className="h-1 bg-foreground/10 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-blue transition-all duration-300" style={{ width: `${calcProgress}%` }}></div>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-2.5 rounded text-[9px] font-mono whitespace-pre-wrap">
                <strong>Error:</strong> {errorMessage}
              </div>
            )}


            {/* Graph Metric Mode */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wider text-foreground/40 border-b border-border-v/50 pb-1 mb-1 mt-2">2. Plot Configuration</label>
              <div className="flex flex-col gap-1 font-mono text-[10px]">
                {(() => {
                  const isBess = typeof project === 'string' && (project.startsWith('SNTB') || project.startsWith('SNTV') || project.startsWith('SNTD') || project.startsWith('SNTZ') || project.startsWith('MSGP'));
                  const currentPlants = getProjectPlants(typeof project === 'string' ? project : '');

                  if (isBess) {
                    return (
                      <button onClick={() => setActiveMetric('fig4')} className={cn("p-2 text-left rounded shadow-sm border-0 transition-all flex items-center justify-between", activeMetric === 'fig4' ? "bg-accent-blue text-white font-bold" : "bg-surface hover:bg-foreground/5 text-foreground/80 border border-border-v")}>
                        <span>Figure 1: Daily Evaluation</span>
                        <span className={cn("text-[8px]", activeMetric === 'fig4' ? "text-blue-100" : "opacity-50")}>All Plants</span>
                      </button>
                    );
                  } else {
                    return (
                      <>
                        <button onClick={() => setActiveMetric('pf_p1')} className={cn("p-2 text-left rounded shadow-sm border-0 transition-all flex items-center justify-between", activeMetric === 'pf_p1' ? "bg-accent-blue text-white font-bold" : "bg-surface hover:bg-foreground/5 text-foreground/80 border border-border-v")}>
                          <span>Figure 1: SWG01 Powerflow Check</span>
                          <span className={cn("text-[8px]", activeMetric === 'pf_p1' ? "text-blue-100" : "opacity-50")}>Subplots</span>
                        </button>

                        {currentPlants.length >= 2 && (
                          <button onClick={() => setActiveMetric('pf_p2')} className={cn("p-2 text-left rounded shadow-sm border-0 transition-all flex items-center justify-between", activeMetric === 'pf_p2' ? "bg-accent-blue text-white font-bold" : "bg-surface hover:bg-foreground/5 text-foreground/80 border border-border-v")}>
                            <span>Figure 2: SWG02 Powerflow Check</span>
                            <span className={cn("text-[8px]", activeMetric === 'pf_p2' ? "text-blue-100" : "opacity-50")}>Subplots</span>
                          </button>
                        )}

                        {currentPlants.length >= 3 && (
                          <button onClick={() => setActiveMetric('pf_p3')} className={cn("p-2 text-left rounded shadow-sm border-0 transition-all flex items-center justify-between", activeMetric === 'pf_p3' ? "bg-accent-blue text-white font-bold" : "bg-surface hover:bg-foreground/5 text-foreground/80 border border-border-v")}>
                            <span>Figure 3: SWG03 Powerflow Check</span>
                            <span className={cn("text-[8px]", activeMetric === 'pf_p3' ? "text-blue-100" : "opacity-50")}>Subplots</span>
                          </button>
                        )}

                        <button onClick={() => setActiveMetric('fig5')} className={cn("p-2 text-left rounded shadow-sm border-0 transition-all flex items-center justify-between", activeMetric === 'fig5' ? "bg-accent-blue text-white font-bold" : "bg-surface hover:bg-foreground/5 text-foreground/80 border border-border-v")}>
                          <span>Figure {currentPlants.length + 1}: Active Power & SOC</span>
                          <span className={cn("text-[8px]", activeMetric === 'fig5' ? "text-blue-100" : "opacity-50")}>All Plants</span>
                        </button>
                        <button onClick={() => setActiveMetric('fig6')} className={cn("p-2 text-left rounded shadow-sm border-0 transition-all flex items-center justify-between", activeMetric === 'fig6' ? "bg-accent-blue text-white font-bold" : "bg-surface hover:bg-foreground/5 text-foreground/80 border border-border-v")}>
                          <span>Figure {currentPlants.length + 2}: Volt & Reactive Power</span>
                          <span className={cn("text-[8px]", activeMetric === 'fig6' ? "text-blue-100" : "opacity-50")}>All Plants</span>
                        </button>
                      </>
                    );
                  }
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Chart Viewer Section */}
        <div className="flex-1 min-w-0 flex flex-col">
          {!(isAIAgentMode || isExportPreviewMode) && (
            <div className="px-3 py-1.5 border-b border-border-v flex justify-between bg-surface/30 items-center">
              <div className="font-mono text-[9px] text-foreground/50 uppercase tracking-wider flex items-center gap-1.5">
                <span>ACTIVE PLOT MODE:</span>
                <span className="text-foreground/90 font-bold bg-foreground/5 px-2 py-0.5 rounded border border-border-v">
                  {activeMetric === 'pf_p1' ? 'Fig 1 (SWG01 Powerflow)' :
                    activeMetric === 'pf_p2' ? 'Fig 2 (SWG02 Powerflow)' :
                      activeMetric === 'pf_p3' ? 'Fig 3 (SWG03 Powerflow)' :
                        activeMetric === 'f_p' ? 'Fig 1 (Frequency & P)' :
                          activeMetric === 'soc_p' ? 'Fig 2 (SOC & P)' :
                            activeMetric === 'v_q' ? 'Fig 3 (Voltage & Q)' :
                              activeMetric === 'fig4' ? (typeof project === 'string' && (project.startsWith('SNTB') || project.startsWith('SNTV') || project.startsWith('SNTD') || project.startsWith('SNTZ') || project.startsWith('MSGP')) ? 'Fig 1 (Daily Evaluation)' : 'Fig 4 (Powerflow check)') :
                                activeMetric === 'fig5' ? `Fig ${getProjectPlants(typeof project === 'string' ? project : '').length + 1} (Active Power & SOC All Plants)` :
                                  `Fig ${getProjectPlants(typeof project === 'string' ? project : '').length + 2} (Voltage & Reactive Power All Plants)`}
                </span>
                {/* Pin counter */}
                {pinnedPoints.length > 0 && (
                  <span className="flex items-center gap-1 ml-2">
                    <span className="bg-accent-blue/10 text-accent-blue border border-accent-blue/30 px-1.5 py-0.5 rounded text-[8px] font-bold">
                      {pinnedPoints.length} pin{pinnedPoints.length > 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => setPinnedPoints([])}
                      className="text-[8px] font-mono text-foreground/40 hover:text-red-400 border border-foreground/10 hover:border-red-400/30 px-1.5 py-0.5 rounded transition-colors"
                      title="Clear all pins"
                    >
                      Clear
                    </button>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyClipboard}
                  disabled={!evalData}
                  className="h-6 px-2 text-[9px] rounded transition-colors flex items-center gap-1 font-bold font-mono bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none shadow-sm"
                  title="Capture all subplots as a single 1920×1080 image and copy to clipboard"
                >
                  <Copy size={10} />
                  <span>COPY AS CLIPBOARD</span>
                </button>
                <button
                  onClick={() => setShowCustomization(!showCustomization)}
                  className={cn("h-6 px-2 text-[9px] rounded transition-colors flex items-center gap-1 font-bold font-mono shadow-sm", showCustomization ? "bg-accent-blue text-white hover:bg-blue-600" : "bg-slate-700 text-white hover:bg-slate-600")}
                >
                  <Sliders size={10} />
                  <span>CUSTOMIZE</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 relative" style={{ display: 'flex', flexDirection: 'row' }}>
            <div ref={chartContainerRef} className="flex-1 relative w-full h-full p-3 min-h-[300px]">
              <GraphPanels
                evalData={evalData}
                graphConfig={graphConfig}
                pinnedPoints={pinnedPoints}
                project={project}
                selectedPlant={selectedPlant}
                activeMetric={activeMetric}
                showNccPCommand={showNccPCommand}
                theme={theme}
                handleHover={handleHover}
                handleUnhover={handleUnhover}
                handleRelayout={handleRelayout}
                handleClickAnnotation={handleClickAnnotation}
              />
            </div>

            {/* Customization Panel - absolute overlay drawer sliding from the right */}
            <CustomizationDrawer
              showCustomization={showCustomization}
              setShowCustomization={setShowCustomization}
              configTab={configTab}
              setConfigTab={setConfigTab}
              graphConfig={graphConfig}
              updateConfig={updateConfig}
              resetConfig={resetConfig}
            />
          </div>
        </div>
      </div>
    </section>
  );
}




