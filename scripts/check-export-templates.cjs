// Syntax gate for the portable-HTML export templates.
//
// The exported pages' JavaScript lives inside TS template literals, so
// `tsc --noEmit` cannot parse it — a broken page script ships silently and
// the exported HTML renders blank (this has happened three times: missing
// getStatusHTML, missing div2Traces, template drift). This script emits each
// template's final <script> block exactly as the browser would receive it
// (evaluating it as a real template literal with representative dummy
// injections) and syntax-checks the result.
//
// Run via `npm run lint` or directly: node scripts/check-export-templates.cjs
const fs = require('fs');
const path = require('path');

const TEMPLATES = [
  'src/features/daily-evaluation/services/htmlExportSingle.ts',
  'src/features/daily-evaluation/services/htmlExportAll.ts',
  'src/lib/portable-view-template.ts',
];

const plantSeries = JSON.stringify({ plant1: [1, 2], plant2: [1, 2], plant3: [1, 2] });
const dummies = {
  dataJson: JSON.stringify({
    timestamps: ['2026-06-21T00:00:00.000Z', '2026-06-21T00:00:01.000Z'],
    pTotal: JSON.parse(plantSeries), pPccPVS: JSON.parse(plantSeries), qBess: JSON.parse(plantSeries),
    pPV: JSON.parse(plantSeries), pBESS: JSON.parse(plantSeries), qTotal: JSON.parse(plantSeries),
    soc: JSON.parse(plantSeries), freq: JSON.parse(plantSeries), vab: JSON.parse(plantSeries),
    vbc: JSON.parse(plantSeries), vca: JSON.parse(plantSeries), cmdP: JSON.parse(plantSeries),
    cmdQ: JSON.parse(plantSeries), remoteP: JSON.parse(plantSeries), dispatchP: JSON.parse(plantSeries),
    dailyCycle: { plant1: 1, plant2: 1, plant3: 1 }, totalCycle: { plant1: 1, plant2: 1, plant3: 1 },
    avgDailyCycle: 1, avgTotalCycle: 1, dataDate: '2026-06-21',
    socStats: { plant1: { maxSoc: 95, maxIdx: 0, minSoc: 5, minIdx: 1 }, plant2: { maxSoc: 95, maxIdx: 0, minSoc: 5, minIdx: 1 }, plant3: { maxSoc: 95, maxIdx: 0, minSoc: 5, minIdx: 1 } },
    deviations: { highSOC: { pair: 'SWG01-SWG02', text: '0m 1s' }, lowSOC: { pair: 'SWG01-SWG02', text: '0m 1s' } },
    processedFiles: [],
  }),
  configJson: JSON.stringify({ showGrid: true, gridSize: 'small', showLegend: true, bgWhite: true, smooth: false, showMarkers: false, fillArea: false, lineWidths: [2, 1.6, 1.6, 1.8, 1.2], y1Min: '', y1Max: '', y2Min: '', y2Max: '', timeFrom: '00:00:00', timeTo: '23:59:59', dataResolution: 1, customTitle: '', customY1Label: '', customY2Label: '', traceVisible: [true, true, true, true, true], lineDash: ['solid', 'solid', 'solid', 'solid', 'solid'], markerSize: 5, pinSize: 8, pinBgColor: '' }),
  metricJson: '"fig4"',
  projectJson: '"SNTV"',
  plantJson: '"plant1"',
  pinnedJson: '[]',
  // TS-scope identifiers some templates interpolate directly
  getProjectPlants: () => ['plant1'],
  project: 'SNTV',
  activeMetric: 'fig4',
  selectedPlant: 'plant1',
};

let failed = false;
for (const rel of TEMPLATES) {
  const file = path.resolve(__dirname, '..', rel);
  const src = fs.readFileSync(file, 'utf8');
  const start = src.lastIndexOf('  <script>');
  const end = src.indexOf('</script>', start);
  if (start === -1 || end === -1) {
    console.error(`[export-templates] ${rel}: page <script> block not found`);
    failed = true;
    continue;
  }
  const segment = src.slice(start + '  <script>'.length, end);
  let emitted;
  try {
    const emit = new Function(...Object.keys(dummies), 'return `' + segment + '`;');
    emitted = emit(...Object.values(dummies));
  } catch (e) {
    console.error(`[export-templates] ${rel}: template emission failed -> ${e.message}`);
    failed = true;
    continue;
  }
  try {
    new Function(emitted);
    console.log(`[export-templates] OK  ${rel}`);
  } catch (e) {
    console.error(`[export-templates] SYNTAX ERROR in emitted page script of ${rel} -> ${e.message}`);
    const m = e.stack && e.stack.match(/<anonymous>:(\d+)/);
    if (m) {
      const ln = parseInt(m[1], 10);
      const lines = emitted.split('\n');
      for (let i = Math.max(0, ln - 4); i < Math.min(lines.length, ln + 2); i++) {
        console.error(`${i + 1 === ln ? '>>' : '  '} ${i + 1}: ${lines[i].slice(0, 160)}`);
      }
    }
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
