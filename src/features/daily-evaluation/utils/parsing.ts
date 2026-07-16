// Small pure helpers for spreadsheet parsing.

// Parse Excel date flex (Date object, Excel serial number, or date string)
export const parseFlexDate = (val: unknown) => {
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    return new Date(Math.round((val - 25569) * 86400000));
  }
  const s = String(val).trim();
  if (!s || s === 'Average' || s === 'Max' || s === 'Min') return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

// Search columns matching key (case-insensitive substring)
export const findColIdx = (headers: string[], key: string) => {
  const k = key.toLowerCase();
  return headers.findIndex(h => h.toLowerCase().includes(k));
};
