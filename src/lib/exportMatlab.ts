import { getProjectPlants } from './project-utils';

export const is20PercentProject = (proj: string) => 
  typeof proj === 'string' && (proj.startsWith('SNTB') || proj.startsWith('SNTV') || proj.startsWith('SNTD') || proj.startsWith('SNTZ') || proj.startsWith('MSGP'));

export const generateAllMatlabScripts = (project: string, evalData: any): { name: string; script: string; safeName: string }[] => {
  if (!evalData || !evalData.timestamps) return [];

  const plants = getProjectPlants(project);
  const allScripts: { name: string; script: string; safeName: string }[] = [];

  let graphConfig: any = {
    lineWidths: [2, 1.6, 1.6, 1.8, 1.2], 
    lineDash: ['solid', 'solid', 'solid', 'dash', 'dot'], 
    traceVisible: [true, true, true, true, true],
    bgWhite: true, 
    showGrid: true
  };
  try {
    const savedCfg = localStorage.getItem('ess_graph_config');
    if (savedCfg) graphConfig = { ...graphConfig, ...JSON.parse(savedCfg) };
  } catch(e) {}

  const configHeader = `
%% =========================================================================
% CONFIGURATION SECTION (Editable)
% Modify these values to customize the appearance of the generated plots
%% =========================================================================

% --- General Figure Settings ---
if ~exist('SAVE_FIG_AND_CLOSE', 'var')
    SAVE_FIG_AND_CLOSE = false;
end
if ${graphConfig.bgWhite ? 'true' : 'false'}
    FIG_BG_COLOR = 'w';
else
    FIG_BG_COLOR = [0.1 0.1 0.18];
end
FIG_POSITION = [100, 100, 1200, 800];
TILE_SPACING = 'compact';
TILE_PADDING = 'compact';

% --- Fonts & Typography ---
FONT_NAME = 'Arial';
FONT_SIZE_TITLE = 12;
FONT_SIZE_AXIS = 10;
FONT_SIZE_LEGEND = 9;

% --- Colors ---
COLOR_P_TOTAL   = '#0072BD';
COLOR_P_PV      = '#EDB120';
COLOR_P_BESS    = '#77AC30';
COLOR_FREQ      = '#D95319';
COLOR_SOC       = '#D95319';
COLOR_Q_TOTAL   = '#D95319';
COLOR_Q_BESS    = '#000000';
COLOR_CMD_P     = [0 0.5 0];
COLOR_CMD_Q     = [0 0 0];
COLOR_REMOTE_P  = [0.45 0.10 0.65];
COLOR_VAB       = [0.000 0.447 0.741];
COLOR_VBC       = [0.466 0.674 0.188];
COLOR_VCA       = [0.494 0.184 0.556];
COLOR_VAVG      = [0.466 0.674 0.188];

% --- Line Styles & Widths ---
LW_STANDARD     = ${graphConfig.lineWidths[0] || 1.2};
LW_BOLD         = ${graphConfig.lineWidths[1] || 1.6};
LW_THICK        = ${graphConfig.lineWidths[3] || 1.8};
LW_CMD          = 1.6;
LS_CMD          = ':';
MS_MARKER       = 6; % Marker Size

% --- Grid Settings ---
SHOW_GRID       = ${graphConfig.showGrid ? 'true' : 'false'};

% --- Y-Axis Margins & Centers ---
MARGIN_FACTOR   = 1.05;
P_CENTER_MW     = 0;
F_CENTER_HZ     = 50;
Q_CENTER_MVAR   = 0;

% --- Subplot Y-Limits ---
V_YLIM = [20, 25.6];

% --- Annotation Styling ---
ANNOTATION_BG   = [1 1 1 0.7];
ANNOTATION_EDGE = 'none';

%% =========================================================================
% END OF CONFIGURATION
%% =========================================================================
`;

  const commonHelpers = `
%% =========================================================================
% HELPER FUNCTIONS
%% =========================================================================

% Helper to balance Y-axes
function yl = centeredYLim(yData, centerPoint, marginFactor)
    if isempty(yData) || all(isnan(yData(:)))
        yl = centerPoint + [-10 10];
        return;
    end
    yMax = max(yData(:), [], 'omitnan');
    yMin = min(yData(:), [], 'omitnan');
    if isnan(yMax) || isnan(yMin)
        yl = centerPoint + [-10 10];
        return;
    end
    diffMax = abs(yMax - centerPoint);
    diffMin = abs(yMin - centerPoint);
    maxDiff = max(diffMax, diffMin);
    if maxDiff == 0
        maxDiff = 1;
    end
    yl = centerPoint + [-maxDiff maxDiff] * marginFactor;
end

% Helper to format axes
function formatAxis(ax, t, showLabels, fn, fs)
    xlim(ax, [min(t) max(t)]);
    try
        ax.XTick = dateshift(min(t), 'start', 'minute', 0) : minutes(30) : max(t);
    catch
    end
    if showLabels
        xtickformat(ax, 'HH:mm');
        xtickangle(ax, 45);
    else
        xticklabels(ax, {});
    end
    set(ax, 'FontName', fn, 'FontSize', fs);
end

% Create Draggable Annotation
function tb = createDraggableAnnotation(pos, str, bg, edge, fs, fn)
    tb = annotation('textbox', pos, 'String', str, ...
        'BackgroundColor', bg, 'EdgeColor', edge, ...
        'FontSize', fs, 'FontName', fn, 'FitBoxToText', 'on');
    
    set(tb, 'ButtonDownFcn', @dragStart);
    function dragStart(src, ~)
        fig = ancestor(src, 'figure');
        if isempty(fig), return; end
        startPt = get(fig, 'CurrentPoint');
        startPos = src.Position;
        set(fig, 'WindowButtonMotionFcn', @dragging);
        set(fig, 'WindowButtonUpFcn', @dragStop);
        function dragging(~, ~)
            currPt = get(fig, 'CurrentPoint');
            dx = (currPt(1) - startPt(1)) / fig.Position(3);
            dy = (currPt(2) - startPt(2)) / fig.Position(4);
            src.Position = [startPos(1)+dx, startPos(2)+dy, startPos(3), startPos(4)];
        end
        function dragStop(~, ~)
            set(fig, 'WindowButtonMotionFcn', '');
            set(fig, 'WindowButtonUpFcn', '');
        end
    end
end
`;

  const socHelpers = `
% Detect First Hit
function [tHit, yHit] = detectFirstHitInRange(tt, yData, rng, defaultVal)
    tHit = defaultVal; yHit = NaN;
    idx = find(yData >= rng(1) & yData <= rng(2), 1, 'first');
    if ~isempty(idx)
        tHit = tt(idx);
        yHit = yData(idx);
    end
end

function [tHit, yHit] = detectMaxSOCPoint(tt, yData)
    tHit = NaT; yHit = NaN;
    if all(isnan(yData)), return; end
    [yHit, idx] = max(yData, [], 'omitnan');
    tHit = tt(idx);
end

function [tHit, yHit, usedBand] = detectLowSOCAfterHigh(tt, yData, rng, tHigh)
    tHit = NaT; yHit = NaN; usedBand = false;
    if all(isnan(yData)), return; end
    if isnat(tHigh)
        startIdx = 1;
    else
        startIdx = find(tt >= tHigh, 1, 'first');
        if isempty(startIdx), startIdx = 1; end
    end
    
    subY = yData(startIdx:end);
    idxSub = find(subY >= rng(1) & subY <= rng(2), 1, 'first');
    if ~isempty(idxSub)
        usedBand = true;
        idx = startIdx + idxSub - 1;
        tHit = tt(idx);
        yHit = yData(idx);
    else
        [yHit, idxSub] = min(subY, [], 'omitnan');
        if ~isempty(idxSub)
            idx = startIdx + idxSub - 1;
            tHit = tt(idx);
        end
    end
end
`;

  const baseHeader = (title: string, dataFilename: string) => `
% MATLAB Script for ${title}
% Make sure to place the JSON data file in the same directory as this script.

${configHeader}

%% =========================================================================
% DATA LOADING & PREPARATION
%% =========================================================================
dataFilename = '${dataFilename}';
fid = fopen(dataFilename, 'r');
if fid < 0
    error('Could not open %s', dataFilename);
end
raw = fread(fid, '*char')';
fclose(fid);
data = jsondecode(raw);

% Convert timestamps
t = datetime(data.timestamps, 'InputFormat', 'yyyy-MM-dd''T''HH:mm:ss.SSSZ', 'TimeZone', 'UTC');
t.TimeZone = 'local';

%% =========================================================================
% FIGURE SETUP
%% =========================================================================
fig = figure('Name', '${title}', 'NumberTitle', 'off', 'Position', FIG_POSITION);
set(fig, 'Color', FIG_BG_COLOR);
if SAVE_FIG_AND_CLOSE
    set(fig, 'Visible', 'off');
end

tlo = tiledlayout(__TILES__, 1, 'TileSpacing', TILE_SPACING, 'Padding', TILE_PADDING);
title(tlo, '${title}', 'FontWeight', 'bold', 'FontSize', FONT_SIZE_TITLE, 'FontName', FONT_NAME);

axs = [];
`;

  const footerCode = (safeName: string) => `
if SAVE_FIG_AND_CLOSE
    set(fig, 'Visible', 'on');
    savefig(fig, '${safeName}.fig');
    close(fig);
end
`;

  const plantNameMap: any = { 'plant1': 'SWG01', 'plant2': 'SWG02', 'plant3': 'SWG03' };

  // --- GENERATORS ---

  const generateDailyEvaluationSummary = (pk: string) => {
    const scriptName = `Daily_Evaluation_Summary`;
    const dateStr = (evalData.dataDate || '').replace(/-/g, '');
    const projLabel = project.includes('SNTL') ? project + 'MWH' : project.includes('SNTV') ? project + ' 12MWH' : project.includes('SNTB') ? project + ' 30MWH' : project;
    const safeName = `${projLabel.replace(/\s+/g, '')}_${scriptName}_${dateStr}`;
    
    let script = baseHeader(`Daily Evaluation Summary`, 'evalData.json').replace('__TILES__', '3');
    
    script += `
%% =========================================================================
% EXTRACT PLANT DATA
%% =========================================================================
pTotal = data.pTotal.${pk};
if isfield(data, 'pPccPVS')
    pPccPVS = data.pPccPVS.${pk};
    pPV = data.pPV.${pk};
    pBESS = data.pBESS.${pk};
else
    pPccPVS = nan(size(pTotal));
    pPV = nan(size(pTotal));
    pBESS = nan(size(pTotal));
end
if isfield(data, 'qBess')
    qBess = data.qBess.${pk};
else
    qBess = nan(size(pTotal));
end
freq = data.freq.${pk};
cmdP = data.cmdP.${pk};
remoteP = data.remoteP.${pk};
soc = data.soc.${pk};
vab = data.vab.${pk};
vbc = data.vbc.${pk};
vca = data.vca.${pk};
qTotal = data.qTotal.${pk};
cmdQ = data.cmdQ.${pk};

% Determine active power to use
if any(~isnan(pPccPVS) & abs(pPccPVS) > 0.001)
    pPlot = pPccPVS;
else
    pPlot = pTotal;
end

%% =========================================================================
% TILE 1: FREQUENCY & ACTIVE POWER
%% =========================================================================
ax = nexttile; axs = [axs, ax];
yyaxis left; ax.YColor = COLOR_P_TOTAL;
plot(t, pPlot, '-', 'Color', COLOR_P_TOTAL, 'LineWidth', LW_STANDARD);
ylabel('P (MW)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(centeredYLim(pPlot, P_CENTER_MW, MARGIN_FACTOR));
if SHOW_GRID, grid on; end

yyaxis right; ax.YColor = COLOR_FREQ;
plot(t, freq, '-', 'Color', COLOR_FREQ, 'LineWidth', LW_BOLD);
ylabel('F (Hz)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(centeredYLim(freq, F_CENTER_HZ, MARGIN_FACTOR));
title('Frequency & Active Power', 'FontName', FONT_NAME);
legend({'P (POC)', 'Frequency'}, 'Location', 'northwest', 'FontSize', FONT_SIZE_LEGEND, 'FontName', FONT_NAME);
formatAxis(ax, t, true, FONT_NAME, FONT_SIZE_AXIS);

%% =========================================================================
% TILE 2: SOC & ACTIVE POWER
%% =========================================================================
ax = nexttile; axs = [axs, ax];
yyaxis left; ax.YColor = COLOR_P_TOTAL; hold on;
legH = gobjects(0); legT = {};
yDataAll = pPlot(:);

pPlotLine = plot(t, pPlot, '-', 'Color', COLOR_P_TOTAL, 'LineWidth', LW_STANDARD);
legH(end+1) = pPlotLine; legT{end+1} = 'P (POC)';

if any(~isnan(pPV) & abs(pPV) > 0.001)
    pPVPlot = plot(t, pPV, '-', 'Color', COLOR_P_PV, 'LineWidth', LW_BOLD);
    legH(end+1) = pPVPlot; legT{end+1} = 'P (PV) (MW)';
    yDataAll = [yDataAll; pPV(:)];
end

if any(~isnan(pBESS) & abs(pBESS) > 0.001)
    pBESSPlot = plot(t, pBESS, '-', 'Color', COLOR_P_BESS, 'LineWidth', LW_BOLD);
    legH(end+1) = pBESSPlot; legT{end+1} = 'P (BESS) (MW)';
    yDataAll = [yDataAll; pBESS(:)];
end

if any(~isnan(cmdP))
    pCmd = stairs(t, cmdP, 'LineStyle', LS_CMD, 'LineWidth', LW_CMD, 'Color', COLOR_CMD_P);
    legH(end+1) = pCmd; legT{end+1} = 'P command from NCC';
    yDataAll = [yDataAll; cmdP(:)];
end
if any(~isnan(remoteP))
    pRem = stairs(t, remoteP, 'LineStyle', '-', 'LineWidth', LW_CMD, 'Color', COLOR_REMOTE_P);
    legH(end+1) = pRem; legT{end+1} = 'Remote Active Power';
    yDataAll = [yDataAll; remoteP(:)];
end
ylabel('P (MW)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(centeredYLim(yDataAll, P_CENTER_MW, MARGIN_FACTOR));
if SHOW_GRID, grid on; end

yyaxis right; ax.YColor = COLOR_SOC;
pSOC = plot(t, soc, '-', 'Color', COLOR_SOC, 'LineWidth', LW_THICK);
ylabel('SOC (%)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS);
legH(end+1) = pSOC; legT{end+1} = 'SOC';
title('SOC & Active Power', 'FontName', FONT_NAME);
legend(legH, legT, 'Location', 'northwest', 'FontSize', FONT_SIZE_LEGEND, 'FontName', FONT_NAME);
formatAxis(ax, t, true, FONT_NAME, FONT_SIZE_AXIS);

%% =========================================================================
% TILE 3: REACTIVE POWER & VOLTAGE
%% =========================================================================
ax = nexttile; axs = [axs, ax];
yyaxis left; ax.YColor = COLOR_P_TOTAL; hold on;
legH3 = gobjects(0); legT3 = {};

${is20PercentProject(project) ? `vavg = (vab + vbc + vca) / 3;
pVavg = plot(t, vavg, '-', 'Color', COLOR_VAVG, 'LineWidth', LW_STANDARD);
ylabel('Vavg (kV)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(V_YLIM);
legH3(end+1) = pVavg; legT3{end+1} = 'Vavg (kV)';` : `pVab = plot(t, vab, '-', 'Color', COLOR_VAB, 'LineWidth', LW_STANDARD);
pVbc = plot(t, vbc, '-', 'Color', COLOR_VBC, 'LineWidth', LW_STANDARD);
pVca = plot(t, vca, '-', 'Color', COLOR_VCA, 'LineWidth', LW_STANDARD);
ylabel('V (kV)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(V_YLIM);
legH3 = [legH3, pVab, pVbc, pVca]; legT3 = [legT3, {'Vab', 'Vbc', 'Vca'}];`}
if SHOW_GRID, grid on; end

yyaxis right; ax.YColor = COLOR_Q_TOTAL; hold on;
pQ = plot(t, qTotal, '-', 'Color', COLOR_Q_TOTAL, 'LineWidth', LW_THICK);
legH3(end+1) = pQ; legT3{end+1} = 'Q total';
yDataQ = qTotal(:);

if any(~isnan(qBess) & abs(qBess) > 0.001) & any(~isnan(pBESS) & abs(pBESS) > 0.001)
    pQBess = plot(t, qBess, '-', 'Color', COLOR_Q_BESS, 'LineWidth', LW_BOLD);
    legH3(end+1) = pQBess; legT3{end+1} = 'Q (BESS) (MVar)';
    yDataQ = [yDataQ; qBess(:)];
end

if any(~isnan(cmdQ))
    pCmdQ = stairs(t, cmdQ, 'LineWidth', LW_CMD, 'Color', COLOR_CMD_Q, 'LineStyle', LS_CMD);
    legH3(end+1) = pCmdQ; legT3{end+1} = 'Q command from NCC';
    yDataQ = [yDataQ; cmdQ(:)];
end
ylabel('Q (MVar)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(centeredYLim(yDataQ, Q_CENTER_MVAR, MARGIN_FACTOR));
title('Reactive Power & Voltage', 'FontName', FONT_NAME);
legend(legH3, legT3, 'Location', 'northwest', 'FontSize', FONT_SIZE_LEGEND, 'FontName', FONT_NAME);
formatAxis(ax, t, true, FONT_NAME, FONT_SIZE_AXIS);

% linkaxes(axs, 'x');

%% =========================================================================
% ANNOTATIONS
%% =========================================================================
try
    if isfield(data, 'dataDate')
        dateStrPrint = char(string(data.dataDate));
    else
        dateStrPrint = 'N/A';
    end

    if isfield(data, 'dailyCycle') && isfield(data.dailyCycle, '${pk}')
        dCyc = data.dailyCycle.${pk};
    else
        dCyc = NaN;
    end
    if isfield(data, 'totalCycle') && isfield(data.totalCycle, '${pk}')
        tCyc = data.totalCycle.${pk};
    else
        tCyc = NaN;
    end

    if ~isnan(dCyc) || ~isnan(tCyc)
        strBox = {['Daily cycle (', dateStrPrint, '):'], ...
                  ['  Cycle Plant Avg = ', sprintf('%.3f', dCyc)], ...
                  '', ...
                  'Total cycle:', ...
                  ['  Total Plant Avg = ', sprintf('%.6f', tCyc)]};
        createDraggableAnnotation([0.22 0.01 0.15 0.05], strBox, ANNOTATION_BG, ANNOTATION_EDGE, FONT_SIZE_LEGEND, FONT_NAME);
    end
catch ME
    disp('Could not add cycle annotation: ' + string(ME.message));
end

${footerCode(safeName)}
${commonHelpers}
`;
    allScripts.push({ name: scriptName, script, safeName });
  };

  const generatePowerflow = (pk: string) => {
    const label = plantNameMap[pk];
    const scriptName = `${label}_Powerflow_Check`;
    
    const dateStr = (evalData.dataDate || '').replace(/-/g, '');
    const projLabel = project.includes('SNTL') ? project + 'MWH' : project;
    const cleanName = scriptName.replace(/\s+/g, '_').replace(/SWG/g, 'SPPC_').replace(/-/g, '_');
    const safeName = `${projLabel}_${cleanName}_${dateStr}`;
    
    let script = baseHeader(`${label} | Powerflow Check`, 'evalData.json').replace('__TILES__', '3');
    
    script += `
%% =========================================================================
% EXTRACT PLANT DATA
%% =========================================================================
pTotal = data.pTotal.${pk};
if isfield(data, 'pPccPVS')
    pPccPVS = data.pPccPVS.${pk};
    pPV = data.pPV.${pk};
    pBESS = data.pBESS.${pk};
else
    pPccPVS = nan(size(pTotal));
    pPV = nan(size(pTotal));
    pBESS = nan(size(pTotal));
end
if isfield(data, 'qBess')
    qBess = data.qBess.${pk};
else
    qBess = nan(size(pTotal));
end
freq = data.freq.${pk};
cmdP = data.cmdP.${pk};
remoteP = data.remoteP.${pk};
soc = data.soc.${pk};
vab = data.vab.${pk};
vbc = data.vbc.${pk};
vca = data.vca.${pk};
qTotal = data.qTotal.${pk};
cmdQ = data.cmdQ.${pk};

% Determine active power to use
if any(~isnan(pPccPVS) & abs(pPccPVS) > 0.001)
    pPlot = pPccPVS;
else
    pPlot = pTotal;
end

%% =========================================================================
% TILE 1: FREQUENCY & ACTIVE POWER
%% =========================================================================
ax = nexttile; axs = [axs, ax];
yyaxis left; ax.YColor = COLOR_P_TOTAL;
plot(t, pPlot, '-', 'Color', COLOR_P_TOTAL, 'LineWidth', LW_STANDARD);
ylabel('P (MW)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(centeredYLim(pPlot, P_CENTER_MW, MARGIN_FACTOR));
if SHOW_GRID, grid on; end

yyaxis right; ax.YColor = COLOR_FREQ;
plot(t, freq, '-', 'Color', COLOR_FREQ, 'LineWidth', LW_BOLD);
ylabel('F (Hz)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(centeredYLim(freq, F_CENTER_HZ, MARGIN_FACTOR));
title('Frequency & Active Power', 'FontName', FONT_NAME);
legend({'P total', 'Frequency'}, 'Location', 'northwest', 'FontSize', FONT_SIZE_LEGEND, 'FontName', FONT_NAME);
formatAxis(ax, t, true, FONT_NAME, FONT_SIZE_AXIS);

%% =========================================================================
% TILE 2: SOC & ACTIVE POWER
%% =========================================================================
ax = nexttile; axs = [axs, ax];
yyaxis left; ax.YColor = COLOR_P_TOTAL; hold on;
legH = gobjects(0); legT = {};
yDataAll = pPlot(:);

pPlotLine = plot(t, pPlot, '-', 'Color', COLOR_P_TOTAL, 'LineWidth', LW_STANDARD);
legH(end+1) = pPlotLine; legT{end+1} = 'P total';

if any(~isnan(pPV) & abs(pPV) > 0.001)
    pPVPlot = plot(t, pPV, '-', 'Color', COLOR_P_PV, 'LineWidth', LW_BOLD);
    legH(end+1) = pPVPlot; legT{end+1} = 'P (PV) (MW)';
    yDataAll = [yDataAll; pPV(:)];
end

if any(~isnan(pBESS) & abs(pBESS) > 0.001)
    pBESSPlot = plot(t, pBESS, '-', 'Color', COLOR_P_BESS, 'LineWidth', LW_BOLD);
    legH(end+1) = pBESSPlot; legT{end+1} = 'P (BESS) (MW)';
    yDataAll = [yDataAll; pBESS(:)];
end

if any(~isnan(cmdP))
    pCmd = stairs(t, cmdP, 'LineStyle', LS_CMD, 'LineWidth', LW_CMD, 'Color', COLOR_CMD_P);
    legH(end+1) = pCmd; legT{end+1} = 'P command from NCC';
    yDataAll = [yDataAll; cmdP(:)];
end
if any(~isnan(remoteP))
    pRem = plot(t, remoteP, '-', 'LineWidth', LW_CMD, 'Color', COLOR_REMOTE_P);
    legH(end+1) = pRem; legT{end+1} = 'Remote Active Power';
    yDataAll = [yDataAll; remoteP(:)];
end
ylabel('P (MW)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(centeredYLim(yDataAll, P_CENTER_MW, MARGIN_FACTOR));
if SHOW_GRID, grid on; end

yyaxis right; ax.YColor = COLOR_SOC;
pSOC = plot(t, soc, '-', 'Color', COLOR_SOC, 'LineWidth', LW_THICK);
ylabel('SOC (%)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS);
legH(end+1) = pSOC; legT{end+1} = 'SOC';
title('SOC & Active Power', 'FontName', FONT_NAME);
legend(legH, legT, 'Location', 'northwest', 'FontSize', FONT_SIZE_LEGEND, 'FontName', FONT_NAME);
formatAxis(ax, t, true, FONT_NAME, FONT_SIZE_AXIS);

%% =========================================================================
% TILE 3: REACTIVE POWER & VOLTAGE
%% =========================================================================
ax = nexttile; axs = [axs, ax];
yyaxis left; ax.YColor = COLOR_P_TOTAL; hold on;
legH3 = gobjects(0); legT3 = {};

${is20PercentProject(project) ? `vavg = (vab + vbc + vca) / 3;
pVavg = plot(t, vavg, '-', 'Color', COLOR_VAVG, 'LineWidth', LW_STANDARD);
ylabel('Vavg (kV)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(V_YLIM);
legH3(end+1) = pVavg; legT3{end+1} = 'Vavg (kV)';` : `pVab = plot(t, vab, '-', 'Color', COLOR_VAB, 'LineWidth', LW_STANDARD);
pVbc = plot(t, vbc, '-', 'Color', COLOR_VBC, 'LineWidth', LW_STANDARD);
pVca = plot(t, vca, '-', 'Color', COLOR_VCA, 'LineWidth', LW_STANDARD);
ylabel('V (kV)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(V_YLIM);
legH3 = [legH3, pVab, pVbc, pVca]; legT3 = [legT3, {'Vab', 'Vbc', 'Vca'}];`}
if SHOW_GRID, grid on; end

yyaxis right; ax.YColor = COLOR_Q_TOTAL; hold on;
pQ = plot(t, qTotal, '-', 'Color', COLOR_Q_TOTAL, 'LineWidth', LW_THICK);
legH3(end+1) = pQ; legT3{end+1} = 'Q total';
yDataQ = qTotal(:);

if any(~isnan(qBess) & abs(qBess) > 0.001) & any(~isnan(pBESS) & abs(pBESS) > 0.001)
    pQBess = plot(t, qBess, '-', 'Color', COLOR_Q_BESS, 'LineWidth', LW_BOLD);
    legH3(end+1) = pQBess; legT3{end+1} = 'Q (BESS) (MVar)';
    yDataQ = [yDataQ; qBess(:)];
end

if any(~isnan(cmdQ))
    pCmdQ = stairs(t, cmdQ, 'LineWidth', LW_CMD, 'Color', COLOR_CMD_Q, 'LineStyle', LS_CMD);
    legH3(end+1) = pCmdQ; legT3{end+1} = 'Q command from NCC';
    yDataQ = [yDataQ; cmdQ(:)];
end
ylabel('Q (MVar)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(centeredYLim(yDataQ, Q_CENTER_MVAR, MARGIN_FACTOR));
title('Reactive Power & Voltage', 'FontName', FONT_NAME);
legend(legH3, legT3, 'Location', 'northwest', 'FontSize', FONT_SIZE_LEGEND, 'FontName', FONT_NAME);
formatAxis(ax, t, true, FONT_NAME, FONT_SIZE_AXIS);

% linkaxes(axs, 'x');
${footerCode(safeName)}
${commonHelpers}
`;
    allScripts.push({ name: scriptName, script, safeName });
  };

  const generateSocAllPlants = () => {
    const scriptName = 'Active_Power_SOC_All_Plants';
    
    const dateStr = (evalData.dataDate || '').replace(/-/g, '');
    const projLabel = project.includes('SNTL') ? project + 'MWH' : project;
    const safeName = `${projLabel}_${scriptName}_${dateStr}`;
    
    let script = baseHeader('Active Power & SOC (All Plants)', 'evalData.json').replace('__TILES__', plants.length.toString());
    script += `
SOC_HIGH_rng = [94.8 95.2];
SOC_LOW_rng  = [4.9  5.3 ];
`;
    plants.forEach((pk, i) => {
      script += `
%% =========================================================================
% PLANT: ${pk}
%% =========================================================================
% Extract plant data
pTotal = data.pTotal.${pk};
if isfield(data, 'pPccPVS')
    pPccPVS = data.pPccPVS.${pk};
    pPV = data.pPV.${pk};
    pBESS = data.pBESS.${pk};
else
    pPccPVS = nan(size(pTotal));
    pPV = nan(size(pTotal));
    pBESS = nan(size(pTotal));
end
soc = data.soc.${pk};
cmdP = data.cmdP.${pk};
remoteP = data.remoteP.${pk};

% Determine active power to use
if any(~isnan(pPccPVS) & abs(pPccPVS) > 0.001)
    pPlot = pPccPVS;
else
    pPlot = pTotal;
end

% --- Tile ${i+1}: Active Power & SOC ---
ax = nexttile; axs = [axs, ax];
yyaxis left; ax.YColor = COLOR_P_TOTAL; hold on;
legH = gobjects(0); legT = {};
yDataAll = pPlot(:);

pPlotLine = plot(t, pPlot, '-', 'Color', COLOR_P_TOTAL, 'LineWidth', LW_STANDARD);
legH(end+1) = pPlotLine; legT{end+1} = 'P total';

if any(~isnan(pPV) & abs(pPV) > 0.001)
    pPVPlot = plot(t, pPV, '-', 'Color', COLOR_P_PV, 'LineWidth', LW_BOLD);
    legH(end+1) = pPVPlot; legT{end+1} = 'P (PV) (MW)';
    yDataAll = [yDataAll; pPV(:)];
end

if any(~isnan(pBESS) & abs(pBESS) > 0.001)
    pBESSPlot = plot(t, pBESS, '-', 'Color', COLOR_P_BESS, 'LineWidth', LW_BOLD);
    legH(end+1) = pBESSPlot; legT{end+1} = 'P (BESS) (MW)';
    yDataAll = [yDataAll; pBESS(:)];
end

if any(~isnan(cmdP))
    pCmd = stairs(t, cmdP, 'LineStyle', LS_CMD, 'LineWidth', LW_CMD, 'Color', COLOR_CMD_P);
    legH(end+1) = pCmd; legT{end+1} = 'P command from NCC';
    yDataAll = [yDataAll; cmdP(:)];
end
if any(~isnan(remoteP))
    pRem = plot(t, remoteP, '-', 'LineWidth', LW_CMD, 'Color', COLOR_REMOTE_P);
    legH(end+1) = pRem; legT{end+1} = 'Remote Active Power';
    yDataAll = [yDataAll; remoteP(:)];
end
ylabel('P (MW)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(centeredYLim(yDataAll, P_CENTER_MW, MARGIN_FACTOR));
if SHOW_GRID, grid on; end

yyaxis right; ax.YColor = COLOR_SOC; hold on;
pSOC = plot(t, soc, '-', 'Color', COLOR_SOC, 'LineWidth', LW_THICK);
ylabel('SOC (%)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS);
legH(end+1) = pSOC; legT{end+1} = 'SOC';

% SOC hit detection
[tHighBand, yHighBand] = detectFirstHitInRange(t, soc, SOC_HIGH_rng, NaT);
if ~isnat(tHighBand)
    tHigh = tHighBand; yHigh = yHighBand; highUsedBand = true;
else
    [tHigh, yHigh] = detectMaxSOCPoint(t, soc); highUsedBand = false;
end
if ~isnat(tHigh)
    hHigh = plot(tHigh, yHigh, 'o', 'LineWidth', LW_BOLD, 'MarkerSize', MS_MARKER);
    legH(end+1) = hHigh;
    if highUsedBand
        legT{end+1} = sprintf('High SOC hit %.1f-%.1f%%', SOC_HIGH_rng(1), SOC_HIGH_rng(2));
    else
        legT{end+1} = 'Max SOC point';
    end
end

[tLow, yLow, lowUsedBand] = detectLowSOCAfterHigh(t, soc, SOC_LOW_rng, tHigh);
if ~isnat(tLow)
    hLow = plot(tLow, yLow, 'o', 'LineWidth', LW_BOLD, 'MarkerSize', MS_MARKER);
    legH(end+1) = hLow;
    if lowUsedBand
        legT{end+1} = sprintf('Low SOC hit %.1f-%.1f%%', SOC_LOW_rng(1), SOC_LOW_rng(2));
    else
        legT{end+1} = 'Min SOC point';
    end
end

title('${plantNameMap[pk]} | Active Power & SOC', 'FontName', FONT_NAME);
legend(legH, legT, 'Location', 'northwest', 'FontSize', FONT_SIZE_LEGEND, 'FontName', FONT_NAME);
formatAxis(ax, t, true, FONT_NAME, FONT_SIZE_AXIS);
`;
    });
    script += `
%% =========================================================================
% ANNOTATIONS
%% =========================================================================
try
    if isfield(data, 'deviations')
        txtHigh = ['Max deviation (HIGH SOC): ', char(string(data.deviations.highSOC.pair)), ' = ', char(string(data.deviations.highSOC.text))];
        txtLow  = ['Max deviation (LOW SOC): ', char(string(data.deviations.lowSOC.pair)), ' = ', char(string(data.deviations.lowSOC.text))];
    else
        txtHigh = 'Max deviation (HIGH SOC): (not enough data)';
        txtLow  = 'Max deviation (LOW SOC): (not enough data)';
    end

    if isfield(data, 'dataDate')
        dateStrPrint = char(string(data.dataDate));
    else
        dateStrPrint = 'N/A';
    end

    cycleLines = {['Daily cycle (', dateStrPrint, '):']};
`;
    plants.forEach((pk) => {
      script += `    if isfield(data, 'dailyCycle') && isfield(data.dailyCycle, '${pk}')
        val = data.dailyCycle.${pk};
        cycleLines{end+1} = ['  ${plantNameMap[pk]}: ', sprintf('%.4f', val)];
    end\n`;
    });
    script += `
    if isfield(data, 'avgDailyCycle')
        cycleLines{end+1} = ['  Average: ', sprintf('%.4f', data.avgDailyCycle)];
    end

    totalCycleLines = {['Plant Total Cycle (', dateStrPrint, '):']};
`;
    plants.forEach((pk) => {
      script += `    if isfield(data, 'totalCycle') && isfield(data.totalCycle, '${pk}')
        val = data.totalCycle.${pk};
        totalCycleLines{end+1} = ['  ${plantNameMap[pk]}: ', sprintf('%.6f', val)];
    end\n`;
    });
    script += `
    if isfield(data, 'avgTotalCycle')
        totalCycleLines{end+1} = ['  Average: ', sprintf('%.6f', data.avgTotalCycle)];
    end

    txt1 = {'Max deviation timings:', ['  ', txtHigh], ['  ', txtLow]};
    
    createDraggableAnnotation([0.01, 0.01, 0.15, 0.05], cycleLines, ANNOTATION_BG, ANNOTATION_EDGE, FONT_SIZE_LEGEND, FONT_NAME);
    createDraggableAnnotation([0.17, 0.01, 0.15, 0.05], totalCycleLines, ANNOTATION_BG, ANNOTATION_EDGE, FONT_SIZE_LEGEND, FONT_NAME);
    createDraggableAnnotation([0.33, 0.01, 0.20, 0.05], txt1, ANNOTATION_BG, ANNOTATION_EDGE, FONT_SIZE_LEGEND, FONT_NAME);
catch ME
    disp('Could not add cycle annotation: ' + string(ME.message));
end

% linkaxes(axs, 'x');
${footerCode(safeName)}
${commonHelpers}
${socHelpers}
`;
    allScripts.push({ name: scriptName, script, safeName });
  };

  const generateVoltReactiveAllPlants = () => {
    const scriptName = 'Volt_Reactive_Power_All_Plants';
    
    const dateStr = (evalData.dataDate || '').replace(/-/g, '');
    const projLabel = project.includes('SNTL') ? project + 'MWH' : project;
    const safeName = `${projLabel}_${scriptName}_${dateStr}`;

    let script = baseHeader('Volt & Reactive Power (All Plants)', 'evalData.json').replace('__TILES__', plants.length.toString());
    plants.forEach((pk, i) => {
      script += `
%% =========================================================================
% PLANT: ${pk}
%% =========================================================================
ax = nexttile; axs = [axs, ax];
vab = data.vab.${pk};
vbc = data.vbc.${pk};
vca = data.vca.${pk};
qTotal = data.qTotal.${pk};
cmdQ = data.cmdQ.${pk};

yyaxis left; ax.YColor = COLOR_P_TOTAL; hold on;
pVab = plot(t, vab, '-', 'Color', COLOR_VAB, 'LineWidth', LW_STANDARD);
pVbc = plot(t, vbc, '-', 'Color', COLOR_VBC, 'LineWidth', LW_STANDARD);
pVca = plot(t, vca, '-', 'Color', COLOR_VCA, 'LineWidth', LW_STANDARD);
ylabel('V (kV)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(V_YLIM);
if SHOW_GRID, grid on; end

yyaxis right; ax.YColor = COLOR_Q_TOTAL; hold on;
legH = [pVab, pVbc, pVca]; legT = {'Vab', 'Vbc', 'Vca'};

pQ = plot(t, qTotal, '-', 'Color', COLOR_Q_TOTAL, 'LineWidth', LW_THICK);
legH(end+1) = pQ; legT{end+1} = 'Q total';
yDataQ = qTotal(:);

if any(~isnan(cmdQ))
    pCmdQ = stairs(t, cmdQ, 'LineWidth', LW_CMD, 'Color', COLOR_CMD_Q, 'LineStyle', LS_CMD);
    legH(end+1) = pCmdQ; legT{end+1} = 'Q command from NCC';
    yDataQ = [yDataQ; cmdQ(:)];
end
ylabel('Q (MVar)', 'FontName', FONT_NAME, 'FontSize', FONT_SIZE_AXIS); 
ylim(centeredYLim(yDataQ, Q_CENTER_MVAR, MARGIN_FACTOR));

title('${plantNameMap[pk]} | Reactive Power & Voltage', 'FontName', FONT_NAME);
legend(legH, legT, 'Location', 'northwest', 'FontSize', FONT_SIZE_LEGEND, 'FontName', FONT_NAME);
formatAxis(ax, t, true, FONT_NAME, FONT_SIZE_AXIS);
`;
    });
    script += `
% linkaxes(axs, 'x');
${footerCode(safeName)}
${commonHelpers}
`;
    allScripts.push({ name: scriptName, script, safeName });
  };

  // Add the scripts
  if (is20PercentProject(project)) {
    generateDailyEvaluationSummary(plants[0]);
  } else {
    plants.forEach(pk => generatePowerflow(pk));
    if (plants.length > 1) {
      generateSocAllPlants();
      generateVoltReactiveAllPlants();
    }
  }

  return allScripts;
};

export const exportMatlabScriptsToZip = async (
  project: string,
  evalData: any,
  zipEntries: { name: string; data: Uint8Array }[],
  setProgress: (prog: any) => void,
  baseFolder?: string
) => {
  const allScripts = generateAllMatlabScripts(project, evalData);
  if (allScripts.length === 0) return;

  // Generate evalData.json with standardized timestamps
  const timestampsStr = evalData.timestamps.map((t: any) => new Date(t).toISOString());
  const serializedEvalData = {
    ...evalData,
    timestamps: timestampsStr
  };
  const dataJson = JSON.stringify(serializedEvalData);
  const encoder = new TextEncoder();
  const folderPrefix = baseFolder ? `${baseFolder}/` : 'MATLAB_Export/';
  zipEntries.push({
    name: `${folderPrefix}evalData.json`,
    data: encoder.encode(dataJson)
  });

  const total = allScripts.length;
  for (let i = 0; i < total; i++) {
    const s = allScripts[i];
    setProgress({ pct: 60 + ((i + 1) / total) * 30, active: true, label: `Generating MATLAB script ${i + 1} of ${total}: ${s.name}...` });
    
    zipEntries.push({
      name: `${folderPrefix}${s.safeName}.m`,
      data: encoder.encode(s.script)
    });

    await new Promise(r => setTimeout(r, 0));
  }
};
