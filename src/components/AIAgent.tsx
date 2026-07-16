import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Loader2, User, ImagePlus, X, Trash2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GEMINI_MODEL } from '../lib/ai-config';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { useAIContext } from '../lib/ai-context';
import { DailyEvaluationGraph } from "../features/daily-evaluation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function serializeTelemetryData(importedGraph: any, activeMetric: string, selectedPlant: string) {
  if (!importedGraph || !importedGraph.evalData) return '';

  const { evalData } = importedGraph;
  const timestamps = evalData.timestamps;
  const plant = selectedPlant;

  const formatTime = (d: any) => {
    try {
      const dateObj = new Date(d);
      const hh = String(dateObj.getHours()).padStart(2, '0');
      const mm = String(dateObj.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch (e) {
      return 'N/A';
    }
  };

  let description = `\n\n--- IMPORTED TELEMETRY DATA ---\n`;
  description += `Project: ${importedGraph.project}\n`;
  description += `Plant: ${plant}\n`;
  description += `Data Date: ${evalData.dataDate || 'N/A'}\n`;
  description += `Active Metric: ${activeMetric}\n\n`;

  if (activeMetric === 'soc_p') {
    const pTotal = evalData.pTotal?.[plant] || [];
    const soc = evalData.soc?.[plant] || [];
    const cmdP = evalData.cmdP?.[plant] || [];
    const remoteP = evalData.remoteP?.[plant] || [];

    if (pTotal.length > 0) {
      const maxP = Math.max(...pTotal);
      const minP = Math.min(...pTotal);
      const avgP = pTotal.reduce((a: number, b: number) => a + b, 0) / pTotal.length;
      const maxSoc = Math.max(...soc);
      const minSoc = Math.min(...soc);

      description += `Key Statistics:\n`;
      description += `- Active Power (P Total): Max = ${maxP.toFixed(2)} MW, Min = ${minP.toFixed(2)} MW, Avg = ${avgP.toFixed(2)} MW\n`;
      description += `- Battery SOC: Max = ${maxSoc.toFixed(1)}%, Min = ${minSoc.toFixed(1)}%\n`;
      description += `- Daily Cycle: ${evalData.dailyCycle?.[plant] || 'N/A'}\n`;
      description += `- Total Cycle Count: ${evalData.totalCycle?.[plant] || 'N/A'}\n\n`;
    }

    description += `Time-Series Samples (every 30 mins):\n`;
    description += `| Time | P Total (MW) | SOC (%) | P Command (MW) | Remote P (MW) |\n`;
    description += `|---|---|---|---|---|\n`;
    for (let i = 0; i < timestamps.length; i += 6) {
      if (!timestamps[i]) continue;
      const timeStr = formatTime(timestamps[i]);
      description += `| ${timeStr} | ${pTotal[i]?.toFixed(2) ?? 'N/A'} | ${soc[i]?.toFixed(1) ?? 'N/A'} | ${cmdP[i]?.toFixed(2) ?? 'N/A'} | ${remoteP[i]?.toFixed(2) ?? 'N/A'} |\n`;
    }
  } else if (activeMetric === 'f_p') {
    const pTotal = evalData.pTotal?.[plant] || [];
    const freq = evalData.freq?.[plant] || [];

    if (pTotal.length > 0) {
      const maxP = Math.max(...pTotal);
      const minP = Math.min(...pTotal);
      const avgP = pTotal.reduce((a: number, b: number) => a + b, 0) / pTotal.length;
      const maxFreq = Math.max(...freq);
      const minFreq = Math.min(...freq);
      const avgFreq = freq.reduce((a: number, b: number) => a + b, 0) / freq.length;

      description += `Key Statistics:\n`;
      description += `- Active Power (P Total): Max = ${maxP.toFixed(2)} MW, Min = ${minP.toFixed(2)} MW, Avg = ${avgP.toFixed(2)} MW\n`;
      description += `- Grid Frequency: Max = ${maxFreq.toFixed(4)} Hz, Min = ${minFreq.toFixed(4)} Hz, Avg = ${avgFreq.toFixed(4)} Hz\n\n`;
    }

    description += `Time-Series Samples (every 30 mins):\n`;
    description += `| Time | P Total (MW) | Frequency (Hz) |\n`;
    description += `|---|---|---|\n`;
    for (let i = 0; i < timestamps.length; i += 6) {
      if (!timestamps[i]) continue;
      const timeStr = formatTime(timestamps[i]);
      description += `| ${timeStr} | ${pTotal[i]?.toFixed(2) ?? 'N/A'} | ${freq[i]?.toFixed(4) ?? 'N/A'} |\n`;
    }
  } else if (activeMetric === 'v_q') {
    const vab = evalData.vab?.[plant] || [];
    const qTotal = evalData.qTotal?.[plant] || [];
    const cmdQ = evalData.cmdQ?.[plant] || [];

    if (vab.length > 0) {
      const maxV = Math.max(...vab);
      const minV = Math.min(...vab);
      const avgV = vab.reduce((a: number, b: number) => a + b, 0) / vab.length;
      const maxQ = Math.max(...qTotal);
      const minQ = Math.min(...qTotal);

      description += `Key Statistics:\n`;
      description += `- Voltage (Vab): Max = ${maxV.toFixed(3)} kV, Min = ${minV.toFixed(3)} kV, Avg = ${avgV.toFixed(3)} kV\n`;
      description += `- Reactive Power (Q Total): Max = ${maxQ.toFixed(2)} MVar, Min = ${minQ.toFixed(2)} MVar\n\n`;
    }

    description += `Time-Series Samples (every 30 mins):\n`;
    description += `| Time | Vab (kV) | Q Total (MVar) | Q Command (MVar) |\n`;
    description += `|---|---|---|---|\n`;
    for (let i = 0; i < timestamps.length; i += 6) {
      if (!timestamps[i]) continue;
      const timeStr = formatTime(timestamps[i]);
      description += `| ${timeStr} | ${vab[i]?.toFixed(3) ?? 'N/A'} | ${qTotal[i]?.toFixed(2) ?? 'N/A'} | ${cmdQ[i]?.toFixed(2) ?? 'N/A'} |\n`;
    }
  } else if (activeMetric === 'fig4') {
    const pTotal = evalData.pTotal?.[plant] || [];
    const soc = evalData.soc?.[plant] || [];
    const freq = evalData.freq?.[plant] || [];
    const vab = evalData.vab?.[plant] || [];
    const qTotal = evalData.qTotal?.[plant] || [];

    description += `Powerflow Check samples for ${plant} (every 30 mins):\n`;
    description += `| Time | P Total (MW) | Frequency (Hz) | SOC (%) | Vab (kV) | Q Total (MVar) |\n`;
    description += `|---|---|---|---|---|---|\n`;
    for (let i = 0; i < timestamps.length; i += 6) {
      if (!timestamps[i]) continue;
      const timeStr = formatTime(timestamps[i]);
      description += `| ${timeStr} | ${pTotal[i]?.toFixed(2) ?? 'N/A'} | ${freq[i]?.toFixed(4) ?? 'N/A'} | ${soc[i]?.toFixed(1) ?? 'N/A'} | ${vab[i]?.toFixed(3) ?? 'N/A'} | ${qTotal[i]?.toFixed(2) ?? 'N/A'} |\n`;
    }
  } else {
    description += `Graph contains multiple subplots for all plants. Traces include P Total, SOC, Frequency, Voltages, and Reactive Power.\n`;
  }

  if (importedGraph.pinnedPoints && importedGraph.pinnedPoints.length > 0) {
    description += `\nUser-Pinned Highlight Points:\n`;
    importedGraph.pinnedPoints.forEach((pt: any) => {
      description += `- Point on trace "${pt.id.split('__')[1] || 'Unknown'}" at time ${pt.x}: Value = ${pt.y}\n`;
    });
  }

  return description;
}

export function AIAgent() {
  const { provider, setProvider, apiKey, systemInstructions, connectionStatus, messages, setMessages, clearHistory, language, setLanguage, importedGraph, setImportedGraph } = useAIContext();
  
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachment, setAttachment] = useState<{data: string, mimeType: string} | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  const [project, setProject] = useState(importedGraph ? importedGraph.project : 'SNTL 400');
  const [plant, setPlant] = useState(importedGraph ? importedGraph.selectedPlant : 'plant1');

  const [leftPaneWidth, setLeftPaneWidth] = useState(40);
  const isResizing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !containerRef.current || !leftPaneRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      let newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      newWidth = Math.max(20, Math.min(newWidth, 80));
      // Update DOM directly for buttery smooth dragging without re-renders
      leftPaneRef.current.style.width = `${newWidth}%`;
    };
    
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        if (containerRef.current) {
           containerRef.current.style.pointerEvents = 'auto';
        }
        // Sync final state
        if (leftPaneRef.current && containerRef.current) {
           const containerRect = containerRef.current.getBoundingClientRect();
           const newWidth = (leftPaneRef.current.getBoundingClientRect().width / containerRect.width) * 100;
           setLeftPaneWidth(newWidth);
        }
      }
    };

    const handleResetWidth = () => {
      console.log('Resetting pane width to 40%');
      setLeftPaneWidth(40);
      if (leftPaneRef.current) leftPaneRef.current.style.width = '40%';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('reset-pane-width', handleResetWidth);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('reset-pane-width', handleResetWidth);
    };
  }, []);

  useEffect(() => {
    if (importedGraph) {
      setProject(importedGraph.project);
      setPlant(importedGraph.selectedPlant);
    }
  }, [importedGraph]);

  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, attachment]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Only accept images
    if (!file.type.startsWith('image/')) {
        alert(language === 'Khmer' ? 'សូមជ្រើសរើសឯកសាររូបភាពដើម្បីវិភាគ។' : 'Please select an image file to analyze.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const base64withMeta = event.target?.result as string;
        // e.g. data:image/png;base64,iVBORw0K...
        const parts = base64withMeta.split(',');
        const mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const base64Data = parts[1];
        setAttachment({ data: base64Data, mimeType });
    };
    reader.readAsDataURL(file);
    
    // Reset input
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() && !attachment) return;
    
    const newUserMessage = { 
        role: 'user' as const, 
        content: inputMessage.trim(),
        image: attachment ? `data:${attachment.mimeType};base64,${attachment.data}` : undefined
    };
    
    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage('');
    setAttachment(null);
    setIsLoading(true);
    
    try {
      if (provider === 'gemini') {
        if (!apiKey) throw new Error("API Key is missing. Please configure it in settings.");
        
        const ai = new GoogleGenAI({ apiKey: apiKey });
        
        // Filter out initial welcome message and ensure alternate turns
        const apiMessages = messages.filter(m => !m.content.includes("Connection established") && !m.content.includes("ការតភ្ជាប់បានជោគជ័យ") && !m.content.includes("Successfully connected") && !m.content.includes("បានភ្ជាប់ជាមួយ"));
        
        const langInstruction = language === 'Khmer' ? "You MUST respond in Khmer." : "You MUST respond in English.";
        
        let telemetryContext = '';
        if (importedGraph) {
            telemetryContext = "\n\n" + serializeTelemetryData(importedGraph, importedGraph.activeMetric || 'soc_p', plant);
        }

        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: apiMessages.concat(newUserMessage).map(msg => {
                const parts: any[] = [];
                if (msg.content) {
                    parts.push({ text: msg.content });
                }
                if (msg.image) {
                     const mimeType = msg.image.match(/data:(.*?);base64,/)?.[1] || 'image/jpeg';
                     const b64 = msg.image.split(',')[1];
                     parts.push({
                        inlineData: {
                            mimeType,
                            data: b64
                        }
                     });
                }
                return {
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: parts
                };
            }),
            config: {
                systemInstruction: systemInstructions + "\n\n" + langInstruction + `\n\nContext: The user is currently analyzing data for Project: ${project}, Plant: ${plant}.${telemetryContext}`
            }
        });
        
        if (response.text !== undefined) {
           setMessages(prev => [...prev, { role: 'assistant', content: response.text as string }]);
        } else {
           setMessages(prev => [...prev, { role: 'assistant', content: language === "Khmer" ? "មានកំហុសក្នុងការទាញយកចម្លើយ។" : "An error occurred fetching response." }]);
        }

      } else {
        // Fallback for demo for other APIs since we don't have their SDKs installed
        setTimeout(() => {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `Connected to ${provider.toUpperCase()} API. (Note: Only Gemini has full SDK integration in this demo, but the fetch logic for ${provider} can be enabled here.)` 
          }]);
          setIsLoading(false);
        }, 1500);
        return;
      }
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: (language === "Khmer" ? `មានកំហុស៖ ` : `Error communicating with API: `) + (error?.message || "Unknown error") }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Get the most recent assistant message that is not a connection message
  const lastValidMessage = [...messages].reverse().find(
    m => m.role === 'assistant' && 
    !m.content.includes("Connection established") && 
    !m.content.includes("ការតភ្ជាប់បានជោគជ័យ") && 
    !m.content.includes("Successfully connected") && 
    !m.content.includes("Mock connected")
  );

  const chatPane = (

    <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col relative overflow-hidden">
      {/* Left Chat Interface */}
      <div className="flex-1 flex flex-col bg-background shadow-inner relative min-w-0 min-h-0">
        {importedGraph && (
          <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 text-[11px] flex items-center justify-between text-purple-400 shrink-0 animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2">
              <Bot size={14} className="animate-pulse" />
              <span>Imported <strong>{importedGraph.project}</strong> graph data is active in LLM context.</span>
            </div>
            <button 
              onClick={() => setImportedGraph(null)}
              className="bg-red-600 text-white hover:bg-red-500 h-7 text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5 px-5 rounded transition-all border-none shadow-none"
              title="Close imported graph"
            >
              <X size={10} /> Close Graph
            </button>
          </div>
        )}
        <div className="px-4 py-3 flex justify-between border-b border-border-v bg-surface/50 shrink-0">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <div className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
                <Bot size={14} className={cn(provider === 'gemini' ? "text-accent-blue" : provider === 'chatgpt' ? "text-green-500" : "text-orange-500")} />
                AI Analytical Assistant <span className="opacity-50">({provider.toUpperCase()})</span>
              </div>
              
              <div className="flex flex-wrap items-end gap-3 mt-1">
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40">LANGUAGE</span>
                    <Select value={language} onValueChange={(v) => setLanguage(v as 'English' | 'Khmer')}>
                      <SelectTrigger className="h-7 text-[11px] bg-foreground/5 border-foreground/10 text-foreground focus:ring-0 focus:ring-offset-0 w-[100px]">
                        <SelectValue placeholder="Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="English" className="text-[11px]">English</SelectItem>
                        <SelectItem value="Khmer" className="text-[11px] font-khmer">Khmer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40">AI PROVIDER</span>
                    <Select value={provider} onValueChange={(v) => setProvider(v as 'gemini' | 'chatgpt' | 'claude')}>
                      <SelectTrigger className="h-7 text-[11px] bg-foreground/5 border-foreground/10 text-foreground focus:ring-0 focus:ring-offset-0 w-[100px]">
                        <SelectValue placeholder="AI Provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini" className="text-[11px]">gemini</SelectItem>
                        <SelectItem value="chatgpt" className="text-[11px]">chatgpt</SelectItem>
                        <SelectItem value="claude" className="text-[11px]">claude</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40">PROJECT</span>
                    <Select value={project} onValueChange={setProject}>
                      <SelectTrigger className="h-7 text-[11px] bg-foreground/5 border-foreground/10 text-foreground focus:ring-0 focus:ring-offset-0 w-[110px]">
                        <SelectValue placeholder="Select Project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SNTL 400" className="text-[11px] font-bold">SNTL 400</SelectItem>
                        <SelectItem value="SNTL 600" className="text-[11px] font-bold">SNTL 600</SelectItem>
                        <SelectItem value="SNTL 1000" className="text-[11px] font-bold">SNTL 1000</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40">PLANT</span>
                    <Select value={plant} onValueChange={setPlant}>
                      <SelectTrigger className="h-7 text-[11px] bg-foreground/5 border-foreground/10 text-foreground focus:ring-0 focus:ring-offset-0 w-[90px]">
                        <SelectValue placeholder="Select Plant" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plant1" className="text-[11px]">plant1</SelectItem>
                        <SelectItem value="plant2" className="text-[11px]">plant2</SelectItem>
                        {project !== 'SNTL 400' && (
                          <SelectItem value="plant3" className="text-[11px]">plant3</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end justify-between py-[2px]">
             <div className="flex items-center gap-2 text-[10px] uppercase font-mono tracking-widest text-foreground/50 shrink-0">
               {connectionStatus === 'connected' ? <><span className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span> Connected</> :
                connectionStatus === 'error' ? <><span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span> Error</> :
                connectionStatus === 'connecting' ? <><span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"></span> Connecting...</> :
                <><span className="h-1.5 w-1.5 rounded-full bg-foreground/30"></span> Disconnected</>}
             </div>
             {messages.length > 1 && (
                  <button 
                    onClick={clearHistory}
                    className="bg-red-600 text-white hover:bg-red-500 h-7 text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5 px-5 rounded transition-all border-none shadow-none"
                    title="Clear History"
                  >
                    <Trash2 size={12} /> <span className="hidden sm:inline">{language === 'Khmer' ? 'លុបប្រវត្តិ' : 'Clear History'}</span>
                  </button>
             )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-agent p-4 md:p-6 w-full min-h-0">
          <div className="max-w-5xl mx-auto flex flex-col gap-6 w-full">
            {messages.map((msg, idx) => (
              <div key={idx} className={cn("flex gap-4 w-full group", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                <div className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center border border-border-v" style={{ backgroundColor: msg.role === 'user' ? 'rgba(var(--foreground-rgb), 0.05)' : msg.role === 'assistant' && provider === 'gemini' ? 'rgba(0,163,255,0.1)' : msg.role === 'assistant' && provider === 'chatgpt' ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)' }}>
                  {msg.role === 'user' ? <User size={14} className="text-foreground/60" /> : <Bot size={14} className={cn(provider === 'gemini' ? "text-accent-blue" : provider === 'chatgpt' ? "text-green-500" : "text-orange-500")} />}
                </div>
                <div className={cn("flex flex-col gap-1 w-full", msg.role === 'user' ? "items-end max-w-[80%]" : "items-start min-w-0 flex-1")}>
                  <div className={cn("flex items-center w-full", msg.role === 'user' ? "justify-end" : "justify-between")}>
                    <span className="text-[10px] text-foreground/40 font-mono font-medium tracking-wide">
                      {msg.role === 'user' ? 'YOU' : provider.toUpperCase()}
                    </span>
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          setCopiedIndex(idx);
                          setTimeout(() => setCopiedIndex(null), 2000);
                        }}
                        className={cn("text-foreground/40 hover:text-foreground transition-opacity flex items-center gap-1 text-[10px] uppercase font-bold", copiedIndex === idx ? "opacity-100 text-green-500" : "opacity-0 group-hover:opacity-100")}
                        title="Copy response"
                      >
                        {copiedIndex === idx ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                      </button>
                    )}
                  </div>
                  <div className={cn("px-4 py-3 rounded-2xl text-[13px] leading-relaxed flex flex-col gap-2 w-full", msg.role === 'user' ? "bg-surface border border-border-v/50 text-foreground/90 rounded-tr-sm" : "bg-transparent text-foreground")}>
                    {msg.role === 'user' ? (
                      <>
                        {msg.image && (
                           <div className="relative group rounded overflow-hidden max-w-xs border border-border-v self-end bg-background/50">
                              <img src={msg.image} alt="Uploaded chart" className="w-full h-auto max-h-[300px] object-contain" />
                           </div>
                        )}
                        {msg.content && <span>{msg.content}</span>}
                      </>
                    ) : (
                      <div className="markdown-body">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-4 w-full">
                 <div className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center border border-border-v" style={{ backgroundColor: provider === 'gemini' ? 'rgba(0,163,255,0.1)' : provider === 'chatgpt' ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)' }}>
                    <Bot size={14} className={cn(provider === 'gemini' ? "text-accent-blue" : provider === 'chatgpt' ? "text-green-500" : "text-orange-500")} />
                 </div>
                 <div className="flex items-center text-foreground/50 gap-2 px-2 h-8">
                   <Loader2 size={12} className="animate-spin" />
                   <span className="text-[11px] font-mono animate-pulse">{language === 'Khmer' ? 'កំពុងវិភាគទិន្នន័យបណ្តាញអគ្គិសនី...' : 'Analyzing grid telemetry...'}</span>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
        
        {/* Input Area */}
        <div className="p-4 border-t border-border-v bg-background shrink-0 w-full">
           <div className="w-full relative flex flex-col">
              {attachment && (
                  <div className="mb-2 w-fit relative bg-surface border border-border-v rounded p-1 group">
                      <img src={`data:${attachment.mimeType};base64,${attachment.data}`} className="h-16 w-auto rounded object-contain" alt="Attachment Preview" />
                      <button onClick={() => setAttachment(null)} className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <X size={12} />
                      </button>
                  </div>
              )}
              <div className="flex flex-wrap gap-2 mb-3 px-1">
                <button 
                  onClick={() => { setInputMessage('Analyze SOC & Power'); }}
                  className="bg-surface border border-border-v text-foreground/80 hover:text-foreground px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1.5"
                >
                  ⚡ Analyze SOC & Power
                </button>
                <button 
                  onClick={() => { setInputMessage('Frequency Stability'); }}
                  className="bg-surface border border-border-v text-foreground/80 hover:text-foreground px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1.5"
                >
                  📊 Frequency Stability
                </button>
                <button 
                  onClick={() => { setInputMessage('Evaluate Q & Voltage'); }}
                  className="bg-surface border border-border-v text-foreground/80 hover:text-foreground px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1.5"
                >
                  📈 Evaluate Q & Voltage
                </button>
                <button 
                  onClick={() => { setInputMessage('Detect Anomalies'); }}
                  className="bg-surface border border-border-v text-foreground/80 hover:text-foreground px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1.5"
                >
                  🔍 Detect Anomalies
                </button>
                <button 
                  onClick={() => { setInputMessage('Generate Full Report'); }}
                  className="bg-surface border border-border-v text-foreground/80 hover:text-foreground px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1.5"
                >
                  📝 Generate Full Report
                </button>
              </div>
              <div className="relative flex items-end w-full border border-border-v rounded-xl bg-surface/50 focus-within:border-accent-blue/50 focus-within:ring-1 focus-within:ring-accent-blue/20 transition-all p-1.5">
                 <button onClick={() => fileInputRef.current?.click()} className="shrink-0 self-end h-[36px] w-[36px] flex items-center justify-center rounded-lg text-foreground/50 hover:bg-foreground/5 hover:text-accent-blue transition-colors outline-none mb-0.5 ml-0.5" title={language === "Khmer" ? "បញ្ចូលរូបភាព" : "Upload chart or image"}>
                    <ImagePlus size={18} />
                 </button>
                 <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                 
                  <textarea
                    value={inputMessage}
                    onChange={(e) => {
                      setInputMessage(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                        e.currentTarget.style.height = 'auto';
                      }
                    }}
                    placeholder={language === 'Khmer' ? "សួរអំពីស្ថិរភាពបណ្តាញវដ្ត ឬបញ្ចូលរូបភាពសម្រាប់ការវិភាគ..." : "Ask about grid stability, cycle calculations, or upload a chart for analysis..."}
                    className="flex-1 bg-transparent border-0 px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none focus:ring-0 resize-none scrollbar-thin self-end min-h-[40px] max-h-32 mb-0 block"
                    rows={1}
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={(!inputMessage.trim() && !attachment) || isLoading}
                    className="shrink-0 self-end h-[36px] w-[36px] flex items-center justify-center rounded-lg text-accent-blue hover:bg-accent-blue hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-accent-blue transition-colors group mb-0.5 mr-0.5"
                  >
                    <Send size={16} className="group-hover:scale-110 transition-transform" />
                  </button>
              </div>
           </div>
        </div>
      </div>
    </section>
  );

  if (importedGraph) {
    return (
      <div ref={containerRef} className="flex-1 min-h-0 flex flex-col xl:flex-row gap-0 overflow-hidden w-full h-full">
        <div ref={leftPaneRef} style={{ width: `${leftPaneWidth}%` }} className="flex flex-col shrink-0 min-h-0 relative h-full xl:border-r-0 border-b xl:border-b-0 border-border-v">
          {chatPane}
        </div>
        
        {/* Resizer */}
        <div 
          className="w-4 cursor-col-resize hover:bg-accent-blue/10 active:bg-accent-blue/20 z-10 shrink-0 h-full flex flex-col justify-center items-center group transition-colors hidden xl:flex relative -ml-2 -mr-2"
          onMouseDown={(e) => {
            e.preventDefault();
            isResizing.current = true;
            document.body.style.cursor = 'col-resize';
            if (containerRef.current) {
               containerRef.current.style.pointerEvents = 'none';
            }
          }}
        >
          <div className="w-1 h-12 bg-border-v group-hover:bg-accent-blue rounded-full"></div>
        </div>

        <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col relative overflow-hidden h-full">
          <DailyEvaluationGraph 
            theme="dark" 
            project={project} 
            isAIAgentMode={true} 
            externalPlant={plant as any} 
            onPlantChange={(p) => setPlant(p)} 
          />
        </section>
      </div>
    );
  }

  return chatPane;
}
