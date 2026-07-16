// ---------- Data-date extraction ----------
// Extract the telemetry date from a file path/name. Recognized patterns:
//   YYYY-MM-DD          (e.g. ..._2026-05-01_...)
//   YYYYMMDDHHMMSS      (e.g. ..._20260501000000_...)
//   DD-Mon-YYYY         (e.g. .../PLANT#01_01-May-2026/...)
// Returns "YYYY-MM-DD" or null.
const _MON: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
function _validDate(y: number, mo: number, d: number) { return y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31; }
function _fmt(y: number, mo: number, d: number) { return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

export function extractDataDate(path: string, fileName: string): string | null {
  for (const s of [fileName, path]) {
    let m = s.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
    if (m && _validDate(+m[1], +m[2], +m[3])) return _fmt(+m[1], +m[2], +m[3]);
    m = s.match(/(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(20\d{2})/i);
    if (m) {
      const mo = _MON[m[2].toLowerCase()];
      if (mo && _validDate(+m[3], mo, +m[1])) return _fmt(+m[3], mo, +m[1]);
    }
    m = s.match(/(?:^|[_\W])(20\d{2})(\d{2})(\d{2})\d{6}(?:[_\W]|$)/);
    if (m && _validDate(+m[1], +m[2], +m[3])) return _fmt(+m[1], +m[2], +m[3]);
  }
  return null;
}
