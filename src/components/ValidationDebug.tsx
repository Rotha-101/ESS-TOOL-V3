import React, { useEffect, useRef, useState } from 'react';
import { Activity, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getDBItem, setDBItem, removeDBItem } from '../lib/db';
import {
  HC_CATS,
  hcAcceptFiles,
  hcBulkImport,
  hcByProject,
  hcClearPlantData,
  hcForceStop,
  hcResetActiveProject,
  hcRunExport,
  getHcActiveProject,
  getHcBusy,
} from '../lib/audit-engine.js';
import { formatBytes, getFilesFromDataTransfer } from '../lib/file-utils';

export function ValidationDebug({ progress, setProgress }: { progress: { pct: number, active: boolean, label: string }, setProgress: React.Dispatch<React.SetStateAction<{ pct: number, active: boolean, label: string }>> }) {
  const project = getHcActiveProject();
  const currentPlants = hcByProject[project] || [];
  
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{name: string, size: string}[]>([]);
  const [pendingFiles, setPendingFiles] = useState<{file: File, path: string}[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await getDBItem<{name: string, size: string}[]>(`validation_log_${project}`);
      if (saved && saved.length > 0) {
        setUploadedFiles(saved);
      } else {
        setUploadedFiles([]);
      }
    })();
  }, [project]);

  
  const handlePlantUpload = (plantId: string | null, type: 'file' | 'folder') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.className = 'hidden';
    if (type === 'folder') {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    } else {
      input.multiple = true;
      input.accept = '.zip,.rar,.7z,.xlsx,.csv';
    }
    input.onchange = async (e: any) => {
      const rawFiles = [...(e.target.files || [])];
      if (rawFiles.length === 0) return;
      const files = rawFiles.map(f => ({ file: f, path: f.webkitRelativePath || f.name }));
      
      const tStart = Date.now();
      try {
        setUploadMessage('');
        await hcBulkImport(files, plantId);
        const duration = ((Date.now() - tStart) / 1000).toFixed(1);
        setUploadMessage(`Audit complete for ${plantId} in ${duration}s!`);
        setTimeout(() => setUploadMessage(''), 8000);
      } catch (err: any) {
        setUploadMessage(`Error: ${err.message || String(err)}`);
      }
    };
    input.click();
  };

  const formatHHMMSS = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const getRemainingTime = () => {
    if (progress.pct <= 1) return '--:--:--';
    const totalSecs = (elapsedTime / progress.pct) * 100;
    const remaining = Math.max(0, totalSecs - elapsedTime);
    return formatHHMMSS(remaining);
  };

  useEffect(() => {
    let intervalId: any = null;
    if (progress.active) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      intervalId = setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsedTime((Date.now() - startTimeRef.current) / 1000);
        }
      }, 100);
    } else {
      startTimeRef.current = null;
      setElapsedTime(0);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [progress.active]);

  const isRunning = getHcBusy() || progress.active;

  const showUploadSuccess = () => {
    setUploadMessage('Folder data successfully uploaded and validated!');
    setTimeout(() => setUploadMessage(''), 5000);
  };

  const [isDragging, setIsDragging] = useState(false);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!e.dataTransfer.files) return;
    const filesArray = await getFilesFromDataTransfer(e.dataTransfer);
    
    // Support directory drop listing exactly as they drop
    const filesList = filesArray.slice(0, 15).map(f => ({
      name: f.path || f.file.name,
      size: formatBytes(f.file.size)
    }));
    if (filesArray.length > 15) {
      filesList.push({
        name: `... and ${filesArray.length - 15} more files`,
        size: ''
      });
    }
    setUploadedFiles(filesList);
    setDBItem(`validation_log_${project}`, filesList);
    setPendingFiles(filesArray);
    
    setUploadMessage('Files dropped successfully! Click RUN to start audit.');
    setTimeout(() => setUploadMessage(''), 5000);
  };

  return (
    <section className="flex-1 bg-panel border border-border-v rounded-sm flex flex-col relative overflow-hidden">

      <div className="px-3 py-2 border-b border-border-v flex items-center justify-between bg-surface/50 shrink-0">
        <div className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
          <Activity size={14} className="text-accent-blue" />
          Validation File Debug
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={(e) => { e.stopPropagation(); handlePlantUpload(null, 'file'); }}
            className="bg-accent-blue text-foreground hover:bg-blue-600 h-7 text-[10px] font-bold px-6 shadow-none rounded-sm border-none"
            disabled={getHcBusy()}
          >
            File
          </Button>
          <Button 
            onClick={(e) => { e.stopPropagation(); handlePlantUpload(null, 'folder'); }}
            className="border border-border-v bg-surface hover:bg-foreground/10 h-7 text-[10px] text-foreground font-bold px-6 shadow-none rounded-sm"
            disabled={getHcBusy()}
          >
            Folder
          </Button>
          <div className="w-px h-5 bg-border-v mx-1"></div>
          <Button 
            className="bg-red-600 text-white hover:bg-red-500 h-7 text-[10px] font-bold px-6 shadow-none rounded-sm border-none uppercase"
            onClick={() => {
              if (confirm('Are you sure you want to clear data for all plants?')) {
                currentPlants.forEach((plant: any) => hcClearPlantData(plant.id, true));
                removeDBItem(`validation_log_${project}`);
                setUploadedFiles([]);
              }
            }}
          >
            CLEAR ALL DATA
          </Button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
         {/* Left sidebar for config */}
         <div className="w-96 border-r border-border-v bg-surface/20 p-4 shrink-0 overflow-y-auto scrollbar-clean hidden md:block">
            <h4 className="text-[11px] font-bold text-foreground/50 mb-4 uppercase tracking-wider border-b border-foreground/10 pb-2">Plant Status</h4>
            
            <div className="space-y-4 text-[10px] font-mono text-foreground/70">
               {currentPlants.map(plant => {
                 const total = HC_CATS.reduce((s, c) => s + (plant.files[c.key]?.length || 0), 0);
                 return (
                   <div key={plant.id}>
                     <div className="flex items-center justify-between mb-1">
                       <span className="text-accent-blue font-bold">{plant.name} ({total} files)</span>
                       <Button 
                         variant="outline" 
                         size="sm" 
                         className="h-5 text-[9px] px-2 py-0 border-accent-blue/30 text-accent-blue bg-accent-blue/5 hover:bg-accent-blue hover:text-foreground"
                         onClick={async () => {
                           await hcRunExport(false);
                           setUploadMessage(`Export complete for ${plant.name}!`);
                           setTimeout(() => setUploadMessage(''), 5000);
                         }}
                         disabled={isRunning}
                       >
                         Process
                       </Button>
                     </div>
                     <div className="bg-foreground/5 p-2 rounded border border-foreground/5 whitespace-normal leading-relaxed space-y-1">
                       {HC_CATS.map(cat => {
                         const list = plant.files[cat.key] || [];
                         const expected = plant.expected?.[cat.key];
                         const okC = list.filter(r => r.report?.status === 'ok').length;
                         const cC = list.filter(r => r.report?.status === 'critical').length;
                         return (
                           <div key={cat.key} className="flex justify-between">
                             <span>{cat.label}:</span>
                             <span className={cn(
                               list.length > 0 && expected && list.length < expected ? "text-yellow-400" :
                               cC > 0 ? "text-red-400" : "text-foreground/80"
                             )}>
                               {list.length} {expected ? `/ ${expected}` : ''}
                               {okC > 0 ? ` (${okC})` : ''}
                               {cC > 0 ? ` (${cC})` : ''}
                             </span>
                           </div>
                        );
                      })}
                    </div>

                   </div>
                 );
               })}
            </div>
              

              {/* Processing Progress Tracker */}
              {progress.active && (
                <div className="mt-4 w-full border-t border-border-v/30 pt-3 text-left">
                  <div className="text-[9px] uppercase font-bold text-foreground/50 mb-2 font-mono tracking-wider flex justify-between items-center">
                    <span>Processing Status</span>
                    <span className="text-accent-blue animate-pulse text-[8px] font-bold">ACTIVE</span>
                  </div>
                  <div className="bg-accent-blue/5 border border-accent-blue/20 rounded p-2.5 space-y-2">
                    <div className="flex justify-between items-center text-[9px] font-mono text-foreground/80 font-bold">
                      <span className="truncate pr-2">{progress.label}</span>
                      <span className="text-accent-blue font-bold shrink-0">{progress.pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-foreground/5 h-1.5 rounded-full overflow-hidden border border-border-v/20">
                      <div 
                        className="bg-accent-blue h-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                        style={{ width: `${progress.pct}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Parsed Excel Sheets List */}
              {(() => {
                const allUploadedFiles = currentPlants.flatMap(plant => 
                  HC_CATS.flatMap(cat => 
                    (plant.files[cat.key] || []).map(item => ({
                      plantName: plant.name,
                      catLabel: cat.label,
                      fileName: item.file.name,
                      filePath: item.path,
                      status: item.report?.status || 'VALIDATED'
                    }))
                  )
                );

                if (allUploadedFiles.length === 0) return null;

                return (
                  <div className="mt-4 w-full border-t border-border-v/30 pt-3">
                    <div className="text-[9px] uppercase font-bold text-foreground/50 mb-2 font-mono tracking-wider flex justify-between items-center">
                      <span>Loaded Sheets</span>
                      <span className="bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded text-[8px] font-bold">{allUploadedFiles.length}</span>
                    </div>
                    <div className="max-h-36 overflow-y-auto scrollbar-clean space-y-1 pr-1">
                      {allUploadedFiles.slice(0, 100).map((f, i) => (
                        <div key={i} className="flex flex-col text-[9px] font-mono bg-foreground/[0.02] border border-border-v/30 rounded p-1.5">
                          <div className="flex items-center justify-between text-foreground/80 font-bold gap-2">
                            <span className="truncate flex-1 text-left" title={f.filePath}>{f.fileName}</span>
                            <span className={`text-[8px] font-bold shrink-0 uppercase tracking-widest ${
                              f.status === 'ok' || f.status === 'VALIDATED' ? 'text-green-500' : 'text-red-500'
                            }`}>{f.status}</span>
                          </div>
                          <div className="flex justify-between text-foreground/45 mt-1 text-[8px]">
                            <span>{f.plantName}</span>
                            <span>{f.catLabel}</span>
                          </div>
                        </div>
                      ))}
                      {allUploadedFiles.length > 100 && (
                        <div className="text-center text-foreground/40 text-[9px] py-1 border border-dashed border-border-v/30 rounded bg-foreground/[0.01]">
                          ... and {allUploadedFiles.length - 100} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
         
         {/* Right area for Plant Category Grid */}
         <div className="flex-1 overflow-y-auto scrollbar-clean p-4 bg-panel space-y-6">
            {currentPlants.length === 0 ? (
              <div className="flex items-center justify-center h-full text-foreground/30 font-mono text-[12px] uppercase tracking-widest">
                No Plants Found for Selected Project
              </div>
            ) : currentPlants.map(plant => {
              const totalFiles = HC_CATS.reduce((s, c) => s + (plant.files[c.key]?.length || 0), 0);
              
              return (
                <div key={plant.id} className="bg-surface border border-border-v rounded-lg p-4 shadow-sm flex flex-col">
                  {/* Plant Header */}
                  <div className="flex items-center gap-4 mb-4 border-b border-border-v/50 pb-3">
                    <div className="font-bold text-[14px] text-foreground tracking-wide bg-background/50 px-3 py-1 rounded border border-border-v">
                      {plant.name}
                    </div>
                    <div className="text-[11px] text-foreground/50 ml-auto font-mono">
                      {totalFiles} files
                    </div>
                    <button 
                      className="text-[10px] uppercase font-bold text-red-400 hover:text-red-300 px-3 py-1.5 border border-red-500/20 hover:border-red-500/50 rounded transition-colors" 
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to clear data for ${plant.name}?`)) {
                          hcClearPlantData(plant.id, true);
                        }
                      }}
                    >
                      Clear Data
                    </button>
                  </div>
                  
                  {/* Category Grid */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {HC_CATS.map(cat => {
                      const list = plant.files[cat.key] || [];
                      const expected = plant.expected?.[cat.key];
                      const okC = list.filter(r => r.report?.status === 'ok').length;
                      const wC = list.filter(r => r.report?.status === 'warning').length;
                      const cC = list.filter(r => r.report?.status === 'critical').length;
                      
                      return (
                        <div key={cat.key} className="border border-border-v bg-background/30 rounded-md p-3 flex flex-col">
                          {/* Category Header */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-[12px] font-bold text-foreground/80">{cat.label}</span>
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded font-mono",
                              expected && list.length < expected ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                              expected && list.length > expected ? "bg-yellow-400/10 text-yellow-400 border border-yellow-500/20" :
                              "bg-surface text-foreground/60 border border-border-v"
                            )}>
                              {list.length} {expected ? `/ ${expected}` : ''} files {expected && list.length < expected ? `- short ${expected - list.length}` : ''}
                            </span>
                            
                            {/* Status Badges */}
                            <div className="ml-auto flex gap-1">
                              {okC > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-mono">{okC}</span>}
                              {wC > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 font-mono">{wC}</span>}
                              {cC > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-mono">{cC}</span>}
                            </div>
                          </div>
                          
                          {/* Dropzone & Reference */}
                          <div className="flex items-stretch gap-2 h-20 mb-2">
                            <label 
                              className={cn(
                                "flex-1 border-2 border-dashed rounded bg-accent-blue/5 hover:bg-accent-blue/10 border-accent-blue/30 hover:border-accent-blue/60 transition-colors flex flex-col items-center justify-center cursor-pointer text-[11px] text-accent-blue font-mono"
                              )}
                              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-accent-blue/20'); }}
                              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('bg-accent-blue/20'); }}
                              onDrop={async (e) => {
                                e.preventDefault();
                                e.currentTarget.classList.remove('bg-accent-blue/20');
                                if (!e.dataTransfer.files) return;
                                const filesArray = await getFilesFromDataTransfer(e.dataTransfer);
                                await hcAcceptFiles(plant, cat, filesArray);
                                showUploadSuccess();
                              }}
                            >
                              <span>Drop {cat.label} xlsx (or click)</span>
                              <input type="file" multiple className="hidden" accept=".xlsx,.xls" onChange={async (e) => {
                                if (!e.target.files) return;
                                const filesArray = Array.from(e.target.files).map(f => ({ file: f, path: f.webkitRelativePath || f.name }));
                                e.target.value = '';
                                await hcAcceptFiles(plant, cat, filesArray);
                                showUploadSuccess();
                              }}/>
                            </label>
                            
                            <div className="w-36 shrink-0 bg-surface border border-border-v rounded flex flex-col p-1.5 relative overflow-hidden">
                              <span className="text-[7px] uppercase font-bold text-foreground/40 mb-1 tracking-wider">Filename Example</span>
                              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-70">
                                <FileSpreadsheet size={20} className="text-green-500/70 mb-1" />
                                <div className="text-[8px] font-mono leading-tight max-w-full overflow-hidden text-ellipsis px-1">
                                  {cat.examples ? cat.examples[0] : 'example_file.xlsx'}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* File List */}
                          <div className="flex-1 bg-surface/50 rounded border border-border-v/50 p-2 overflow-y-auto scrollbar-clean max-h-32 text-[10px] font-mono">
                            {list.length === 0 ? (
                              <div className="text-center text-foreground/30 py-2">no files yet</div>
                            ) : (
                              <div className="space-y-1">
                                {list.slice(0, 100).map((fileEntry: any, i: number) => {
                                  const status = fileEntry.report?.status;
                                  const isCritical = status === 'critical';
                                  const isWarning = status === 'warning';
                                  const isOk = status === 'ok';
                                  
                                  return (
                                    <div key={i} className={cn(
                                      "flex items-center gap-2 p-1 rounded",
                                      isCritical ? "bg-red-500/10 text-red-400" :
                                      isWarning ? "bg-yellow-400/10 text-yellow-400" :
                                      isOk ? "text-foreground/80" : "text-foreground/60"
                                    )}>
                                      <div className="w-4 text-center">
                                        {isCritical ? '' : isWarning ? '' : isOk ? '' : ''}
                                      </div>
                                      <div className="flex-1 truncate" title={fileEntry.path}>{fileEntry.path.split('/').pop()}</div>
                                      {fileEntry.report?.reasons?.length > 0 && (
                                        <div className="text-[9px] opacity-70 truncate max-w-[120px]">
                                          {fileEntry.report.reasons[0]}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {list.length > 100 && (
                                  <div className="text-center text-foreground/40 text-[9px] py-1 border border-dashed border-border-v/30 rounded bg-foreground/[0.01]">
                                    ... and {list.length - 100} more
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
         </div>
         </div>
      </section>
  );
}
