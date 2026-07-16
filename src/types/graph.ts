// Shared graph-UI types for the daily-evaluation feature.

/** Figure/metric modes of the daily-evaluation graph. */
export type ActiveMetric =
  | 'f_p'
  | 'soc_p'
  | 'v_q'
  | 'fig4'
  | 'fig5'
  | 'fig6'
  | 'pf_p1'
  | 'pf_p2'
  | 'pf_p3';

/** Full MATLAB-style per-figure graph configuration (see defaultGraphConfig). */
export interface GraphConfig {
  // Layout
  showGrid: boolean;
  gridSize: 'small' | 'medium' | 'large' | 'xlarge';
  showLegend: boolean;
  bgWhite: boolean;
  // Line style
  smooth: boolean;
  showMarkers: boolean;
  fillArea: boolean;
  /** Line widths per trace index (0-4). */
  lineWidths: number[];
  // Y axis ranges ('' = auto)
  y1Min: string;
  y1Max: string;
  y2Min: string;
  y2Max: string;
  // Time range
  timeFrom: string;
  timeTo: string;
  /** 1s, 60s, 300s */
  dataResolution: number;
  // Title & axis labels (empty = use default)
  customTitle: string;
  customY1Label: string;
  customY2Label: string;
  /** Trace visibility by index. */
  traceVisible: boolean[];
  /** Line dash style per trace. */
  lineDash: string[];
  markerSize: number;
  // Pin settings
  pinSize: number;
  pinBgColor: string;
}

/** A pinned data-point annotation (click a point to pin/unpin). */
export interface PinnedPoint {
  id: string;
  graphId: string;
  x: string;
  y: number;
  yref: string;
  text: string;
  color: string;
  ax: number;
  ay: number;
}
