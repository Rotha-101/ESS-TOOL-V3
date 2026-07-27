// Parsing constants for the Telegram NCC EMS reports.

import type { FilterState } from './types';

export const SUPPORTED_UNITS = ['SWG01', 'SWG02', 'SWG03'];

/** Default filter state. Lives here (not in the component) so the store can seed
 *  itself without importing the whole TelegramNcc tree. */
export const INITIAL_FILTERS: FilterState = {
  startDate: '',
  endDate: '',
  activeUnits: SUPPORTED_UNITS,
  minP: '',
};

export const REGEX_PATTERNS = {
  TIME: /TIME:\s([\d\-: ]+)/,
  P: /P=\s*([\-0-9.]+)MW/,
  Q: /Q=\s*([\-0-9.]+)Mvar/,
  SOC: /SOC=\s*([0-9.]+)%/,
};

export const EXPORT_COLUMNS = [
  'Datetime',
  'SWG01 P(MW)',
  'SWG01 Q(MVAR)',
  'SWG01 SOC(%)',
  'SWG02 P(MW)',
  'SWG02 Q(MVAR)',
  'SWG02 SOC(%)',
  'SWG03 P(MW)',
  'SWG03 Q(MVAR)',
  'SWG03 SOC(%)',
];

/** Per-unit accent colours (hex + tailwind text class) for charts/tables. */
export const UNIT_COLORS: Record<string, { hex: string; text: string; dot: string }> = {
  SWG01: { hex: '#3b82f6', text: 'text-blue-500 dark:text-blue-400', dot: 'bg-blue-500' },
  SWG02: { hex: '#06b6d4', text: 'text-cyan-500 dark:text-cyan-400', dot: 'bg-cyan-500' },
  SWG03: { hex: '#f59e0b', text: 'text-amber-500 dark:text-amber-400', dot: 'bg-amber-500' },
};
