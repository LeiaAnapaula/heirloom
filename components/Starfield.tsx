"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number; // 0..1 of width
  y: number; // 0..1 of height
  r: number; // radius in css px
  phase: number;
  speed: number; // twinkle speed
  warm: boolean; // a few stars carry the gold
  depth: number; // parallax drift factor
};

type Shooter = { x: number; y: number; vx: number; vy: number; life: number };

// Deterministic so the sky looks the same on every render and in screenshots.
function seededStars(count: number): Star[] {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: count }, () => {
    const big = rand() < 0.06;
    return {
      x: rand(),
      y: rand(),
      r: big ? 1.3 + rand() * 0.9 : 0.35 + rand() * 0.8,
      phase: rand() * Math.PI * 2,
      speed: 0.4 + rand() * 1.4,
      warm: rand() < 0.18,
      depth: 0.2 + rand() * 0.8,
    };
  });
}

/**
 * A slow, living night sky. Stars twinkle and drift a little; once in a while
 * a shooting star crosses. Respects reduced motion by holding still.
 */
export default function Starfield({ density = 1 }: { density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let shooter: Shooter | null = null;
    let nextShooterAt = 6000;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = seededStars(Math.round(((width * height) / 4200) * density));
    };

    const drawSky = () => {
      const g = ctx.createRadialGradient(width * 0.5, height * 1.15, height * 0.1, width * 0.5, height * 0.6, height * 1.2);
      g.addColorStop(0, "#3b3478");
      g.addColorStop(0.35, "#1e2a5e");
      g.addColorStop(0.75, "#121a40");
      g.addColorStop(1, "#0a0f2a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    };

    const frame = (t: number) => {
      drawSky();
      const drift = reduceMotion ? 0 : t * 0.0000035;

      for (const s of stars) {
        const twinkle = reduceMotion ? 0.8 : 0.55 + 0.45 * Math.sin(t * 0.001 * s.speed + s.phase);
        const x = (((s.x + drift * s.depth) % 1) + 1) % 1 * width;
        const y = s.y * height;
        ctx.globalAlpha = twinkle;
        if (s.r > 1.2) {
          const halo = ctx.createRadialGradient(x, y, 0, x, y, s.r * 6);
          halo.addColorStop(0, s.warm ? "rgba(245,201,105,0.55)" : "rgba(220,228,255,0.45)");
          halo.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = halo;
          ctx.fillRect(x - s.r * 6, y - s.r * 6, s.r * 12, s.r * 12);
        }
        ctx.fillStyle = s.warm ? "#ffe3a3" : "#eef1ff";
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!reduceMotion) {
        if (!shooter && t > nextShooterAt) {
          shooter = {
            x: width * (0.15 + Math.random() * 0.6),
            y: height * (0.05 + Math.random() * 0.25),
            vx: 7 + Math.random() * 3,
            vy: 2.2 + Math.random() * 1.2,
            life: 1,
          };
          nextShooterAt = t + 9000 + Math.random() * 9000;
        }
        if (shooter) {
          const tail = ctx.createLinearGradient(shooter.x, shooter.y, shooter.x - shooter.vx * 14, shooter.y - shooter.vy * 14);
          tail.addColorStop(0, `rgba(255,235,190,${0.9 * shooter.life})`);
          tail.addColorStop(1, "rgba(255,235,190,0)");
          ctx.strokeStyle = tail;
          ctx.lineWidth = 1.6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(shooter.x, shooter.y);
          ctx.lineTo(shooter.x - shooter.vx * 14, shooter.y - shooter.vy * 14);
          ctx.stroke();
          shooter.x += shooter.vx;
          shooter.y += shooter.vy;
          shooter.life -= 0.012;
          if (shooter.life <= 0 || shooter.x > width + 200) shooter = null;
        }
        raf = requestAnimationFrame(frame);
      }
    };

    resize();
    if (reduceMotion) frame(0);
    else raf = requestAnimationFrame(frame);

    const onResize = () => {
      resize();
      if (reduceMotion) frame(0);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [density]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
