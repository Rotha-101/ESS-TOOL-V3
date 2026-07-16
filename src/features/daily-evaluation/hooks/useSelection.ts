import { useEffect, useState } from 'react';
import type { PlantKey } from '@/types/eval-data';
import type { ActiveMetric } from '@/types/graph';
import { getAvailableMetrics, getDefaultMetric, normalizeActiveMetric } from '../config/metricConfig';

// Plant + figure selection. In AI-agent mode the plant is proxied to the
// parent (externalPlant/onPlantChange) and initial values come from the
// imported graph snapshot.
export const useSelection = ({ project, isAIAgentMode, importedGraph, externalPlant, onPlantChange }: {
  project: string;
  isAIAgentMode: boolean;
  importedGraph: any;
  externalPlant?: PlantKey;
  onPlantChange?: (plant: PlantKey) => void;
}) => {
  const [localPlant, setLocalPlant] = useState<PlantKey>(
    isAIAgentMode && importedGraph ? importedGraph.selectedPlant : 'plant1'
  );
  const selectedPlant = isAIAgentMode && externalPlant ? externalPlant : localPlant;
  const setSelectedPlant = isAIAgentMode && onPlantChange ? onPlantChange : setLocalPlant;

  const [activeMetric, setActiveMetric] = useState<ActiveMetric>(
    isAIAgentMode && importedGraph ? normalizeActiveMetric(importedGraph.activeMetric, project) : getDefaultMetric(project)
  );

  // Ensure selectedPlant is valid for the current project
  useEffect(() => {
    if (project === 'SNTL400' && selectedPlant === 'plant3') {
      setSelectedPlant('plant1');
    }
  }, [project, selectedPlant]);

  // Ensure the figure is valid for the current project: switching projects
  // used to keep the previous project's metric (e.g. pf_p1 carried from an
  // SNTL project into a 20% BESS project), which then leaked into HTML
  // exports as an unrenderable initial figure.
  useEffect(() => {
    if (!getAvailableMetrics(project).includes(activeMetric)) {
      setActiveMetric(getDefaultMetric(project));
    }
  }, [project, activeMetric]);

  return { selectedPlant, setSelectedPlant, activeMetric, setActiveMetric };
};
