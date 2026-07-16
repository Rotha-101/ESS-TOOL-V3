import React, { useState, useEffect, useRef } from "react";
import { FileCode, Upload, Save, AlertTriangle, Download, RefreshCw, Bot, Send, Zap } from "lucide-react";
import { useAIContext } from '../lib/ai-context';
import { GEMINI_MODEL } from '../lib/ai-config';
import { GoogleGenAI } from "@google/genai";

interface Props {
  project: string;
  theme?: 'dark' | 'light';
}

export function ImportChartScript({ project, theme = 'dark' }: Props) {
  const isDark = theme === 'dark';
  // ── Theme tokens ──────────────────────────────────────────────────────────
  const bg        = isDark ? '#0A0B0D'  : '#F8F9FA';
  const bgPanel   = isDark ? '#111318'  : '#FFFFFF';
  const bgAI      = isDark ? '#0D0E12'  : '#F1F3F5';
  const bgCode    = isDark ? '#111318'  : '#FFFFFF';
  const bgMsg     = isDark ? '#1a1b23'  : '#EFF0F3';
  const bgCB      = isDark ? '#0A0B0D'  : '#F8F9FA';
  const border    = isDark ? '#1f2937'  : '#DDE1E7';
  const borderLt  = isDark ? 'rgba(31,41,55,0.6)' : 'rgba(203,213,225,0.8)';
  const textMain  = isDark ? '#D1D5DB'  : '#111827';
  const textSub   = isDark ? '#6B7280'  : '#6B7280';
  const textCode  = isDark ? '#D1D5DB'  : '#1E293B';
  const scrollBar = isDark ? '#374151 transparent' : '#CBD5E1 transparent';
  const codeBg    = isDark ? '#89DDFF'  : '#1E40AF';
  const codePre   = isDark ? '#374151 transparent' : '#CBD5E1 transparent';
  const [scriptContent, setScriptContent] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadSavedScript(project);
  }, [project]);

  const getDefaultScript = () => {
    const isSNTL400 = project === "SNTL400";

    return `/**
 * DEFAULT ENGINE SCRIPT FOR ${project}
 * ─────────────────────────────────────────────────────────────────────────────
 * This function is called by the JS Dynamic Plot engine.
 * 
 * Available data object fields:
 *   data.times        – string[] of "HH:MM:SS" labels (86400 points for 1Hz)
 *   data.timestamps   – Date[] objects matching times
 *   data.pTotal       – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – Active Power (MW)
 *   data.freq         – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – Frequency (Hz)
 *   data.soc          – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – State of Charge (%)
 *   data.cmdP         – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – NCC Active Power Command (MW)
 *   data.remoteP      – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – Remote Active Power (MW)
 *   data.dispatchP    – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – Dispatch Allocation (MW)
 *   data.vab          – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – Vab Voltage (kV)
 *   data.vbc          – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – Vbc Voltage (kV)
 *   data.vca          – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – Vca Voltage (kV)
 *   data.qTotal       – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – Reactive Power (MVar)
 *   data.cmdQ         – { plant1, plant2${isSNTL400 ? "" : ", plant3"} } – NCC Reactive Power Command (MVar)
 *   data.dataDate     – string – e.g. "May 15, 2026"
 * 
 * Return an object with:
 *   { traces: Plotly.Data[], layout: Partial<Plotly.Layout> }
 * ─────────────────────────────────────────────────────────────────────────────
 */
function generatePlotConfig(data) {
  const t = data.times || [];
  const p1 = data.pTotal?.plant1 || [];
  const p2 = data.pTotal?.plant2 || [];${isSNTL400 ? "" : "\n  const p3 = data.pTotal?.plant3 || [];"}
  const freq1 = data.freq?.plant1 || [];
  const freq2 = data.freq?.plant2 || [];${isSNTL400 ? "" : "\n  const freq3 = data.freq?.plant3 || [];"}
  const soc1 = data.soc?.plant1 || [];
  const soc2 = data.soc?.plant2 || [];${isSNTL400 ? "" : "\n  const soc3 = data.soc?.plant3 || [];"}
  const cmdP1 = data.cmdP?.plant1 || [];
  const cmdP2 = data.cmdP?.plant2 || [];${isSNTL400 ? "" : "\n  const cmdP3 = data.cmdP?.plant3 || [];"}
  const remP1 = data.remoteP?.plant1 || [];
  const remP2 = data.remoteP?.plant2 || [];${isSNTL400 ? "" : "\n  const remP3 = data.remoteP?.plant3 || [];"}
  const vab1  = data.vab?.plant1 || [];
  const vbc1  = data.vbc?.plant1 || [];
  const vca1  = data.vca?.plant1 || [];
  const q1    = data.qTotal?.plant1 || [];
  const cmdQ1 = data.cmdQ?.plant1 || [];

  // ── Shared layout builder (mimics MATLAB style) ────────────────────────────
  function mkLayout(title, y1label, y2label) {
    return {
      title: { text: '<b>' + title + '</b>', font: { size: 12, color: '#E0E0E0' } },
      margin: { l: 60, r: 60, t: 45, b: 50 },
      paper_bgcolor: '#1a1a2e',
      plot_bgcolor: '#1a1a2e',
      font: { color: '#E0E0E0', size: 10 },
      showlegend: true,
      legend: { x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top',
                bgcolor: 'rgba(20,20,40,0.85)', bordercolor: 'rgba(255,255,255,0.15)',
                borderwidth: 1, font: { size: 9 } },
      xaxis: { title: '<b>Time (HH:MM:SS)</b>', showgrid: true,
               gridcolor: 'rgba(255,255,255,0.05)', zeroline: false,
               tickfont: { size: 9 }, automargin: true },
      yaxis: { title: '<b>' + y1label + '</b>', showgrid: true,
               gridcolor: 'rgba(255,255,255,0.05)', zeroline: false,
               tickfont: { size: 9 }, automargin: true, fixedrange: true },
      yaxis2: { title: '<b>' + y2label + '</b>', overlaying: 'y', side: 'right',
                showgrid: false, zeroline: false,
                tickfont: { size: 9, color: '#D95319' },
                title_font: { color: '#D95319', size: 10 },
                automargin: true, fixedrange: true }
    };
  }

  // ── Build traces ───────────────────────────────────────────────────────────
  // NOTE: The DynamicPlot engine renders ONE plot container.
  // To show multiple subplots (like Figure 1 does in the native app), use the
  // Plotly subplot grid below OR pick ONE plant / ONE figure to focus on.
  // 
  // Example below: SWG01 – Powerflow Daily Check (3 stacked subplots via grid)

  const traces = [
    // ── Subplot 1: Frequency & Active Power ───────────────────────────────
    { x: t, y: p1,    type: 'scatter', mode: 'lines', name: 'P total (SWG01)',
      xaxis: 'x',  yaxis: 'y',  line: { color: '#0072BD', width: 2 } },
    { x: t, y: freq1, type: 'scatter', mode: 'lines', name: 'Frequency (SWG01)',
      xaxis: 'x',  yaxis: 'y2', line: { color: '#D95319', width: 1.5 } },

    // ── Subplot 2: SOC & Active Power ─────────────────────────────────────
    { x: t, y: p1,    type: 'scatter', mode: 'lines', name: 'P total (SWG01)',
      xaxis: 'x2', yaxis: 'y3', line: { color: '#0072BD', width: 1.2 }, showlegend: false },
    { x: t, y: cmdP1, type: 'scatter', mode: 'lines', name: 'P cmd NCC',
      xaxis: 'x2', yaxis: 'y3', line: { color: '#D95319', width: 1.6, shape: 'hv' } },
    { x: t, y: remP1, type: 'scatter', mode: 'lines', name: 'Remote Active Power',
      xaxis: 'x2', yaxis: 'y3', line: { color: '#731A66', width: 1.6 } },
    { x: t, y: soc1,  type: 'scatter', mode: 'lines', name: 'SOC',
      xaxis: 'x2', yaxis: 'y4', line: { color: '#D95319', width: 1.2 } },

    // ── Subplot 3: Reactive Power & Voltage ────────────────────────────────
    { x: t, y: vab1,  type: 'scatter', mode: 'lines', name: 'Vab',
      xaxis: 'x3', yaxis: 'y5', line: { color: '#0072BD', width: 1.2 } },
    { x: t, y: vbc1,  type: 'scatter', mode: 'lines', name: 'Vbc',
      xaxis: 'x3', yaxis: 'y5', line: { color: '#77AC30', width: 1.2 } },
    { x: t, y: vca1,  type: 'scatter', mode: 'lines', name: 'Vca',
      xaxis: 'x3', yaxis: 'y5', line: { color: '#7E2F8E', width: 1.2 } },
    { x: t, y: q1,    type: 'scatter', mode: 'lines', name: 'Q total',
      xaxis: 'x3', yaxis: 'y6', line: { color: '#D95319', width: 1.3 } },
    { x: t, y: cmdQ1, type: 'scatter', mode: 'lines', name: 'Q cmd NCC',
      xaxis: 'x3', yaxis: 'y6', line: { color: '#000000', width: 1.8, shape: 'hv' } },
  ];

  const bg = '#1a1a2e';
  const grid = 'rgba(255,255,255,0.05)';
  const fontColor = '#E0E0E0';

  const layout = {
    title: { text: '<b>SWG01 (Plant 01) | Powerflow Daily Check — ${project}</b>',
             font: { size: 13, color: fontColor } },
    paper_bgcolor: bg,
    plot_bgcolor: bg,
    font: { color: fontColor, size: 10 },
    height: 840,
    margin: { l: 65, r: 65, t: 50, b: 40 },
    showlegend: true,

    // 3-row subplot grid
    grid: { rows: 3, columns: 1, pattern: 'independent', roworder: 'top to bottom' },

    // ── Subplot 1 axes ────────────────────────────────────────────────────
    xaxis:  { showgrid: true, gridcolor: grid, zeroline: false, tickfont: { size: 9 }, automargin: true },
    yaxis:  { title: '<b>P (MW)</b>',  showgrid: true, gridcolor: grid, zeroline: false, fixedrange: true, tickfont: { size: 9 }, automargin: true },
    yaxis2: { title: '<b>F (Hz)</b>',  overlaying: 'y',  side: 'right', showgrid: false, zeroline: false, fixedrange: true,
              tickfont: { size: 9, color: '#D95319' }, title_font: { color: '#D95319', size: 10 }, automargin: true },

    // ── Subplot 2 axes ────────────────────────────────────────────────────
    xaxis2: { showgrid: true, gridcolor: grid, zeroline: false, tickfont: { size: 9 }, automargin: true },
    yaxis3: { title: '<b>P (MW)</b>',  showgrid: true, gridcolor: grid, zeroline: false, fixedrange: true, tickfont: { size: 9 }, automargin: true },
    yaxis4: { title: '<b>SOC (%)</b>', overlaying: 'y3', side: 'right', showgrid: false, zeroline: false, fixedrange: true, range: [0, 100],
              tickfont: { size: 9, color: '#D95319' }, title_font: { color: '#D95319', size: 10 }, automargin: true },

    // ── Subplot 3 axes ────────────────────────────────────────────────────
    xaxis3: { title: '<b>Time (HH:MM:SS)</b>', showgrid: true, gridcolor: grid, zeroline: false, tickfont: { size: 9 }, automargin: true },
    yaxis5: { title: '<b>V (kV)</b>',   showgrid: true, gridcolor: grid, zeroline: false, fixedrange: true, tickfont: { size: 9 }, automargin: true },
    yaxis6: { title: '<b>Q (MVar)</b>', overlaying: 'y5', side: 'right', showgrid: false, zeroline: false, fixedrange: true,
              tickfont: { size: 9, color: '#D95319' }, title_font: { color: '#D95319', size: 10 }, automargin: true },

    legend: { x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top',
              bgcolor: 'rgba(20,20,40,0.85)', bordercolor: 'rgba(255,255,255,0.15)',
              borderwidth: 1, font: { size: 9, color: fontColor } },
  };

  return { traces, layout };
}`;
  };

  const loadSavedScript = async (projId: string) => {
    const api = (window as any).electronAPI;
    if (api && api.loadChartScript) {
      setIsProcessing(true);
      setStatus("Loading saved chart script...");
      setError("");
      try {
        const res = await api.loadChartScript(projId);
        if (res.ok && res.content) {
          setScriptContent(res.content);
          setStatus(`✓ Successfully loaded custom plot script for ${projId}`);
        } else {
          setScriptContent(getDefaultScript());
          setStatus("No custom script found. Loaded default template.");
        }
      } catch (err: any) {
        setError(`Failed to load script: ${err.message}`);
      } finally {
        setIsProcessing(false);
      }
    } else {
      setScriptContent(getDefaultScript());
      setError("Not running in Desktop App. Loaded default template for preview.");
    }
  };

  const handleSave = async () => {
    const api = (window as any).electronAPI;
    if (!api || !api.saveChartScript) {
      setError("This feature is only available in the Electron Desktop App.");
      return;
    }
    
    setIsProcessing(true);
    setStatus("Saving script to engine...");
    try {
      const res = await api.saveChartScript(project, scriptContent);
      if (res.ok) {
        setStatus(`✓ Custom plot script saved for ${project}! Graphs will now use this script.`);
      } else {
        setError(`Failed to save: ${res.error}`);
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setScriptContent(event.target?.result as string);
      setStatus(`Loaded script from file: ${file.name}`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDownloadDefault = () => {
    const defaultScript = getDefaultScript();
    const blob = new Blob([defaultScript], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.replace(/\s+/g, '_')}_default_engine.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus(`Downloaded default engine template for ${project}`);
  };

  return (
    <section
      className="flex-1 flex flex-col overflow-hidden rounded-lg border"
      style={{ margin: 0, background: bg, borderColor: border }}
    >
      {/* ── Top Toolbar ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ background: bgPanel, borderBottom: `1px solid ${border}` }}>
        <div className="font-bold text-sm flex items-center gap-3" style={{ color: textMain }}>
          <FileCode size={16} className="text-blue-400" />
          JS Chart Scripts
          <span className="ml-4 rounded px-2 py-1 text-xs uppercase font-mono" style={{ background: bg, border: `1px solid ${border}`, color: textMain }}>
            {project}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => loadSavedScript(project)} disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 rounded transition-colors"
            style={{ background: isDark ? 'rgba(55,65,81,0.5)' : '#E5E7EB', color: textMain }}
          >
            <RefreshCw size={14} />
            Display Current Engine
          </button>
          <button onClick={handleDownloadDefault}
            className="px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 rounded transition-colors"
            style={{ background: isDark ? 'rgba(55,65,81,0.5)' : '#E5E7EB', color: textMain }}
          >
            <Download size={14} />
            Download Default Engine
          </button>
          <label className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer rounded transition-colors">
            <Upload size={14} />
            Upload .js
            <input type="file" className="hidden" accept=".js,.txt" onChange={handleFileUpload} />
          </label>
          <button onClick={handleSave} disabled={isProcessing} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 rounded transition-colors">
            <Save size={14} />
            Save to Engine
          </button>
        </div>
      </div>

      {/* Status Bar */}
      {(status || error) && (
        <div className={`px-4 py-2 text-xs font-mono font-bold flex items-center gap-2 ${error ? 'bg-red-500/10 text-red-400 border-b border-red-500/20' : 'bg-green-500/10 text-green-400 border-b border-green-500/20'}`}>
          {error ? <AlertTriangle size={14} /> : null}
          {error || status}
        </div>
      )}

      {/* ── Split Pane: Editor LEFT | AI Agent RIGHT ─────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Code Editor */}
        <div className="flex-1 p-4 overflow-hidden flex flex-col min-w-0" style={{ background: bg }}>
          <div className="mb-3 text-xs uppercase font-bold" style={{ color: textSub }}>
            Define `generatePlotConfig(data)` function:
          </div>
          <textarea
            value={scriptContent}
            onChange={(e) => setScriptContent(e.target.value)}
            placeholder={`function generatePlotConfig(data) {\n  return {\n    traces: [\n      { x: data.times, y: data.pTotal.plant1, type: 'scatter', name: 'Plant 1 Power' }\n    ],\n    layout: { title: 'Dynamic Custom Plot' }\n  };\n}`}
            className="flex-1 w-full font-mono text-[13px] leading-relaxed p-4 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            style={{
              background: bgCode,
              color: textCode,
              border: `1px solid ${border}`,
              scrollbarWidth: 'thin',
              scrollbarColor: scrollBar,
            }}
            spellCheck="false"
          />
        </div>

        {/* Divider */}
        <div className="w-px shrink-0" style={{ background: border }} />

        {/* AI Agent Panel */}
        <ScriptAIAgent
          scriptContent={scriptContent}
          project={project}
          theme={theme}
          onApplyCode={(newCode) => {
            setScriptContent(newCode);
            setStatus("✓ AI applied new code to editor. Review and click Save to Engine.");
          }}
        />
      </div>
    </section>
  );
}

// ── AI Agent Sub-Component ────────────────────────────────────────────────────

interface AIAgentProps {
  scriptContent: string;
  project: string;
  theme: 'dark' | 'light';
  onApplyCode: (code: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  codeBlock?: string;
}

function ScriptAIAgent({ scriptContent, project, theme, onApplyCode }: AIAgentProps) {
  const { apiKey, provider, connectionStatus } = useAIContext();
  const isDark = theme === 'dark';
  const bgAI    = isDark ? '#0D0E12' : '#F1F3F5';
  const bgPanel = isDark ? '#111318' : '#FFFFFF';
  const bgMsg   = isDark ? '#1a1b23' : '#EFF0F3';
  const bgCB    = isDark ? '#0A0B0D' : '#F8F9FA';
  const border  = isDark ? '#1f2937' : '#DDE1E7';
  const textMain = isDark ? '#E5E7EB' : '#111827';
  const textSub  = isDark ? '#6B7280' : '#6B7280';
  const textCode = isDark ? '#9CA3AF' : '#374151';
  const scrollBar = isDark ? '#374151 transparent' : '#CBD5E1 transparent';
  const codeBg   = isDark ? '#1e2030' : '#EFF6FF';
  const codeColor = isDark ? '#89DDFF' : '#1D4ED8';
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `👋 Hi! I'm your **Chart Script AI Assistant** for **${project}**.\n\nI can help you:\n• **Modify** the engine code (add new traces, change colors, add subplots)\n• **Debug** errors in your script\n• **Explain** how specific parts of the code work\n• **Generate** new plot configurations from scratch\n\nI can see your current code in the editor. Just describe what you want to change!`
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const extractCodeBlock = (text: string): { cleaned: string; code: string | undefined } => {
    const codeMatch = text.match(/```(?:javascript|js)?\n?([\s\S]*?)```/);
    if (codeMatch) {
      return {
        cleaned: text.replace(/```(?:javascript|js)?\n?[\s\S]*?```/, '').trim(),
        code: codeMatch[1].trim()
      };
    }
    return { cleaned: text, code: undefined };
  };

  const callAI = async (userMessage: string) => {
    const systemPrompt = `You are an expert Plotly.js and JavaScript chart scripting assistant embedded inside the ESS Toolbox application.

The user is editing a JavaScript chart engine script for project: ${project}.

The current script in the editor is:
\`\`\`javascript
${scriptContent}
\`\`\`

Available data object fields:
- data.times        – string[] "HH:MM:SS" labels
- data.timestamps   – Date[] objects
- data.pTotal       – { plant1, plant2, plant3 } – Active Power (MW)
- data.freq         – { plant1, plant2, plant3 } – Frequency (Hz)
- data.soc          – { plant1, plant2, plant3 } – State of Charge (%)
- data.cmdP         – { plant1, plant2, plant3 } – NCC Power Command (MW)
- data.remoteP      – { plant1, plant2, plant3 } – Remote Active Power (MW)
- data.dispatchP    – { plant1, plant2, plant3 } – Dispatch Allocation (MW)
- data.vab/vbc/vca  – { plant1, plant2, plant3 } – Voltages (kV)
- data.qTotal       – { plant1, plant2, plant3 } – Reactive Power (MVar)
- data.cmdQ         – { plant1, plant2, plant3 } – NCC Q Command (MVar)
- data.dataDate     – string

The function must return: { traces: Plotly.Data[], layout: Partial<Plotly.Layout> }

When providing modified code, ALWAYS wrap it in a \`\`\`javascript code block so it can be applied directly to the editor.
Be concise and helpful. If you write new code, write the COMPLETE generatePlotConfig function, not just a snippet.`;

    if (!apiKey) {
      return `I need an API key to work. Please go to **System Settings > AI Agent Setup** and enter your API key, then try again.`;
    }

    if (provider !== 'gemini') {
      // Mock response for other providers since we only have direct fetch for Gemini in this component
      await new Promise(r => setTimeout(r, 1000));
      return `*Connected to ${provider.toUpperCase()} API.* (Note: Chart Script AI relies on Gemini's specific instructions. Please switch to Gemini in System Settings for full code generation, or use the main AI Agent.)`;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\nUser request: ' + userMessage }] }
        ],
        config: {
          temperature: 0.4,
          maxOutputTokens: 4096
        }
      });
      return response.text || 'No response received.';
    } catch (err: any) {
      throw new Error(err?.message || 'Failed to generate content');
    }
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isLoading) return;
    setInput('');

    const userMsg: ChatMessage = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const raw = await callAI(msg);
      const { cleaned, code } = extractCodeBlock(raw);
      const assistantMsg: ChatMessage = { role: 'assistant', content: cleaned || raw, codeBlock: code };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${err.message}\n\nPlease check your API Key in **System Settings > AI Agent Setup**.`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessage = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, `<code style="background:${codeBg};padding:1px 4px;border-radius:3px;font-size:11px;color:${codeColor}">$1</code>`)
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="w-[480px] shrink-0 flex flex-col overflow-hidden" style={{ background: bgAI, borderLeft: `1px solid ${border}` }}>
      {/* AI Panel Header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0" style={{ background: bgPanel, borderBottom: `1px solid ${border}` }}>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
          <Bot size={15} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: textMain }}>Chart Script AI</div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: textSub }}>Modify • Debug • Generate</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-400 animate-pulse' : connectionStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'}`} />
          <span className={`text-[10px] font-bold ${connectionStatus === 'connected' ? 'text-green-500' : connectionStatus === 'connecting' ? 'text-yellow-500' : connectionStatus === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
            {connectionStatus === 'connected' ? 'Ready' : connectionStatus === 'connecting' ? 'Connecting...' : connectionStatus === 'error' ? 'Error' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Quick Action Chips */}
      <div className="px-4 py-2.5 flex flex-wrap gap-1.5 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
        {[
          'Add Plant 2 traces',
          'Change to dark theme',
          'Add SOC subplot',
          'Explain this code',
          'Fix any errors',
          'Add annotations',
        ].map(chip => (
          <button
            key={chip}
            onClick={() => { setInput(chip); inputRef.current?.focus(); }}
            className="text-[10px] px-2.5 py-0.5 rounded-full border transition-colors font-mono"
            style={{
              background: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(219,234,254,0.8)',
              color: '#3B82F6',
              borderColor: isDark ? 'rgba(59,130,246,0.2)' : 'rgba(147,197,253,0.6)',
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0"
        style={{ scrollbarWidth: 'thin', scrollbarColor: scrollBar }}
      >
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[95%] px-3.5 py-2.5 rounded-xl text-[12px] leading-relaxed ${
                msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
              }`}
              style={{
                background: msg.role === 'user' ? '#2563EB' : bgMsg,
                color: msg.role === 'user' ? '#FFFFFF' : textMain,
                border: msg.role === 'user' ? 'none' : `1px solid ${border}`,
              }}
            >
              {msg.role === 'assistant' ? (
                <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
              ) : (
                msg.content
              )}
            </div>
            {msg.codeBlock && (
              <div className="w-full rounded-lg overflow-hidden" style={{ background: bgCB, border: `1px solid ${border}` }}>
                <div className="flex items-center justify-between px-3 py-1.5" style={{ background: bgPanel, borderBottom: `1px solid ${border}` }}>
                  <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: textSub }}>Generated Code</span>
                  <button
                    onClick={() => onApplyCode(msg.codeBlock!)}
                    className="text-[10px] px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white rounded font-bold flex items-center gap-1 transition-colors"
                  >
                    <Zap size={10} />
                    Apply to Editor
                  </button>
                </div>
                <pre
                  className="text-[10px] font-mono p-3 leading-relaxed whitespace-pre-wrap"
                  style={{
                    maxHeight: '150px',
                    overflowY: 'auto',
                    overflowX: 'auto',
                    scrollbarWidth: 'thin',
                    scrollbarColor: scrollBar,
                    color: textCode,
                  }}
                >
                  {msg.codeBlock.slice(0, 600)}{msg.codeBlock.length > 600 ? '...' : ''}
                </pre>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start">
            <div className="rounded-xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2" style={{ background: bgMsg, border: `1px solid ${border}` }}>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[11px]" style={{ color: textSub }}>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pt-2 pb-2 shrink-0" style={{ borderTop: `1px solid ${border}`, background: bgAI }}>
        <div
          className="flex items-center gap-0 rounded-xl overflow-hidden transition-all"
          style={{
            border: `1px solid ${input.trim() ? 'rgba(59,130,246,0.6)' : border}`,
            background: bgPanel,
            boxShadow: input.trim() ? '0 0 0 1px rgba(59,130,246,0.1)' : 'none',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI to modify your chart code…"
            rows={1}
            className="flex-1 bg-transparent text-[11.5px] font-mono px-3 py-2.5 resize-none focus:outline-none leading-relaxed"
            style={{
              maxHeight: '72px',
              scrollbarWidth: 'thin',
              scrollbarColor: scrollBar,
              color: textMain,
            }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            title="Send (Enter)"
            className="w-9 h-9 mr-1 shrink-0 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 active:scale-95"
          >
            {isLoading
              ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Send size={13} className="text-white" />
            }
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <span className="text-[9px] font-mono" style={{ color: textSub }}>⏎ Send&nbsp;&nbsp;⇧⏎ New line</span>
          <div className="flex items-center gap-1.5">
            {input.length > 0 && (
              <span className="text-[9px] font-mono" style={{ color: textSub }}>{input.length} chars</span>
            )}
            <span className="text-[9px] font-mono flex items-center gap-1" style={{ color: textSub }}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70 inline-block" />
              Gemini Flash
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
