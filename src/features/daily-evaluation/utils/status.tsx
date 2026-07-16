import React from 'react';

// Daily-cycle status labels: <0.5 take action, <0.8 warning,
// SNTL400 additionally alerts above 1. HTML variant is used when composing
// annotation strings; JSX variant renders in the stats overlays.

export const getStatusHTML = (val: number, prj: string) => {
  if (val < 0.5) return '<span style="color:#DC2626">🔴 Take action</span>';
  if (val < 0.8) return '<span style="color:#EAB308">🟡 Warning</span>';
  if (prj === 'SNTL400' && val > 1) return '<span style="color:#DC2626">🔴 Alert</span>';
  return '<span style="color:#22C55E">🟢 Normal</span>';
};

export const getStatusJSX = (val: number, prj: string) => {
  if (val < 0.5) return <span style={{color:'#DC2626'}}>🔴 Take action</span>;
  if (val < 0.8) return <span style={{color:'#EAB308'}}>🟡 Warning</span>;
  if (prj === 'SNTL400' && val > 1) return <span style={{color:'#DC2626'}}>🔴 Alert</span>;
  return <span style={{color:'#22C55E'}}>🟢 Normal</span>;
};
