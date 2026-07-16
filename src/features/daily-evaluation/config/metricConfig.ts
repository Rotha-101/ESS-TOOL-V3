import type { ActiveMetric } from '@/types/graph';
import { isBessProject } from '@/lib/project-detection';

export const getDefaultMetric = (project: string): ActiveMetric =>
  project === 'SNTL400' || project === 'SNTL600' ? 'pf_p1' : (isBessProject(project) ? 'fig4' : 'soc_p');

export const normalizeActiveMetric = (metric: unknown, project: string): ActiveMetric => {
  const allowedMetrics: ActiveMetric[] = ['f_p', 'soc_p', 'v_q', 'fig4', 'fig5', 'fig6', 'pf_p1', 'pf_p2', 'pf_p3'];
  return allowedMetrics.includes(metric as ActiveMetric) ? (metric as ActiveMetric) : getDefaultMetric(project);
};

// Figures actually offered for a given project (mirrors the export template's
// ACTIVE GRAPH option lists). The fallback branch is deliberately permissive
// (every metric) so projects outside the three known families never get a
// user-chosen figure snapped away.
export const getAvailableMetrics = (project: string): ActiveMetric[] =>
  project === 'SNTL400' ? ['pf_p1', 'pf_p2', 'fig5', 'fig6']
  : project === 'SNTL600' ? ['pf_p1', 'pf_p2', 'pf_p3', 'fig5', 'fig6']
  : isBessProject(project) ? ['fig4', 'fig5', 'fig6']
  : ['f_p', 'soc_p', 'v_q', 'fig4', 'fig5', 'fig6', 'pf_p1', 'pf_p2', 'pf_p3'];
