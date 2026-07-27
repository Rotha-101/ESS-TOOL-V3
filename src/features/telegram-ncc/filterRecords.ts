// Shared filter predicate for parsed EMS records. Lives outside the component so
// the Daily Evaluation tab can apply the exact same filters the Telegram tab's
// XLSX/CSV export uses — keeping "Reuse NCC Data" equivalent to the
// download-then-upload round trip.

import type { EmsRecord, FilterState } from './types';

export function filterEmsRecords(records: EmsRecord[], filters: FilterState): EmsRecord[] {
  return records.filter(record => {
    const recordTs = record.datetime.replace(' ', 'T').slice(0, 16);
    if (filters.startDate && recordTs < filters.startDate) return false;
    if (filters.endDate && recordTs > filters.endDate) return false;
    if (filters.minP) {
      const limit = parseFloat(filters.minP);
      if (!isNaN(limit)) {
        const hasLoad = Object.values(record.units).some(u => Math.abs(u.p) >= limit);
        if (!hasLoad) return false;
      }
    }
    return true;
  });
}
