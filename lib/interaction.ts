import type { Interaction, Line } from "./episode";
import type { Attempt } from "./profile";

/**
 * What the episode runner hands every interaction. Interactions never talk to the
 * voice, the session store, or the router directly; they go through this.
 */
export type InteractionContext = {
  /** The child's first name. */
  name: string;
  /**
   * Speak lines in the narrator voice and show them as captions, one after another.
   * Resolves when the last line finishes, or early if the screen goes away or a newer
   * narrate() (or the celebration) takes over the voice.
   * `{name}` in lines is filled in for you.
   */
  narrate: (lines: Line[]) => Promise<void>;
  /** Record an attempt. The runner updates skill scores. */
  log: (attempt: Attempt) => void;
  /**
   * The child finished this page. The runner celebrates (art mood, sound, the screen's
   * onSuccess narration) and turns the page. Safe to call more than once; only the first counts.
   */
  succeed: () => void;
  /**
   * Start the celebration (the sounds and the onSuccess narration) now, while the interaction
   * still plays out its own payoff, like the rocket swooping along her S. Calling it is up to the
   * interaction. The page stays put; call succeed() when the payoff is over, and it then only
   * holds a moment and turns. Only the first call per screen counts.
   */
  cheer: () => void;
  /** False once this screen is gone. Check it after every await before touching state. */
  alive: () => boolean;
  /** The screen's onHelp lines, already part of the episode data. */
  help: Line[];
};

export type InteractionProps<T extends Interaction> = {
  config: T;
  /**
   * False while the screen's opening narration plays (show your scene, don't listen yet),
   * true once the child may act.
   */
  active: boolean;
  ctx: InteractionContext;
};
