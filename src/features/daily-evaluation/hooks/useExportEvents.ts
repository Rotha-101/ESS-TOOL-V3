import { useEffect, useRef } from 'react';
import type { EvalData } from '@/types/eval-data';

// Bridge for App.tsx's document-level export triggers. The ref is refreshed
// every render so the mount-once listeners always see the current handlers;
// window.isGraphMounted tells App a graph is present. Moved verbatim from
// DailyEvaluationGraph.tsx.
export const useExportEvents = (
  handleExportHtml: () => void,
  handleExportAllHtml: () => void,
  evalData: EvalData | null,
) => {
  const exportRefs = useRef({ handleExportHtml, handleExportAllHtml, evalData });
  useEffect(() => {
    exportRefs.current = { handleExportHtml, handleExportAllHtml, evalData };
  });

  useEffect(() => {
    (window as any).isGraphMounted = true;
    const handleSingle = () => {
      if (exportRefs.current.evalData) exportRefs.current.handleExportHtml();
    };
    const handleAll = () => {
      if (exportRefs.current.evalData) exportRefs.current.handleExportAllHtml();
    };
    document.addEventListener('export-html-single', handleSingle);
    document.addEventListener('export-html-all', handleAll);
    return () => {
      (window as any).isGraphMounted = false;
      document.removeEventListener('export-html-single', handleSingle);
      document.removeEventListener('export-html-all', handleAll);
    };
  }, []);
};
