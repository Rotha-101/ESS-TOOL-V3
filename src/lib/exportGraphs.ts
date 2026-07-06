import { generatePortableViewHtml } from './portable-view-template';
import { getProjectPlants } from './project-utils';

const is20PercentProject = (proj: string) => typeof proj === 'string' && (proj.startsWith('SNTB') || proj.startsWith('SNTV') || proj.startsWith('SNTD') || proj.startsWith('SNTZ') || proj.startsWith('MSGP'));

export const exportAllGraphsToZip = async (
  project: string,
  evalData: any,
  zipEntries: { name: string; data: Uint8Array }[],
  setProgress: (prog: any) => void,
  baseFolder?: string
) => {
  if (!evalData || !evalData.timestamps) return;

  const plants = getProjectPlants(project);
  const win = window as any;
  if (!win.Plotly) {
    console.error('Plotly is not loaded. Cannot export graphs.');
    return;
  }

  const timeX = evalData.timestamps.map((t: Date | string) => {
    const dt = new Date(t);
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    const ss = String(dt.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  });

  let graphConfig: any = {
    lineWidths: [2, 1.6, 1.6, 1.8, 1.2], lineDash: ['solid', 'solid', 'solid', 'dash', 'dot'], traceVisible: [true, true, true, true, true], showMarkers: false, markerSize: 6,
    smooth: false, fillArea: false, bgWhite: true, showGrid: true,
    customTitle: '', customY1Label: '', customY2Label: '',
    y1Min: '', y1Max: '', y2Min: '', y2Max: ''
  };
  try {
    const savedCfg = localStorage.getItem('ess_graph_config');
    if (savedCfg) graphConfig = { ...graphConfig, ...JSON.parse(savedCfg) };
  } catch(e) {}

  const applyTrace = (trace: any, idx: number) => {
    const lw = graphConfig.lineWidths[idx] ?? 1.5;
    const dash = graphConfig.lineDash[idx] ?? 'solid';
    const visible = graphConfig.traceVisible[idx] !== false;
    const modeBase = graphConfig.showMarkers ? 'lines+markers' : 'lines';
    return {
      ...trace,
      x: timeX,
      visible: visible ? true : 'legendonly',
      mode: modeBase,
      line: {
        ...trace.line,
        width: lw,
        dash: dash,
        shape: graphConfig.smooth ? 'spline' : (trace.line?.shape ?? 'linear'),
      },
      ...(graphConfig.showMarkers ? { marker: { size: graphConfig.markerSize, ...(trace.marker || {}) } } : {}),
      ...(graphConfig.fillArea && !trace.yaxis ? { fill: 'tozeroy', fillcolor: (trace.line?.color ?? '#0072BD') + '22' } : {}),
    };
  };

  const getSubplotLayoutAllPlants = (title: string, y1Title: string, y2Title: string): any => {
    const bg = graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e';
    const fontColor = graphConfig.bgWhite ? '#000000' : '#E0E0E0';
    const gridColor = graphConfig.bgWhite ? '#E5E5E5' : 'rgba(255,255,255,0.16)';
    
    let layout = {
      margin: { l: 60, r: 60, t: 50, b: 50 },
      paper_bgcolor: bg,
      plot_bgcolor: bg,
      showlegend: graphConfig.showLegend !== false,
      legend: { orientation: 'h', x: 0, y: 1.05, font: { size: 11, color: fontColor } },
      title: { text: title, font: { family: 'Inter, sans-serif', size: 14, color: fontColor, weight: 'bold' } },
      hovermode: 'x unified'
    };

    plants.forEach((pk, i) => {
      const idx = i + 1;
      const plantLabel = pk === 'plant1' ? 'SWG01' : pk === 'plant2' ? 'SWG02' : 'SWG03';
      
      (layout as any)['yaxis' + idx] = { 
        title: { text: y1Title, font: { size: 10, color: fontColor } }, 
        showgrid: graphConfig.showGrid !== false, gridcolor: gridColor, zeroline: false,
        domain: [(plants.length - 1 - i) / plants.length + 0.02, (plants.length - i) / plants.length - 0.02]
      };
      
      if (y2Title) {
        (layout as any)['yaxis' + (idx + plants.length)] = { 
          title: { text: y2Title, font: { size: 10, color: fontColor } }, 
          overlaying: 'y' + idx, side: 'right', showgrid: false 
        };
      }

      if (!(layout as any).annotations) (layout as any).annotations = [];
      (layout as any).annotations.push({
        text: '<b>' + plantLabel + '</b>',
        x: 0.5,
        y: (plants.length - i) / plants.length,
        xref: 'paper', yref: 'paper',
        xanchor: 'center', yanchor: 'bottom',
        showarrow: false,
        font: { size: 12, color: fontColor }
      });
    });

    (layout as any).xaxis = { title: 'Time', showgrid: graphConfig.showGrid !== false, gridcolor: gridColor, zeroline: false };
    return layout;
  };

  const getSubplotLayoutSinglePlant3Rows = (title: string, sub1: string, sub2: string, sub3: string): any => {
    const bg = graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e';
    const fontColor = graphConfig.bgWhite ? '#000000' : '#E0E0E0';
    const gridColor = graphConfig.bgWhite ? '#E5E5E5' : 'rgba(255,255,255,0.16)';
    const axisColor = graphConfig.bgWhite ? '#151515' : '#888888';
    
    let layout = {
      margin: { l: 60, r: 60, t: 80, b: 50 },
      paper_bgcolor: bg,
      plot_bgcolor: bg,
      showlegend: graphConfig.showLegend !== false,
      legend: { orientation: 'h', x: 0, y: 1.05, font: { size: 11, color: fontColor } },
      title: { text: title, font: { family: 'Inter, sans-serif', size: 14, color: fontColor, weight: 'bold' } },
      hovermode: 'x unified'
    };

    // Row 1: Freq & Active Power
    (layout as any).yaxis = { title: { text: 'P (MW)', font: { size: 10, color: fontColor } }, showgrid: graphConfig.showGrid !== false, gridcolor: gridColor, zeroline: true, zerolinecolor: axisColor, domain: [0.68, 0.98] };
    (layout as any).yaxis4 = { title: { text: 'F (Hz)', font: { size: 10, color: fontColor } }, overlaying: 'y', side: 'right', showgrid: false };
    
    // Row 2: SOC & Active Power
    (layout as any).yaxis2 = { title: { text: 'P (MW)', font: { size: 10, color: fontColor } }, showgrid: graphConfig.showGrid !== false, gridcolor: gridColor, zeroline: true, zerolinecolor: axisColor, domain: [0.35, 0.65] };
    (layout as any).yaxis5 = { title: { text: 'SOC (%)', font: { size: 10, color: fontColor } }, overlaying: 'y2', side: 'right', showgrid: false };

    // Row 3: Volt & Reactive Power
    (layout as any).yaxis3 = { title: { text: 'V (kV)', font: { size: 10, color: fontColor } }, showgrid: graphConfig.showGrid !== false, gridcolor: gridColor, zeroline: true, zerolinecolor: axisColor, domain: [0.02, 0.32] };
    (layout as any).yaxis6 = { title: { text: 'Q (MVar)', font: { size: 10, color: fontColor } }, overlaying: 'y3', side: 'right', showgrid: false };

    (layout as any).annotations = [
      { text: '<b>' + sub1 + '</b>', x: 0.5, y: 0.98, xref: 'paper', yref: 'paper', xanchor: 'center', yanchor: 'bottom', showarrow: false, font: { size: 11, color: fontColor } },
      { text: '<b>' + sub2 + '</b>', x: 0.5, y: 0.65, xref: 'paper', yref: 'paper', xanchor: 'center', yanchor: 'bottom', showarrow: false, font: { size: 11, color: fontColor } },
      { text: '<b>' + sub3 + '</b>', x: 0.5, y: 0.32, xref: 'paper', yref: 'paper', xanchor: 'center', yanchor: 'bottom', showarrow: false, font: { size: 11, color: fontColor } }
    ];

    (layout as any).xaxis = { title: 'Time', showgrid: graphConfig.showGrid !== false, gridcolor: gridColor, zeroline: false };
    return layout;
  };

  const getSubplotLayoutSinglePlant1Row = (title: string, y1Title: string, y2Title: string): any => {
    const bg = graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e';
    const fontColor = graphConfig.bgWhite ? '#000000' : '#E0E0E0';
    const gridColor = graphConfig.bgWhite ? '#E5E5E5' : 'rgba(255,255,255,0.16)';
    const axisColor = graphConfig.bgWhite ? '#151515' : '#888888';
    
    let layout: any = {
      margin: { l: 60, r: 60, t: 80, b: 80 },
      paper_bgcolor: bg,
      plot_bgcolor: bg,
      showlegend: graphConfig.showLegend !== false,
      title: { text: title, font: { family: 'Inter, sans-serif', size: 14, color: fontColor, weight: 'bold' } },
      hovermode: 'x unified'
    };

    // Build explicit hourly tick values for clean time labels
    const hourlyTickvals: string[] = [];
    const hourlyTicktext: string[] = [];
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, '0');
      hourlyTickvals.push(`${hh}:00:00`);
      hourlyTicktext.push(`${hh}:00:00`);
    }

    layout.yaxis = { 
      title: { text: `<b>${y1Title}</b>`, font: { size: 12, color: '#0072BD' } }, 
      tickfont: { color: '#0072BD', size: 10 },
      showgrid: graphConfig.showGrid !== false, 
      gridcolor: gridColor, 
      gridwidth: 1,
      linecolor: axisColor,
      linewidth: 1.2,
      mirror: true,
      zeroline: false,
      automargin: true,
      nticks: 20
    };

    if (y2Title) {
      layout.yaxis2 = { 
        title: { text: `<b>${y2Title}</b>`, font: { size: 12, color: '#D95319' } }, 
        tickfont: { color: '#D95319', size: 10 },
        overlaying: 'y', side: 'right', 
        showgrid: false,
        linecolor: axisColor,
        linewidth: 1.2,
        mirror: true,
        zeroline: false,
        automargin: true
      };
    }

    layout.xaxis = { 
      type: 'category',
      showgrid: graphConfig.showGrid !== false, 
      gridcolor: gridColor, 
      gridwidth: 1,
      linecolor: axisColor,
      linewidth: 1.2,
      mirror: true,
      zeroline: false,
      tickangle: -45,
      tickfont: { color: fontColor, size: 10 },
      tickvals: hourlyTickvals,
      ticktext: hourlyTicktext,
      automargin: true
    };
    return layout;
  };

  const b64ToUint8Array = (b64: string) => {
    const base64Part = b64.includes(",") ? b64.split(",")[1] : b64;
    const bin = atob(base64Part);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      u8[i] = bin.charCodeAt(i);
    }
    return u8;
  };

  const renderGraphToPng = async (traces: any[], layout: any, offscreenDiv: HTMLDivElement, composite?: { title: string, subplots: {traces: any[], layout: any}[] }): Promise<Uint8Array | null> => {
    try {
      if (composite) {
        const targetWidth = 1920;
        const targetHeight = 1080;
        const plotCount = composite.subplots.length;
        const titleText = composite.title;
        
        const titleHeight = titleText ? 60 : 0;
        const plotAreaHeight = targetHeight - titleHeight;
        const baseSubplotHeight = Math.floor(plotAreaHeight / plotCount);
        const remainder = plotAreaHeight - baseSubplotHeight * plotCount;
        const subplotHeights = Array.from({ length: plotCount }, (_, i) => baseSubplotHeight + (i < remainder ? 1 : 0));

        const imageUrls = [];
        for (let i = 0; i < plotCount; i++) {
          const { traces: subTraces, layout: subLayout } = composite.subplots[i];
          subLayout.margin = { l: 80, r: 60, t: 40, b: 80 }; 
          if (subLayout.xaxis) subLayout.xaxis.automargin = false;
          if (subLayout.yaxis) subLayout.yaxis.automargin = false;
          if (subLayout.yaxis2) subLayout.yaxis2.automargin = false;

          subLayout.title = { text: '<b>' + subLayout.title.text + '</b>', font: { family: 'Helvetica, Arial, sans-serif', size: 14, color: graphConfig.bgWhite ? '#000000' : '#E0E0E0' } };
          subLayout.legend = { orientation: 'v', x: 0.01, y: 0.99, bgcolor: graphConfig.bgWhite ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)', bordercolor: graphConfig.bgWhite ? '#000' : '#fff', borderwidth: 1, font: {size: 11, color: graphConfig.bgWhite ? '#000' : '#fff'} };
          const gd = await win.Plotly.newPlot(offscreenDiv, subTraces, subLayout, { staticPlot: true, displayModeBar: false });
          // Use scale 1.5 with 1280 base to match the text sizes the user wanted
          const scaledWidth = Math.floor(targetWidth / 1.5);
          const scaledHeight = Math.floor(subplotHeights[i] / 1.5);
          const b64 = await win.Plotly.toImage(gd, { format: 'png', width: scaledWidth, height: scaledHeight, scale: 1.5 });
          imageUrls.push(b64);
          win.Plotly.purge(offscreenDiv);
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const bgColor = graphConfig.bgWhite ? '#FFFFFF' : '#1a1a2e';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (titleText) {
          ctx.fillStyle = graphConfig.bgWhite ? '#000000' : '#E0E0E0';
          ctx.font = 'bold 24px Helvetica, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(titleText, targetWidth / 2, titleHeight / 2);
        }

        const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });

        let yOffset = titleHeight;
        for (let i = 0; i < imageUrls.length; i++) {
          const img = await loadImage(imageUrls[i]);
          ctx.drawImage(img, 0, yOffset, targetWidth, subplotHeights[i]);
          yOffset += subplotHeights[i];
        }

        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
        if (!blob) return null;
        const arrayBuffer = await blob.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      } else {
        const gd = await win.Plotly.newPlot(offscreenDiv, traces, layout, { staticPlot: true, displayModeBar: false });
        const b64 = await win.Plotly.toImage(gd, { format: 'png', width: 1280, height: 720, scale: 1.5 });
        return b64ToUint8Array(b64);
      }
    } catch (err) {
      console.error('PNG render failed:', err);
      return null;
    } finally {
      try { win.Plotly.purge(offscreenDiv); } catch (_) {}
    }
  };

  const allGraphs: { folder: string; name: string; metricId: string; traces: any[]; layout: any; composite?: { title: string, subplots: {traces: any[], layout: any}[] } }[] = [];

  const addMetricGraphs = (metric: string, folderName: string) => {
    const vTitle = is20PercentProject(project) ? 'Vavg (kV)' : 'V (kV)';
    const getVoltageTraces = (pk: string) => {
      if (is20PercentProject(project)) {
        const vab = evalData.vab?.[pk] || [];
        const vbc = evalData.vbc?.[pk] || [];
        const vca = evalData.vca?.[pk] || [];
        const vavg = vab.map((v: number, i: number) => (v + (vbc[i] || v) + (vca[i] || v)) / 3);
        return [
          applyTrace({ y: vavg, type: 'scatter', mode: 'lines', name: 'Vavg (kV)', xaxis: 'x', yaxis: 'y', line: { color: '#77AC30', width: 0.8 } }, 0)
        ];
      }
      return [
        applyTrace({ y: evalData.vab?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Vab', xaxis: 'x', yaxis: 'y', line: { color: '#0072BD', width: 1.2 } }, 0),
        applyTrace({ y: evalData.vbc?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Vbc', xaxis: 'x', yaxis: 'y', line: { color: '#77AC30', width: 1.2 } }, 1),
        applyTrace({ y: evalData.vca?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Vca', xaxis: 'x', yaxis: 'y', line: { color: '#7E2F8E', width: 1.2 } }, 2)
      ];
    };

    if (metric === 'f_p') {
      const subplots: any[] = [];
      plants.forEach(pk => {
        const label = pk === 'plant1' ? 'SWG01' : pk === 'plant2' ? 'SWG02' : 'SWG03';
        subplots.push({
          traces: [
            applyTrace({ y: evalData.pTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P total', xaxis: 'x', yaxis: 'y', line: { color: '#0072BD', width: 2 } }, 0),
            applyTrace({ y: evalData.freq?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Frequency', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 1.5 } }, 1)
          ],
          layout: getSubplotLayoutSinglePlant1Row(label + ' (Plant 0' + pk.slice(-1) + ') | Frequency & Active Power', 'P (MW)', 'F (Hz)')
        });
      });
      allGraphs.push({ folder: folderName, name: 'Freq & Active Power', metricId: 'f_p', traces: [], layout: {}, composite: { title: 'Frequency & Active Power All Plants', subplots } });
    } else if (metric === 'soc_p') {
      const subplots: any[] = [];
      plants.forEach(pk => {
        const label = pk === 'plant1' ? 'SWG01' : pk === 'plant2' ? 'SWG02' : 'SWG03';
        subplots.push({
          traces: [
            applyTrace({ y: evalData.pTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P total', xaxis: 'x', yaxis: 'y', line: { color: '#0072BD', width: 2 } }, 0),
            applyTrace({ y: evalData.cmdP?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P cmd', xaxis: 'x', yaxis: 'y', line: { color: '#D95319', width: 1.6, shape: 'hv' } }, 1),
            applyTrace({ y: evalData.remoteP?.[pk] || [], type: 'scatter', mode: 'lines', connectgaps: true, name: 'Remote P', xaxis: 'x', yaxis: 'y', line: { color: '#731A66', width: 1.6, shape: 'hv' } }, 2),
            applyTrace({ y: evalData.soc?.[pk] || [], type: 'scatter', mode: 'lines', name: 'SOC', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 2 } }, 3)
          ],
          layout: getSubplotLayoutSinglePlant1Row(label + ' (Plant 0' + pk.slice(-1) + ') | SOC & Active Power', 'P (MW)', 'SOC (%)')
        });
      });
      allGraphs.push({ folder: folderName, name: 'SOC & Active Power', metricId: 'soc_p', traces: [], layout: {}, composite: { title: 'SOC & Active Power All Plants', subplots } });
    } else if (metric === 'v_q') {
      const subplots: any[] = [];
      plants.forEach(pk => {
        const label = pk === 'plant1' ? 'SWG01' : pk === 'plant2' ? 'SWG02' : 'SWG03';
        subplots.push({
          traces: [
            ...getVoltageTraces(pk),
            applyTrace({ y: evalData.qTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Q total', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 1.3 } }, 3),
            applyTrace({ y: evalData.cmdQ?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Q cmd', xaxis: 'x', yaxis: 'y2', line: { color: '#000000', width: 1.6, shape: 'hv' } }, 4)
          ],
          layout: getSubplotLayoutSinglePlant1Row(label + ' (Plant 0' + pk.slice(-1) + ') | Reactive Power & Voltage', vTitle, 'Q (MVar)')
        });
      });
      allGraphs.push({ folder: folderName, name: 'Volt & Reactive Power', metricId: 'v_q', traces: [], layout: {}, composite: { title: 'Reactive Power & Voltage All Plants', subplots } });
    } else if (metric.startsWith('pf_')) {
      const pk = metric === 'pf_p1' ? 'plant1' : metric === 'pf_p2' ? 'plant2' : 'plant3';
      const label = pk === 'plant1' ? 'SWG01' : pk === 'plant2' ? 'SWG02' : 'SWG03';
      
      allGraphs.push({
        folder: folderName, name: label + ' - Powerflow Check', metricId: metric,
        traces: [], layout: {},
        composite: {
          title: label + ' (Plant 0' + pk.slice(-1) + ') | Powerflow (Daily Check)',
          subplots: [
            {
              traces: [
                applyTrace({ y: evalData.pTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P total', xaxis: 'x', yaxis: 'y', line: { color: '#0072BD', width: 2 } }, 0),
                applyTrace({ y: evalData.freq?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Frequency', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 1.5 } }, 1)
              ],
              layout: getSubplotLayoutSinglePlant1Row('Frequency & Active Power', 'P (MW)', 'F (Hz)')
            },
            {
              traces: [
                applyTrace({ y: evalData.pTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P total', xaxis: 'x', yaxis: 'y', line: { color: '#0072BD', width: 2 } }, 0),
                applyTrace({ y: evalData.cmdP?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P cmd', xaxis: 'x', yaxis: 'y', line: { color: '#D95319', width: 1.6, shape: 'hv' } }, 1),
                applyTrace({ y: evalData.remoteP?.[pk] || [], type: 'scatter', mode: 'lines', connectgaps: true, name: 'Remote P', xaxis: 'x', yaxis: 'y', line: { color: '#731A66', width: 1.6, shape: 'hv' } }, 2),
                applyTrace({ y: evalData.soc?.[pk] || [], type: 'scatter', mode: 'lines', name: 'SOC', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 2 } }, 3)
              ],
              layout: getSubplotLayoutSinglePlant1Row('SOC & Active Power', 'P (MW)', 'SOC (%)')
            },
            {
              traces: [
                ...getVoltageTraces(pk),
                applyTrace({ y: evalData.qTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Q total', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 1.3 } }, 3),
                applyTrace({ y: evalData.cmdQ?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Q cmd', xaxis: 'x', yaxis: 'y2', line: { color: '#000000', width: 1.8, shape: 'hv' } }, 4)
              ],
              layout: getSubplotLayoutSinglePlant1Row('Reactive Power & Voltage', vTitle, 'Q (MVar)')
            }
          ]
        }
      });
    } else if (metric === 'fig4') {
      plants.forEach(pk => {
        const label = pk === 'plant1' ? 'SWG01' : pk === 'plant2' ? 'SWG02' : 'SWG03';
        allGraphs.push({
          folder: folderName, name: label + ' - Powerflow Check', metricId: 'fig4',
          traces: [], layout: {},
          composite: {
            title: label + ' | Powerflow Check',
            subplots: [
              {
                traces: [
                  applyTrace({ y: evalData.pTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P total', xaxis: 'x', yaxis: 'y', line: { color: '#0072BD', width: 2 } }, 0),
                  applyTrace({ y: evalData.freq?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Frequency', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 1.5 } }, 1)
                ],
                layout: getSubplotLayoutSinglePlant1Row('Frequency & Active Power', 'P (MW)', 'F (Hz)')
              },
              {
                traces: [
                  applyTrace({ y: evalData.pTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P total', xaxis: 'x', yaxis: 'y', line: { color: '#0072BD', width: 2 } }, 0),
                  applyTrace({ y: evalData.cmdP?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P cmd', xaxis: 'x', yaxis: 'y', line: { color: '#D95319', width: 1.6, shape: 'hv' } }, 1),
                  applyTrace({ y: evalData.remoteP?.[pk] || [], type: 'scatter', mode: 'lines', connectgaps: true, name: 'Remote P', xaxis: 'x', yaxis: 'y', line: { color: '#731A66', width: 1.6, shape: 'hv' } }, 2),
                  applyTrace({ y: evalData.soc?.[pk] || [], type: 'scatter', mode: 'lines', name: 'SOC', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 2 } }, 3)
                ],
                layout: getSubplotLayoutSinglePlant1Row('SOC & Active Power', 'P (MW)', 'SOC (%)')
              },
              {
                traces: [
                  ...getVoltageTraces(pk),
                  applyTrace({ y: evalData.qTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Q total', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 1.3 } }, 3),
                  applyTrace({ y: evalData.cmdQ?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Q cmd', xaxis: 'x', yaxis: 'y2', line: { color: '#000000', width: 1.8, shape: 'hv' } }, 4)
                ],
                layout: getSubplotLayoutSinglePlant1Row('Reactive Power & Voltage', vTitle, 'Q (MVar)')
              }
            ]
          }
        });
      });
    } else if (metric === 'fig5') {
      const subplots: any[] = [];
      plants.forEach(pk => {
        const label = pk === 'plant1' ? 'SWG01' : pk === 'plant2' ? 'SWG02' : 'SWG03';
        subplots.push({
          traces: [
            applyTrace({ y: evalData.pTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P total', xaxis: 'x', yaxis: 'y', line: { color: '#0072BD', width: 2 } }, 0),
            applyTrace({ y: evalData.cmdP?.[pk] || [], type: 'scatter', mode: 'lines', name: 'P cmd', xaxis: 'x', yaxis: 'y', line: { color: '#D95319', width: 1.6, shape: 'hv' } }, 1),
            applyTrace({ y: evalData.remoteP?.[pk] || [], type: 'scatter', mode: 'lines', connectgaps: true, name: 'Remote P', xaxis: 'x', yaxis: 'y', line: { color: '#731A66', width: 1.6, shape: 'hv' } }, 2),
            applyTrace({ y: evalData.soc?.[pk] || [], type: 'scatter', mode: 'lines', name: 'SOC', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 2 } }, 3)
          ],
          layout: getSubplotLayoutSinglePlant1Row(label + ' (Plant 0' + pk.slice(-1) + ')', 'P (MW)', 'SOC (%)')
        });
      });
      allGraphs.push({ folder: folderName, name: 'Active Power & SOC', metricId: 'fig5', traces: [], layout: {}, composite: { title: 'Active Power & SOC (All Plants)', subplots } });
    } else if (metric === 'fig6') {
      const subplots: any[] = [];
      plants.forEach(pk => {
        const label = pk === 'plant1' ? 'SWG01' : pk === 'plant2' ? 'SWG02' : 'SWG03';
        subplots.push({
          traces: [
            ...getVoltageTraces(pk),
            applyTrace({ y: evalData.qTotal?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Q total', xaxis: 'x', yaxis: 'y2', line: { color: '#D95319', width: 1.3 } }, 3),
            applyTrace({ y: evalData.cmdQ?.[pk] || [], type: 'scatter', mode: 'lines', name: 'Q cmd', xaxis: 'x', yaxis: 'y2', line: { color: '#000000', width: 1.6, shape: 'hv' } }, 4)
          ],
          layout: getSubplotLayoutSinglePlant1Row(label + ' (Plant 0' + pk.slice(-1) + ')', vTitle, 'Q (MVar)')
        });
      });
      allGraphs.push({ folder: folderName, name: 'Volt & Reactive Power', metricId: 'fig6', traces: [], layout: {}, composite: { title: 'Volt & Reactive Power (All Plants)', subplots } });
    }
  };
  const p = getProjectPlants(project);
  const isBess = project.startsWith('SNTB') || project.startsWith('SNTV') || project.startsWith('SNTD') || project.startsWith('SNTZ') || project.startsWith('MSGP');

  if (isBess) {
    addMetricGraphs('f_p', 'Figure 1 - Freq & Active Power');
    addMetricGraphs('soc_p', 'Figure 2 - SOC & Active Power');
    addMetricGraphs('v_q', 'Figure 3 - Volt & Reactive Power');
    addMetricGraphs('fig4', 'Figure 4 - Powerflow Check');
    addMetricGraphs('fig5', 'Figure 5 - Active Power & SOC');
    addMetricGraphs('fig6', 'Figure 6 - Volt & Reactive Power');
  } else {
    p.forEach((pk, i) => {
      addMetricGraphs(`pf_p${i+1}`, `Figure ${i+1} - SWG0${i+1} Powerflow Check`);
    });
    addMetricGraphs('fig5', `Figure ${p.length + 1} - Active Power & SOC`);
    addMetricGraphs('fig6', `Figure ${p.length + 2} - Volt & Reactive Power`);
  }

  const total = allGraphs.length;
  const offscreenDiv = document.createElement('div');
  offscreenDiv.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1280px;height:720px;opacity:0;pointer-events:none;';
  document.body.appendChild(offscreenDiv);

  for (let i = 0; i < total; i++) {
    const g = allGraphs[i];
    setProgress({ pct: 60 + ((i + 1) / total) * 28, active: true, label: `Exporting Graph ${i + 1} of ${total}: ${g.name}...` });

    // Use full interactive customized HTML template
    let selectedPlant = 'plant1';
    if (g.name.includes('SWG02')) selectedPlant = 'plant2';
    if (g.name.includes('SWG03')) selectedPlant = 'plant3';
    
    const dateStr = (evalData.dataDate || '').replace(/-/g, '');
    const projLabel = project.includes('SNTL') ? project + 'MWH' : project;
    const safeName = g.name.replace(/\s+/g, '_').replace(/SWG/g, 'SPPC-');
    const prefix = `${i + 1}. ${dateStr}_${projLabel}_`;
    
    const htmlStr = generatePortableViewHtml(project, evalData, graphConfig, g.metricId, selectedPlant, []);
    const folderPrefix = baseFolder ? `${baseFolder}/` : 'Graphs/';
    zipEntries.push({
      name: `${folderPrefix}${g.folder}/${prefix}${safeName}.html`,
      data: new TextEncoder().encode(htmlStr)
    });

    await new Promise(r => setTimeout(r, 0));
  }
  
  document.body.removeChild(offscreenDiv);
};
