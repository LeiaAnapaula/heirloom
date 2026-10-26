"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { buildOf, WORLD, type BuildKind } from "../config";
import { actions, hud, useHud, type Piece } from "../store";
import { BuildPicture, Icon } from "./icons";
import Portrait from "./Portrait";
import { HudButton } from "./ui";
import { EmptyCardArt, EnvelopeBack, EnvelopeFlap, EnvelopePocket, FallbackScene, Heart, Postmark, Seal, Stamp, Teacup } from "./PostcardArt";

/**
 * The last step of the loop: what the child built goes back to Grandpa as a
 * postcard. The front is a picture of the world taken the moment it opens; the
 * back is a short letter written from what is in the world. Sending folds it
 * into an envelope that flies away, then a calm "Sent to Grandpa".
 *
 * Nothing goes over the network here. The demo marks the postcard as sent in
 * the HUD store and the rest of the HUD can answer that.
 */

export default function Postcard() {
  const open = useHud((s) => s.postcardOpen);
  // Mounting on open gives every visit a fresh picture, fresh focus, and fresh timers.
  return open ? <PostcardDialog /> : null;
}

type Phase = "write" | "sending" | "sent";
type Picture = string | null | undefined; // undefined: not taken yet; null: the world could not be photographed

/** How long the fold-and-fly takes before the confirmation shows. Matches the delays in CSS below. */
const SEND_MS = 1800;
const SEND_REDUCED_MS = 240;

/** The letter is always in the child's own voice; a name only changes how it is signed. */
const CHILD_FALLBACK = { line: "I", sign: "me" };
const BRIDGE_WISH = "You always wished for a bridge right here.";

function PostcardDialog() {
  const pieces = useHud((s) => s.pieces);
  const childName = useHud((s) => s.childName);

  const [phase, setPhase] = useState<Phase>("write");
  const [picture, setPicture] = useState<Picture>(undefined);
  const [reduced, setReduced] = useState(false);
  const [handoff, setHandoff] = useState<CSSProperties | undefined>(undefined);
  // Already sent and nothing changed since: say so, and let them send it again.
  const [sentBefore] = useState(() => hud.get().sent);

  const dialogRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false); // set on the first tap, so a double tap sends once
  const pressedOutside = useRef(false);

  const titleId = useId();
  const letter = useMemo(() => summarize(pieces), [pieces]);
  const empty = pieces.length === 0 && phase === "write";

  // On open: remember who opened it, move focus in, take one picture of the world.
  useEffect(() => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    const s = hud.get();
    const keyboardFirst = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    // On a laptop the name field is the first thing to do; on a tablet, no surprise keyboard.
    if (s.pieces.length > 0 && !s.childName && keyboardFirst) nameRef.current?.focus({ preventScroll: true });
    else dialogRef.current?.focus({ preventScroll: true });
    if (s.selected) actions.select(null);

    const frame = requestAnimationFrame(() => {
      setPicture(hud.get().status === "ready" ? actions.snapshot(960) : null);
    });
    return () => {
      cancelAnimationFrame(frame);
      // However it closes (Escape skips the blur), a name left as "Mia-" is finished, so the HUD never shows "Mia-'s bridge".
      const typed = hud.get().childName;
      if (finishName(typed) !== typed) actions.setChildName(finishName(typed));
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // The flight runs on one timer; closing the postcard (unmounting) cancels it.
  useEffect(() => {
    if (phase !== "sending") return;
    const t = window.setTimeout(() => setPhase("sent"), reduced ? SEND_REDUCED_MS : SEND_MS);
    return () => window.clearTimeout(t);
  }, [phase, reduced]);

  // Keep focus inside the dialog as the card changes under it.
  useEffect(() => {
    if (phase === "sending") dialogRef.current?.focus({ preventScroll: true });
    if (phase === "sent") backRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const close = () => actions.closePostcard();

  const goBuild = () => {
    actions.closePostcard();
    actions.setMode("build");
  };

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    if (sendingRef.current) return;
    sendingRef.current = true;
    // The big card shrinks to exactly where the small copy of it appears above the envelope.
    const r = cardRef.current?.getBoundingClientRect();
    if (r) setHandoff(handoffTo(r));
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setPhase("sending");
    actions.markSent();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      // Stop here so the world underneath does not also treat it as "leave build mode".
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "Tab") trapTab(e, dialogRef.current);
  };

  const wide = !empty && phase !== "sent";
  const status =
    phase === "sending" ? "Sending your postcard to Grandpa." : phase === "sent" ? "Sent to Grandpa. He’ll see it with his morning tea." : "";

  return (
    <div className="fixed inset-0 z-40 font-ui text-pine">
      <style>{CSS}</style>
      <div aria-hidden className="pc-fade absolute inset-0 bg-[rgb(28_38_32/0.44)] backdrop-blur-[3px]" />
      <div
        className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain"
        onPointerDown={(e) => {
          pressedOutside.current = !dialogRef.current?.contains(e.target as Node);
        }}
        onClick={(e) => {
          // Only a press that starts and ends on the backdrop closes it, never a drag out of the card.
          if (pressedOutside.current && !dialogRef.current?.contains(e.target as Node)) close();
          pressedOutside.current = false;
        }}
      >
        <div className="flex min-h-full items-center justify-center" style={SAFE_PADDING}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            data-phase={empty ? "empty" : phase}
            className={`relative w-full ${wide ? "max-w-[880px]" : "max-w-[440px]"}`}
            style={{ outline: "none" }}
          >
            {empty ? (
              <EmptyCard titleId={titleId} onClose={close} onBuild={goBuild} />
            ) : phase === "sent" ? (
              <SentCard titleId={titleId} onClose={close} backRef={backRef} />
            ) : (
              <WriteCard
                cardRef={cardRef}
                nameRef={nameRef}
                titleId={titleId}
                phase={phase}
                reduced={reduced}
                handoff={handoff}
                picture={picture}
                letter={letter}
                childName={childName}
                sentBefore={sentBefore}
                onSend={send}
                onClose={close}
              />
            )}
            {phase === "sending" && !reduced && <EnvelopeFlight picture={picture} bridge={letter.hasBridge} />}
            <p role="status" className="sr-only">
              {status}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- The postcard itself: picture on the front, letter on the back ---------- */

type WriteCardProps = {
  cardRef: Ref<HTMLElement>;
  nameRef: Ref<HTMLInputElement>;
  titleId: string;
  phase: Phase;
  reduced: boolean;
  handoff: CSSProperties | undefined;
  picture: Picture;
  letter: Letter;
  childName: string;
  sentBefore: boolean;
  onSend: (e?: FormEvent) => void;
  onClose: () => void;
};

function WriteCard({ cardRef, nameRef, titleId, phase, reduced, handoff, picture, letter, childName, sentBefore, onSend, onClose }: WriteCardProps) {
  const nameId = useId();
  const hintId = useId();
  const sending = phase === "sending";
  const name = displayName(childName);
  const motion = sending ? (reduced ? "pc-fade-out" : "pc-shrink") : "pc-rise";

  return (
    <section
      ref={cardRef}
      inert={sending}
      className={`relative overflow-clip rounded-[26px] ${motion}`}
      style={{ ...PAPER, ...handoff }}
    >
      <header className="flex items-center justify-between gap-3 py-3 pr-3 pl-5 sm:pl-7">
        <h2 id={titleId} className="flex min-w-0 items-center gap-2.5 font-display text-[18px] leading-tight font-semibold sm:text-[20px]">
          <Icon.envelope className="h-5 w-5 shrink-0 text-wood max-[359px]:hidden" />
          A postcard for Grandpa
        </h2>
        <HudButton round aria-label="Close the postcard" onClick={onClose} className="shrink-0">
          <Icon.close />
        </HudButton>
      </header>

      <div className="grid border-t-2 border-dashed border-[#e4d9c2] md:grid-cols-[minmax(0,1.06fr)_minmax(0,1fr)]">
        <Front picture={picture} letter={letter} />
        <div className="min-w-0 px-5 pt-4 pb-5 [overflow-wrap:anywhere] sm:px-7 md:pt-6">
          <span className="relative float-right mt-1 mr-0.5 mb-2 ml-4 block w-[46px] rotate-[4deg] min-[360px]:w-[54px] sm:w-[60px]">
            <Stamp className="block h-auto w-full drop-shadow-[0_2px_3px_rgb(44_58_50/0.22)]" />
            {sending && !reduced && <Postmark className="pc-postmark absolute top-[18px] -left-[30px] w-[76px] text-wood/80" />}
          </span>
          <p className="font-display text-[26px] leading-tight font-medium [font-variation-settings:'SOFT'_100] sm:text-[28px]">Dear Grandpa,</p>
          <div className="mt-3 space-y-3">
            {letter.shown.map((k) => (
              <div key={k.kind}>
                <p className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgb(44_58_50/0.18)] ring-1 ring-pine/10">
                    <BuildPicture kind={k.kind} className="h-7 w-7" />
                  </span>
                  <span className="min-w-0 font-display text-[19px] leading-[1.35] [font-variation-settings:'SOFT'_100] sm:text-[20px]">
                    {lineFor(k, CHILD_FALLBACK.line)}
                  </span>
                </p>
                {k.kind === "bridge" && (
                  <p className="mt-1.5 ml-12 font-display text-[17px] leading-snug text-wood italic">
                    {BRIDGE_WISH} {k.count > 1 ? `Now there are ${countWord(k.count)}.` : "Now there is one."}
                  </p>
                )}
              </div>
            ))}
            {letter.more && <p className="ml-12 font-display text-[19px] leading-snug sm:text-[20px]">And more. Come and see!</p>}
          </div>
          <p className="clear-both mt-5 font-display text-[24px] leading-tight italic sm:text-[26px]">
            Love, {name || CHILD_FALLBACK.sign}
          </p>
          <p className="mt-3 border-t border-dashed border-[#e4d9c2] pt-3 font-display text-[15px] text-pine/80 italic">
            The world Grandpa and I built.
          </p>
        </div>
      </div>

      {/*
       * On a phone the name and the button stay in reach while the card scrolls under them.
       * On a phone turned sideways they also sit in one low row, so most of the card still shows.
       */}
      <form
        onSubmit={onSend}
        className="z-[1] flex flex-col gap-3 border-t-2 border-dashed border-[#e4d9c2] px-5 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-md:sticky max-md:bottom-0 max-md:bg-[#f7f4ea] max-md:shadow-[0_-14px_24px_-20px_rgb(44_58_50/0.5)] sm:px-7 md:flex-row md:items-end md:justify-between md:gap-4 md:pt-4 md:pb-5 short:sticky short:bottom-0 short:flex-row short:items-end short:justify-between short:gap-3 short:bg-[#f7f4ea] short:pt-2.5 short:pb-[max(0.625rem,env(safe-area-inset-bottom))] short:shadow-[0_-14px_24px_-20px_rgb(44_58_50/0.5)]"
      >
        <div className="min-w-0 md:w-[290px] short:w-[290px]">
          <label htmlFor={nameId} className="block text-[15px] font-extrabold short:sr-only">
            Your name
          </label>
          <input
            ref={nameRef}
            id={nameId}
            name="postcard-first-name"
            type="text"
            value={childName}
            onChange={(e) => actions.setChildName(cleanName(e.target.value))}
            onBlur={(e) => actions.setChildName(finishName(e.target.value))}
            placeholder="Your name"
            maxLength={20}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="send"
            aria-describedby={hintId}
            data-1p-ignore
            data-lpignore="true"
            className="mt-1.5 h-12 w-full rounded-2xl border-2 border-pine/15 bg-white/90 px-4 text-[18px] font-bold text-pine shadow-[inset_0_1px_2px_rgb(44_58_50/0.08)] transition-colors select-text placeholder:text-transparent focus:border-pine/45 short:mt-0 short:placeholder:text-pine/70"
          />
          <p id={hintId} className="mt-1.5 text-[14px] font-medium text-pine/80 max-md:sr-only short:sr-only">
            So Grandpa knows it’s from you.
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end short:items-end">
          {sentBefore && (
            <p className="flex items-center gap-1.5 text-[14px] font-bold text-[#4f6e42] md:justify-end">
              <Icon.check className="h-4 w-4 text-leaf" />
              Grandpa already has this one.
            </p>
          )}
          <button type="submit" aria-disabled={sending || undefined} className={`${CTA} w-full md:w-auto short:w-auto`}>
            {sentBefore ? "Send it again" : "Send to Grandpa"}
            <Icon.envelope className="h-5 w-5" />
          </button>
        </div>
      </form>
    </section>
  );
}

/** The picture side: the world as it is right now, in a white paper border. */
function Front({ picture, letter }: { picture: Picture; letter: Letter }) {
  const alt = `${WORLD.title}, with ${letter.phrase}`;
  return (
    <figure className="min-w-0 border-b-2 border-dashed border-[#e4d9c2] p-4 sm:p-6 md:border-r-2 md:border-b-0">
      <div className="-rotate-[1.2deg] rounded-[14px] bg-[#fffefa] p-2.5 pb-2 shadow-[0_1px_2px_rgb(44_58_50/0.12),0_10px_24px_-10px_rgb(44_58_50/0.4)]">
        <div className="relative aspect-[3/2] overflow-hidden rounded-[9px] bg-[#cfdde6]">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL the engine just drew; nothing to optimize
            <img src={picture} alt={alt} className="pc-develop absolute inset-0 h-full w-full object-cover object-[50%_42%]" draggable={false} />
          ) : picture === null ? (
            <div role="img" aria-label={alt} className="absolute inset-0">
              <FallbackScene className="h-full w-full" bridge={letter.hasBridge} />
              <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                {letter.shown
                  .filter((k) => k.kind !== "bridge")
                  .slice(0, 3)
                  .map((k) => (
                    <span key={k.kind} className="grid h-11 w-11 place-items-center rounded-full bg-white/90 shadow-[0_2px_6px_rgb(44_58_50/0.25)]">
                      <BuildPicture kind={k.kind} className="h-8 w-8" />
                    </span>
                  ))}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(180deg,#d7e5ec,#eef1e8)]" />
          )}
        </div>
        <figcaption className="mt-2 px-1 pb-0.5 text-[13px] font-bold text-pine/80">{WORLD.title}</figcaption>
      </div>
    </figure>
  );
}

/* ---------- After sending: calm, with Grandpa's portrait ---------- */

function SentCard({ titleId, onClose, backRef }: { titleId: string; onClose: () => void; backRef: Ref<HTMLButtonElement> }) {
  return (
    <section className="pc-rise relative overflow-hidden rounded-[26px] px-6 pt-9 pb-6 text-center sm:px-9" style={PAPER}>
      <div className="relative mx-auto h-[88px] w-[88px]">
        <Portrait speaking={false} className="pc-pop h-full w-full rounded-full shadow-[0_8px_20px_-8px_rgb(138_90_59/0.6)] ring-4 ring-white" />
        <Teacup className="pc-pop-late absolute -right-4 -bottom-1 h-11 w-11 drop-shadow-[0_2px_2px_rgb(44_58_50/0.18)]" />
      </div>
      <h2 id={titleId} className="mt-5 font-display text-[30px] leading-tight font-semibold">
        Sent to Grandpa
      </h2>
      <p className="mx-auto mt-2 max-w-[30ch] text-[17px] leading-snug font-medium text-pine/80">He’ll see it with his morning tea.</p>
      <button ref={backRef} type="button" onClick={onClose} className={`${CTA} mt-7 w-full`}>
        Back to the world
      </button>
      <p className="mt-4 font-display text-[15px] text-wood italic">The world Grandpa and I built.</p>
    </section>
  );
}

/* ---------- Nothing built yet ---------- */

function EmptyCard({ titleId, onClose, onBuild }: { titleId: string; onClose: () => void; onBuild: () => void }) {
  return (
    <section className="pc-rise relative overflow-hidden rounded-[26px] px-6 pt-8 pb-6 text-center sm:px-8" style={PAPER}>
      <HudButton round aria-label="Close the postcard" onClick={onClose} className="absolute top-3 right-3">
        <Icon.close />
      </HudButton>
      <EmptyCardArt className="mx-auto h-[118px] w-auto" />
      <h2 id={titleId} className="mt-4 font-display text-[26px] leading-tight font-semibold">
        A postcard for Grandpa
      </h2>
      <p className="mt-2 text-[17px] leading-snug font-medium text-pine/80">Build something first, then show Grandpa.</p>
      <button type="button" onClick={onBuild} className={`${CTA} mt-6 w-full`}>
        <Icon.build className="h-5 w-5" />
        Start building
      </button>
    </section>
  );
}

/* ---------- The fold and the flight ---------- */

const PUFFS = [
  { dx: "-58px", dy: "6px", color: "text-honey", size: "h-4 w-4" },
  { dx: "60px", dy: "2px", color: "text-geranium", size: "h-[18px] w-[18px]" },
  { dx: "-30px", dy: "34px", color: "text-geranium", size: "h-3.5 w-3.5" },
  { dx: "34px", dy: "36px", color: "text-honey", size: "h-[18px] w-[18px]" },
  { dx: "2px", dy: "48px", color: "text-leaf", size: "h-3.5 w-3.5" },
];

/** Where the small card first appears, measured from the middle of the screen (see .pc-slide). */
const MINI = { width: 144 * 1.12, height: 108 * 1.12, dy: -87 };

/** Move and shrink the big card into the small card's first frame (fitting both ways, for tall phone cards), so one becomes the other. */
function handoffTo(r: DOMRect): CSSProperties {
  const dx = window.innerWidth / 2 - (r.left + r.width / 2);
  const dy = window.innerHeight / 2 + MINI.dy - (r.top + r.height / 2);
  return { "--pc-dx": `${Math.round(dx)}px`, "--pc-dy": `${Math.round(dy)}px`, "--pc-s": Math.min(MINI.width / r.width, MINI.height / r.height).toFixed(3) } as CSSProperties;
}

function EnvelopeFlight({ picture, bridge }: { picture: Picture; bridge: boolean }) {
  return (
    <div aria-hidden data-postcard-envelope className="pointer-events-none fixed inset-0 z-10 grid place-items-center overflow-hidden">
      <div className="relative h-[150px] w-[220px]">
        <div className="pc-fly absolute inset-0">
          <div className="pc-env-in absolute inset-0 [perspective:700px]">
            <EnvelopeBack className="absolute inset-0 h-full w-full" />
            <div className="pc-flap absolute inset-0">
              <EnvelopeFlap className="h-full w-full" />
            </div>
            <div className="pc-slide absolute top-[30px] left-[38px] z-[2] w-[144px] rounded-[6px] bg-[#fffefa] p-1.5 shadow-[0_4px_10px_-4px_rgb(44_58_50/0.45)]">
              <div className="relative aspect-[3/2] overflow-hidden rounded-[3px] bg-[#cfdde6]">
                {picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the same data URL as the card
                  <img src={picture} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_42%]" />
                ) : (
                  <FallbackScene className="absolute inset-0 h-full w-full" bridge={bridge} />
                )}
              </div>
            </div>
            <EnvelopePocket className="absolute inset-0 z-[3] h-full w-full" />
            <Seal className="pc-seal absolute top-[73px] left-1/2 z-[5] -ml-[15px] h-[30px] w-[30px]" />
          </div>
        </div>
        {PUFFS.map((p) => (
          <span key={p.dx} className={`pc-puff absolute bottom-1 left-1/2 -ml-2 ${p.color}`} style={{ "--dx": p.dx, "--dy": p.dy } as CSSProperties}>
            <Heart className={`block ${p.size}`} />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- Writing the letter ---------- */

type KindCount = { kind: BuildKind; count: number; last: number };
type Letter = { shown: KindCount[]; more: boolean; hasBridge: boolean; phrase: string };

/**
 * One line per kind of thing built, newest first, three or four of them at most.
 * The bridge is what Grandpa wished for, so it always makes the letter, and leads it.
 */
function summarize(pieces: Piece[]): Letter {
  const byKind = new Map<BuildKind, KindCount>();
  for (const p of pieces) {
    const k = byKind.get(p.kind);
    if (k) {
      k.count += 1;
      k.last = Math.max(k.last, p.placedAt);
    } else byKind.set(p.kind, { kind: p.kind, count: 1, last: p.placedAt });
  }
  const all = [...byKind.values()].sort((a, b) => b.last - a.last);
  const room = all.length > 4 ? 3 : 4;
  const bridge = byKind.get("bridge");
  let shown = all.slice(0, room);
  if (bridge && !shown.includes(bridge)) shown = [bridge, ...shown.slice(0, room - 1)];
  shown.sort((a, b) => Number(b.kind === "bridge") - Number(a.kind === "bridge") || b.last - a.last);
  const more = all.length > shown.length;
  const things = shown.map(({ kind, count }) => {
    const noun = buildOf(kind).noun;
    return count > 1 ? `${countWord(count)} ${plural(noun)}` : `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
  });
  const phrase = things.length ? new Intl.ListFormat("en", { type: "conjunction" }).format(more ? [...things, "more"] : things) : "";
  return { shown, more, hasBridge: !!bridge, phrase };
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

function plural(noun: string): string {
  return /(s|x|z|ch|sh)$/.test(noun) ? `${noun}es` : `${noun}s`;
}

/** Grandpa's line for one kind, with duplicates folded in: "a lantern" becomes "two lanterns". */
function lineFor({ kind, count }: KindCount, name: string): string {
  const build = buildOf(kind);
  const text = build.message(name);
  if (count < 2) return text;
  const noun = build.noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\ba (little )?${noun}\\b`), (_m, little: string | undefined) => `${countWord(count)} ${little ?? ""}${plural(build.noun)}`);
}

/**
 * First names: letters (any alphabet), starting with one, up to 20. A single hyphen,
 * apostrophe or space can join the parts, for Mary-Kate, D'Andre and Anne Marie.
 */
function cleanName(raw: string): string {
  const name = raw
    .replace(/[^\p{L}\p{M}'’ -]/gu, "")
    .replace(/^[^\p{L}]+/u, "")
    .replace(/(['’ -])['’ -]+/g, "$1");
  return Array.from(name).slice(0, 20).join("");
}

/** A joiner is kept while the child is still typing; once they stop, a dangling one goes. */
function finishName(name: string): string {
  return name.replace(/['’ -]+$/, "");
}

function displayName(name: string): string {
  const done = finishName(name);
  return done ? done.charAt(0).toLocaleUpperCase() + done.slice(1) : "";
}

/* ---------- Dialog plumbing ---------- */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab go round and round inside the dialog. */
function trapTab(e: KeyboardEvent<HTMLDivElement>, root: HTMLElement | null) {
  if (!root) return;
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[inert]") && el.getClientRects().length > 0);
  if (items.length === 0) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !root.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

const SAFE_PADDING: CSSProperties = {
  paddingTop: "max(12px, env(safe-area-inset-top))",
  paddingBottom: "max(12px, env(safe-area-inset-bottom))",
  paddingLeft: "max(12px, env(safe-area-inset-left))",
  paddingRight: "max(12px, env(safe-area-inset-right))",
};

/** Card stock: warm, with a little light across one corner and the faintest grain. */
const PAPER: CSSProperties = {
  backgroundColor: "#f8f5ec",
  backgroundImage: [
    "radial-gradient(120% 80% at 0% 0%, rgb(255 255 255 / 0.8), transparent 55%)",
    "radial-gradient(90% 70% at 100% 100%, rgb(227 168 61 / 0.1), transparent 60%)",
    "repeating-linear-gradient(115deg, rgb(138 90 59 / 0.02) 0 2px, transparent 2px 5px)",
  ].join(", "),
  boxShadow:
    "0 1px 0 rgb(255 255 255 / 0.85) inset, 0 0 0 1px rgb(44 58 50 / 0.1), 0 30px 60px -24px rgb(16 24 20 / 0.6), 0 12px 24px -14px rgb(16 24 20 / 0.4)",
};

const CTA =
  "inline-flex min-h-14 select-none items-center justify-center gap-2.5 rounded-2xl bg-pine px-6 text-[17px] font-extrabold text-paper shadow-[0_10px_22px_-10px_rgb(44_58_50/0.7)] transition-[background-color,transform] duration-150 hover:bg-[#3a4b41] active:scale-[0.97] aria-disabled:cursor-default";

/*
 * Timeline of a send, in ms: the postmark thumps (0), the card shrinks onto the
 * spot above the envelope (200), the envelope arrives (420), the small copy of the
 * card takes over and slides in (540), the flap closes (900), the seal presses
 * (1110), and it all flies up with a puff of hearts (1290). SEND_MS is the end.
 * With reduced motion the card only fades, and the confirmation fades in.
 */
const CSS = `
@keyframes pc-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes pc-fade-out { from { opacity: 1 } to { opacity: 0 } }
@keyframes pc-rise { from { opacity: 0; transform: translateY(16px) scale(.985) } to { opacity: 1; transform: none } }
@keyframes pc-develop { from { opacity: 0; filter: saturate(.4) brightness(1.15) } to { opacity: 1; filter: none } }
@keyframes pc-pop { 0% { opacity: 0; transform: scale(.6) } 70% { opacity: 1; transform: scale(1.06) } 100% { opacity: 1; transform: none } }
@keyframes pc-postmark { 0% { opacity: 0; transform: scale(1.9) rotate(-24deg) } 55% { opacity: .95; transform: scale(.94) rotate(-12deg) } 100% { opacity: .9; transform: scale(1) rotate(-12deg) } }
@keyframes pc-shrink { 0% { opacity: 1; transform: none } 82% { opacity: 1 } 100% { opacity: 0; transform: translate(var(--pc-dx, 0), var(--pc-dy, 0)) scale(var(--pc-s, .18)) rotate(-6deg) } }
@keyframes pc-env-in { from { opacity: 0; transform: translateY(18px) scale(.72) } to { opacity: 1; transform: none } }
@keyframes pc-slide { 0%, 10% { transform: translateY(-96px) rotate(-6deg) scale(1.12) } 0% { opacity: 0 } 8% { opacity: 1 } 100% { opacity: 1; transform: translateY(6px) } }
@keyframes pc-flap { 0% { transform: rotateX(180deg); z-index: 1 } 49% { z-index: 1 } 50% { z-index: 4 } 100% { transform: rotateX(0deg); z-index: 4 } }
@keyframes pc-seal { 0% { opacity: 0; transform: scale(1.8) } 65% { opacity: 1; transform: scale(.9) } 100% { opacity: 1; transform: none } }
@keyframes pc-fly {
  0% { transform: none; opacity: 1 }
  14% { transform: translateY(10px) scale(1.04, .95); opacity: 1 }
  80% { opacity: 1 }
  100% { transform: translate(70px, -78vh) rotate(-16deg) scale(.5); opacity: 0 }
}
@keyframes pc-puff { 0% { opacity: 0; transform: translate(0, 0) scale(.3) } 25% { opacity: 1 } 70% { opacity: 1 } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1) rotate(-10deg) } }

.pc-fade { animation: pc-fade-in 220ms ease-out both }
.pc-rise { animation: pc-rise 420ms cubic-bezier(.22, 1, .36, 1) both }
.pc-develop { animation: pc-develop 700ms ease-out both }
.pc-pop { animation: pc-pop 520ms cubic-bezier(.22, 1, .36, 1) 80ms both }
.pc-pop-late { animation: pc-pop 520ms cubic-bezier(.22, 1, .36, 1) 320ms both }
.pc-fade-out { animation: pc-fade-out 200ms ease forwards }
.pc-postmark { transform-origin: 70% 50%; animation: pc-postmark 300ms cubic-bezier(.3, 1.4, .5, 1) both }
.pc-shrink { animation: pc-shrink 360ms cubic-bezier(.55, 0, .35, 1) 200ms forwards }
.pc-env-in { animation: pc-env-in 260ms cubic-bezier(.22, 1, .36, 1) 420ms both }
.pc-slide { animation: pc-slide 380ms cubic-bezier(.45, 0, .3, 1) 540ms both }
.pc-flap { transform-origin: 50% 0; backface-visibility: visible; animation: pc-flap 260ms cubic-bezier(.5, 0, .3, 1) 900ms both }
.pc-seal { animation: pc-seal 220ms cubic-bezier(.3, 1.3, .5, 1) 1110ms both }
.pc-fly { animation: pc-fly 500ms cubic-bezier(.55, 0, .8, .25) 1290ms forwards }
.pc-puff { opacity: 0; animation: pc-puff 650ms ease-out 1310ms both }

@media (prefers-reduced-motion: reduce) {
  .pc-rise, .pc-pop, .pc-pop-late, .pc-develop { animation: pc-fade-in 240ms ease-out both }
  .pc-shrink { animation: pc-fade-out 200ms ease forwards }
  .pc-postmark, .pc-fly, .pc-puff { animation: none }
}
`;
