import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { WorkbookPreviewSource } from '../components/WorkbookPreview';

interface AppState {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  
  activePreview: WorkbookPreviewSource | null;
  setActivePreview: (preview: WorkbookPreviewSource | null) => void;
  
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  
  isSettingsMaximized: boolean;
  setIsSettingsMaximized: (isMaximized: boolean) => void;
  
  auditStateVersion: number;
  incrementAuditStateVersion: () => void;
  
  progress: { pct: number; active: boolean; label: string };
  setProgress: (progress: { pct: number; active: boolean; label: string }) => void;
  
  // Export state
  exportSource: string;
  setExportSource: (source: string) => void;
  
  exportFormat: string;
  setExportFormat: (format: string) => void;
  
  exportDateRange: string;
  setExportDateRange: (range: string) => void;
  
  exportAggregation: string;
  setExportAggregation: (agg: string) => void;
  
  exportFilename: string;
  setExportFilename: (name: string) => void;
  
  exportColumns: string[];
  setExportColumns: (cols: string[]) => void;
  
  exportPreviewMode: string;
  setExportPreviewMode: (mode: string) => void;
  
  showNccPCommand: boolean;
  setShowNccPCommand: (val: boolean) => void;
  
  evalDataPreview: any;
  setEvalDataPreview: (data: any) => void;

  // Global Settings States
  compactTableRows: boolean;
  setCompactTableRows: (val: boolean) => void;

  autoRefreshDashboard: boolean;
  setAutoRefreshDashboard: (val: boolean) => void;

  refreshInterval: number;
  setRefreshInterval: (val: number) => void;

  timezone: 'local' | 'utc';
  setTimezone: (val: 'local' | 'utc') => void;

  exportMetadataHeaders: boolean;
  setExportMetadataHeaders: (val: boolean) => void;

  autoExportValidation: boolean;
  setAutoExportValidation: (val: boolean) => void;

  strictValidationMode: boolean;
  setStrictValidationMode: (val: boolean) => void;

  autoRejectUnknownSignals: boolean;
  setAutoRejectUnknownSignals: (val: boolean) => void;

  warningTolerance: number;
  setWarningTolerance: (val: number) => void;

  soundAlerts: boolean;
  setSoundAlerts: (val: boolean) => void;

  showToastNotifications: boolean;
  setShowToastNotifications: (val: boolean) => void;

  aiModelTier: string;
  setAiModelTier: (val: string) => void;

  aiTemperature: number;
  setAiTemperature: (val: number) => void;

  aiMemoryLimit: string;
  setAiMemoryLimit: (val: string) => void;

  aiIncludeTelemetry: boolean;
  setAiIncludeTelemetry: (val: boolean) => void;

  aiEnableWebSearch: boolean;
  setAiEnableWebSearch: (val: boolean) => void;

  hcActiveProject: string | null;
  setHcActiveProject: (proj: string | null) => void;
  // Global RAM Cache for instant dataset access (bypasses IndexedDB)
  evalDataCache: Record<string, any>;
  setEvalDataCache: (projectId: string, data: any) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeTab: 'dashboard',
      setActiveTab: (tab) => set({ activeTab: tab, activePreview: null }),
      
      activePreview: null,
      setActivePreview: (preview) => set({ activePreview: preview }),
      
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      
      isSettingsOpen: false,
      setIsSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
      
      isSettingsMaximized: false,
      setIsSettingsMaximized: (isMaximized) => set({ isSettingsMaximized: isMaximized }),
      
      auditStateVersion: 0,
      incrementAuditStateVersion: () => set((state) => ({ auditStateVersion: state.auditStateVersion + 1 })),
      
      progress: { pct: 0, active: false, label: '' },
      setProgress: (progress) => set({ progress }),
      
      exportSource: 'Validation File Debug',
      setExportSource: (source) => set({ exportSource: source }),
      
      exportFormat: 'excel',
      setExportFormat: (format) => set({ exportFormat: format }),
      
      exportDateRange: 'Last 30 Days',
      setExportDateRange: (range) => set({ exportDateRange: range }),
      
      exportAggregation: 'raw',
      setExportAggregation: (agg) => set({ exportAggregation: agg }),
      
      exportFilename: '',
      setExportFilename: (name) => set({ exportFilename: name }),
      
      exportColumns: ['Timestamp', 'Value', 'Status', 'Device ID', 'Signal Name'],
      setExportColumns: (cols) => set({ exportColumns: cols }),
      
      exportPreviewMode: 'data',
      setExportPreviewMode: (mode) => set({ exportPreviewMode: mode }),
      
      showNccPCommand: false,
      setShowNccPCommand: (val) => set({ showNccPCommand: val }),
      
      evalDataPreview: null,
      setEvalDataPreview: (data) => set({ evalDataPreview: data }),

      evalDataCache: {},
      setEvalDataCache: (projectId, data) => set((state) => ({ 
        evalDataCache: { ...state.evalDataCache, [projectId]: data } 
      })),

      // Global Settings defaults & setters
      compactTableRows: true,
      setCompactTableRows: (val) => set({ compactTableRows: val }),

      autoRefreshDashboard: true,
      setAutoRefreshDashboard: (val) => set({ autoRefreshDashboard: val }),

      refreshInterval: 30,
      setRefreshInterval: (val) => set({ refreshInterval: val }),

      timezone: 'local',
      setTimezone: (val) => set({ timezone: val }),

      exportMetadataHeaders: true,
      setExportMetadataHeaders: (val) => set({ exportMetadataHeaders: val }),

      autoExportValidation: false,
      setAutoExportValidation: (val) => set({ autoExportValidation: val }),

      strictValidationMode: false,
      setStrictValidationMode: (val) => set({ strictValidationMode: val }),

      autoRejectUnknownSignals: false,
      setAutoRejectUnknownSignals: (val) => set({ autoRejectUnknownSignals: val }),

      warningTolerance: 15,
      setWarningTolerance: (val) => set({ warningTolerance: val }),

      soundAlerts: true,
      setSoundAlerts: (val) => set({ soundAlerts: val }),

      showToastNotifications: true,
      setShowToastNotifications: (val) => set({ showToastNotifications: val }),

      aiModelTier: 'gemini-2.5-pro',
      setAiModelTier: (val) => set({ aiModelTier: val }),

      aiTemperature: 0.7,
      setAiTemperature: (val) => set({ aiTemperature: val }),

      aiMemoryLimit: '10',
      setAiMemoryLimit: (val) => set({ aiMemoryLimit: val }),

      aiIncludeTelemetry: true,
      setAiIncludeTelemetry: (val) => set({ aiIncludeTelemetry: val }),

      aiEnableWebSearch: false,
      setAiEnableWebSearch: (val) => set({ aiEnableWebSearch: val }),

      hcActiveProject: null,
      setHcActiveProject: (proj) => set({ hcActiveProject: proj }),
    }),
    {
      name: 'ess-toolbox-storage', // name of the item in the storage (must be unique)
      version: 1, // bump version to discard old, incompatible state
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
      partialize: (state) => ({ 
        activeTab: state.activeTab,
        hcActiveProject: state.hcActiveProject,
        exportSource: state.exportSource,
        exportFormat: state.exportFormat,
        exportDateRange: state.exportDateRange,
        exportAggregation: state.exportAggregation,
        exportFilename: state.exportFilename,
        exportColumns: state.exportColumns,
        exportPreviewMode: state.exportPreviewMode,
        theme: state.theme,
        compactTableRows: state.compactTableRows,
        autoRefreshDashboard: state.autoRefreshDashboard,
        refreshInterval: state.refreshInterval,
        timezone: state.timezone,
        exportMetadataHeaders: state.exportMetadataHeaders,
        autoExportValidation: state.autoExportValidation,
        strictValidationMode: state.strictValidationMode,
        autoRejectUnknownSignals: state.autoRejectUnknownSignals,
        warningTolerance: state.warningTolerance,
        soundAlerts: state.soundAlerts,
        showToastNotifications: state.showToastNotifications,
        aiModelTier: state.aiModelTier,
        aiTemperature: state.aiTemperature,
        aiMemoryLimit: state.aiMemoryLimit,
        aiIncludeTelemetry: state.aiIncludeTelemetry,
        aiEnableWebSearch: state.aiEnableWebSearch
      }),
    }
  )
);
