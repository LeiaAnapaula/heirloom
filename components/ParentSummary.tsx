"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import FamilyPanel from "./account/FamilyPanel";
import { Suspense, use, useEffect, useEffectEvent, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { browser } from "react-dom";
import { StarSprite } from "./art/sprites";
import { lostStar } from "@/content/episodes/lost-star";
import { planNext } from "@/lib/adapt";
import { withName, type CountInteraction, type FeatherInteraction } from "@/lib/episode";
import { SKILL_IDS, type Attempt, type SkillId } from "@/lib/profile";
import { clearSession, loadSession, subscribe, type LoggedAttempt, type Session } from "@/lib/session";
import { MASTERY, isMastered, lastAttempt } from "@/lib/skills";

const ease = [0.22, 1, 0.36, 1] as const;

// What the summary talks about comes from the episode itself, so a new episode
// file brings its own words, letter and counting without touching this page.
const interactions = lostStar.screens.map((s) => s.interaction);
const WORDS = interactions.flatMap((i) => (i.type === "readAloud" ? [{ word: i.word.toUpperCase(), skill: i.skill }] : []));
const LETTERS = interactions.flatMap((i) => (i.type === "trace" ? [{ letter: i.letter, skill: i.skill }] : []));
const COUNT = interactions.find((i): i is CountInteraction => i.type === "count");
const IDEA = interactions.find((i): i is FeatherInteraction => i.type === "feather");

const SKILL_LABELS: Record<SkillId, string> = {
  "read:GO": "Reading GO",
  "read:HOME": "Reading HOME",
  "read:SUN": "Reading SUN",
  "write:S": "Writing S",
  "count:to5": "Counting",
  "count:add1": "Adding one more",
  "idea:gravity": "Gravity",
};

/**
 * The grown-up corner. A quick sum keeps little readers out, then a calm summary of
 * today's reading from this device and what tomorrow's story will practice.
 */
export default function ParentSummary() {
  return (
    <Suspense fallback={<div aria-busy className="min-h-dvh" />}>
      <GrownUpCorner />
    </Suspense>
  );
}

function GrownUpCorner() {
  // The saved session and the random question exist only in this browser, so this part
  // renders there. The static page ships the night sky and an empty fallback.
  use(browser("The parent check and today's results live in this browser."));
  const [unlocked, setUnlocked] = useState(false);
  const reduceMotion = useReducedMotion();
  // Leaving the page locks it again: Next keeps visited pages alive, and a child must not
  // find the grown-up page already open the next time someone taps "For grown-ups".
  useLayoutEffect(() => () => setUnlocked(false), []);
  const fade = { duration: reduceMotion ? 0 : 0.35 };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {unlocked ? (
        <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: fade }}>
          <Summary />
          <FamilyPanel />
        </motion.div>
      ) : (
        <motion.div key="gate" exit={{ opacity: 0, transition: fade }}>
          <ParentGate
            onPass={() => {
              window.scrollTo(0, 0);
              setUnlocked(true);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* The parent check                                                    */
/* ------------------------------------------------------------------ */

type Question = { a: number; b: number };

/** Two numbers from 2 to 9 that add up to 11 to 18: quick for a grown-up, a stretch at five. */
function newQuestion(previous?: Question): Question {
  for (;;) {
    const sum = 11 + Math.floor(Math.random() * 8);
    const lo = Math.max(2, sum - 9);
    const hi = Math.min(9, sum - 2);
    const a = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (!previous || a !== previous.a || sum - a !== previous.b) return { a, b: sum - a };
  }
}

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function ParentGate({ onPass }: { onPass: () => void }) {
  const reduceMotion = useReducedMotion();
  const [question, setQuestion] = useState(() => newQuestion());
  const [entry, setEntry] = useState("");
  const [wrong, setWrong] = useState(false);
  const [missed, setMissed] = useState(false);
  const answer = String(question.a + question.b);

  // After a wrong answer the digits shake for a moment, then a fresh question appears.
  useEffect(() => {
    if (!wrong) return;
    const t = window.setTimeout(() => {
      setQuestion(newQuestion(question));
      setEntry("");
      setWrong(false);
    }, 700);
    return () => window.clearTimeout(t);
  }, [wrong, question]);

  const press = (digit: string) => {
    if (wrong || entry.length >= answer.length) return;
    const next = entry + digit;
    setEntry(next);
    setMissed(false);
    if (next.length < answer.length) return;
    if (next === answer) {
      onPass();
    } else {
      setWrong(true);
      setMissed(true);
    }
  };

  const clear = () => {
    if (!wrong) setEntry("");
  };

  // A laptop keyboard works too.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === "Backspace" || e.key === "Delete" || e.key === "Escape") clear();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-[25rem] flex-col items-center justify-center pb-12 pt-24 text-center">
      <div className="absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))]">
        <BackToBook quiet />
      </div>

      <StarSprite className="h-12 w-12" />
      <h1 className="mt-5 text-3xl font-semibold text-moon sm:text-4xl">For grown-ups</h1>
      <p className="mt-2 text-lg text-mist">Answer this to see today&apos;s results.</p>

      <motion.div
        className="mt-8 w-full"
        animate={wrong && !reduceMotion ? { x: [0, -12, 10, -7, 5, 0] } : { x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <p className="text-2xl font-medium text-moon">
          What is <span className="font-bold text-gold">{question.a}</span> + <span className="font-bold text-gold">{question.b}</span>?
        </p>
        <div role="status" aria-label={entry ? `Your answer: ${entry}` : "Your answer"} className="mt-5 flex justify-center gap-3">
          {Array.from(answer, (_, i) => (
            <span
              key={i}
              className={`grid h-[88px] w-[72px] place-items-center rounded-2xl text-5xl font-semibold tabular-nums ring-1 transition-colors duration-300 ${
                wrong ? "bg-ink/40 text-mist ring-mist/50" : entry[i] ? "bg-gold/10 text-gold ring-gold/60" : "bg-ink/40 ring-mist/25"
              }`}
            >
              {entry[i] ?? <span aria-hidden className="h-1 w-7 rounded-full bg-mist/30" />}
            </span>
          ))}
        </div>
      </motion.div>

      <p aria-live="polite" className="mt-4 min-h-7 text-lg text-mist">
        {missed ? "Not quite. Here is a new one." : ""}
      </p>

      <div className="mt-4 grid w-full grid-cols-3 gap-3">
        {DIGITS.map((d) => (
          <PadKey key={d} onPress={() => press(d)}>
            {d}
          </PadKey>
        ))}
        <PadKey wide onPress={() => press("0")}>
          0
        </PadKey>
        <PadKey quiet onPress={clear}>
          Clear
        </PadKey>
      </div>
    </section>
  );
}

function PadKey({ children, onPress, wide, quiet }: { children: ReactNode; onPress: () => void; wide?: boolean; quiet?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`h-[76px] rounded-[1.4rem] ring-1 transition-[background-color,transform] duration-150 motion-safe:active:scale-[0.96] ${
        quiet
          ? "bg-ink/40 text-xl font-semibold text-mist ring-mist/25 hover:bg-dusk/60"
          : "bg-dusk/60 text-3xl font-semibold tabular-nums text-moon ring-gold/25 hover:bg-dusk active:bg-gold/20"
      } ${wide ? "col-span-2" : ""}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* The summary                                                         */
/* ------------------------------------------------------------------ */

function Summary() {
  const session = useSyncExternalStore(subscribe, loadSession, () => null);
  if (!session || session.attempts.length === 0) return <EmptyState />;
  return <Report session={session} />;
}

function EmptyState() {
  return (
    <section className="mx-auto flex min-h-dvh max-w-[30rem] flex-col items-center justify-center py-16 text-center">
      <StarSprite className="h-20 w-20" />
      <p className="mt-6 text-2xl font-medium leading-relaxed text-moon [text-wrap:balance]">
        Read the story together, then come back here to see what was learned.
      </p>
      <Link href="/" className="glow-button mt-10 rounded-full px-10 py-5 text-2xl font-bold">
        Back to the book
      </Link>
    </section>
  );
}

function Report({ session }: { session: Session }) {
  const { attempts, profile } = session;
  const name = profile.name || "Your child";
  const plan = planNext(session);
  const practiced = SKILL_IDS.filter((id) => attempts.some((a) => a.skill === id));
  const [today] = useState(() => new Date().toDateString());

  const started = new Date(session.startedAt);
  const isToday = started.toDateString() === today;
  const date = started.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const minutes = Math.round(((attempts[attempts.length - 1]?.at ?? session.startedAt) - session.startedAt) / 60000);
  const guess = IDEA ? [...attempts].reverse().find((a) => a.skill === IDEA.skill && a.note)?.note : undefined;
  const counting = countingSentence(attempts);

  return (
    <article className="mx-auto w-full max-w-[44rem] select-text pb-16 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <nav className="-ml-3">
        <BackToBook quiet />
      </nav>

      <header className="mt-6">
        <h1 className="bg-gradient-to-b from-[#fff4d6] via-gold to-gold-deep bg-clip-text pb-1 text-4xl font-semibold tracking-tight text-transparent sm:text-5xl">
          {name}&apos;s {isToday ? "story today" : "latest story"}
        </h1>
        <p className="mt-3 text-lg text-mist">{date}</p>
        <p className="mt-1 text-lg text-mist/85">
          {withName(lostStar.title, name)}, {session.finished ? "read to the end" : "stopped partway through"}
          {minutes >= 1 ? ` in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}` : ""}.
        </p>
      </header>

      <div className="mt-12 grid gap-12">
        <Card label="Words read" index={0}>
          <ul className="divide-y divide-gold/10">
            {WORDS.map(({ word, skill }) => (
              <Row key={skill} glyph={word} how={readHow(lastAttempt(attempts, skill))} empty="Not read yet" />
            ))}
          </ul>
        </Card>

        <Card label="Letter practiced" index={1}>
          <ul className="divide-y divide-gold/10">
            {LETTERS.map(({ letter, skill }) => (
              <Row key={skill} glyph={letter} how={traceHow(lastAttempt(attempts, skill))} empty="Not traced yet" />
            ))}
          </ul>
        </Card>

        <Card label="Counting" index={2}>
          <p className={`text-xl leading-relaxed ${counting ? "text-moon" : "text-mist"}`}>{counting ?? "Not counted yet"}</p>
        </Card>

        <Card label="New idea" index={3}>
          <p className="text-xl leading-relaxed text-moon">
            <span className="font-semibold text-gold">Gravity.</span>{" "}
            {IDEA && lastAttempt(attempts, IDEA.skill)
              ? "The Moon pulls gently, so a dropped feather falls slowly."
              : "It waits on the Moon page, which was not reached today."}
          </p>
          <p className="mt-4 text-sm font-semibold text-mist">{name}&apos;s guess</p>
          {guess ? (
            <blockquote className="mt-1 text-xl italic leading-relaxed text-moon">&ldquo;{guess}&rdquo;</blockquote>
          ) : (
            <p className="mt-1 text-lg text-mist">No guess today</p>
          )}
        </Card>

        <Card label="Skills, start to now" index={4}>
          <ul className="grid gap-5">
            {practiced.map((id) => (
              <SkillBar key={id} skill={id} start={session.startSkills[id]} now={session.skills[id]} />
            ))}
          </ul>
          <p className="mt-5 text-sm text-mist/80">The thin line marks mastery, at {pct(MASTERY)}.</p>
        </Card>

        <Card label="Tomorrow" index={5}>
          <p className="text-2xl font-semibold text-gold">{plan.title}</p>
          <dl className="mt-4 grid gap-5">
            <PlanRow term="New word" value={plan.word} reason={plan.wordReason} />
            <PlanRow term="Letter" value={plan.letter} reason={plan.letterReason} />
            <PlanRow term="Math" value={plan.math === "adding" ? "Simple adding" : "More counting"} reason={plan.mathReason} />
          </dl>
        </Card>
      </div>

      <PrivacyNote />

      <div className="mt-12 flex justify-center">
        <Link href="/" className="glow-button rounded-full px-10 py-5 text-2xl font-bold">
          Back to the book
        </Link>
      </div>
    </article>
  );
}

/** One part of the report: a plain heading and what happened. Read like a note, not a dashboard. */
function Card({ label, children }: { label: string; index?: number; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-gold">{label}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ glyph, how, empty }: { glyph: string; how: string | null; empty: string }) {
  return (
    <li className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <span className="inline-flex min-w-[4.75rem] justify-center rounded-xl bg-gold/10 px-3 py-1.5 text-2xl font-bold tracking-wide text-gold ring-1 ring-gold/30">
        {glyph}
      </span>
      <span className={`text-lg ${how ? "text-moon" : "text-mist"}`}>{how ?? empty}</span>
    </li>
  );
}

function SkillBar({ skill, start, now }: { skill: SkillId; start: number; now: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-lg font-semibold text-moon">{SKILL_LABELS[skill]}</span>
        <span className="flex items-center gap-2 text-sm tabular-nums text-mist">
          {pct(start)} → {pct(now)}
          {isMastered(now) && (
            <span className="inline-flex items-center gap-1 font-semibold text-gold">
              <StarSprite glow={false} className="h-3.5 w-3.5" />
              mastered
            </span>
          )}
        </span>
      </div>
      <div aria-hidden className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-ink/70 ring-1 ring-inset ring-mist/10">
        <div className="absolute inset-y-0 left-0 rounded-full bg-mist/20" style={{ width: pct(start) }} />
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold-deep to-gold shadow-[0_0_12px_rgba(245,201,105,0.5)]"
          initial={{ width: reduceMotion ? pct(now) : pct(start) }}
          animate={{ width: pct(now) }}
          transition={{ duration: reduceMotion ? 0 : 1.1, delay: reduceMotion ? 0 : 0.5, ease }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-moon/50" style={{ left: pct(MASTERY) }} />
      </div>
    </li>
  );
}

function PlanRow({ term, value, reason }: { term: string; value: string; reason: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-mist sm:pt-1">{term}</dt>
      <dd>
        <span className="text-xl font-bold tracking-wide text-gold">{value}</span>
        <p className="mt-1 text-base leading-relaxed text-moon/85">{reason}</p>
      </dd>
    </div>
  );
}

function PrivacyNote() {
  const [asking, setAsking] = useState(false);
  return (
    <footer className="mt-10 px-1 text-sm leading-relaxed text-mist">
      <p>
        Kept on this device: first name, age, interests, skill scores, and today&apos;s answers, including the gravity guess as
        text. If you are signed in, the same results are also saved to your grown-up account so they follow your child. No voice
        recordings are ever made or kept: the browser&apos;s speech service turns spoken answers into text. To write and read the
        story, only first name, age and interests are shared with our AI partners.
      </p>
      {asking ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-base text-moon">Clear today&apos;s results from this device?</span>
          <button type="button" onClick={clearSession} className="min-h-12 rounded-full bg-mist px-5 text-base font-semibold text-ink">
            Yes, clear them
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="min-h-12 rounded-full px-5 text-base font-semibold text-moon ring-1 ring-mist/40 hover:bg-dusk/60"
          >
            Keep them
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="mt-4 min-h-12 rounded-full px-5 text-base font-semibold text-moon ring-1 ring-mist/40 transition-colors hover:bg-dusk/60"
        >
          Clear today&apos;s results
        </button>
      )}
    </footer>
  );
}

function BackToBook({ quiet }: { quiet?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex min-h-[72px] items-center gap-2 rounded-full px-4 text-lg font-semibold transition-colors ${
        quiet ? "text-mist hover:text-moon" : "text-gold"
      }`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      Back to the book
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Plain words from attempts                                           */
/* ------------------------------------------------------------------ */

const pct = (score: number) => `${Math.round(score * 100)}%`;

const afterHints = (n: number) => (n === 1 ? "after a hint" : "after two hints");

function readHow(a: Attempt | undefined): string | null {
  if (!a) return null;
  if (a.mode === "tap") return "Answered by tap";
  if (!a.correct) return "Read together";
  return a.hintsUsed > 0 ? `Read ${afterHints(a.hintsUsed)}` : "Read on their own";
}

function traceHow(a: Attempt | undefined): string | null {
  if (!a) return null;
  if (!a.correct) return "Traced together";
  return a.hintsUsed > 0 ? `Traced ${afterHints(a.hintsUsed)}` : "Traced on their own";
}

/** "Counted 4 planets, then added one more to make 5." with a few honest qualifiers. */
function countingSentence(attempts: LoggedAttempt[]): string | null {
  const [first, second] = COUNT?.steps ?? [];
  const counted = first && lastAttempt(attempts, first.skill);
  if (!first || !counted) return null;
  const head = `Counted ${first.answer} planets${!counted.correct ? " together" : counted.hintsUsed > 0 ? ` ${afterHints(counted.hintsUsed)}` : ""}`;
  const added = second && lastAttempt(attempts, second.skill);
  if (!second || !added) return `${head}.`;
  const tail = added.correct
    ? `then added one more to make ${second.answer}${added.hintsUsed > 0 ? ` ${afterHints(added.hintsUsed)}` : ""}`
    : `then counted to ${second.answer} together`;
  return `${head}, ${tail}.`;
}
