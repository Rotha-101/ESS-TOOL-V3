import React, { useState } from 'react';
import {
  Archive,
  Bot,
  Grid2X2,
  Info,
  Key,
  Maximize2,
  Minimize2,
  Moon,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  User,
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
import { AccountCard } from './AccountCard';

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
            <SettingsIcon size={14} className="text-foreground/60" />
            Settings
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
            {/* Four sections, every control in them wired to something. The
                previous five contained ~17 toggles that changed nothing — a
                non-technical user cannot tell which of those work, so they
                cost trust rather than adding capability. */}
            <button onClick={() => setActiveMenu('general')} className={cn("p-2 px-3 text-[12px] font-medium text-left border-l-2 transition-colors rounded-sm flex items-center gap-2", activeMenu === 'general' ? "border-accent-blue bg-accent-blue/10 text-foreground" : "border-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground")}><User size={14} className="opacity-70" /> Account</button>
            <button onClick={() => setActiveMenu('appearance')} className={cn("p-2 px-3 text-[12px] font-medium text-left border-l-2 transition-colors rounded-sm flex items-center gap-2", activeMenu === 'appearance' ? "border-accent-blue bg-accent-blue/10 text-foreground" : "border-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground")}><Grid2X2 size={14} className="opacity-70" /> Appearance</button>
            <button onClick={() => setActiveMenu('ai')} className={cn("p-2 px-3 text-[12px] font-medium text-left border-l-2 transition-colors rounded-sm flex items-center gap-2", activeMenu === 'ai' ? "border-accent-blue bg-accent-blue/10 text-foreground" : "border-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground")}><Bot size={14} className="opacity-70" /> AI Assistant</button>
            <button onClick={() => setActiveMenu('about')} className={cn("p-2 px-3 text-[12px] font-medium text-left border-l-2 transition-colors rounded-sm flex items-center gap-2", activeMenu === 'about' ? "border-accent-blue bg-accent-blue/10 text-foreground" : "border-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground")}><Info size={14} className="opacity-70" /> About</button>
          </div>
          
          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeMenu === 'general' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                {/* Identity is server-owned — the name on a published graph
                    comes from the activation credential, so an editable field
                    here would promise a control the user does not have. */}
                <AccountCard />

                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <Archive size={12} /> Graph history
                  </h3>

                  <div className="flex items-center justify-between bg-surface/50 p-3.5 rounded-lg border border-border-v">
                    <div className="flex flex-col pr-4">
                      <span className="text-[12px] font-medium">Keep every graph I generate</span>
                      <span className="text-[11px] text-foreground/45 leading-relaxed">Saves each day instead of replacing the previous one</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input type="checkbox" className="sr-only peer" checked={graphHistoryEnabled} onChange={(e) => setGraphHistoryEnabled(e.target.checked)} />
                      <div className="w-9 h-5 bg-foreground/20 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:bg-accent-blue"></div>
                    </label>
                  </div>
                </div>

              </div>
            )}

            {activeMenu === 'appearance' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <Grid2X2 size={12} /> Appearance
                  </h3>

                  <div className="flex items-center justify-between bg-surface/50 p-3.5 rounded-lg border border-border-v">
                    <span className="text-[12px] font-medium">Theme</span>
                    <Select value={theme} onValueChange={(val: any) => setTheme(val)}>
                      <SelectTrigger className="w-40 h-9 text-[12px] bg-panel border-border-v">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark" className="text-[12px]"><div className="flex items-center gap-2"><Moon size={12}/> Dark</div></SelectItem>
                        <SelectItem value="light" className="text-[12px]"><div className="flex items-center gap-2"><Sun size={12}/> Light</div></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between bg-surface/50 p-3.5 rounded-lg border border-border-v">
                    <div className="flex flex-col pr-4">
                      <span className="text-[12px] font-medium">Compact rows</span>
                      <span className="text-[11px] text-foreground/45 leading-relaxed">Fit more graphs on screen at once</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input type="checkbox" className="sr-only peer" checked={compactTableRows} onChange={(e) => setCompactTableRows(e.target.checked)} />
                      <div className="w-9 h-5 bg-foreground/20 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:bg-accent-blue"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeMenu === 'ai' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                {/* Only the controls that reach the AI actually appear here.
                    Model tier, temperature, memory limit, live telemetry and
                    web search were all present and all inert — ai-config.ts
                    even documents that the tier selector was never wired. */}
                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <Bot size={12} /> Assistant
                  </h3>

                  <div className="flex items-center justify-between bg-surface/50 p-3.5 rounded-lg border border-border-v">
                    <div className="flex flex-col pr-4">
                      <span className="text-[12px] font-medium">Language</span>
                      <span className="text-[11px] text-foreground/45">Replies from the assistant</span>
                    </div>
                    <div className="flex bg-panel rounded-lg border border-border-v p-0.5 shrink-0">
                      {(['English', 'Khmer'] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => setLanguage(lang)}
                          className={cn(
                            'px-3 py-1.5 rounded-md text-[12px] transition-colors',
                            language === lang ? 'bg-accent-blue/15 text-accent-blue font-medium' : 'text-foreground/60 hover:text-foreground',
                          )}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-surface/50 p-3.5 rounded-lg border border-border-v space-y-2.5">
                    <div className="flex flex-col">
                      <span className="text-[12px] font-medium flex items-center gap-1.5"><Key size={11} /> API key</span>
                      <span className="text-[11px] text-foreground/45 leading-relaxed">Needed only for the AI Assistant. Everything else works without it.</span>
                    </div>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Paste your API key"
                      spellCheck={false}
                      autoComplete="off"
                      className="w-full h-9 px-3 rounded-lg bg-panel border border-border-v text-[12px] font-mono text-foreground/90 placeholder:text-foreground/25 focus:outline-none focus:border-accent-blue"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <Sparkles size={12} /> Instructions
                  </h3>
                  <p className="text-[11px] text-foreground/50 leading-relaxed max-w-2xl">
                    How the assistant should interpret your data and answer questions.
                  </p>
                  <textarea
                    value={systemInstructions}
                    onChange={(e) => setSystemInstructions(e.target.value)}
                    className="w-full h-32 bg-surface/50 border border-border-v rounded-lg p-3 text-[12px] font-mono focus:outline-none focus:border-accent-blue/50 transition-colors resize-none"
                  />
                </div>
              </div>
            )}

            {activeMenu === 'about' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
                    <Info size={12} /> About
                  </h3>
                  <div className="bg-surface/50 p-4 rounded-lg border border-border-v space-y-3">
                    <div>
                      <div className="text-[14px] font-semibold text-foreground">Data Visualization Tool</div>
                      <div className="text-[11px] text-foreground/45 mt-0.5">
                        Version {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-border-v text-[11px] text-foreground/50 leading-relaxed">
                      Developed by the Performance and Analysis Office, ESS Division.
                    </div>
                  </div>
                  <div className="bg-surface/50 p-4 rounded-lg border border-border-v">
                    <div className="text-[12px] font-medium mb-1">Need help?</div>
                    <div className="text-[11px] text-foreground/50 leading-relaxed">
                      Contact your system administrator for access problems, or if a graph
                      is not appearing for your colleagues.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
