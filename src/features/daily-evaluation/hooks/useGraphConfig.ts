import { useState } from 'react';
import type { GraphConfig } from '@/types/graph';
import { defaultGraphConfig } from '../config/defaultGraphConfig';

// MATLAB-style per-figure graph configuration + customization drawer state.
export const useGraphConfig = (initialConfig: GraphConfig | null) => {
  const [graphConfig, setGraphConfig] = useState<GraphConfig>(
    initialConfig ? { ...initialConfig } : { ...defaultGraphConfig }
  );
  const [configTab, setConfigTab] = useState<'layout' | 'axes' | 'lines' | 'time'>('layout');
  const [showCustomization, setShowCustomization] = useState(false);

  const updateConfig = (patch: Partial<typeof defaultGraphConfig>) =>
    setGraphConfig(prev => ({ ...prev, ...patch }));

  const resetConfig = () => setGraphConfig({ ...defaultGraphConfig });

  return {
    graphConfig, setGraphConfig, updateConfig, resetConfig,
    configTab, setConfigTab, showCustomization, setShowCustomization,
  };
};
