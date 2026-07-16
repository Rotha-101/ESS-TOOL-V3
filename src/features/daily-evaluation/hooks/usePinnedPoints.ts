import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveMetric, PinnedPoint } from '@/types/graph';

// Pinned point annotations — click a data point to pin/unpin it.
// Double-clicks are detected manually via a capturing document mousedown
// listener (Plotly's own doubleClick handling is disabled on the panels).
export const usePinnedPoints = ({ initial, activeMetric, selectedPlant }: {
  initial: PinnedPoint[] | null;
  activeMetric: ActiveMetric;
  selectedPlant: string;
}) => {
  const [pinnedPoints, setPinnedPoints] = useState<PinnedPoint[]>(initial ? [...initial] : []);

  const lastHoveredPtRef = useRef<any>(null);

  // Handlers touch only refs and functional setState, so empty-dep
  // useCallback is safe; stable identities keep GraphPanels' React.memo
  // effective across unrelated parent re-renders.
  const handleHover = useCallback((event: any, graphId: string) => {
    if (event && event.points && event.points.length > 0) {
      lastHoveredPtRef.current = { pt: event.points[0], graphId };
    }
  }, []);
  const handleUnhover = useCallback(() => {
    lastHoveredPtRef.current = null;
  }, []);

  const handleRelayout = useCallback((event: any, graphId: string) => {
    if (!event) return;
    const keys = Object.keys(event);

    const isAnnotationUpdate = keys.some(k => k.startsWith('annotations['));
    if (!isAnnotationUpdate) return;

    setPinnedPoints(prev => {
      const next = [...prev];
      const localPins = prev.filter(p => p.graphId === graphId);
      let changed = false;
      keys.forEach(key => {
        const match = key.match(/annotations\[(\d+)\]\.(ax|ay)/);
        if (match) {
          const idx = parseInt(match[1], 10);
          const prop = match[2];
          const localPin = localPins[idx];
          if (localPin) {
            const globalIdx = next.findIndex(p => p.id === localPin.id);
            if (globalIdx >= 0) {
              next[globalIdx] = { ...next[globalIdx], [prop]: event[key] };
              changed = true;
            }
          }
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const lastClickAnnotationTimeRef = useRef(0);
  const handleClickAnnotation = useCallback((event: any, graphId: string) => {
    const now = Date.now();
    if (now - lastClickAnnotationTimeRef.current < 300) {
      const clickedText = event.annotation.text;
      const clickedX = event.annotation.x;
      setPinnedPoints(prev => prev.filter(p => !(p.graphId === graphId && p.text === clickedText && String(p.x) === String(clickedX))));
    }
    lastClickAnnotationTimeRef.current = now;
  }, []);

  const handleDoubleClick = () => {
    if (!lastHoveredPtRef.current) return;
    const { pt, graphId } = lastHoveredPtRef.current;
    if (!pt || pt.x == null || pt.y == null) return;

    const xVal = String(pt.x);
    const yVal = Number(pt.y);
    const name = pt.data?.name || 'Series';
    const color = pt.data?.line?.color || pt.data?.marker?.color || '#0072BD';
    const isY2 = pt.data?.yaxis === 'y2';
    const id = `${graphId}__${xVal}__${name}`;

    setPinnedPoints(prev => {
      const existingIdx = prev.findIndex(p => p.id === id);
      if (existingIdx >= 0) {
        return prev.filter((_, i) => i !== existingIdx);
      }
      const offset = prev.length % 2 === 0 ? -40 : 40;
      return [...prev, {
        id, graphId, x: xVal, y: yVal, yref: isY2 ? 'y2' : 'y',
        text: `<b>${xVal}</b>  ${yVal.toFixed(3)}<br><i>${name}</i>`,
        color, ax: 30, ay: offset,
      }];
    });
    lastHoveredPtRef.current = null;
  };

  useEffect(() => {
    let lastMousedownTime = 0;
    const handleMousedown = () => {
      const now = Date.now();
      if (now - lastMousedownTime < 300) {
        handleDoubleClick();
      }
      lastMousedownTime = now;
    };
    document.addEventListener('mousedown', handleMousedown, true);
    return () => document.removeEventListener('mousedown', handleMousedown, true);
  }, []);

  // Clear pins when switching figures or plants. Bail out with the same
  // reference when already empty — otherwise every figure switch commits a
  // new [] and forces a second full re-render (and Plotly redraw) for nothing.
  useEffect(() => { setPinnedPoints(prev => (prev.length === 0 ? prev : [])); }, [activeMetric, selectedPlant]);

  return { pinnedPoints, setPinnedPoints, handleHover, handleUnhover, handleRelayout, handleClickAnnotation };
};
