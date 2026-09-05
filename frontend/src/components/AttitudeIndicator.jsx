import { useEffect, useRef } from 'react';
import { useStore } from '../store.js';

export default function AttitudeIndicator({ width = 120, height = 120, pitch = 0, roll = 0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const p = pitch * (Math.PI / 180) * 3;
    const r = roll * (Math.PI / 180);

    ctx.clearRect(0, 0, W, H);

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(r);

    const pitchOffset = p * H * 0.5;

    // Sky
    ctx.fillStyle = '#1a3050';
    ctx.fillRect(-W, -H + pitchOffset, W * 2, H);

    // Ground
    ctx.fillStyle = '#4a3018';
    ctx.fillRect(-W, pitchOffset, W * 2, H);

    // Horizon line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-W, pitchOffset);
    ctx.lineTo(W, pitchOffset);
    ctx.stroke();

    // Pitch lines
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const y = pitchOffset + i * H * 0.1;
      const lineW = i % 2 === 0 ? 20 : 12;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-lineW, y);
      ctx.lineTo(lineW, y);
      ctx.stroke();
    }

    ctx.restore();

    // Fixed crosshair - amber color
    ctx.strokeStyle = '#ffbb00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 10, cy);
    ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + 30, cy);
    ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#ffbb00';
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.restore();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [pitch, roll]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ borderRadius: '50%' }} />;
}
