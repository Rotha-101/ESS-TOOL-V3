import type { ActiveMetric } from '@/types/graph';
import { isBessProject } from '@/lib/project-detection';

export const getDefaultMetric = (project: string): ActiveMetric =>
  project === 'SNTL400' || project === 'SNTL600' ? 'pf_p1' : (isBessProject(project) ? 'fig4' : 'soc_p');

export const normalizeActiveMetric = (metric: unknown, project: string): ActiveMetric => {
  const allowedMetrics: ActiveMetric[] = ['f_p', 'soc_p', 'v_q', 'fig4', 'fig5', 'fig6', 'pf_p1', 'pf_p2', 'pf_p3'];
  return allowedMetrics.includes(metric as ActiveMetric) ? (metric as ActiveMetric) : getDefaultMetric(project);
};
