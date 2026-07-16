import React from 'react';
import { Sliders, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GraphConfig } from '@/types/graph';
import { defaultGraphConfig } from '../config/defaultGraphConfig';

export type ConfigTab = 'layout' | 'axes' | 'lines' | 'time';

// Customization Panel — absolute overlay drawer sliding from the right.
// Four tabs (layout / axes / lines / time); body moved verbatim from
// DailyEvaluationGraph.tsx.
export function CustomizationDrawer({
  showCustomization, setShowCustomization,
  configTab, setConfigTab,
  graphConfig, updateConfig, resetConfig,
}: {
  showCustomization: boolean;
  setShowCustomization: (show: boolean) => void;
  configTab: ConfigTab;
  setConfigTab: (tab: ConfigTab) => void;
  graphConfig: GraphConfig;
  updateConfig: (patch: Partial<typeof defaultGraphConfig>) => void;
  resetConfig: () => void;
}) {
  if (!showCustomization) return null;
  return (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: '288px',
                  zIndex: 30,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  boxShadow: '-4px 0 24px rgba(0,0,0,0.25)',
                }}
                className="bg-panel border-l border-border-v"
              >
                {/* Panel header + tab bar */}
                <div className="px-3 pt-2 pb-0 border-b border-border-v bg-surface/60 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-[10px] uppercase tracking-wider text-foreground/70 flex items-center gap-1.5">
                      <Sliders size={11} className="text-accent-blue" />
                      Graph Properties
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={resetConfig} className="text-[8px] font-mono uppercase tracking-wider text-foreground/40 hover:text-red-400 transition-colors px-1.5 py-0.5 border border-foreground/10 rounded hover:border-red-400/30">
                        Reset
                      </button>
                      <button onClick={() => setShowCustomization(false)} className="ml-1 p-0.5 text-foreground/40 hover:text-foreground hover:bg-foreground/10 rounded transition-colors" title="Close">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-0 text-[9px] font-bold uppercase tracking-wider">
                    {(['layout', 'axes', 'lines', 'time'] as const).map(tab => (
                      <button key={tab} onClick={() => setConfigTab(tab)}
                        className={cn('px-2.5 py-1 border-b-2 transition-colors',
                          configTab === tab
                            ? 'border-accent-blue text-accent-blue'
                            : 'border-transparent text-foreground/40 hover:text-foreground/70'
                        )}
                      >{tab}</button>
                    ))}
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px', fontFamily: 'monospace' }}>

                  {/* â”€â”€ TAB: Layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                  {configTab === 'layout' && (
                    <>
                      {/* Toggle group */}
                      {([
                        ['Show Grid Lines', 'showGrid'],
                        ['Show Legend', 'showLegend'],
                        ['White Background', 'bgWhite'],
                        ['Smooth Curves', 'smooth'],
                        ['Data Markers', 'showMarkers'],
                        ['Fill Area (Y1)', 'fillArea'],
                      ] as [string, keyof typeof defaultGraphConfig][]).map(([label, key]) => (
                        <label key={key} className="flex items-center justify-between p-1.5 hover:bg-foreground/5 rounded cursor-pointer select-none group">
                          <span className="text-foreground/80 group-hover:text-foreground transition-colors">{label}</span>
                          <div
                            onClick={() => updateConfig({ [key]: !(graphConfig[key] as boolean) } as any)}
                            className={cn(
                              'w-8 h-4 rounded-full relative transition-colors cursor-pointer shrink-0',
                              (graphConfig[key] as boolean) ? 'bg-accent-blue' : 'bg-foreground/20'
                            )}
                          >
                            <div className={cn(
                              'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all',
                              (graphConfig[key] as boolean) ? 'left-[18px]' : 'left-0.5'
                            )} />
                          </div>
                        </label>
                      ))}

                      {/* Grid Size */}
                      {graphConfig.showGrid && (
                        <div className="flex flex-col gap-1.5 p-1.5 mt-1 border-t border-border-v pt-2">
                          <div className="text-foreground/70 text-[10px] uppercase tracking-wider mb-1">Grid Size</div>
                          <div className="flex items-center gap-1 bg-surface/50 p-1 rounded border border-border-v">
                            {(['small', 'medium', 'large', 'xlarge'] as const).map(size => (
                              <button
                                key={size}
                                onClick={() => updateConfig({ gridSize: size })}
                                className={cn(
                                  "flex-1 py-1 text-[9px] uppercase tracking-wider rounded transition-colors",
                                  graphConfig.gridSize === size ? "bg-accent-blue/20 text-accent-blue font-bold" : "text-foreground/50 hover:text-foreground/80 hover:bg-foreground/5"
                                )}
                              >
                                {size === 'xlarge' ? 'X-Large' : size}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Marker size */}
                      {graphConfig.showMarkers && (
                        <div className="flex items-center justify-between gap-2 p-1.5">
                          <span className="text-foreground/70 shrink-0">Marker Size</span>
                          <input type="range" min={2} max={12} step={1}
                            value={graphConfig.markerSize}
                            onChange={e => updateConfig({ markerSize: Number(e.target.value) })}
                            className="flex-1 h-1 accent-blue-500"
                          />
                          <span className="w-4 text-right text-foreground/60">{graphConfig.markerSize}</span>
                        </div>
                      )}

                      {/* Pin Settings */}
                      <div className="flex flex-col gap-1.5 p-1.5 mt-1 border-t border-border-v pt-2">
                        <div className="text-foreground/70 text-[10px] uppercase tracking-wider mb-1">Pin Settings</div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-foreground/70 shrink-0 text-[10px]">Text Size</span>
                          <input type="range" min={6} max={16} step={1}
                            value={graphConfig.pinSize || 8}
                            onChange={e => updateConfig({ pinSize: Number(e.target.value) })}
                            className="flex-1 h-1 accent-blue-500"
                          />
                          <span className="w-4 text-right text-foreground/60 text-[10px]">{graphConfig.pinSize || 8}px</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-foreground/70 shrink-0 text-[10px]">BG Color</span>
                          <input type="color"
                            value={graphConfig.pinBgColor || '#ffffff'}
                            onChange={e => updateConfig({ pinBgColor: e.target.value })}
                            className="w-6 h-6 p-0 border-0 bg-transparent rounded cursor-pointer"
                          />
                          <button onClick={() => updateConfig({ pinBgColor: '' })} className="text-[9px] text-foreground/50 hover:text-foreground">Reset</button>
                        </div>
                      </div>

                      {/* Custom plot title */}
                      <div className="flex flex-col gap-1 mt-1 border-t border-border-v pt-2">
                        <span className="text-foreground/50 uppercase text-[9px] tracking-widest">Plot Title Override</span>
                        <input
                          type="text"
                          value={graphConfig.customTitle}
                          onChange={e => updateConfig({ customTitle: e.target.value })}
                          placeholder="(use default)"
                          className="h-7 bg-surface/50 border border-border-v rounded px-2 text-[10px] focus:outline-none focus:border-accent-blue/50 transition-colors"
                        />
                      </div>
                    </>
                  )}

                  {/* â”€â”€ TAB: Axes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                  {configTab === 'axes' && (
                    <>
                      {/* Y1 axis */}
                      <div className="flex flex-col gap-2">
                        <div className="text-[9px] uppercase tracking-widest text-blue-400 font-bold border-b border-border-v/50 pb-1">Left Y-Axis (Y1)</div>
                        <div className="flex flex-col gap-1">
                          <span className="text-foreground/50 text-[9px]">Label Override</span>
                          <input type="text" value={graphConfig.customY1Label}
                            onChange={e => updateConfig({ customY1Label: e.target.value })}
                            placeholder="(use default)"
                            className="h-7 bg-surface/50 border border-border-v rounded px-2 text-[10px] focus:outline-none focus:border-accent-blue/50"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-foreground/50 text-[9px]">Min</span>
                            <input type="number" value={graphConfig.y1Min}
                              onChange={e => updateConfig({ y1Min: e.target.value })}
                              placeholder="auto"
                              className="h-7 bg-surface/50 border border-border-v rounded px-2 text-[10px] focus:outline-none focus:border-accent-blue/50"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-foreground/50 text-[9px]">Max</span>
                            <input type="number" value={graphConfig.y1Max}
                              onChange={e => updateConfig({ y1Max: e.target.value })}
                              placeholder="auto"
                              className="h-7 bg-surface/50 border border-border-v rounded px-2 text-[10px] focus:outline-none focus:border-accent-blue/50"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Y2 axis */}
                      <div className="flex flex-col gap-2 mt-2">
                        <div className="text-[9px] uppercase tracking-widest text-orange-400 font-bold border-b border-border-v/50 pb-1">Right Y-Axis (Y2)</div>
                        <div className="flex flex-col gap-1">
                          <span className="text-foreground/50 text-[9px]">Label Override</span>
                          <input type="text" value={graphConfig.customY2Label}
                            onChange={e => updateConfig({ customY2Label: e.target.value })}
                            placeholder="(use default)"
                            className="h-7 bg-surface/50 border border-border-v rounded px-2 text-[10px] focus:outline-none focus:border-accent-blue/50"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-foreground/50 text-[9px]">Min</span>
                            <input type="number" value={graphConfig.y2Min}
                              onChange={e => updateConfig({ y2Min: e.target.value })}
                              placeholder="auto"
                              className="h-7 bg-surface/50 border border-border-v rounded px-2 text-[10px] focus:outline-none focus:border-accent-blue/50"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-foreground/50 text-[9px]">Max</span>
                            <input type="number" value={graphConfig.y2Max}
                              onChange={e => updateConfig({ y2Max: e.target.value })}
                              placeholder="auto"
                              className="h-7 bg-surface/50 border border-border-v rounded px-2 text-[10px] focus:outline-none focus:border-accent-blue/50"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* â”€â”€ TAB: Lines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                  {configTab === 'lines' && (
                    <>
                      <div className="text-[9px] uppercase tracking-widest text-foreground/40 mb-1">Per-Series Settings (by trace index)</div>
                      {([0, 1, 2, 3, 4] as const).map(idx => (
                        <div key={idx} className="border border-border-v/50 rounded p-2 flex flex-col gap-2 bg-surface/20">
                          <div className="flex items-center justify-between">
                            <span className="text-foreground/70 font-bold text-[9px] uppercase tracking-wider">Trace {idx + 1}</span>
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                              <span className="text-foreground/50 text-[9px]">Visible</span>
                              <div
                                onClick={() => {
                                  const v = [...graphConfig.traceVisible];
                                  v[idx] = !v[idx];
                                  updateConfig({ traceVisible: v });
                                }}
                                className={cn('w-6 h-3 rounded-full relative cursor-pointer transition-colors', graphConfig.traceVisible[idx] ? 'bg-accent-blue' : 'bg-foreground/20')}
                              >
                                <div className={cn('absolute top-0.5 w-2 h-2 rounded-full bg-white shadow transition-all', graphConfig.traceVisible[idx] ? 'left-[14px]' : 'left-0.5')} />
                              </div>
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-foreground/50 shrink-0 text-[9px] w-16">Line Width</span>
                            <input type="range" min={0.5} max={5} step={0.5}
                              value={graphConfig.lineWidths[idx]}
                              onChange={e => {
                                const w = [...graphConfig.lineWidths];
                                w[idx] = Number(e.target.value);
                                updateConfig({ lineWidths: w });
                              }}
                              className="flex-1 h-1 accent-blue-500"
                            />
                            <span className="text-foreground/60 text-[9px] w-5 text-right">{graphConfig.lineWidths[idx]}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-foreground/50 shrink-0 text-[9px] w-16">Line Style</span>
                            <select
                              value={graphConfig.lineDash[idx]}
                              onChange={e => {
                                const d = [...graphConfig.lineDash];
                                d[idx] = e.target.value;
                                updateConfig({ lineDash: d });
                              }}
                              className="flex-1 h-6 bg-surface/50 border border-border-v rounded px-1 text-[9px] focus:outline-none focus:border-accent-blue/50"
                            >
                              <option value="solid">Solid</option>
                              <option value="dash">Dashed</option>
                              <option value="dot">Dotted</option>
                              <option value="dashdot">Dash-Dot</option>
                              <option value="longdash">Long Dash</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* â”€â”€ TAB: Time â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                  {configTab === 'time' && (
                    <>
                      <div className="text-[9px] uppercase tracking-widest text-foreground/40 mb-1">Time Range Filter</div>
                      <div className="text-[9px] text-foreground/50 mb-2 leading-relaxed">
                        Zoom into a specific time window. Filters all plots to only display data within this range.
                      </div>
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-foreground/60 text-[9px]">Data Resolution</span>
                          <select
                            value={graphConfig.dataResolution || 1}
                            onChange={e => updateConfig({ dataResolution: Number(e.target.value) })}
                            className="h-8 bg-surface/50 border border-border-v rounded px-2 text-[11px] focus:outline-none focus:border-accent-blue/50"
                          >
                            <option value={1}>1 Second (Raw High-Res)</option>
                            <option value={60}>1 Minute (Aggregated)</option>
                            <option value={300}>5 Minutes (Aggregated)</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-foreground/60 text-[9px]">From (HH:MM:SS)</span>
                          <input type="time" step="1" value={graphConfig.timeFrom}
                            onChange={e => updateConfig({ timeFrom: e.target.value })}
                            className="h-8 bg-surface/50 border border-border-v rounded px-2 text-[11px] focus:outline-none focus:border-accent-blue/50"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-foreground/60 text-[9px]">To (HH:MM:SS)</span>
                          <input type="time" step="1" value={graphConfig.timeTo}
                            onChange={e => updateConfig({ timeTo: e.target.value })}
                            className="h-8 bg-surface/50 border border-border-v rounded px-2 text-[11px] focus:outline-none focus:border-accent-blue/50"
                          />
                        </div>
                        <button
                          onClick={() => updateConfig({ timeFrom: '00:00:00', timeTo: '23:59:59' })}
                          className="h-7 border border-border-v text-foreground/50 hover:text-foreground hover:bg-foreground/5 rounded text-[9px] uppercase tracking-wider transition-colors"
                        >
                          Reset to Full Day
                        </button>
                        {/* Preset zooms */}
                        <div className="text-[9px] uppercase tracking-widest text-foreground/40 mt-1">Quick Zoom Presets</div>
                        {[
                          ['Morning', '06:00:00', '12:00:00'],
                          ['Afternoon', '12:00:00', '18:00:00'],
                          ['Night', '18:00:00', '23:59:59'],
                          ['Peak', '08:00:00', '20:00:00'],
                        ].map(([label, from, to]) => (
                          <button key={label}
                            onClick={() => updateConfig({ timeFrom: from, timeTo: to })}
                            className={cn(
                              'h-7 border rounded text-[9px] uppercase tracking-wider transition-colors',
                              graphConfig.timeFrom === from && graphConfig.timeTo === to
                                ? 'border-accent-blue/50 bg-accent-blue/10 text-accent-blue'
                                : 'border-border-v text-foreground/50 hover:text-foreground hover:bg-foreground/5'
                            )}
                          >
                            {label} ({from.slice(0, 5)}â€“{to.slice(0, 5)})
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                </div>
              </div>
  );
}
