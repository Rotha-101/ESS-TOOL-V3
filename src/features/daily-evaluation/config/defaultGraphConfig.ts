import type { GraphConfig } from '@/types/graph';

// Full MATLAB-style per-figure graph configuration
export const defaultGraphConfig: GraphConfig = {
  // Layout
  showGrid: true,
  gridSize: 'small',
  showLegend: true,
  bgWhite: true,
  // Line style
  smooth: false,
  showMarkers: false,
  fillArea: false,
  // Line widths per trace index (0-4)
  lineWidths: [2, 1.6, 1.6, 1.8, 1.2],
  // Y axis ranges (null = auto)
  y1Min: '',
  y1Max: '',
  y2Min: '',
  y2Max: '',
  // Time range
  timeFrom: '00:00:00',
  timeTo: '23:59:59',
  dataResolution: 1, // 1s, 60s, 300s
  // Title & axis labels (empty = use default)
  customTitle: '',
  customY1Label: '',
  customY2Label: '',
  // Trace visibility (by index)
  traceVisible: [true, true, true, true, true],
  // Line dash style per trace
  lineDash: ['solid', 'solid', 'solid', 'solid', 'solid'],
  // Marker size
  markerSize: 5,
  // Pin settings
  pinSize: 8,
  pinBgColor: '',
};
