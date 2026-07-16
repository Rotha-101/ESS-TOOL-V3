// Single source of truth for project-type detection.
// "20% BESS" projects (single-plant battery projects): SNTB*, SNTV*, SNTD*,
// SNTZ*, MSGP*. Previously copy-pasted as inline startsWith chains across
// App.tsx, CycleCalculation, DailyEvaluationGraph, PowerFlowMode,
// audit-engine, exportGraphs and exportMatlab.

export const BESS_PROJECT_PREFIXES = ['SNTB', 'SNTV', 'SNTD', 'SNTZ', 'MSGP'] as const;

export const isBessProject = (project: unknown): boolean =>
  typeof project === 'string' && BESS_PROJECT_PREFIXES.some(p => project.startsWith(p));

/** Historical alias used by the export modules — same rule. */
export const is20PercentProject = isBessProject;
