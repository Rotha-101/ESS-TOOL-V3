import React, { useRef } from 'react';
import Plot from 'react-plotly.js';
import type { Config } from 'plotly.js';
import { Database } from 'lucide-react';
import { DraggableOverlay } from '@/components/DraggableOverlay';
import { getProjectPlants } from '@/lib/project-utils';
import { is20PercentProject } from '@/lib/project-detection';
import { getStatusJSX } from '../utils/status';
import type { EvalData, PlantKey } from '@/types/eval-data';
import type { ActiveMetric, GraphConfig, PinnedPoint } from '@/types/graph';

export interface GraphPanelsProps {
  evalData: EvalData | null;
  graphConfig: GraphConfig;
  pinnedPoints: PinnedPoint[];
  project: string;
  selectedPlant: PlantKey;
  activeMetric: ActiveMetric;
  showNccPCommand: boolean;
  theme: 'dark' | 'light';
  handleHover: (event: any, graphId: string) => void;
  handleUnhover: () => void;
  handleRelayout: (event: any, graphId: string) => void;
  handleClickAnnotation: (event: any, graphId: string) => void;
}

// All Plotly panel construction for the daily-evaluation figures, moved
// verbatim from DailyEvaluationGraph.tsx (the former renderPlot closure).
// React.memo: the panels re-render only when graph inputs change, not on
// unrelated parent state churn (parse progress ticks, drawer toggles, ...).
export const GraphPanels = React.memo(function GraphPanels({
  evalData, graphConfig, pinnedPoints, project, selectedPlant, activeMetric,
  showNccPCommand, theme,
  handleHover, handleUnhover, handleRelayout, handleClickAnnotation,
}: GraphPanelsProps) {
  const filterCache = useRef(new WeakMap());
  const lastTimeHash = useRef('');

  // Per-source-array caches so the O(86,400)-per-trace work (hover rounding,
  // has-data scans, Vavg derivation, step-signal decimation) runs once per
  // dataset instead of on every render/figure switch. Keys are the source
  // arrays themselves: a new dataset means new arrays, so stale entries are
  // simply garbage-collected. Results are pure functions of the keyed array,
  // so cached values are byte-identical to what the inline code produced.
  const roundCache = useRef(new WeakMap<any[], Map<number, any[]>>());
  const roundArrCached = (arr: any[], decimals: number) => {
    let byDec = roundCache.current.get(arr);
    if (!byDec) { byDec = new Map(); roundCache.current.set(arr, byDec); }
    let out = byDec.get(decimals);
    if (!out) {
      out = arr.map(v => (v != null && typeof v === 'number' && !isNaN(v)) ? Number(v.toFixed(decimals)) : v);
      byDec.set(decimals, out);
    }
    return out;
  };
  const hasDataCache = useRef(new WeakMap<any[], boolean>());
  const hasValidDataCached = (arr: any[]) => {
    let v = hasDataCache.current.get(arr);
    if (v === undefined) {
      v = arr.some((x) => x != null && !isNaN(x));
      hasDataCache.current.set(arr, v);
    }
    return v;
  };
  const vavgCache = useRef(new WeakMap<any[], any[]>());
  const decimateCache = useRef(new WeakMap<any[], { srcX: any[]; dx: any[]; dy: any[] }>());

  const renderPlot = () => {
    // Large, beautiful glassmorphic Empty State Dropzone when no data is loaded
    if (!evalData) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-surface/30 p-8 text-center select-none text-foreground/40 font-mono">
          <Database size={48} className="opacity-20 mb-4" />
          <div className="text-sm font-bold uppercase tracking-widest text-foreground/50 mb-2">Awaiting Telemetry Data</div>
          <div className="text-[10px] max-w-sm">Use the "Drop Data Folder" panel on the left to ingest your SNTL 600 telemetry data, or click "Reuse Validation Tab Data" to plot previously uploaded files.</div>
        </div>
      );
    }

    const isDarkMode = theme === 'dark';
    const pKey = selectedPlant;
    const is20PercentRaw = ['SNTB', 'SNTV', 'SNTZ', 'SNTX', 'SNTD', 'DMF', 'MSGP'].some(p => project.startsWith(p));
    const getVTraces = (data: any, pk: string) => {
      if (is20PercentRaw) {
        let vavg = data.vab?.[pk] ? vavgCache.current.get(data.vab[pk]) : undefined;
        if (data.vab?.[pk] && !vavg) {
          vavg = data.vab[pk].map((v: number, i: number) => {
            if (v == null || isNaN(v)) return NaN;
            const v2 = data.vbc?.[pk]?.[i];
            const v3 = data.vca?.[pk]?.[i];
            if (v2 == null || isNaN(v2) || v3 == null || isNaN(v3)) return NaN;
            return (v + v2 + v3) / 3;
          });
          vavgCache.current.set(data.vab[pk], vavg!);
        }
        return [
          applyTrace({ x: filteredTimeX, y: vavg, type: 'scattergl', mode: 'lines', name: 'Vavg (kV)', line: { color: '#0072BD', width: 1.2 } }, 0)
        ];
      }
      return [
        applyTrace({ x: filteredTimeX, y: data.vab?.[pk], type: 'scattergl', mode: 'lines', name: 'Vab', line: { color: '#0072BD', width: 1.2 } }, 0),
        applyTrace({ x: filteredTimeX, y: data.vbc?.[pk], type: 'scattergl', mode: 'lines', name: 'Vbc', line: { color: '#77AC30', width: 1.2 } }, 0),
        applyTrace({ x: filteredTimeX, y: data.vca?.[pk], type: 'scattergl', mode: 'lines', name: 'Vca', line: { color: '#7E2F8E', width: 1.2 } }, 0)
      ];
    };

    // Time array string for X-axis labels
    // Cache timeX string conversion
    let timeX = [];
    if (filterCache.current.has(evalData.timestamps)) {
      timeX = filterCache.current.get(evalData.timestamps);
    } else {
      timeX = evalData.timestamps.map((t: Date) => {
        const d = new Date(t);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
      });
      filterCache.current.set(evalData.timestamps, timeX);
    }

    // Helper: format Date to full report timestamp tip (e.g. May 15, 2026, 14:41:14)
    const formatFullTime = (d: Date) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      const day = d.getDate();
      const year = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${month} ${day}, ${year}, ${hh}:${mm}:${ss}`;
    };

    // Helper: filter timeX & data arrays by graphConfig.timeFrom / timeTo
    const currentTimeHash = `${graphConfig.timeFrom}_${graphConfig.timeTo}_${graphConfig.dataResolution}`;
    if (lastTimeHash.current !== currentTimeHash) {
      filterCache.current = new WeakMap();
      lastTimeHash.current = currentTimeHash;
    }

    const applyTimeRange = (dataArr: any[]) => {
      if (!dataArr) return [];
      if (!graphConfig.timeFrom && !graphConfig.timeTo && (!graphConfig.dataResolution || graphConfig.dataResolution <= 1)) return dataArr;

      if (typeof dataArr === 'object' && filterCache.current.has(dataArr)) {
        return filterCache.current.get(dataArr);
      }

      const toSeconds = (t: string) => {
        const [h, m, s] = t.split(':').map(Number);
        return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
      };
      const fromSec = toSeconds(graphConfig.timeFrom || '00:00:00');
      const toSec = toSeconds(graphConfig.timeTo || '23:59:59');
      let sliced = dataArr.slice(fromSec, toSec + 1);
      const step = graphConfig.dataResolution || 1;
      let result = sliced;
      if (step > 1) {
        result = sliced.filter((_, i) => i % step === 0);
      }

      if (typeof dataArr === 'object') {
        filterCache.current.set(dataArr, result);
      }
      return result;
    };

    const filteredTimeX = applyTimeRange(timeX);
    const filterArr = (arr: any[]) => applyTimeRange(arr);

    // Helper: apply graphConfig to a trace object
    const applyTrace = (trace: any, idx: number): any => {
      const lw = graphConfig.lineWidths[idx] ?? 1.5;
      let dash = trace.line?.dash ?? graphConfig.lineDash[idx] ?? 'solid';
      if (trace.name && (trace.name.includes('command from NCC'))) dash = 'dot';

      const visible = graphConfig.traceVisible[idx] !== false;
      let mode = graphConfig.showMarkers ? 'lines+markers' : 'lines';
      let connectGaps = trace.connectgaps;

      if (trace.name) {
        const tName = trace.name.toLowerCase();
        if (!tName.includes('command') && (tName.includes('p ') || tName.startsWith('p ') || tName.includes('active power') ||
          tName.includes('q ') || tName.startsWith('q ') || tName.includes('reactive power') ||
          tName.includes('q total') || tName.includes('q (bess)'))) {
          dash = 'solid';
          mode = 'lines';
          connectGaps = true;
        }
      }

      const isNoData = trace.name && trace.name.includes('(No Data)');
      const hasValidData = trace.y && (Array.isArray(trace.y) ? hasValidDataCached(trace.y) : trace.y.some((v: any) => v != null && !isNaN(v)));
      const hideLegend = isNoData || !hasValidData;
      let newY = trace.y;
      let hoverTpl = trace.hovertemplate;
      if (trace.name && newY && Array.isArray(newY)) {
        const tName = trace.name.toLowerCase();
        if (tName.includes('soc')) {
          newY = roundArrCached(newY, 1);
          hoverTpl = '(%{x}, %{y:.1f})';
        } else if (tName.includes('p ') || tName.startsWith('p ') || tName.includes('active power') || tName.includes('q ') || tName.startsWith('q ') || tName.includes('reactive power') || tName.includes('q total') || tName.includes('q (bess)')) {
          newY = roundArrCached(newY, 2);
          hoverTpl = '(%{x}, %{y:.2f})';
        }
      }

      let finalY = filterArr(newY);
      let finalX = filteredTimeX;

      // Decimate points for command signals to fix Plotly dash rendering bug on dense data
      if (trace.name && (trace.name.includes('command from NCC') || trace.name.includes('Remote Active Power')) && finalY && finalY.length > 0) {
        const cached = decimateCache.current.get(finalY);
        if (cached && cached.srcX === finalX) {
          finalX = cached.dx;
          finalY = cached.dy;
        } else {
          const decY = [];
          const decX = [];
          let lastY = undefined;
          for (let i = 0; i < finalY.length; i++) {
              const val = finalY[i];
              const bothNaN = typeof val === 'number' && typeof lastY === 'number' && isNaN(val) && isNaN(lastY);
              if (i === 0 || i === finalY.length - 1 || (!bothNaN && val !== lastY)) {
                  decY.push(val);
                  decX.push(finalX[i]);
                  lastY = val;
              }
          }
          decimateCache.current.set(finalY, { srcX: finalX, dx: decX, dy: decY });
          finalY = decY;
          finalX = decX;
        }
      }

      return {
        ...trace,
        ...(connectGaps !== undefined ? { connectgaps: connectGaps } : {}),
        x: finalX,
        y: finalY,
        ...(hoverTpl || trace.hovertemplate ? { hovertemplate: hoverTpl || trace.hovertemplate } : {}),
        visible: visible ? (trace.visible !== undefined ? trace.visible : true) : 'legendonly',
        showlegend: hideLegend ? false : (trace.showlegend !== undefined ? trace.showlegend : true),
        mode: mode as any,
        line: {
          ...trace.line,
          width: lw,
          dash: dash,
          shape: graphConfig.smooth ? 'spline' : (trace.line?.shape ?? 'linear'),
        },
        ...(graphConfig.showMarkers ? { marker: { size: graphConfig.markerSize, ...(trace.marker || {}) } } : {}),
        ...(graphConfig.fillArea && !trace.yaxis ? { fill: 'tozeroy', fillcolor: (trace.line?.color ?? '#0072BD') + '22' } : {}),
      };
    };

    // Shared MATLAB Layout styler â€” now driven by graphConfig
    const getCycleAnnotations = (pk: 'plant1' | 'plant2' | 'plant3') => {
      if (!evalData || !evalData.hasCycleData || !evalData.dailyCycle || !evalData.totalCycle || typeof evalData.dailyCycle[pk] !== 'number') return [];
      return [{
        x: 0.99, y: 0.95,
        xref: 'paper', yref: 'paper',
        xanchor: 'right', yanchor: 'top',
        text: 'Daily cycle (' + (evalData.dataDate || 'N/A') + '):<br>  Cycle Plant Avg = ' + (evalData.dailyCycle[pk]?.toFixed(3) || '0.000') + '<br><br>Total cycle:<br>  Total Plant Avg = ' + (evalData.totalCycle[pk]?.toFixed(3) || '0.000'),
        showarrow: false,
        bgcolor: graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e',
        bordercolor: graphConfig.bgWhite ? '#000000' : '#E0E0E0',
        font: { size: 10, color: graphConfig.bgWhite ? '#000000' : '#E0E0E0', family: 'Helvetica, Arial, sans-serif' },
        align: 'left',
        borderpad: 4
      }];
    };

    const getMATLABLayout = (title: string, y1Title: string, y2Title: string, y2Range?: [number, number], y1Range?: [number, number], uiRev?: string): any => {
      const resolvedTitle = graphConfig.customTitle || title;
      const resolvedY1 = graphConfig.customY1Label || y1Title;
      const resolvedY2 = graphConfig.customY2Label || y2Title;
      const bg = graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e';
      const fontColor = graphConfig.bgWhite ? '#000000' : '#E0E0E0';
      const gridColor = graphConfig.bgWhite ? '#E5E5E5' : 'rgba(255,255,255,0.16)';
      const axisColor = graphConfig.bgWhite ? '#151515' : '#888888';

      // User-set range overrides from Axes tab (take priority over everything)
      let resolvedY1Range: [number, number] | undefined = y1Range;
      if (graphConfig.y1Min !== '' && graphConfig.y1Max !== '') {
        const mn = parseFloat(graphConfig.y1Min);
        const mx = parseFloat(graphConfig.y1Max);
        if (!isNaN(mn) && !isNaN(mx)) resolvedY1Range = [mn, mx];
      }
      let resolvedY2Range: [number, number] | undefined = y2Range;
      if (graphConfig.y2Min !== '' && graphConfig.y2Max !== '') {
        const mn = parseFloat(graphConfig.y2Min);
        const mx = parseFloat(graphConfig.y2Max);
        if (!isNaN(mn) && !isNaN(mx)) resolvedY2Range = [mn, mx];
      }

      // Build pinned annotations for this layout
      const annotations = pinnedPoints
        .filter(pt => pt.graphId === uiRev)
        .map((pt, i) => ({
          x: pt.x, y: pt.y, yref: pt.yref as any, xref: 'x' as const, axref: 'pixel', ayref: 'pixel', cliponaxis: false, text: pt.text,
          showarrow: true, arrowhead: 2, arrowcolor: pt.color, arrowsize: 1, arrowwidth: 1.5,
          ax: pt.ax, ay: pt.ay,
          bgcolor: graphConfig.pinBgColor || (graphConfig.bgWhite ? 'rgba(255,255,255,0.94)' : 'rgba(20,20,40,0.94)'),
          bordercolor: pt.color, borderwidth: 1.5, borderpad: 4, opacity: 0.97,
          font: { family: 'Arial, sans-serif', size: graphConfig.pinSize || 8, color: graphConfig.pinBgColor ? '#111111' : (graphConfig.bgWhite ? '#111111' : '#E0E0E0') },
          captureevents: true,
        }));

      return {
        // uirevision: keeps zoom/pan state across React re-renders.
        // Only changes when figure/plant/time filter changes â€” not when toggling grid/legend etc.
        uirevision: uiRev ?? `${activeMetric}_${selectedPlant}_${graphConfig.timeFrom}_${graphConfig.timeTo}`,
        dragmode: 'zoom' as const,
        title: {
          text: `<b>${resolvedTitle}</b>`,
          font: { family: 'Helvetica, Arial, sans-serif', size: 12, color: fontColor },
          x: 0.5, y: 0.98,
          xanchor: 'center' as const,
          yanchor: 'top' as const
        },
        autosize: true,
        // Fixed margins sized for the rotated HH:MM:SS tick labels and axis
        // titles. automargin is intentionally NOT used: it re-measures labels
        // after the first paint and re-layouts the visible plot (the "settling
        // animation" on figure switches) at the cost of extra full redraws.
        margin: { t: 50, r: 55, l: 55, b: 62 },
        modebar: { orientation: 'h' },
        hovermode: 'closest',
        paper_bgcolor: bg,
        plot_bgcolor: bg,
        font: { family: 'Helvetica, Arial, sans-serif', size: 10, color: fontColor },
        xaxis: {
          type: 'category' as const,
          showgrid: graphConfig.showGrid,
          gridcolor: gridColor,
          gridwidth: 1,
          linecolor: axisColor,
          linewidth: 1.2,
          mirror: true,
          tickangle: -45,
          tickfont: { color: fontColor, size: 9 },
          nticks: graphConfig.gridSize === 'small' ? 49 : graphConfig.gridSize === 'large' ? 13 : graphConfig.gridSize === 'xlarge' ? 7 : 25,
          fixedrange: false,
          rangeslider: { visible: false },
        },
        yaxis: {
          title: { text: `<b>${resolvedY1}</b>`, font: { color: '#0072BD', size: 10 } },
          tickfont: { color: '#0072BD', size: 9 },
          showgrid: graphConfig.showGrid,
          ...(graphConfig.gridSize !== 'medium' && { nticks: graphConfig.gridSize === 'small' ? 20 : graphConfig.gridSize === 'large' ? 5 : 3 }),
          gridcolor: gridColor,
          gridwidth: 1,
          linecolor: axisColor,
          linewidth: 1.2,
          mirror: true,
          zeroline: false,
          fixedrange: true,
          // autorange when no override â€” lets both axes zoom together
          ...(resolvedY1Range ? { range: resolvedY1Range } : { autorange: true }),
        },
        ...(y2Title ? {
          yaxis2: {
            title: { text: `<b>${resolvedY2}</b>`, font: { color: '#D95319', size: 10 } },
            tickfont: { color: '#D95319', size: 9 },
            overlaying: 'y' as const,
            side: 'right' as const,
            showgrid: false,
            zeroline: false,
            fixedrange: true,
            ...(resolvedY2Range ? { range: resolvedY2Range } : { autorange: true }),
          }
        } : {}),
        showlegend: graphConfig.showLegend,
        legend: {
          x: 0.01, y: 0.99,
          xanchor: 'left' as const,
          yanchor: 'top' as const,
          bgcolor: graphConfig.bgWhite ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,40,0.85)',
          bordercolor: axisColor,
          borderwidth: 1,
          font: { size: 9, color: fontColor }
        },
        annotations,
      };
    };

    // Shared plot config with zoom enabled
    const plotCfgZoom: Partial<Config> = {
      displayModeBar: true,
      modeBarButtonsToRemove: ['select2d', 'lasso2d'] as any[],
      displaylogo: false,
      edits: { legendPosition: true, annotationPosition: true, annotationTail: true },
      scrollZoom: true,
      doubleClick: false as any,   // disable double-click reset (we use it for pins)
      toImageButtonOptions: { format: 'png' as const, filename: `plot_${activeMetric}_${selectedPlant}`, scale: 2 },
    };

    if (activeMetric === 'f_p') {
      const isBessProject = is20PercentProject(project);
      const hasPlant2 = (evalData.pTotal.plant2 && evalData.pTotal.plant2.some(v => !isNaN(v))) || (evalData.soc.plant2 && evalData.soc.plant2.some(v => !isNaN(v)));
      const hasPlant3 = !isBessProject && project !== 'SNTL400' && evalData.soc.plant3 && evalData.soc.plant3.some(v => !isNaN(v));
      const drawPanel1 = (pk: 'plant1' | 'plant2' | 'plant3', title: string) => (
        <div className="h-[280px] w-full relative mb-1" key={pk}>
          <Plot
            data={[
              applyTrace({ x: filteredTimeX, y: evalData.pTotal?.[pk], type: 'scattergl', mode: 'lines', name: 'P (POC) (MW)', line: { color: '#0072BD', width: 2 } }, 0),
              applyTrace({ x: filteredTimeX, y: evalData.freq?.[pk], type: 'scattergl', mode: 'lines', name: 'Frequency', yaxis: 'y2', line: { color: '#D95319', width: 1.5 } }, 1),
            ]}
            layout={getMATLABLayout(title, 'P (MW)', 'F (Hz)', undefined, undefined, `f_p_${pk}`)}
            useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `f_p_${pk}`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `f_p_${pk}`)} onClickAnnotation={(e) => handleClickAnnotation(e, `f_p_${pk}`)}
          />
        </div>
      );
      return (
        <div className="flex flex-col w-full h-full overflow-y-auto pt-2" style={{ background: graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e' }}>
          <div className="text-center text-[13px] tracking-wider mb-0 mt-0 font-sans" style={{ color: graphConfig.bgWhite ? '#000000' : '#E0E0E0' }}>
            <b>{evalData.dataDate} | Frequency & Active Power (All Plants)</b>
          </div>
          {drawPanel1('plant1', evalData.dataDate + ' | SWG01 (Plant 01) | Frequency & Active Power')}
          {hasPlant2 && drawPanel1('plant2', evalData.dataDate + ' | SWG02 (Plant 02) | Frequency & Active Power')}
          {hasPlant3 && drawPanel1('plant3', evalData.dataDate + ' | SWG03 (Plant 03) | Frequency & Active Power')}
        </div>
      );
    }

    if (activeMetric === 'soc_p') {
      const isBessProject = is20PercentProject(project);
      const hasPlant2 = (evalData.pTotal.plant2 && evalData.pTotal.plant2.some(v => !isNaN(v))) || (evalData.soc.plant2 && evalData.soc.plant2.some(v => !isNaN(v)));
      const hasPlant3 = !isBessProject && project !== 'SNTL400' && evalData.soc.plant3 && evalData.soc.plant3.some(v => !isNaN(v));
      const drawPanel2 = (pk: 'plant1' | 'plant2' | 'plant3', title: string) => (
        <div className="h-[280px] w-full relative mb-1" key={pk}>
          <Plot
            data={[
              applyTrace({ x: filteredTimeX, y: evalData.pPccPVS?.[pk]?.some((v) => v != null && !isNaN(v) && Math.abs(Number(v)) > 0.001) ? evalData.pPccPVS?.[pk] : evalData.pTotal?.[pk], type: 'scattergl', mode: 'lines', name: 'P (POC) (MW)', line: { color: '#0072BD', width: 2 } }, 0),
              applyTrace({ x: filteredTimeX, y: evalData.pPV?.[pk], type: 'scattergl', mode: 'lines', name: 'P (PV) (MW)', showlegend: Boolean(evalData.pPV?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#EDB120', width: 2 } }, 10),
              applyTrace({ x: filteredTimeX, y: evalData.pBESS?.[pk], type: 'scattergl', mode: 'lines', name: 'P (BESS) (MW)', showlegend: Boolean(evalData.pBESS?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#77AC30', width: 2 } }, 11),
              applyTrace({ x: filteredTimeX, y: evalData.cmdP?.[pk], type: 'scatter', mode: 'lines', name: 'P command from NCC', visible: (project === 'SNTL400' || project === 'SNTL600') ? showNccPCommand : true, showlegend: Boolean(evalData.cmdP?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#008000', width: 1.6, shape: 'hv', dash: 'dot' } }, 3),
              applyTrace({ x: filteredTimeX, y: evalData.remoteP?.[pk], type: 'scatter', mode: 'lines', connectgaps: true, name: 'Remote Active Power', visible: (project === 'SNTL400' || project === 'SNTL600') ? !showNccPCommand : true, showlegend: Boolean(evalData.remoteP?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#9966cc', width: 1.6, dash: 'dot', shape: 'hv' } }, 4),
              applyTrace({ x: filteredTimeX, y: evalData.soc?.[pk], type: 'scattergl', mode: 'lines', name: 'SOC', yaxis: 'y2', line: { color: '#D95319', width: 2 } }, 5),
            ]}
            layout={getMATLABLayout(title, 'P (MW)', 'SOC (%)', undefined, undefined, `soc_p_${pk}`)}
            useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `soc_p_${pk}`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `soc_p_${pk}`)} onClickAnnotation={(e) => handleClickAnnotation(e, `soc_p_${pk}`)}
          />
        </div>
      );
      return (
        <div className="flex flex-col w-full h-full overflow-y-auto pt-2" style={{ background: graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e' }}>
          <div className="text-center text-[13px] tracking-wider mb-0 mt-0 font-sans" style={{ color: graphConfig.bgWhite ? '#000000' : '#E0E0E0' }}>
            <b>{evalData.dataDate} | SOC & Active Power (All Plants)</b>
          </div>
          {drawPanel2('plant1', evalData.dataDate + ' | SWG01 (Plant 01) | SOC & Active Power')}
          {hasPlant2 && drawPanel2('plant2', evalData.dataDate + ' | SWG02 (Plant 02) | SOC & Active Power')}
          {hasPlant3 && drawPanel2('plant3', evalData.dataDate + ' | SWG03 (Plant 03) | SOC & Active Power')}
        </div>
      );
    }

    if (activeMetric === 'v_q') {
      const isBessProject = is20PercentProject(project);
      const hasPlant2 = (evalData.pTotal.plant2 && evalData.pTotal.plant2.some(v => !isNaN(v))) || (evalData.soc.plant2 && evalData.soc.plant2.some(v => !isNaN(v)));
      const hasPlant3 = !isBessProject && project !== 'SNTL400' && evalData.soc.plant3 && evalData.soc.plant3.some(v => !isNaN(v));
      const drawPanel3 = (pk: 'plant1' | 'plant2' | 'plant3', title: string) => (
        <div className="h-[280px] w-full relative mb-1" key={pk}>
          <Plot
            data={[
              ...getVTraces(evalData, pk),
              applyTrace({ x: filteredTimeX, y: evalData.qTotal?.[pk], type: 'scattergl', mode: 'lines', name: 'Q total', yaxis: 'y2', line: { color: '#D95319', width: 1.3 } }, 3),
              applyTrace({ x: filteredTimeX, y: ((!['SNTV', 'SNTZ'].includes(project) && evalData.qBess?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001) && evalData.pBESS?.[pk]?.some(v => !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001))) ? evalData.qBess?.[pk] : [], type: 'scattergl', mode: 'lines', name: 'Q (BESS) (MVar)', showlegend: Boolean((!['SNTV', 'SNTZ'].includes(project) && evalData.qBess?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001) && evalData.pBESS?.[pk]?.some(v => !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001))), yaxis: 'y2', line: { color: '#000000', width: 1.4 } }, 10),
              applyTrace({ x: filteredTimeX, y: evalData.cmdQ?.[pk]?.map((v) => v === 0 ? null : v), type: 'scatter', mode: 'lines', name: 'Q command from NCC', showlegend: Boolean(evalData.cmdQ?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), yaxis: 'y2', line: { color: '#000000', width: 1.6, shape: 'hv', dash: 'dot' } }, 4),
            ]}
            layout={getMATLABLayout(title, 'V (kV)', 'Q (MVar)', [-30, 30], [20, 25.6], `v_q_${pk}`)}
            useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `v_q_${pk}`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `v_q_${pk}`)} onClickAnnotation={(e) => handleClickAnnotation(e, `v_q_${pk}`)}
          />
        </div>
      );
      return (
        <div className="flex flex-col w-full h-full overflow-y-auto pt-2" style={{ background: graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e' }}>
          <div className="text-center text-[13px] tracking-wider mb-0 mt-0 font-sans" style={{ color: graphConfig.bgWhite ? '#000000' : '#E0E0E0' }}>
            <b>{evalData.dataDate} | Reactive Power & Voltage (All Plants)</b>
          </div>
          {drawPanel3('plant1', evalData.dataDate + ' | SWG01 (Plant 01) | Reactive Power & Voltage')}
          {hasPlant2 && drawPanel3('plant2', evalData.dataDate + ' | SWG02 (Plant 02) | Reactive Power & Voltage')}
          {hasPlant3 && drawPanel3('plant3', evalData.dataDate + ' | SWG03 (Plant 03) | Reactive Power & Voltage')}
        </div>
      );
    }
    if (activeMetric === 'pf_p1' || activeMetric === 'pf_p2' || activeMetric === 'pf_p3') {
      const pk = activeMetric === 'pf_p1' ? 'plant1' : activeMetric === 'pf_p2' ? 'plant2' : 'plant3';
      const title = evalData.dataDate + ' | ' + (activeMetric === 'pf_p1' ? 'SWG01 (Plant 01)' : activeMetric === 'pf_p2' ? 'SWG02 (Plant 02)' : 'SWG03 (Plant 03)');

      const drawPanelPF = (pk: 'plant1' | 'plant2' | 'plant3', title: string) => (
        <div className="flex flex-col w-full border-b-[3px] border-border-v/50 pb-4 mb-4" key={pk}>
          <div className="h-[280px] w-full relative mb-1">
            <Plot
              data={[
                applyTrace({ x: filteredTimeX, y: evalData.pTotal?.[pk], type: 'scattergl', mode: 'lines', name: 'P (POC) (MW)', line: { color: '#0072BD', width: 2 } }, 0),
                applyTrace({ x: filteredTimeX, y: evalData.freq?.[pk], type: 'scattergl', mode: 'lines', name: 'Frequency', yaxis: 'y2', line: { color: '#D95319', width: 1.5 } }, 1),
              ]}
              layout={getMATLABLayout('Frequency & Active Power', 'P (MW)', 'F (Hz)', undefined, undefined, `pf_${pk}_fp`)}
              useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `pf_${pk}_fp`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `pf_${pk}_fp`)} onClickAnnotation={(e) => handleClickAnnotation(e, `pf_${pk}_fp`)}
            />
          </div>
          <div className="h-[280px] w-full relative mb-1">
            <Plot
              data={[
                applyTrace({ x: filteredTimeX, y: evalData.pPccPVS?.[pk]?.some((v) => v != null && !isNaN(v) && Math.abs(Number(v)) > 0.001) ? evalData.pPccPVS?.[pk] : evalData.pTotal?.[pk], type: 'scattergl', mode: 'lines', name: 'P (POC) (MW)', line: { color: '#0072BD', width: 1.2 } }, 0),
                applyTrace({ x: filteredTimeX, y: evalData.pPV?.[pk], type: 'scattergl', mode: 'lines', name: 'P (PV) (MW)', showlegend: Boolean(evalData.pPV?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#EDB120', width: 2 } }, 10),
                applyTrace({ x: filteredTimeX, y: evalData.pBESS?.[pk], type: 'scattergl', mode: 'lines', name: 'P (BESS) (MW)', showlegend: Boolean(evalData.pBESS?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#77AC30', width: 2 } }, 11),
                applyTrace({ x: filteredTimeX, y: evalData.cmdP?.[pk], type: 'scatter', mode: 'lines', name: 'P command from NCC', visible: (project === 'SNTL400' || project === 'SNTL600') ? showNccPCommand : true, showlegend: Boolean(evalData.cmdP?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#008000', width: 1.6, shape: 'hv', dash: 'dot' } }, 1),
                applyTrace({ x: filteredTimeX, y: evalData.remoteP?.[pk], type: 'scatter', mode: 'lines', connectgaps: true, name: 'Remote Active Power', visible: (project === 'SNTL400' || project === 'SNTL600') ? !showNccPCommand : true, showlegend: Boolean(evalData.remoteP?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#9966cc', width: 1.6, dash: 'dot', shape: 'hv' } }, 2),
                applyTrace({ x: filteredTimeX, y: evalData.soc?.[pk], type: 'scattergl', mode: 'lines', name: 'SOC', yaxis: 'y2', line: { color: '#D95319', width: 1.2 } }, 3),
              ]}
              layout={{ ...getMATLABLayout('SOC & Active Power', 'P (MW)', 'SOC (%)', undefined, undefined, `pf_${pk}_soc`), annotations: getCycleAnnotations(pk as any) }}
              useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `pf_${pk}_soc`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `pf_${pk}_soc`)} onClickAnnotation={(e) => handleClickAnnotation(e, `pf_${pk}_soc`)}
            />
          </div>
          <div className="h-[280px] w-full relative mb-1">
            <Plot
              data={[
                ...getVTraces(evalData, pk),
                applyTrace({ x: filteredTimeX, y: evalData.qTotal?.[pk], type: 'scattergl', mode: 'lines', name: 'Q total', yaxis: 'y2', line: { color: '#D95319', width: 1.3 } }, 3),
                applyTrace({ x: filteredTimeX, y: ((!['SNTV', 'SNTZ'].includes(project) && evalData.qBess?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001) && evalData.pBESS?.[pk]?.some(v => !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001))) ? evalData.qBess?.[pk] : [], type: 'scattergl', mode: 'lines', name: 'Q (BESS) (MVar)', showlegend: Boolean((!['SNTV', 'SNTZ'].includes(project) && evalData.qBess?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001) && evalData.pBESS?.[pk]?.some(v => !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001))), yaxis: 'y2', line: { color: '#000000', width: 1.4 } }, 10),
                applyTrace({ x: filteredTimeX, y: evalData.cmdQ?.[pk]?.map((v) => v === 0 ? null : v), type: 'scatter', mode: 'lines', name: 'Q command from NCC', showlegend: Boolean(evalData.cmdQ?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), yaxis: 'y2', line: { color: '#000000', width: 1.8, shape: 'hv', dash: 'dot' } }, 4),
              ]}
              layout={getMATLABLayout('Reactive Power & Voltage', 'V (kV)', 'Q (MVar)', [-30, 30], [20, 25.6], `pf_${pk}_vq`)}
              useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `pf_${pk}_vq`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `pf_${pk}_vq`)} onClickAnnotation={(e) => handleClickAnnotation(e, `pf_${pk}_vq`)}
            />
          </div>
        </div>
      );

      return (
        <div className="flex flex-col w-full h-full overflow-y-auto pt-2" style={{ background: graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e' }}>
          <div className="text-center text-[13px] tracking-wider mb-2 mt-0 font-sans" style={{ color: graphConfig.bgWhite ? '#000000' : '#E0E0E0' }}>
            <b>{title} | Powerflow (Daily Check)</b>
          </div>
          {drawPanelPF(pk, title)}
        </div>
      );
    }


    if (activeMetric === 'fig4') {
      const isBessProject = is20PercentProject(project);
      const hasPlant2 = (evalData.pTotal.plant2 && evalData.pTotal.plant2.some(v => !isNaN(v))) || (evalData.soc.plant2 && evalData.soc.plant2.some(v => !isNaN(v)));
      const hasPlant3 = !isBessProject && project !== 'SNTL400' && evalData.soc.plant3 && evalData.soc.plant3.some(v => !isNaN(v));
      const drawPanel4 = (pk: 'plant1' | 'plant2' | 'plant3', title: string) => (
        <div className="flex flex-col w-full border-b-[3px] border-border-v/50 pb-4 mb-4" key={pk}>
          <div className="text-center text-[12px] tracking-wider mb-2 font-sans font-bold" style={{ color: graphConfig.bgWhite ? '#000000' : '#E0E0E0' }}>
            {title}
          </div>
          <div className="h-[280px] w-full relative mb-1">
            <Plot
              data={[
                applyTrace({ x: filteredTimeX, y: evalData.pTotal?.[pk], type: 'scattergl', mode: 'lines', name: 'P (POC) (MW)', line: { color: '#0072BD', width: 2 } }, 0),
                applyTrace({ x: filteredTimeX, y: evalData.freq?.[pk], type: 'scattergl', mode: 'lines', name: 'Frequency', yaxis: 'y2', line: { color: '#D95319', width: 1.5 } }, 1),
              ]}
              layout={getMATLABLayout('Frequency & Active Power', 'P (MW)', 'F (Hz)', undefined, undefined, `fig4_fp_${pk}`)}
              useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `fig4_fp_${pk}`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `fig4_fp_${pk}`)} onClickAnnotation={(e) => handleClickAnnotation(e, `fig4_fp_${pk}`)}
            />
          </div>
          <div className="h-[280px] w-full relative mb-1">
            <Plot
              data={[
                applyTrace({ x: filteredTimeX, y: evalData.pPccPVS?.[pk]?.some((v) => v != null && !isNaN(v) && Math.abs(Number(v)) > 0.001) ? evalData.pPccPVS?.[pk] : evalData.pTotal?.[pk], type: 'scattergl', mode: 'lines', name: 'P (POC) (MW)', line: { color: '#0072BD', width: 1.2 } }, 0),
                applyTrace({ x: filteredTimeX, y: evalData.pPV?.[pk], type: 'scattergl', mode: 'lines', name: 'P (PV) (MW)', showlegend: Boolean(evalData.pPV?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#EDB120', width: 2 } }, 10),
                applyTrace({ x: filteredTimeX, y: evalData.pBESS?.[pk], type: 'scattergl', mode: 'lines', name: 'P (BESS) (MW)', showlegend: Boolean(evalData.pBESS?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#77AC30', width: 2 } }, 11),
                applyTrace({ x: filteredTimeX, y: evalData.cmdP?.[pk], type: 'scatter', mode: 'lines', name: 'P command from NCC', visible: (project === 'SNTL400' || project === 'SNTL600') ? showNccPCommand : true, showlegend: Boolean(evalData.cmdP?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#008000', width: 1.6, shape: 'hv', dash: 'dot' } }, 1),
                applyTrace({ x: filteredTimeX, y: evalData.remoteP?.[pk], type: 'scatter', mode: 'lines', connectgaps: true, name: 'Remote Active Power', visible: (project === 'SNTL400' || project === 'SNTL600') ? !showNccPCommand : true, showlegend: Boolean(evalData.remoteP?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), line: { color: '#9966cc', width: 1.6, dash: 'dot', shape: 'hv' } }, 2),
                applyTrace({ x: filteredTimeX, y: evalData.soc?.[pk], type: 'scattergl', mode: 'lines', name: 'SOC', yaxis: 'y2', line: { color: '#D95319', width: 1.2 } }, 3),
              ]}
              layout={{ ...getMATLABLayout('SOC & Active Power', 'P (MW)', 'SOC (%)', undefined, undefined, `fig4_soc_${pk}`), annotations: getCycleAnnotations(pk as any) }}
              useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `fig4_soc_${pk}`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `fig4_soc_${pk}`)} onClickAnnotation={(e) => handleClickAnnotation(e, `fig4_soc_${pk}`)}
            />
          </div>
          <div className="h-[280px] w-full relative mb-1">
            <Plot
              data={[
                ...getVTraces(evalData, pk),
                applyTrace({ x: filteredTimeX, y: evalData.qTotal?.[pk], type: 'scattergl', mode: 'lines', name: 'Q total', yaxis: 'y2', line: { color: '#D95319', width: 1.3 } }, 3),
                applyTrace({ x: filteredTimeX, y: ((!['SNTV', 'SNTZ'].includes(project) && evalData.qBess?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001) && evalData.pBESS?.[pk]?.some(v => !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001))) ? evalData.qBess?.[pk] : [], type: 'scattergl', mode: 'lines', name: 'Q (BESS) (MVar)', showlegend: Boolean((!['SNTV', 'SNTZ'].includes(project) && evalData.qBess?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001) && evalData.pBESS?.[pk]?.some(v => !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001))), yaxis: 'y2', line: { color: '#000000', width: 1.4 } }, 10),
                applyTrace({ x: filteredTimeX, y: evalData.cmdQ?.[pk]?.map((v) => v === 0 ? null : v), type: 'scatter', mode: 'lines', name: 'Q command from NCC', showlegend: Boolean(evalData.cmdQ?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), yaxis: 'y2', line: { color: '#000000', width: 1.8, shape: 'hv', dash: 'dot' } }, 4),
              ]}
              layout={getMATLABLayout('Reactive Power & Voltage', 'V (kV)', 'Q (MVar)', [-30, 30], [20, 25.6], `fig4_vq_${pk}`)}
              useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `fig4_vq_${pk}`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `fig4_vq_${pk}`)} onClickAnnotation={(e) => handleClickAnnotation(e, `fig4_vq_${pk}`)}
            />
          </div>
        </div>
      );
      return (
        <div className="flex flex-col w-full h-full overflow-y-auto pt-2" style={{ background: graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e' }}>
          <div className="text-center text-[13px] tracking-wider mb-2 mt-0 font-sans" style={{ color: graphConfig.bgWhite ? '#000000' : '#E0E0E0' }}>
            <b>{isBessProject ? `${project} Daily Evaluation` : `${evalData.dataDate} | Powerflow (Daily Check) All Plants`}</b>
          </div>
          {drawPanel4('plant1', evalData.dataDate + ' | SWG01 (Plant 01)')}
          {hasPlant2 && drawPanel4('plant2', evalData.dataDate + ' | SWG02 (Plant 02)')}
          {hasPlant3 && drawPanel4('plant3', evalData.dataDate + ' | SWG03 (Plant 03)')}
        </div>
      );
    }

    if (activeMetric === 'fig5') {
      const isBessProject = is20PercentProject(project);
      const hasPlant2 = (evalData.pTotal.plant2 && evalData.pTotal.plant2.some(v => !isNaN(v))) || (evalData.soc.plant2 && evalData.soc.plant2.some(v => !isNaN(v)));
      const plants = getProjectPlants(typeof project === 'string' ? project : '');
      const hasPlant3 = plants.includes('plant3') && evalData.soc.plant3 && evalData.soc.plant3.some((v) => !isNaN(v));
      const avgDaily = !isNaN(evalData.avgDailyCycle) ? evalData.avgDailyCycle : (evalData.dailyCycle.plant1 + (hasPlant2 ? evalData.dailyCycle.plant2 : 0) + (hasPlant3 ? evalData.dailyCycle.plant3 : 0)) / (hasPlant3 ? 3 : (hasPlant2 ? 2 : 1));
      const avgTotal = !isNaN(evalData.avgTotalCycle) ? evalData.avgTotalCycle : (evalData.totalCycle.plant1 + (hasPlant2 ? evalData.totalCycle.plant2 : 0) + (hasPlant3 ? evalData.totalCycle.plant3 : 0)) / (hasPlant3 ? 3 : (hasPlant2 ? 2 : 1));

      const drawPanel = (pKey: 'plant1' | 'plant2' | 'plant3', title: string, statsIndex: number) => {
        const socStats = evalData.socStats[pKey];

        const plotData: any[] = [
          {
            x: timeX,
            y: evalData.pTotal[pKey],
            type: 'scattergl',
            mode: 'lines',
            name: 'P (POC) (MW)',
            line: { color: '#0072BD', width: 1.2 }
          },
          {
            x: timeX,
            y: evalData.cmdP[pKey],
            type: 'scatter',
            mode: 'lines',
            name: 'P command from NCC',
            visible: (project === 'SNTL400' || project === 'SNTL600') ? showNccPCommand : true,
            showlegend: Boolean(evalData.cmdP?.[pKey]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)),
            line: { color: '#008000', width: 1.6, dash: 'dot', shape: 'hv' }
          },
          {
            x: timeX,
            y: evalData.remoteP[pKey],
            type: 'scatter',
            mode: 'lines',
            name: 'Remote Active Power',
            visible: (project === 'SNTL400' || project === 'SNTL600') ? !showNccPCommand : true,
            showlegend: Boolean(evalData.remoteP?.[pKey]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)),
            line: { color: '#9966cc', width: 1.6, dash: 'dot', shape: 'hv' }
          },
          {
            x: timeX,
            y: evalData.dispatchP[pKey],
            type: 'scattergl',
            mode: 'lines',
            name: 'P dispatch allocation',
            showlegend: Boolean(evalData.dispatchP[pKey]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)),
            line: { color: '#339933', width: 1.8, dash: 'dot' }
          },
          {
            x: timeX,
            y: evalData.soc[pKey],
            type: 'scattergl',
            mode: 'lines',
            name: 'SOC',
            yaxis: 'y2',
            line: { color: '#D95319', width: 1.2 }
          }
        ];

        // Highlight hit points
        if (socStats.maxIdx !== 0) {
          plotData.push({
            x: [timeX[socStats.maxIdx]],
            y: [socStats.maxSoc],
            type: 'scattergl',
            mode: 'markers',
            yaxis: 'y2',
            name: 'Max SOC point',
            marker: { color: '#FF3B30', size: 8, symbol: 'circle', line: { color: '#000000', width: 1.5 } },
            showlegend: false
          });
        }
        if (socStats.minIdx !== 0) {
          plotData.push({
            x: [timeX[socStats.minIdx]],
            y: [socStats.minSoc],
            type: 'scattergl',
            mode: 'markers',
            yaxis: 'y2',
            name: 'Min SOC point',
            marker: { color: '#FF3B30', size: 8, symbol: 'circle', line: { color: '#000000', width: 1.5 } },
            showlegend: false
          });
        }

        // Pointer annotations
        const annotations: any[] = [];
        if (socStats.maxIdx !== 0) {
          const maxDate = evalData.timestamps[socStats.maxIdx];
          annotations.push({
            x: timeX[socStats.maxIdx],
            y: socStats.maxSoc,
            yref: 'y2',
            xref: 'x',
            text: `<b>High SOC Target</b><br>${socStats.maxSoc.toFixed(1)}% at ${formatFullTime(maxDate)}`,
            showarrow: true,
            arrowhead: 2,
            arrowcolor: '#DC2626',
            arrowsize: 1,
            arrowwidth: 1.2,
            ax: 35,
            ay: -35,
            bordercolor: '#0072BD',
            borderwidth: 1,
            borderpad: 3,
            bgcolor: '#FFFFFF',
            opacity: 0.95,
            font: { family: 'Arial, sans-serif', size: 7.5, color: '#000000' }
          });
        }
        if (socStats.minIdx !== 0) {
          const minDate = evalData.timestamps[socStats.minIdx];
          annotations.push({
            x: timeX[socStats.minIdx],
            y: socStats.minSoc,
            yref: 'y2',
            xref: 'x',
            text: `<b>Low SOC Target</b><br>${socStats.minSoc.toFixed(1)}% at ${formatFullTime(minDate)}`,
            showarrow: true,
            arrowhead: 2,
            arrowcolor: '#DC2626',
            arrowsize: 1,
            arrowwidth: 1.2,
            ax: 35,
            ay: 35,
            bordercolor: '#0072BD',
            borderwidth: 1,
            borderpad: 3,
            bgcolor: '#FFFFFF',
            opacity: 0.95,
            font: { family: 'Arial, sans-serif', size: 7.5, color: '#000000' }
          });
        }

        const matlabLayout = getMATLABLayout(title, 'P (MW)', 'SOC (%)', [0, 100], [-100, 100], `fig5_${pKey}`);
        matlabLayout.annotations = [...(matlabLayout.annotations || []), ...annotations];

        const renderOverlay = () => {
          if (statsIndex === 1) {
            if (!evalData.hasCycleData) return null;
            return (
              <DraggableOverlay initialX={64} initialY={40}>
                <div className="bg-white/95 border border-blue-500/80 px-2 py-1 text-[7.5px] font-mono text-black shadow-sm rounded-sm leading-relaxed flex flex-col max-w-[190px]">
                  <div className="font-bold border-b border-gray-200 pb-0.5 mb-1 text-[8px]">Daily cycle ({evalData.dataDate}):</div>
                  <div>Cycle_Plant 01 = {Number(evalData.dailyCycle.plant1.toFixed(4))} -&gt; {getStatusJSX(evalData.dailyCycle.plant1, project)}</div>
                  {hasPlant2 && <div>Cycle_Plant 02 = {Number(evalData.dailyCycle.plant2.toFixed(4))} -&gt; {getStatusJSX(evalData.dailyCycle.plant2, project)}</div>}
                  {hasPlant3 && <div>Cycle_Plant 03 = {Number(evalData.dailyCycle.plant3.toFixed(4))} -&gt; {getStatusJSX(evalData.dailyCycle.plant3, project)}</div>}
                  <div className="font-bold text-blue-600 border-t border-gray-200 pt-0.5 mt-0.5">Cycle_Average Daily Cycle = {Number(avgDaily.toFixed(4))} -&gt; {getStatusJSX(avgDaily, project)}</div>
                </div>
              </DraggableOverlay>
            );
          }
          if (statsIndex === 2) {
            return (
              <>
                {evalData.hasCycleData && <DraggableOverlay initialX={64} initialY={40}>
                  <div className="bg-white/95 border border-blue-500/80 px-2 py-1 text-[7.5px] font-mono text-black shadow-sm rounded-sm leading-relaxed flex flex-col max-w-[210px]">
                    <div className="font-bold border-b border-gray-200 pb-0.5 mb-1 text-[8px]">Plant Total Cycle ({evalData.dataDate}):</div>
                    <div>Plant 01 Total Cycle = {evalData.totalCycle.plant1.toFixed(6)}</div>
                    {hasPlant2 && <div>Plant 02 Total Cycle = {evalData.totalCycle.plant2.toFixed(6)}</div>}
                    {hasPlant3 && <div>Plant 03 Total Cycle = {evalData.totalCycle.plant3.toFixed(6)}</div>}
                    <div className="font-bold text-blue-600 border-t border-gray-200 pt-0.5 mt-0.5">Average Total Plant Cycle = {Number(avgTotal.toFixed(6))}</div>
                  </div>
                </DraggableOverlay>}
                <DraggableOverlay defaultCentered={true}>
                  <div className="bg-white/95 border border-blue-500/80 px-2 py-1 text-[7.5px] font-mono text-black shadow-sm rounded-sm leading-relaxed flex flex-col max-w-[230px]">
                    <div className="font-bold border-b border-gray-200 pb-0.5 mb-1 text-[8px]">Max deviation timings:</div>
                    <div>Max deviation (HIGH SOC): {evalData.deviations.highSOC.pair} = {evalData.deviations.highSOC.text}</div>
                    <div>Max deviation (LOW SOC): {evalData.deviations.lowSOC.pair} = {evalData.deviations.lowSOC.text}</div>
                  </div>
                </DraggableOverlay>
              </>
            );
          }
          if (statsIndex === 3) {
            return null; // Max deviation moved to statsIndex === 2
          }
          return null;
        };

        const styledPlotData = plotData.map((t: any, idx: number) => applyTrace(t, idx));
        return (
          <div className="h-[280px] w-full relative mb-1" key={pKey}>
            {renderOverlay()}
            <Plot
              data={styledPlotData}
              layout={matlabLayout}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
              config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `fig5_${pKey}`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `fig5_${pKey}`)} onClickAnnotation={(e) => handleClickAnnotation(e, `fig5_${pKey}`)}
            />
          </div>
        );
      };

      return (
        <div className="flex flex-col w-full h-full overflow-y-auto pt-2" style={{ background: graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e' }}>
          <div className="text-center text-[13px] tracking-wider mb-0 mt-0 font-sans" style={{ color: graphConfig.bgWhite ? '#000000' : '#E0E0E0' }}>
            <b>{evalData.dataDate} | Active Power & SOC (All Plants)</b>
          </div>
          {drawPanel('plant1', evalData.dataDate + ' | SWG01 (Plant 01) | Active Power & SOC', 1)}
          {hasPlant2 && drawPanel('plant2', evalData.dataDate + ' | SWG02 (Plant 02) | Active Power & SOC', 2)}
          {hasPlant3 && drawPanel('plant3', evalData.dataDate + ' | SWG03 (Plant 03) | Active Power & SOC', 3)}
        </div>
      );
    }

    if (activeMetric === 'fig6') {
      const isBessProject = is20PercentProject(project);
      const hasPlant2 = (evalData.pTotal.plant2 && evalData.pTotal.plant2.some(v => !isNaN(v))) || (evalData.soc.plant2 && evalData.soc.plant2.some(v => !isNaN(v)));
      const plants = getProjectPlants(typeof project === 'string' ? project : '');
      const hasPlant3 = plants.includes('plant3') && evalData.soc.plant3 && evalData.soc.plant3.some((v) => !isNaN(v));
      const drawPanel6 = (pk: 'plant1' | 'plant2' | 'plant3', title: string) => (
        <div className="h-[280px] w-full relative mb-1" key={pk}>
          <Plot
            data={[
              ...getVTraces(evalData, pk),
              applyTrace({ x: filteredTimeX, y: evalData.qTotal?.[pk], type: 'scattergl', mode: 'lines', name: 'Q total', yaxis: 'y2', line: { color: '#D95319', width: 1.3 } }, 3),
              applyTrace({ x: filteredTimeX, y: ((!['SNTV', 'SNTZ'].includes(project) && evalData.qBess?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001) && evalData.pBESS?.[pk]?.some(v => !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001))) ? evalData.qBess?.[pk] : [], type: 'scattergl', mode: 'lines', name: 'Q (BESS) (MVar)', showlegend: Boolean((!['SNTV', 'SNTZ'].includes(project) && evalData.qBess?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001) && evalData.pBESS?.[pk]?.some(v => !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001))), yaxis: 'y2', line: { color: '#000000', width: 1.4 } }, 10),
              applyTrace({ x: filteredTimeX, y: evalData.cmdQ?.[pk]?.map((v) => v === 0 ? null : v), type: 'scatter', mode: 'lines', name: 'Q command from NCC', showlegend: Boolean(evalData.cmdQ?.[pk]?.some((v) => v != null && !isNaN(Number(v)) && Math.abs(Number(v)) > 0.001)), yaxis: 'y2', line: { color: '#000000', width: 1.8, shape: 'hv', dash: 'dot' } }, 4),
            ]}
            layout={getMATLABLayout(title, 'V (kV)', 'Q (MVar)', [-30, 30], [20, 25.6], `fig6_${pk}`)}
            useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={plotCfgZoom} onClick={undefined} onHover={(e) => handleHover(e, `fig6_${pk}`)} onUnhover={handleUnhover} onRelayout={(e) => handleRelayout(e, `fig6_${pk}`)} onClickAnnotation={(e) => handleClickAnnotation(e, `fig6_${pk}`)}
          />
        </div>
      );
      return (
        <div className="flex flex-col w-full h-full overflow-y-auto pt-2" style={{ background: graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e' }}>
          <div className="text-center text-[13px] tracking-wider mb-0 mt-0 font-sans" style={{ color: graphConfig.bgWhite ? '#000000' : '#E0E0E0' }}>
            <b>{evalData.dataDate} | Reactive Power & Voltage (All Plants)</b>
          </div>
          {drawPanel6('plant1', evalData.dataDate + ' | SWG01 (Plant 01) | Reactive Power & Voltage')}
          {hasPlant2 && drawPanel6('plant2', evalData.dataDate + ' | SWG02 (Plant 02) | Reactive Power & Voltage')}
          {hasPlant3 && drawPanel6('plant3', evalData.dataDate + ' | SWG03 (Plant 03) | Reactive Power & Voltage')}
        </div>
      );
    }
  };

  return renderPlot();
});
