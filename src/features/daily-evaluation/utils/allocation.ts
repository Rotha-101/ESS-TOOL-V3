// JS Implementation of MATLAB alloc_with_limits
export const runAllocWithLimits = (
  Pset: number,
  SOCc: number[],
  SOH: number[],
  SOCmin: number,
  SOCmax: number,
  Crate_dis: number[],
  Crate_cha: number[],
  P_limit: number[]
) => {
  const Pi = [0, 0, 0];
  let w = [0, 0, 0];
  if (Pset > 0) {
    w = SOCc.map((soc, i) => Math.max(0, soc - SOCmin) * SOH[i] * Crate_dis[i]);
  } else if (Pset < 0) {
    w = SOCc.map((soc, i) => Math.max(0, SOCmax - soc) * SOH[i] * Crate_cha[i]);
  } else {
    return Pi;
  }
  const sumW = w.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return Pi;

  const signP = Math.sign(Pset);
  const Pmag = Math.abs(Pset);
  const active = [true, true, true];
  const Pi_mag = [0, 0, 0];
  let remaining = Pmag;

  for (let iter = 0; iter < 3; iter++) {
    if (remaining <= 1e-9) break;
    const activeW = w.filter((_, i) => active[i]).reduce((a, b) => a + b, 0);
    if (activeW <= 0) break;

    for (let i = 0; i < 3; i++) {
      if (!active[i]) continue;
      const alloc = remaining * (w[i] / activeW);
      const cap = P_limit[i] - Pi_mag[i];
      if (cap <= 1e-12) {
        active[i] = false;
        continue;
      }
      if (alloc >= cap) {
        Pi_mag[i] += cap;
        active[i] = false;
      } else {
        Pi_mag[i] += alloc;
      }
    }
    remaining = Pmag - Pi_mag.reduce((a, b) => a + b, 0);
  }
  return Pi_mag.map(mag => mag * signP);
};
