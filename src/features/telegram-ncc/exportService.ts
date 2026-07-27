// XLSX / CSV export for parsed EMS records. Ported from the PA Reporting Tool;
// uses the same `xlsx` package the rest of this app already depends on.

import * as XLSX from 'xlsx';
import type { EmsRecord } from './types';
import { EXPORT_COLUMNS, SUPPORTED_UNITS } from './constants';

export class ExportService {
  /** Flatten records into rows aligned with EXPORT_COLUMNS. */
  private static prepareData(records: EmsRecord[]) {
    return records.map(record => {
      const row: any[] = [record.datetime];
      SUPPORTED_UNITS.forEach(unit => {
        const data = record.units[unit];
        row.push(data.p, data.q, data.soc);
      });
      return row;
    });
  }

  static downloadXLSX(records: EmsRecord[], fileName = 'EMS_Report') {
    const worksheetData = [EXPORT_COLUMNS, ...this.prepareData(records)];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'Operational Data');
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  }

  static downloadCSV(records: EmsRecord[], fileName = 'EMS_Report') {
    const worksheetData = [EXPORT_COLUMNS, ...this.prepareData(records)];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const csvContent = XLSX.utils.sheet_to_csv(ws);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
