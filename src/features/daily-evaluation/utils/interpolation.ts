// In-place gap filling for 1 Hz telemetry series (gaps are NaN).

export const interpolateArray = (arr: number[]) => {
  let lastValidIdx = -1;
  for (let i = 0; i < arr.length; i++) {
    if (!isNaN(arr[i])) {
      if (lastValidIdx !== -1 && i - lastValidIdx > 1) {
        const startVal = arr[lastValidIdx];
        const endVal = arr[i];
        const steps = i - lastValidIdx;
        for (let j = 1; j < steps; j++) {
          arr[lastValidIdx + j] = startVal + (endVal - startVal) * (j / steps);
        }
      }
      lastValidIdx = i;
    }
  }
  const firstIdx = arr.findIndex(v => !isNaN(v));
  if (firstIdx > 0) {
    for (let i = 0; i < firstIdx; i++) arr[i] = arr[firstIdx];
  }
  let lastIdx = -1;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!isNaN(arr[i])) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx !== -1 && lastIdx < arr.length - 1) {
    for (let i = lastIdx + 1; i < arr.length; i++) arr[i] = arr[lastIdx];
  }
};

// Forward-fill empty telemetry data gaps to ensure clean lines
export const forwardFillArray = (arr: any[], noBackwardFill = false) => {
  let last = NaN;
  for (let i = 0; i < arr.length; i++) {
    const val = Number(arr[i]);
    if (arr[i] == null || arr[i] === "" || Number.isNaN(val)) {
      if (!Number.isNaN(last)) arr[i] = last;
    } else {
      last = val;
      arr[i] = val; // Ensure it's stored as a number, not string
    }
  }
  if (!noBackwardFill) {
    const firstIdx = arr.findIndex(v => v != null && v !== "" && !Number.isNaN(Number(v)));
    if (firstIdx > 0) {
      const firstVal = Number(arr[firstIdx]);
      for (let i = 0; i < firstIdx; i++) arr[i] = firstVal;
    }
  }
};
