import React, { useEffect, useRef } from 'react';

export default function AttitudeIndicator({ width = 140, height = 140, pitch = 0, roll = 0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const radius = cx - 4;

    // Conversions
    const p = Math.max(-45, Math.min(45, pitch)); // clamp pitch
    const r = roll * (Math.PI / 180);
    const pitchPx = (p / 45) * (H * 0.45);

    ctx.clearRect(0, 0, W, H);

    // 1. Clip inside circular instrument bezel
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // 2. Rotate & Translate for Roll & Pitch
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-r); // Standard aviation roll convention

    // Sky gradient (Deep tactical aerospace navy)
    const skyGrad = ctx.createLinearGradient(0, -H, 0, pitchPx);
    skyGrad.addColorStop(0, '#0a192f');
    skyGrad.addColorStop(1, '#1e3a5f');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-W * 1.5, -H * 1.5 + pitchPx, W * 3, H * 1.5);

    // Ground gradient (Tactical dark slate amber)
    const groundGrad = ctx.createLinearGradient(0, pitchPx, 0, H);
    groundGrad.addColorStop(0, '#38220f');
    groundGrad.addColorStop(1, '#1c1007');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(-W * 1.5, pitchPx, W * 3, H * 1.5);

    // Horizon Line (White glowing line)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(-W, pitchPx);
    ctx.lineTo(W, pitchPx);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Pitch Ladder Rungs (-30 to +30 degrees)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const pitchStep = (H * 0.45) / 45; // pixels per degree
    [-30, -20, -10, 10, 20, 30].forEach(deg => {
      const y = pitchPx - (deg * pitchStep);
      const isPositive = deg > 0;
      const rWidth = isPositive ? 24 : 20;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();

      if (isPositive) {
        // Solid ladder rungs for climb
        ctx.moveTo(-rWidth, y);
        ctx.lineTo(-6, y);
        ctx.moveTo(6, y);
        ctx.lineTo(rWidth, y);
      } else {
        // Dashed ladder rungs for dive
        ctx.setLineDash([3, 2]);
        ctx.moveTo(-rWidth, y);
        ctx.lineTo(-6, y);
        ctx.moveTo(6, y);
        ctx.lineTo(rWidth, y);
        ctx.setLineDash([]);
      }
      ctx.stroke();

      // Degree numerals
      ctx.fillText(`${Math.abs(deg)}`, -rWidth - 6, y);
      ctx.fillText(`${Math.abs(deg)}`, rWidth + 6, y);
    });

    ctx.restore(); // Restore roll/pitch transform

    // 3. Roll Scale Ticks on Bezel
    ctx.save();
    ctx.translate(cx, cy);
    [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].forEach(angle => {
      const rad = (angle - 90) * (Math.PI / 180);
      const isMajor = Math.abs(angle) === 0 || Math.abs(angle) === 30 || Math.abs(angle) === 60;
      const len = isMajor ? 6 : 3;
      const x1 = Math.cos(rad) * (radius - 1);
      const y1 = Math.sin(rad) * (radius - 1);
      const x2 = Math.cos(rad) * (radius - 1 - len);
      const y2 = Math.sin(rad) * (radius - 1 - len);

      ctx.strokeStyle = isMajor ? 'var(--amber)' : 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = isMajor ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    // Roll Pointer (Top Triangle)
    ctx.fillStyle = 'var(--amber)';
    ctx.beginPath();
    ctx.moveTo(0, -radius + 8);
    ctx.lineTo(-4, -radius + 1);
    ctx.lineTo(4, -radius + 1);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // 4. Fixed Aircraft Reference Symbol (Electric Amber Wings)
    ctx.strokeStyle = '#ffb800';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#ffb800';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    // Left Wing
    ctx.moveTo(cx - 32, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.lineTo(cx - 10, cy + 5);
    // Right Wing
    ctx.moveTo(cx + 32, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx + 10, cy + 5);
    ctx.stroke();

    // Center Reference Pip
    ctx.fillStyle = '#ffb800';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 5. Glass Arc Highlight
    const glare = ctx.createLinearGradient(0, 0, W, H);
    glare.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    glare.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
    glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glare;
    ctx.fill();

    ctx.restore(); // End clipping

    // 6. Outer Bezel Ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

  }, [pitch, roll]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <canvas 
        ref={canvasRef} 
        width={width} 
        height={height} 
        style={{ 
          borderRadius: '50%', 
          boxShadow: '0 4px 16px rgba(0,0,0,0.6), inset 0 0 10px rgba(0,0,0,0.8)' 
        }} 
      />
      <div style={{ 
        fontFamily: 'var(--font-mono)', 
        fontSize: '0.68rem', 
        color: 'var(--text-muted)',
        letterSpacing: 0.5 
      }}>
        PITCH: <span style={{ color: 'var(--amber)', fontWeight: 800 }}>{pitch.toFixed(1)}°</span> | ROLL: <span style={{ color: 'var(--amber)', fontWeight: 800 }}>{roll.toFixed(1)}°</span>
      </div>
    </div>
  );
}
