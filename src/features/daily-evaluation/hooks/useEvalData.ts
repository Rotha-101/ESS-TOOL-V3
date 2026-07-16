import { useEffect, useState } from 'react';
import { getDBItem, setDBItem, removeDBItem } from '@/lib/db';
import { useAppStore } from '@/store/useAppStore';
import type { EvalData } from '@/types/eval-data';

// Owns the evaluation dataset: React state + fan-out persistence into the
// zustand RAM cache and IndexedDB (eval_data_${project}), plus the reload
// effect on project change / audit-state bumps.
export const useEvalData = (project: string, initialData: EvalData | null) => {
  const auditStateVersion = useAppStore(state => state.auditStateVersion);
  const [evalData, setEvalDataState] = useState<EvalData | null>(initialData);

  const setEvalData = async (data: EvalData | null) => {
    setEvalDataState(data);
    useAppStore.getState().setEvalDataCache(project, data);
    if (data) {
      await setDBItem(`eval_data_${project}`, data);
    } else {
      await removeDBItem(`eval_data_${project}`);
    }
  };

  // Load persisted evalData from localforage on mount or project change
  useEffect(() => {
    (async () => {
      const saved = await getDBItem<any>(`eval_data_${project}`);
      if (saved) {
        setEvalDataState(saved);
      } else {
        setEvalDataState(null);
      }
    })();
  }, [project, auditStateVersion]);

  return { evalData, setEvalData, setEvalDataState };
};
