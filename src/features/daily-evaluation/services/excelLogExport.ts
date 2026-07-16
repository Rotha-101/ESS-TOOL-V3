import type { EvalData } from '@/types/eval-data';

const XLSX = (window as any).XLSX;

// Export processed data as a real Excel file matching MATLAB logs
// (Message + Realtime_Dispatch sheets). Moved verbatim from
// DailyEvaluationGraph.tsx; self-contained including its error alert.
export const downloadExcelLogs = (evalData: EvalData, project: string): void => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Message
      const messageRows = [
        { 'Timestamp': new Date().toISOString(), 'Message': `[INFO] Daily evaluation compiled for project ${project}.` },
        { 'Timestamp': new Date().toISOString(), 'Message': '[INFO] Aligning timelines and forward-filling telemetry gaps.' },
        { 'Timestamp': new Date().toISOString(), 'Message': '[INFO] Simulated remote active power dispatch math: alloc_with_limits compiled successfully.' },
        { 'Timestamp': new Date().toISOString(), 'Message': '[DONE] Saved raw data + historical raw data to workbook.' }
      ];
      const wsMessage = XLSX.utils.json_to_sheet(messageRows);
      XLSX.utils.book_append_sheet(wb, wsMessage, 'Message');

      // Sheet 2: Realtime_Dispatch
      const timeStampsStr = evalData.timestamps.map((t: Date) => {
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
      });
      const dispatchRows = timeStampsStr.map((time: string, idx: number) => ({
        'Time': time,
        'Plant1_Actual_MW': evalData.pTotal.plant1[idx] ? Number(evalData.pTotal.plant1[idx].toFixed(2)) : 0,
        'Plant1_Dispatch_MW': evalData.dispatchP.plant1[idx] ? Number(evalData.dispatchP.plant1[idx].toFixed(2)) : 0,
        'Plant2_Actual_MW': evalData.pTotal.plant2[idx] ? Number(evalData.pTotal.plant2[idx].toFixed(2)) : 0,
        'Plant2_Dispatch_MW': evalData.dispatchP.plant2[idx] ? Number(evalData.dispatchP.plant2[idx].toFixed(2)) : 0,
        ...(project !== 'SNTL400' ? {
          'Plant3_Actual_MW': evalData.pTotal.plant3[idx] ? Number(evalData.pTotal.plant3[idx].toFixed(2)) : 0,
          'Plant3_Dispatch_MW': evalData.dispatchP.plant3[idx] ? Number(evalData.dispatchP.plant3[idx].toFixed(2)) : 0,
        } : {})
      }));
      const wsDispatch = XLSX.utils.json_to_sheet(dispatchRows);
      XLSX.utils.book_append_sheet(wb, wsDispatch, 'Realtime_Dispatch');

      const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Realtime_Data_Debug_${project}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
    } catch (err: any) {
      alert(`Export failed: ${err.message || String(err)}`);
    }
};
