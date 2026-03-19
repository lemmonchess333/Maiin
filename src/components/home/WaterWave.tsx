import { useEffect, useRef } from "react";

export default function WaterWave({ width, splash }: { width: number; splash: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ampRef = useRef(2);
  const frameRef = useRef(0);

  useEffect(function() {
    ampRef.current = 7;
    const decay = setInterval(function() {
      ampRef.current = Math.max(ampRef.current * 0.92, 2);
      if (ampRef.current <= 2.1) clearInterval(decay);
    }, 50);
    return function() { clearInterval(decay); };
  }, [splash]);

  useEffect(function() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let running = true;
    const h = 16;
    canvas.width = width;
    canvas.height = h;

    function draw() {
      if (!running || !ctx) return;
      frameRef.current++;
      const t = frameRef.current * 0.04;
      const amp = ampRef.current;
      ctx.clearRect(0, 0, width, h);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= width; x += 2) {
        const y = amp * Math.sin((x / width) * 3 * Math.PI + t) + amp * 0.5 * Math.sin((x / width) * 5 * Math.PI - t * 0.7);
        ctx.lineTo(x, y + h / 2);
      }
      ctx.lineTo(width, h);
      ctx.closePath();
      ctx.fillStyle = "rgba(78, 173, 204, 0.15)";
      ctx.fill();
      requestAnimationFrame(draw);
    }
    draw();
    return function() { running = false; };
  }, [width]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={16}
      className="absolute inset-x-0 top-0 pointer-events-none"
      style={{ transform: "translateY(-8px)" }}
    />
  );
}
