"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { Pencil, Rocket } from "./art/sprites";
import { S, type LetterTemplate } from "@/content/letters/S";
import type { TraceInteraction } from "@/lib/episode";
import type { InteractionProps } from "@/lib/interaction";
import { pathLength, resample, scoreTrace, type Pt } from "@/lib/tracing";

const LETTERS: Record<TraceInteraction["letter"], LetterTemplate> = { S };

const PAD = 22; // viewBox room around the letter box for the rocket and wandering strokes
const DEMO_MS = 2600;
const SLOW = 1.6; // hint demos play this much slower
const FLIGHT_MS = 2400;
const FLIGHT_POINTS = 80;
const IDLE_MS = 10000;
const MORE_MS = 1300; // after a short stroke, how long to wait for the rest of the letter
const MAX_HINTS = 2;
const TAP_LENGTH = 14; // box units; shorter strokes are taps or slips, not attempts
const STROKE_W = 7;
const ROCKET_H = 34; // box units; the sprite is 60 x 120 and points up
const ROCKET_PIVOT = 52 / 120; // turn around the body, a little above the fins
const PENCIL_H = 46; // box units; the sprite is 40 x 120, tip at (20, 118)
const PENCIL_TILT = 24; // degrees, leaning like a pencil in a right hand

const GLOW = "magic-pencil-glow";

type Phase = "intro" | "demo" | "turn" | "trace" | "hint" | "fly" | "done";

/** What the pointer handlers report to the run that is waiting for a stroke. */
type Waiter = { down: () => void; tap: () => void; done: (stroke: Pt[]) => void };

const fmt = (p: Pt) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
const transformAt = (p: Pt, deg: number) => `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${deg.toFixed(1)})`;
/** Sprite rotation for travel from a to b: the sprites point up, so add a quarter turn. */
const headingOf = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
/** Steer `from` part of the way to `to` along the short way round. */
const turnToward = (from: number, to: number, k: number) => from + ((((to - from + 540) % 360) + 360) % 360 - 180) * k;

function setLine(g: SVGGElement | null, points: string) {
  g?.querySelectorAll("polyline").forEach((p) => p.setAttribute("points", points));
}

/**
 * Screen 3: the magic pencil writes S, then the child traces it with a finger, mouse or pen.
 * A good enough S (generous, see lib/tracing.ts) sends the rocket swooping along the very
 * curve she drew. Two misses bring the pencil back, slower; after that the page moves on anyway.
 */
export default function MagicPencil({ config, active, ctx }: InteractionProps<TraceInteraction>) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("intro");
  const [passed, setPassed] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const pencilRef = useRef<SVGGElement>(null);
  const rocketRef = useRef<SVGGElement>(null);
  const demoRef = useRef<SVGGElement>(null);
  const strokeRef = useRef<SVGGElement>(null);
  const trailRef = useRef<SVGGElement>(null);
  const tailRef = useRef<SVGGElement>(null);

  const waiter = useRef<Waiter | null>(null);
  const drawing = useRef<number | null>(null); // pointerId of the stroke in progress
  const toSvg = useRef<DOMMatrix | null>(null);
  const stroke = useRef<Pt[]>([]);
  const strokeText = useRef("");
  const continuing = useRef(false); // true while waiting for the second part of a letter drawn in pieces
  const reduceRef = useRef(false);

  // Everything here depends only on the letter, so it is worked out once.
  const geo = useMemo(() => {
    const letter = LETTERS[config.letter];
    const template = letter.points[0];
    const demo = resample(template, 160);
    const ahead = demo[6];
    const len = Math.hypot(ahead.x - letter.start.x, ahead.y - letter.start.y) || 1;
    const dir = { x: (ahead.x - letter.start.x) / len, y: (ahead.y - letter.start.y) / len };
    return {
      letter,
      template,
      demo,
      demoText: demo.map(fmt),
      // The rocket waits just behind the start dot, nose pointing the way the pencil goes.
      park: { x: letter.start.x - dir.x * 20, y: letter.start.y - dir.y * 20 },
      parkAngle: headingOf(letter.start, ahead),
      viewBox: [-PAD, -PAD, letter.box.width + PAD * 2, letter.box.height + PAD * 2] as const,
    };
  }, [config.letter]);

  useEffect(() => {
    reduceRef.current = !!reduceMotion;
  }, [reduceMotion]);

  useEffect(() => {
    if (!active) return;
    const clock = new Clock();
    const alive = () => !clock.stopped && ctx.alive();
    const { template, demo, demoText, park, parkAngle } = geo;
    let rocketAt = park;
    let rocketAngle = parkAngle;

    const placePencil = (p: Pt) => pencilRef.current?.setAttribute("transform", transformAt(p, PENCIL_TILT));
    const placeRocket = (p: Pt, deg: number) => {
      rocketAt = p;
      rocketAngle = deg;
      rocketRef.current?.setAttribute("transform", transformAt(p, deg));
    };

    // The pencil writes the letter; the gold line follows just behind its tip.
    const showDemo = async (slow: number) => {
      setLine(demoRef.current, "");
      placePencil(demo[0]);
      setPhase("demo");
      await clock.sleep(350); // the pencil fades in at the start dot
      await clock.tween(DEMO_MS * slow, (t) => {
        const f = easeInOut(t) * (demo.length - 1);
        const i = Math.floor(f);
        const tip = lerp(demo[i], demo[Math.min(i + 1, demo.length - 1)], f - i);
        setLine(demoRef.current, demoText.slice(0, i + 1).join(" ") + " " + fmt(tip));
        placePencil(tip);
      });
      await clock.sleep(400);
    };

    // Resolves with her stroke, "idle" if no stroke is finished within idleMs, or null if the
    // page goes away. Taps don't push the timer back (a child tapping the dot over and over still
    // gets help), and the timer never interrupts a stroke that is being drawn.
    const waitForStroke = (idleMs: number) =>
      new Promise<Pt[] | "idle" | null>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const fire = () => {
          if (drawing.current !== null) timer = clock.timeout(fire, 600);
          else finish("idle");
        };
        const finish = (result: Pt[] | "idle" | null) => {
          clock.clear(timer);
          waiter.current = null;
          resolve(result);
        };
        waiter.current = { down: () => {}, tap: () => {}, done: finish };
        clock.onStop(() => finish(null));
        timer = clock.timeout(fire, idleMs);
      });

    // The rocket swoops along `path`, turning to face where it is going, leaving a soft gold trail.
    const fly = async (path: Pt[]) => {
      const rocket = rocketRef.current;
      const texts = path.map(fmt);
      const end = path[path.length - 1];
      const endAngle = headingOf(path[Math.max(0, path.length - 9)], end);
      if (reduceRef.current) {
        // No swooping: the rocket fades out and fades back in at the end of the curve.
        if (rocket) {
          rocket.style.transition = "opacity 250ms ease";
          rocket.style.opacity = "0";
        }
        await clock.sleep(260);
        setLine(trailRef.current, texts.join(" "));
        placeRocket(end, endAngle);
        if (rocket) rocket.style.opacity = "1";
        await clock.sleep(300);
        return;
      }

      // A short glide from the parking spot to wherever her stroke began.
      const from = rocketAt;
      const fromAngle = rocketAngle;
      const startAngle = headingOf(path[0], path[Math.min(8, path.length - 1)]);
      const gap = Math.hypot(path[0].x - from.x, path[0].y - from.y);
      await clock.tween(Math.min(700, Math.max(250, gap * 4)), (t) => {
        const e = easeInOut(t);
        placeRocket(lerp(from, path[0], e), turnToward(fromAngle, startAngle, e));
      });
      if (!alive()) return;

      let angle = startAngle;
      await clock.tween(FLIGHT_MS, (t) => {
        const f = easeInOut(t) * (path.length - 1);
        const i = Math.floor(f);
        const pos = lerp(path[i], path[Math.min(i + 1, path.length - 1)], f - i);
        // Face along a short window of the path, then ease toward it, so a shaky line flies smooth.
        const ahead = headingOf(path[Math.max(0, i - 4)], path[Math.min(path.length - 1, i + 4)]);
        angle = turnToward(angle, ahead, 0.2);
        placeRocket(pos, angle);
        setLine(trailRef.current, texts.slice(0, i + 1).join(" ") + " " + fmt(pos));
        setLine(tailRef.current, texts.slice(Math.max(0, i - 10), i + 1).join(" ") + " " + fmt(pos));
      });
    };

    (async () => {
      await showDemo(1);
      if (!alive()) return;
      setPhase("turn");
      await ctx.narrate(config.yourTurn);
      if (!alive()) return;

      const enabledAt = performance.now();
      const templateLength = pathLength(template);
      let hintsUsed = 0;

      // One hint: say the help line, watch the pencil again slowly, then hand the pencil back.
      const hint = async () => {
        hintsUsed++;
        setPhase("hint");
        await ctx.narrate(ctx.help);
        if (!alive()) return;
        await showDemo(SLOW);
        if (!alive()) return;
        // The caption still shows the help line; tell her it is her turn again.
        setPhase("turn");
        await ctx.narrate(config.yourTurn);
      };

      for (;;) {
        stroke.current = [];
        strokeText.current = "";
        setLine(strokeRef.current, "");
        setPhase("trace");

        let got = await waitForStroke(IDLE_MS);
        if (got === null || !alive()) return;

        if (got === "idle" && hintsUsed < MAX_HINTS) {
          // Nothing drawn (or only taps): help, as many times as a miss would.
          await hint();
          if (!alive()) return;
          continue;
        }

        // Some children draw an S in two pieces. A short stroke waits a moment for the rest,
        // and the pieces are scored together as one letter.
        while (got !== "idle" && pathLength(got) < templateLength * 0.85 && !scoreTrace(got, template).pass) {
          continuing.current = true;
          const more = await waitForStroke(MORE_MS);
          continuing.current = false;
          if (more === null || !alive()) return;
          if (more === "idle") break;
          got = more;
        }

        const ms = Math.round(performance.now() - enabledAt);
        // Still nothing after two hints: the page moves on anyway (the rocket follows the letter).
        const { pass } = got === "idle" ? { pass: false } : scoreTrace(got, template);
        if (pass || hintsUsed >= MAX_HINTS) {
          // A miss after two hints still moves the story on: the rocket follows the letter instead.
          setPassed(pass);
          setPhase("fly");
          await fly(resample(pass && got !== "idle" ? got : template, FLIGHT_POINTS));
          if (!alive()) return;
          setPhase("done");
          ctx.log({ skill: config.skill, correct: pass, hintsUsed, ms, mode: "trace" });
          ctx.succeed();
          return;
        }

        await hint();
        if (!alive()) return;
      }
    })();

    return () => {
      clock.stop();
      waiter.current = null;
      drawing.current = null;
    };
    // config, ctx and geo are fixed for the life of this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const toPoint = (e: { clientX: number; clientY: number }): Pt | null => {
    if (!toSvg.current) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(toSvg.current);
    return { x: p.x, y: p.y };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!waiter.current || drawing.current !== null || !ctm || !e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    toSvg.current = ctm.inverse(); // the page does not move mid-stroke, so one matrix will do
    drawing.current = e.pointerId;
    waiter.current.down();
    const p = toPoint(e);
    if (continuing.current && p) {
      // The rest of a letter drawn in pieces: keep the first part and carry on from here.
      stroke.current.push(p);
      strokeText.current += " " + fmt(p);
    } else {
      stroke.current = p ? [p] : [];
      strokeText.current = p ? fmt(p) : "";
    }
    setLine(strokeRef.current, strokeText.current);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drawing.current !== e.pointerId) return;
    // Coalesced events keep fast curves round on screens that batch pointer moves.
    const coalesced = e.nativeEvent.getCoalescedEvents?.();
    for (const ev of coalesced && coalesced.length ? coalesced : [e.nativeEvent]) {
      const p = toPoint(ev);
      const last = stroke.current[stroke.current.length - 1];
      if (!p || (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.6)) continue;
      stroke.current.push(p);
      strokeText.current += " " + fmt(p);
    }
    setLine(strokeRef.current, strokeText.current);
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drawing.current !== e.pointerId) return;
    drawing.current = null;
    const pts = stroke.current;
    if (pts.length < 3 || pathLength(pts) < TAP_LENGTH) {
      // A tap or a slip: wipe it and keep waiting, no attempt counted.
      stroke.current = [];
      strokeText.current = "";
      setLine(strokeRef.current, "");
      waiter.current?.tap();
      return;
    }
    waiter.current?.done(pts);
  };

  const { letter, park, parkAngle, viewBox } = geo;
  const templateHint = useMemo(
    () => JSON.stringify(letter.points[0].filter((_, i, all) => i % Math.ceil(all.length / 60) === 0 || i === all.length - 1)),
    [letter],
  );
  const tracing = phase === "trace";
  const flying = phase === "fly";
  const parked = phase !== "fly" && phase !== "done";
  const fade = (on: boolean, ms = 500): CSSProperties => ({ opacity: on ? 1 : 0, transition: `opacity ${ms}ms ease` });
  const strokeOpacity = tracing ? 1 : flying || phase === "done" ? (passed ? 0.6 : 0) : 0;
  const pencilScale = PENCIL_H / 120;

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: "62%", top: "56%", height: "62%", aspectRatio: `${viewBox[2]} / ${viewBox[3]}` }}
      >
        <svg
          ref={svgRef}
          viewBox={viewBox.join(" ")}
          className="absolute inset-0 h-full w-full overflow-visible"
          role="img"
          aria-label={`The letter ${letter.letter}. Trace it with your finger.`}
          // Hooks for the end-to-end test that traces the letter like a child would.
          data-trace-area=""
          data-tracing={tracing ? "true" : "false"}
          data-template-points={templateHint}
        >
          <defs>
            {/* Sized in user space: a straight stroke has a zero-width box, which would clip a box-relative blur. */}
            <filter id={GLOW} filterUnits="userSpaceOnUse" x={viewBox[0] - 60} y={viewBox[1] - 60} width={viewBox[2] + 120} height={viewBox[3] + 120}>
              <feGaussianBlur stdDeviation="3.5" />
            </filter>
            <radialGradient id="magic-pencil-start-glow">
              <stop offset="0%" stopColor="#fff1c4" stopOpacity="0.9" />
              <stop offset="45%" stopColor="#f5c969" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#f5c969" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* The guide: soft round dots of moonlight along the letter. */}
          {letter.strokes.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="#f7f0dc"
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeDasharray="0 10"
              style={{ strokeOpacity: tracing ? 0.45 : 0.35, transition: "stroke-opacity 600ms ease" }}
            />
          ))}

          <GlowLine ref={trailRef} width={4} style={{ opacity: 0.28 }} />
          <GlowLine ref={demoRef} width={STROKE_W} style={fade(phase === "demo", 600)} />
          <GlowLine ref={strokeRef} width={STROKE_W} style={{ opacity: strokeOpacity, transition: "opacity 500ms ease" }} />
          <GlowLine ref={tailRef} width={5} style={{ opacity: 0.7 }} />

          {/* Where to begin: a glowing dot that breathes harder when it is her turn. */}
          <g style={fade(parked, 400)}>
            <motion.circle
              cx={letter.start.x}
              cy={letter.start.y}
              fill="url(#magic-pencil-start-glow)"
              initial={{ r: 11, opacity: 0.6 }}
              animate={
                reduceMotion
                  ? { r: 12, opacity: 0.8 }
                  : tracing
                    ? { r: [11, 17, 11], opacity: [0.7, 1, 0.7] }
                    : { r: [10, 12.5, 10], opacity: [0.5, 0.75, 0.5] }
              }
              transition={reduceMotion ? { duration: 0.3 } : { duration: tracing ? 1.4 : 2.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <circle cx={letter.start.x} cy={letter.start.y} r={4.5} fill="#f5c969" stroke="#fff1c9" strokeWidth={1.2} />
          </g>

          <g ref={rocketRef} transform={transformAt(park, parkAngle)}>
            <motion.g
              animate={parked && !reduceMotion ? { y: [0, -1.4, 0] } : { y: 0 }}
              transition={parked && !reduceMotion ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
            >
              <svg
                x={-ROCKET_H / 4}
                y={-ROCKET_H * ROCKET_PIVOT}
                width={ROCKET_H / 2}
                height={ROCKET_H}
                viewBox="0 0 60 120"
                overflow="visible"
              >
                <Rocket flame={flying} />
              </svg>
            </motion.g>
          </g>

          <g ref={pencilRef} transform={transformAt(letter.start, PENCIL_TILT)} style={fade(phase === "demo", 300)}>
            <svg
              x={-20 * pencilScale}
              y={-118 * pencilScale}
              width={40 * pencilScale}
              height={120 * pencilScale}
              viewBox="0 0 40 120"
              overflow="visible"
            >
              <Pencil />
            </svg>
          </g>
        </svg>

        {/* Where fingers land: a bit bigger than the letter, so a stroke may start a little outside it. */}
        <div
          aria-hidden
          className="absolute -inset-[12%]"
          style={{ touchAction: "none", pointerEvents: tracing ? "auto" : "none", cursor: tracing ? "crosshair" : undefined }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        />
      </div>
    </div>
  );
}

/** A gold line that glows: a blurred halo, the line itself, and a bright core. Points are set from outside. */
function GlowLine({ ref, width, style }: { ref: Ref<SVGGElement>; width: number; style?: CSSProperties }) {
  return (
    <g ref={ref} fill="none" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <polyline stroke="#f5c969" strokeOpacity={0.6} strokeWidth={width * 2} filter={`url(#${GLOW})`} />
      <polyline stroke="#f5c969" strokeWidth={width} />
      <polyline stroke="#fff4d6" strokeOpacity={0.85} strokeWidth={width * 0.34} />
    </g>
  );
}

/**
 * Every timer and animation frame one run of the page starts, so leaving the page stops
 * them all at once. Stopping also settles anything still waiting, so awaits never hang.
 */
class Clock {
  stopped = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private frames = new Set<number>();
  private stoppers = new Set<() => void>();

  timeout(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  clear(id: ReturnType<typeof setTimeout> | undefined) {
    if (id === undefined) return;
    clearTimeout(id);
    this.timers.delete(id);
  }

  onStop(fn: () => void) {
    if (this.stopped) fn();
    else this.stoppers.add(fn);
  }

  sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const done = () => {
        this.stoppers.delete(done);
        resolve();
      };
      this.onStop(done);
      if (!this.stopped) this.timeout(done, ms);
    });
  }

  /** Calls `frame` with progress from 0 to 1 on each animation frame for `ms`, then resolves. */
  tween(ms: number, frame: (t: number) => void) {
    return new Promise<void>((resolve) => {
      const done = () => {
        this.stoppers.delete(done);
        resolve();
      };
      this.onStop(done);
      if (this.stopped) return;
      const t0 = performance.now();
      const tick = () => {
        const id = requestAnimationFrame((now) => {
          this.frames.delete(id);
          const t = Math.min(1, Math.max(0, (now - t0) / ms));
          frame(t);
          if (t < 1) tick();
          else done();
        });
        this.frames.add(id);
      };
      tick();
    });
  }

  stop() {
    this.stopped = true;
    this.timers.forEach(clearTimeout);
    this.frames.forEach(cancelAnimationFrame);
    const stoppers = [...this.stoppers];
    this.timers.clear();
    this.frames.clear();
    this.stoppers.clear();
    stoppers.forEach((fn) => fn());
  }
}
