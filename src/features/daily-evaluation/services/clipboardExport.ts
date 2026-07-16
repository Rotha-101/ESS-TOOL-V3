// @ts-ignore - distribution bundle avoids node polyfill issues in Vite
import Plotly from 'plotly.js/dist/plotly.js';
import { is20PercentProject } from '@/lib/project-detection';
import type { EvalData } from '@/types/eval-data';
import type { ActiveMetric, GraphConfig } from '@/types/graph';

// Compose the visible Plotly panels onto a 1920x1080 canvas (fig5 gets the
// daily/total-cycle info boxes drawn on top) and copy the PNG to the
// clipboard. Moved verbatim from DailyEvaluationGraph.tsx
// (chartContainerRef.current -> container parameter).
export const copyChartsToClipboard = async ({ container, evalData, project, activeMetric, graphConfig }: {
  container: HTMLElement;
  evalData: EvalData;
  project: string;
  activeMetric: ActiveMetric;
  graphConfig: Pick<GraphConfig, 'bgWhite'>;
}): Promise<void> => {
    const plotDivs = container.querySelectorAll('.js-plotly-plot');
    if (plotDivs.length === 0) {
      alert("No graphs found to copy.");
      return;
    }

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });

    try {
      const targetWidth = 1920;
      const targetHeight = 1080;
      const plotCount = plotDivs.length;

      const titleEl = container.querySelector('.flex-col > .text-center b, .flex-col > .text-center');
      const titleText = titleEl?.textContent?.trim() ?? '';
      const titleHeight = titleText ? 44 : 0;
      const plotAreaHeight = targetHeight - titleHeight;

      const baseSubplotHeight = Math.floor(plotAreaHeight / plotCount);
      const remainder = plotAreaHeight - baseSubplotHeight * plotCount;
      const subplotHeights = Array.from({ length: plotCount }, (_, i) =>
        baseSubplotHeight + (i < remainder ? 1 : 0)
      );

      const imageUrls = await Promise.all(
        Array.from(plotDivs).map((div, i) =>
          Plotly.toImage(div as any, {
            format: 'png',
            width: targetWidth,
            height: subplotHeights[i],
            scale: 1,
          })
        )
      );

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

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

      let yOffset = titleHeight;
      for (let i = 0; i < imageUrls.length; i++) {
        const img = await loadImage(imageUrls[i]);
        ctx.drawImage(img, 0, yOffset, targetWidth, subplotHeights[i]);

        if (activeMetric === 'fig5' && evalData && evalData.dailyCycle && evalData.totalCycle) {
          const drawInfoBox = (lines: string[], x: number, y: number, bgWhite: boolean, headerIdx: number, footerIdx: number) => {
            const padding = 12;
            const lineHeight = 22;
            ctx.font = '15px "JetBrains Mono", monospace';
            let maxWidth = 0;
            lines.forEach((line, idx) => {
              ctx.font = idx === headerIdx ? 'bold 16px "JetBrains Mono", monospace' : (idx === footerIdx ? 'bold 15px "JetBrains Mono", monospace' : '15px "JetBrains Mono", monospace');
              const w = ctx.measureText(line).width;
              if (w > maxWidth) maxWidth = w;
            });
            const boxWidth = maxWidth + padding * 2;
            const boxHeight = lines.length * lineHeight + padding * 2;

            ctx.fillStyle = bgWhite ? 'rgba(255,255,255,0.95)' : 'rgba(30,30,46,0.95)';
            ctx.fillRect(x, y, boxWidth, boxHeight);
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, boxWidth, boxHeight);

            lines.forEach((line, idx) => {
              if (idx === headerIdx) {
                ctx.font = 'bold 16px "JetBrains Mono", monospace';
                ctx.fillStyle = bgWhite ? '#000' : '#FFF';
              } else if (idx === footerIdx) {
                ctx.font = 'bold 15px "JetBrains Mono", monospace';
                ctx.fillStyle = '#2563EB';
              } else {
                ctx.font = '15px "JetBrains Mono", monospace';
                ctx.fillStyle = bgWhite ? '#000' : '#E0E0E0';
              }
              ctx.textAlign = 'left';
              ctx.fillText(line, x + padding, y + padding + idx * lineHeight + 15);

              if (idx === headerIdx) {
                ctx.beginPath();
                ctx.moveTo(x + padding, y + padding + idx * lineHeight + 20);
                ctx.lineTo(x + boxWidth - padding, y + padding + idx * lineHeight + 20);
                ctx.strokeStyle = 'rgba(229, 231, 235, 1)';
                ctx.stroke();
              }
              if (footerIdx > 0 && idx === footerIdx - 1) {
                ctx.beginPath();
                ctx.moveTo(x + padding, y + padding + idx * lineHeight + 24);
                ctx.lineTo(x + boxWidth - padding, y + padding + idx * lineHeight + 24);
                ctx.strokeStyle = 'rgba(229, 231, 235, 1)';
                ctx.stroke();
              }
            });
          };

          const isBessProject = is20PercentProject(project);
          const hasPlant3 = !isBessProject && project !== 'SNTL400' && evalData.soc.plant3 && evalData.soc.plant3.some((v) => !isNaN(v));
          const getStatus = (val: number) => val < 0.5 ? 'Take action' : val < 0.8 ? 'Warning' : (project === 'SNTL400' && val > 1 ? 'Alert' : 'Normal');

          if (i === 0) {
            const avgDaily = !isNaN(evalData.avgDailyCycle) ? evalData.avgDailyCycle : 0;
            const lines = [
              `Daily cycle (${evalData.dataDate}):`,
              `Cycle_Plant 01 = ${evalData.dailyCycle.plant1.toFixed(3)} -> ${getStatus(evalData.dailyCycle.plant1)}`,
              `Cycle_Plant 02 = ${evalData.dailyCycle.plant2.toFixed(3)} -> ${getStatus(evalData.dailyCycle.plant2)}`
            ];
            if (hasPlant3) lines.push(`Cycle_Plant 03 = ${evalData.dailyCycle.plant3.toFixed(3)} -> ${getStatus(evalData.dailyCycle.plant3)}`);
            lines.push(`Cycle_Average Daily Cycle = ${avgDaily.toFixed(3)} -> ${getStatus(avgDaily)}`);
            drawInfoBox(lines, 160, yOffset + 60, graphConfig.bgWhite, 0, lines.length - 1);
          }

          if (i === 1) {
            const avgTotal = !isNaN(evalData.avgTotalCycle) ? evalData.avgTotalCycle : 0;
            const lines = [
              `Plant Total Cycle (${evalData.dataDate}):`,
              `Plant 01 Total Cycle = ${evalData.totalCycle.plant1.toFixed(6)}`,
              `Plant 02 Total Cycle = ${evalData.totalCycle.plant2.toFixed(6)}`
            ];
            if (hasPlant3) lines.push(`Plant 03 Total Cycle = ${evalData.totalCycle.plant3.toFixed(6)}`);
            lines.push(`Average Total Plant Cycle = ${Number(avgTotal.toFixed(6))}`);
            drawInfoBox(lines, 160, yOffset + 60, graphConfig.bgWhite, 0, lines.length - 1);

            if (evalData.deviations && evalData.deviations.highSOC) {
              const devLines = [
                `Max deviation timings:`,
                `Max deviation (HIGH SOC): ${evalData.deviations.highSOC.pair} = ${evalData.deviations.highSOC.text}`,
                `Max deviation (LOW SOC): ${evalData.deviations.lowSOC.pair} = ${evalData.deviations.lowSOC.text}`
              ];
              drawInfoBox(devLines, (targetWidth / 2) - 150, yOffset + 60, graphConfig.bgWhite, 0, -1);
            }
          }
        }

        yOffset += subplotHeights[i];
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (!blob) return;

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      alert("Graph captured at 1920×1080 and copied to clipboard!");
    } catch (err) {
      console.error("Image capture error:", err);
      alert("Failed to capture graphs. Please ensure browser permissions allow clipboard access.");
    }
};
