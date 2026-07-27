import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  Bot,
  CheckCircle2,
  Cpu,
  Download,
  Grid2X2,
  Key,
  Maximize2,
  Minimize2,
  Moon,
  Network,
  Settings,
  Sliders,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAIContext } from '../lib/ai-context';
import { useAppStore } from '../store/useAppStore';
import { RepositorySettings } from './RepositorySettings';

export function SettingsWindow({ onClose, isMaximized, onToggleMaximize }: { onClose: () => void, isMaximized: boolean, onToggleMaximize: () => void }) {
  const [activeMenu, setActiveMenu] = useState('general');
  const { provider, setProvider, apiKey, setApiKey, connectionStatus, handleConnect, handleDisconnect, systemInstructions, setSystemInstructions, setConnectionStatus, language, setLanguage } = useAIContext();

  const {
    theme, setTheme,
    engineerName, setEngineerName,
    graphHistoryEnabled, setGraphHistoryEnabled,
    compactTableRows, setCompactTableRows,
    autoRefreshDashboard, setAutoRefreshDashboard,
    refreshInterval, setRefreshInterval,
    timezone, setTimezone,
    exportFormat, setExportFormat,
    exportMetadataHeaders, setExportMetadataHeaders,
    autoExportValidation, setAutoExportValidation,
    strictValidationMode, setStrictValidationMode,
    autoRejectUnknownSignals, setAutoRejectUnknownSignals,
    warningTolerance, setWarningTolerance,
    soundAlerts, setSoundAlerts,
    showToastNotifications, setShowToastNotifications,
    aiModelTier, setAiModelTier,
    aiTemperature, setAiTemperature,
    aiMemoryLimit, setAiMemoryLimit,
    aiIncludeTelemetry, setAiIncludeTelemetry,
    aiEnableWebSearch, setAiEnableWebSearch
  } = useAppStore();

  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm transition-all animate-in fade-in duration-200", isMaximized ? "p-0" : "")}>
      <div className={cn("bg-panel border border-border-v flex flex-col shadow-2xl overflow-hidden transition-all duration-300", isMaximized ? "w-full h-full rounded-none" : "w-full max-w-5xl h-[80vh] min-h-[600px] rounded-md")}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border-v bg-surface/50 shrink-0">
          <div className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
            <Settings size={14} className="text-foreground/60" />
            System Settings
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onToggleMaximize} className="p-1.5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground rounded transition-colors group relative" title={isMaximized ? "Restore" : "Maximize"}>
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-red-500/20 text-foreground/50 hover:text-red-500 rounded transition-colors" title="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 bg-background/30">
          {/* Sidebar */}
          <div className="w-56 border-r border-border-v bg-panel flex flex-col shrink-0 p-2 gap-1 overflow-y-auto">
            <button onClick={() => setActiveMenu('general')} className={cn("p-2 px-3 text-[12px] font-medium text-left border-l-2 transition-colors rounded-sm flex items-center gap-2", activeMenu === 'general' ? "border-accent-blue bg-accent-blue/10 text-foreground" : "border-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground")}><Settings size={14} className="opacity-70" /> General Settings</button>
            <button onClick={() => setActiveMenu('data')} className={cn("p-2 px-3 text-[12px] font-medium text-left border-l-2 transition-colors rounded-sm flex items-center gap-2", activeMenu === 'data' ? "border-accent-blue bg-accent-blue/10 text-foreground" : "border-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground")}><Download size={14} className="opacity-70" /> Data & Export</button>
            <button onClick={() => setActiveMenu('validation')} className={cn("p-2 px-3 text-[12px] font-medium text-left border-l-2 transition-colors rounded-sm flex items-center gap-2", activeMenu === 'validation' ? "border-accent-blue bg-accent-blue/10 text-foreground" : "border-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground")}><CheckCircle2 size={14} className="opacity-70" /> Validation Rules</button>
            <button onClick={() => setActiveMenu('alerts')} className={cn("p-2 px-3 text-[12px] font-medium text-left border-l-2 transition-colors rounded-sm flex items-center gap-2", activeMenu === 'alerts' ? "border-accent-blue bg-accent-blue/10 text-foreground" : "border-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground")}><AlertTriangle size={14} className="opacity-70" /> Notifications & Alerts</button>
            <button onClick={() => setActiveMenu('ai')} className={cn("p-2 px-3 text-[12px] font-medium text-left border-l-2 transition-colors rounded-sm flex items-center gap-2", activeMenu === 'ai' ? "border-accent-blue bg-accent-blue/10 text-foreground" : "border-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground")}><Bot size={14} className="opacity-70" /> AI Agent Setup</button>
          </div>
          
          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeMenu === 'general' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <Archive size={12} /> Graph Repository
                  </h3>

                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <div className="flex flex-col">
                      <span className="text-[12px] font-medium">Engineer Name</span>
                      <span className="text-[10px] text-foreground/40">Stamped on every graph you generate</span>
                    </div>
                    <input
                      value={engineerName}
                      onChange={(e) => setEngineerName(e.target.value)}
                      placeholder="e.g. CHEA Rotha"
                      className="w-48 h-8 px-2 rounded bg-panel border border-border-v text-[11px] text-foreground/90 placeholder:text-foreground/30 focus:outline-none focus:border-accent-blue"
                    />
                  </div>

                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <div className="flex flex-col">
                      <span className="text-[12px] font-medium">Auto-Save Generated Graphs</span>
                      <span className="text-[10px] text-foreground/40">Keeps history instead of overwriting the previous day</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={graphHistoryEnabled} onChange={(e) => setGraphHistoryEnabled(e.target.checked)} />
                      <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent-blue"></div>
                    </label>
                  </div>
                </div>

                <RepositorySettings />

                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <Grid2X2 size={12} /> Display Preferences
                  </h3>
                  
                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <span className="text-[12px] font-medium">Theme Preference</span>
                    <Select value={theme} onValueChange={(val: any) => setTheme(val)}>
                      <SelectTrigger className="w-36 h-8 text-[11px] bg-panel border-border-v">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark" className="text-[11px]"><div className="flex items-center gap-2"><Moon size={12}/> Dark Mode</div></SelectItem>
                        <SelectItem value="light" className="text-[11px]"><div className="flex items-center gap-2"><Sun size={12}/> Light Mode</div></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <span className="text-[12px] font-medium">Timezone Display</span>
                    <Select value={timezone} onValueChange={(val: any) => setTimezone(val)}>
                      <SelectTrigger className="w-36 h-8 text-[11px] bg-panel border-border-v">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local" className="text-[11px]">Local Time</SelectItem>
                        <SelectItem value="utc" className="text-[11px]">UTC / GMT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <span className="text-[12px] font-medium">Compact Table Rows</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={compactTableRows} onChange={(e) => setCompactTableRows(e.target.checked)} />
                      <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent-blue"></div>
                    </label>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <Activity size={12} /> Dashboard Refresh
                  </h3>
                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <div>
                      <div className="text-[12px] font-medium text-foreground">Auto-refresh Dashboard</div>
                      <div className="text-[10px] text-foreground/50 mt-1">Automatically pull new telemetry data</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={autoRefreshDashboard} onChange={(e) => setAutoRefreshDashboard(e.target.checked)} />
                      <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                  </div>
                  <div className={cn("flex items-center justify-between bg-surface/30 p-3 rounded border border-border-v transition-opacity", !autoRefreshDashboard && "opacity-50 pointer-events-none")}>
                    <span className="text-[12px] font-medium">Refresh Interval</span>
                    <div className="flex items-center gap-2">
                      <input type="number" value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))} className="w-14 bg-panel border border-border-v text-[11px] p-1.5 rounded text-center outline-none focus:border-accent-blue" min={5} />
                      <span className="text-[10px] text-foreground/50">seconds</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeMenu === 'data' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <Download size={12} /> Export Configuration
                  </h3>
                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <span className="text-[12px] font-medium">Default Export Format</span>
                    <Select value={exportFormat} onValueChange={setExportFormat}>
                      <SelectTrigger className="w-36 h-8 text-[11px] bg-panel border-border-v">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excel" className="text-[11px]">Excel (.xlsx)</SelectItem>
                        <SelectItem value="csv" className="text-[11px]">Raw Text (.csv)</SelectItem>
                        <SelectItem value="json" className="text-[11px]">JSON Payload (.json)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <span className="text-[12px] font-medium">Include Metadata Headers</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={exportMetadataHeaders} onChange={(e) => setExportMetadataHeaders(e.target.checked)} />
                      <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent-blue"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <div>
                      <div className="text-[12px] font-medium">Auto-Export after Validation</div>
                      <div className="text-[10px] text-foreground/50 mt-1">Automatically download exported file after scanning</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={autoExportValidation} onChange={(e) => setAutoExportValidation(e.target.checked)} />
                      <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent-blue"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}
            
            {activeMenu === 'validation' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <CheckCircle2 size={12} /> Audit Engine Rules
                  </h3>
                  <div className="flex flex-col gap-2 bg-surface/50 p-3 rounded border border-red-500/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-red-100">Strict Validation Mode</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={strictValidationMode} onChange={(e) => setStrictValidationMode(e.target.checked)} />
                        <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-500"></div>
                      </label>
                    </div>
                    <p className="text-[10px] text-foreground/60 leading-relaxed font-mono">When enabled, any minor schema variations or missing optional fields will cause a complete file rejection. Use only for critical compliance reports.</p>
                  </div>
                  
                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <div>
                      <div className="text-[12px] font-medium">Auto-Reject Unknown Signals</div>
                      <div className="text-[10px] text-foreground/50 mt-1">If true, signals not in the schema will fail the file entirely</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={autoRejectUnknownSignals} onChange={(e) => setAutoRejectUnknownSignals(e.target.checked)} />
                      <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent-blue"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}
            
            {activeMenu === 'alerts' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                 <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <AlertTriangle size={12} /> Alert Thresholds
                  </h3>
                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <span className="text-[12px] font-medium">Warning Tolerance</span>
                    <div className="flex items-center gap-3">
                       <input type="range" min="0" max="100" value={warningTolerance} onChange={(e) => setWarningTolerance(Number(e.target.value))} className="w-32 h-1 bg-foreground/20 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                       <span className="text-[11px] font-mono w-8 text-right text-foreground/60">{warningTolerance}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <div>
                      <div className="text-[12px] font-medium">Sound Alerts on Rejection</div>
                      <div className="text-[10px] text-foreground/50 mt-1">Play an audible chime when files fail validation</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={soundAlerts} onChange={(e) => setSoundAlerts(e.target.checked)} />
                      <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent-blue"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                    <div>
                      <div className="text-[12px] font-medium">Enable Toast Notifications</div>
                      <div className="text-[10px] text-foreground/50 mt-1">Show brief popups when actions complete</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={showToastNotifications} onChange={(e) => setShowToastNotifications(e.target.checked)} />
                      <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent-blue"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}
            
            {activeMenu === 'ai' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                        <Cpu size={12} /> Model Selection
                      </h3>
                      <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                        <span className="text-[12px] font-medium">Model Tier</span>
                        <Select value={aiModelTier} onValueChange={setAiModelTier}>
                          <SelectTrigger className="w-36 h-8 text-[11px] bg-panel border-border-v">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gemini-2.5-pro" className="text-[11px]">Gemini 2.5 Pro</SelectItem>
                            <SelectItem value="gemini-2.5-flash" className="text-[11px]">Gemini 2.5 Flash</SelectItem>
                            <SelectItem value="gpt-4o" className="text-[11px]">GPT-4o</SelectItem>
                            <SelectItem value="claude-3.5-sonnet" className="text-[11px]">Claude 3.5 Sonnet</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                        <Sliders size={12} /> Model Parameters
                      </h3>
                      <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                        <div className="flex flex-col">
                          <span className="text-[12px] font-medium">Temperature</span>
                          <span className="text-[9px] text-foreground/50">Higher = more creative</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input type="range" min="0" max="1" step="0.1" value={aiTemperature} onChange={(e) => setAiTemperature(Number(e.target.value))} className="w-24 h-1 bg-foreground/20 rounded-lg appearance-none cursor-pointer accent-accent-blue" />
                          <span className="text-[11px] font-mono w-6 text-right text-foreground/60">{aiTemperature.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                        <Network size={12} /> Context & Memory
                      </h3>
                      <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                        <span className="text-[12px] font-medium">Memory Limit</span>
                        <Select value={aiMemoryLimit} onValueChange={setAiMemoryLimit}>
                          <SelectTrigger className="w-36 h-8 text-[11px] bg-panel border-border-v">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5" className="text-[11px]">Last 5 Messages</SelectItem>
                            <SelectItem value="10" className="text-[11px]">Last 10 Messages</SelectItem>
                            <SelectItem value="20" className="text-[11px]">Last 20 Messages</SelectItem>
                            <SelectItem value="all" className="text-[11px]">All History</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                        <div>
                          <div className="text-[12px] font-medium">Include Live Telemetry</div>
                          <div className="text-[10px] text-foreground/50 mt-1">Inject recent SCADA data into prompts</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={aiIncludeTelemetry} onChange={(e) => setAiIncludeTelemetry(e.target.checked)} />
                          <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent-blue"></div>
                        </label>
                      </div>
                      
                      <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
                        <div>
                          <div className="text-[12px] font-medium">Enable Web Search</div>
                          <div className="text-[10px] text-foreground/50 mt-1">Allow agent to search for external docs</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={aiEnableWebSearch} onChange={(e) => setAiEnableWebSearch(e.target.checked)} />
                          <div className="w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent-blue"></div>
                        </label>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                        Language Mode
                      </h3>
                      <div className="flex bg-surface/50 rounded border border-border-v p-1">
                         <button 
                           onClick={() => setLanguage('English')}
                           className={cn("flex-1 px-4 py-1.5 rounded transition-colors text-[12px]", language === 'English' ? "bg-accent-blue/10 text-accent-blue font-medium" : "text-foreground/60 hover:text-foreground")}
                         >
                           English
                         </button>
                         <button 
                           onClick={() => setLanguage('Khmer')}
                           className={cn("flex-1 px-4 py-1.5 rounded transition-colors text-[12px] font-khmer", language === 'Khmer' ? "bg-accent-blue/10 text-accent-blue font-medium" : "text-foreground/60 hover:text-foreground")}
                         >
                           ážáŸ’áž˜áŸ‚ážš
                         </button>
                      </div>
                      
                      <div className="space-y-4 mt-6">
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                          <Cpu size={12} /> Legacy Provider
                        </h3>
                        <div className="flex bg-surface/50 rounded border border-border-v p-1 overflow-x-auto scrollbar-none">
                          <button 
                            onClick={() => setProvider('gemini')}
                            className={cn("px-4 py-1.5 rounded transition-colors flex items-center justify-center gap-1 text-[12px] whitespace-nowrap", provider === 'gemini' ? "bg-accent-blue/10 text-accent-blue font-medium" : "text-foreground/60 hover:text-foreground")}
                          >
                            Gemini
                          </button>
                          <button 
                            onClick={() => setProvider('chatgpt')}
                            className={cn("px-4 py-1.5 rounded transition-colors flex items-center justify-center gap-1 text-[12px] whitespace-nowrap", provider === 'chatgpt' ? "bg-green-500/10 text-green-500 font-medium" : "text-foreground/60 hover:text-foreground")}
                          >
                            ChatGPT
                          </button>
                          <button 
                            onClick={() => setProvider('claude')}
                            className={cn("px-4 py-1.5 rounded transition-colors flex items-center justify-center gap-1 text-[12px] whitespace-nowrap", provider === 'claude' ? "bg-orange-500/10 text-orange-500 font-medium" : "text-foreground/60 hover:text-foreground")}
                          >
                            Claude
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                  
                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><Key size={12} /> API Access</div>
                    <div className="flex items-center gap-1">
                      {connectionStatus === 'connected' && <span className="flex items-center gap-1 text-[10px] uppercase font-mono tracking-widest text-green-500"><span className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span> Connected</span>}
                      {connectionStatus === 'error' && <span className="flex items-center gap-1 text-[10px] uppercase font-mono tracking-widest text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span> Error</span>}
                      {connectionStatus === 'connecting' && <span className="flex items-center gap-1 text-[10px] uppercase font-mono tracking-widest text-yellow-500"><span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"></span> Connecting</span>}
                      {connectionStatus === 'disconnected' && <span className="flex items-center gap-1 text-[10px] uppercase font-mono tracking-widest text-foreground/40"><span className="h-1.5 w-1.5 rounded-full bg-foreground/20"></span> Disconnected</span>}
                    </div>
                  </h3>
                  <div className="flex gap-2">
                    <input 
                      type="password" 
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Leave blank to use default process.env variable..."
                      className="flex-1 h-9 bg-surface/50 border border-border-v rounded px-3 text-[12px] font-mono focus:outline-none focus:border-accent-blue/50 transition-colors"
                    />
                    {connectionStatus === 'connected' ? (
                      <button 
                        onClick={handleDisconnect}
                        className="h-9 px-4 bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white rounded text-[12px] font-medium transition-colors shrink-0"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button 
                        onClick={handleConnect}
                        disabled={connectionStatus === 'connecting'}
                        className="h-9 px-4 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue hover:text-white rounded text-[12px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        {connectionStatus === 'connecting' ? 'Connecting...' : 'Test Connection'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <Sparkles size={12} /> System Instructions
                  </h3>
                  <p className="text-[11px] text-foreground/60 leading-relaxed max-w-2xl">
                    Configure the base persona and analysis rules for the AI Agent. This directs how the AI interprets telemetry data and answers queries.
                  </p>
                  <textarea 
                    value={systemInstructions}
                    onChange={(e) => setSystemInstructions(e.target.value)}
                    className="w-full h-32 bg-surface/50 border border-border-v rounded p-3 text-[12px] font-mono focus:outline-none focus:border-accent-blue/50 transition-colors resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
