// Telegram → EMS reporting types. Ported from the standalone PA Reporting Tool
// (Telegram-to-CSV) so its parsing/export logic can run inside this app's
// "Telegram NCC Data" tab.

export interface TextEntity {
  type: string;
  text: string;
}

export interface TelegramMessage {
  id: number;
  type: string;
  date: string;
  text_entities: TextEntity[];
}

export interface EmsUnitData {
  p: number;
  q: number;
  soc: number;
}

export interface EmsRecord {
  datetime: string;
  units: Record<string, EmsUnitData>;
}

export enum ValidationStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  PASS = 'PASS',
  FAIL = 'FAIL',
}

export interface ExtractionResult {
  records: EmsRecord[];
  status: ValidationStatus;
  error?: string;
}

export interface FilterState {
  startDate: string;
  endDate: string;
  activeUnits: string[];
  minP: string;
}
