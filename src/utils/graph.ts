import { createCanvas } from "@napi-rs/canvas";
import { config, toHex } from "../../config";

interface DayData {
  day: string;
  verified: number;
  blocked: number;
}

export function createPullbackGraph(added: number, failed: number): Buffer {
  const width = 400;
  const height = 200;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);

  const total = added + failed;
  const barWidth = 280;
  const barHeight = 40;
  const x = (width - barWidth) / 2;
  const y = 80;

  ctx.fillStyle = "#222";
  ctx.fillRect(x, y, barWidth, barHeight);

  if (total > 0) {
    const successWidth = (added / total) * barWidth;
    ctx.fillStyle = toHex(config.theme.success);
    ctx.fillRect(x, y, successWidth, barHeight);

    ctx.fillStyle = toHex(config.theme.error);
    ctx.fillRect(x + successWidth, y, barWidth - successWidth, barHeight);
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Pullback Results", width / 2, 30);

  ctx.font = "14px sans-serif";
  const successColor = toHex(config.theme.success);
  const errorColor = toHex(config.theme.error);

  ctx.fillStyle = successColor;
  ctx.fillRect(x, 150, 16, 16);
  ctx.fillStyle = "#888";
  ctx.textAlign = "left";
  ctx.fillText(`Added: ${added}`, x + 24, 163);

  ctx.fillStyle = errorColor;
  ctx.fillRect(x + 140, 150, 16, 16);
  ctx.fillStyle = "#888";
  ctx.fillText(`Failed: ${failed}`, x + 164, 163);

  return canvas.toBuffer("image/png");
}

export function createStatsGraph(data: DayData[]): Buffer {
  const width = 600;
  const height = 300;
  const padding = { top: 30, right: 30, bottom: 50, left: 50 };

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = chartWidth / data.length - 10;

  const maxValue = Math.max(...data.map((d) => d.verified + d.blocked), 1);

  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = "#666";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    const val = Math.round(maxValue - (maxValue / 4) * i);
    ctx.fillText(String(val), padding.left - 10, y + 4);
  }

  const successColor = toHex(config.theme.success);
  const errorColor = toHex(config.theme.error);

  data.forEach((d, i) => {
    const x = padding.left + i * (chartWidth / data.length) + 5;
    const totalHeight = ((d.verified + d.blocked) / maxValue) * chartHeight;
    const verifiedHeight = (d.verified / maxValue) * chartHeight;
    const blockedHeight = (d.blocked / maxValue) * chartHeight;

    if (d.verified > 0) {
      ctx.fillStyle = successColor;
      ctx.fillRect(
        x,
        padding.top + chartHeight - verifiedHeight,
        barWidth,
        verifiedHeight
      );
    }

    if (d.blocked > 0) {
      ctx.fillStyle = errorColor;
      ctx.fillRect(
        x,
        padding.top + chartHeight - totalHeight,
        barWidth,
        blockedHeight
      );
    }

    ctx.fillStyle = "#888";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    const label = d.day.slice(5);
    ctx.fillText(label, x + barWidth / 2, height - padding.bottom + 20);
  });

  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Verifications (Last 7 Days)", width / 2, 20);

  ctx.fillStyle = successColor;
  ctx.fillRect(width - 150, 10, 12, 12);
  ctx.fillStyle = "#888";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Verified", width - 134, 20);

  ctx.fillStyle = errorColor;
  ctx.fillRect(width - 80, 10, 12, 12);
  ctx.fillText("Blocked", width - 64, 20);

  return canvas.toBuffer("image/png");
}
