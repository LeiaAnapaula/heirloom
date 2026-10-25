import type { Episode } from "@/lib/episode";

/**
 * "Mia and the Lost Star", as data. Screens read from this file, so a new episode
 * is a new file like this one. Line ids name the cached audio in public/audio/.
 * {name} becomes the child's first name.
 */
export const lostStar: Episode = {
  id: "lost-star",
  title: "{name} and the Lost Star",
  next: { title: "Saturn's Rings" },
  screens: [
    {
      id: "wake",
      art: "book-wakes",
      narration: [
        { id: "s1-hello", text: "Hello, {name}." },
        { id: "s1-star", text: "A little star fell out of the sky last night, and only you can bring it home." },
        { id: "s1-ask", text: "Will you help me?" },
      ],
      interaction: {
        type: "yes",
        accept: ["yes", "yeah", "yep", "yup", "yes please", "sure", "ok", "okay", "i will", "uh huh"],
      },
      onSuccess: { narration: [], effect: "turn" },
      onHelp: { narration: [{ id: "s1-nudge", text: "Just say yes, or tap the glowing button." }] },
    },
    {
      id: "go",
      art: "launch-pad",
      narration: [{ id: "s2-read", text: "To start the rocket, read the word on the button." }],
      interaction: {
        type: "readAloud",
        word: "go",
        skill: "read:GO",
        accept: ["goh", "gow", "goe", "geaux", "gogo", "go go"],
        place: { x: 70, y: 56 },
        giveUp: [
          { id: "s2-giveup-1", text: "Great try, {name}! That word says GO.", say: "Great try, {name}! That word says go." },
          { id: "s2-giveup-2", text: "Let's say it together. GO!", say: "Let's say it together. Go!", highlight: [0, 1] },
        ],
      },
      onSuccess: { narration: [{ id: "s2-yay", text: "You did it, {name}!" }], effect: "liftoff" },
      onHelp: {
        narration: [
          { id: "s2-hint-1", text: "Let's sound it out together." },
          { id: "s2-hint-g", text: "G...", say: "Guh...", highlight: [0] },
          { id: "s2-hint-o", text: "O...", say: "Oh...", highlight: [1] },
          { id: "s2-hint-go", text: "Go!", highlight: [0, 1] },
          { id: "s2-hint-try", text: "Your turn." },
        ],
      },
    },
    {
      id: "steer",
      art: "space-path",
      narration: [
        { id: "s3-steer", text: "To steer, we draw the letter S, for Star." },
        { id: "s3-watch", text: "Watch the magic pencil." },
      ],
      interaction: {
        type: "trace",
        letter: "S",
        skill: "write:S",
        yourTurn: [{ id: "s3-turn", text: "Now you try. Trace the S with your finger." }],
      },
      onSuccess: { narration: [{ id: "s3-yay", text: "Wheee! You steered the rocket, {name}!" }], effect: "swoop" },
      onHelp: { narration: [{ id: "s3-again", text: "Let's watch the pencil one more time, slowly." }] },
    },
    {
      id: "count",
      art: "planets",
      narration: [{ id: "s4-ask", text: "How many planets do you see, {name}?" }],
      interaction: {
        type: "count",
        max: 6,
        steps: [
          {
            answer: 4,
            skill: "count:to5",
            ask: [],
            correct: [
              { id: "s4-four", text: "Four planets!" },
              { id: "s4-more", text: "Let's add one more." },
            ],
          },
          {
            answer: 5,
            skill: "count:add1",
            ask: [{ id: "s4-now", text: "How many now?" }],
            correct: [],
          },
        ],
        numbers: [
          { id: "s4-n1", text: "One." },
          { id: "s4-n2", text: "Two." },
          { id: "s4-n3", text: "Three." },
          { id: "s4-n4", text: "Four." },
          { id: "s4-n5", text: "Five." },
          { id: "s4-n6", text: "Six." },
        ],
      },
      onSuccess: { narration: [{ id: "s4-five", text: "Five planets! Great counting, {name}." }], effect: "sparkle" },
      onHelp: { narration: [{ id: "s4-help", text: "Let's count them together." }] },
    },
    {
      id: "moon",
      art: "moon",
      narration: [
        { id: "s5-land", text: "We made it to the Moon, and there is our star!" },
        { id: "s5-ask", text: "If you drop a feather on the Moon, what do you think happens?" },
      ],
      interaction: {
        type: "feather",
        skill: "idea:gravity",
        guessMs: 7000,
        tapNow: [{ id: "s5-tap", text: "Let's find out! Tap the feather to drop it." }],
      },
      onSuccess: { narration: [{ id: "s5-gravity", text: "The Moon pulls gently, {name}. That's called gravity." }], effect: "fall" },
      onHelp: { narration: [{ id: "s5-guess", text: "What do you think? Say your guess out loud." }] },
    },
    {
      id: "home",
      art: "star-home",
      narration: [{ id: "s6-read", text: "Read the magic word to send the star home." }],
      interaction: {
        type: "readAloud",
        word: "home",
        skill: "read:HOME",
        accept: ["hom", "hoam", "holm", "homes", "homey", "hume"],
        place: { x: 50, y: 40 },
        giveUp: [
          { id: "s6-giveup-1", text: "Great try, {name}! That word says HOME.", say: "Great try, {name}! That word says home." },
          { id: "s6-giveup-2", text: "Let's say it together. HOME!", say: "Let's say it together. Home!", highlight: [0, 1, 2, 3] },
        ],
      },
      onSuccess: {
        narration: [
          { id: "s6-thanks", text: "Thank you, {name}." },
          { id: "s6-tomorrow", text: "Tomorrow, the star wants to show you Saturn's rings." },
        ],
        effect: "home",
      },
      onHelp: {
        narration: [
          { id: "s6-hint-1", text: "Let's sound it out together." },
          { id: "s6-hint-h", text: "H...", say: "Hhh...", highlight: [0] },
          { id: "s6-hint-o", text: "O...", say: "Oh...", highlight: [1] },
          { id: "s6-hint-m", text: "M...", say: "Mmm...", highlight: [2] },
          { id: "s6-hint-home", text: "Home!", highlight: [0, 1, 2, 3] },
          { id: "s6-hint-try", text: "Your turn." },
        ],
      },
    },
  ],
};

export const episodes: Record<string, Episode> = { [lostStar.id]: lostStar };
