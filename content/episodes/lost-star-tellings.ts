import type { Telling } from "@/lib/episode";

/**
 * Written tellings of "The Lost Star": the same six pages, retold for one thing a child loves.
 * A child whose grown-up picked "dinosaurs" hears the dinosaur telling the moment the book
 * opens, with no story brain and no wait. Each telling is narration for the episode's outline
 * ids (wake, go, go:success, steer, steer:success, count, count:success, moon, moon:success,
 * home, home:success), with {name} where the child's name goes.
 *
 * Every telling must pass the same checks as generated narration (validation, the blocklist,
 * no dashes, the child's name a few times, Saturn at the end). tests/tellings.test.ts enforces it.
 */

/**
 * The words that pick each telling, the interest chip first (lib/profile.ts IDEAS), then close
 * synonyms. Matching ignores case, extra spaces, a leading "the " and a simple plural, so
 * "Dinosaur" and "the dinosaurs" both pick dinosaurs. No word may pick two tellings, and none
 * may be something the written story is already about (space, planets, stars, rockets...).
 * A telling sets `interests: TELLING_INTERESTS.<its id>`.
 */
export const TELLING_INTERESTS: Record<string, string[]> = {
  dinosaurs: ["dinosaurs", "dinosaur", "dinos", "dino", "fossils", "triceratops", "stegosaurus"],
  ocean: [
    "the ocean", "ocean", "the sea", "sea", "beach", "whales", "fish", "dolphins", "sea animals", "sea turtles",
    "octopus", "mermaids",
  ],
  animals: [
    "animals", "pets", "dogs", "puppies", "cats", "kittens", "horses", "ponies", "farm animals", "the farm", "the zoo",
    "zoo animals", "bunnies", "rabbits", "owls", "birds",
  ],
  trucks: ["trucks", "diggers", "dump trucks", "tractors", "fire trucks", "construction", "cars", "buses", "vehicles"],
  music: ["music", "songs", "singing", "dancing", "piano", "drums", "guitar", "instruments"],
  drawing: ["drawing", "art", "painting", "colors", "colours", "crayons", "crafts", "coloring"],
  bugs: ["bugs", "insects", "butterflies", "ladybugs", "bees", "ants", "caterpillars", "beetles", "fireflies", "spiders"],
  castles: ["castles", "knights", "princesses", "princes", "kings and queens", "dragons", "fairy tales"],
  trains: ["trains", "railroads", "steam trains", "choo choo trains"],
};

/** The written tellings, one per interest chip other than space (the written story is the space one). */
export const lostStarTellings: Telling[] = [
  // A baby triceratops watches its little star fall from its cozy nest, rides along, and waves from the nest at the end.
  {
    id: "dinosaurs",
    interests: TELLING_INTERESTS.dinosaurs,
    screens: {
      wake: [
        "Hello, {name}.",
        "From its cozy nest, a baby triceratops watched its little star fall.",
        "Only you can bring it home.",
        "Will you help us?",
      ],
      go: [
        "The baby triceratops squeezes into the rocket, all three horns first.",
        "To start the rocket, read the word on the button.",
      ],
      "go:success": ["You did it, {name}! Rumble, rumble, like a dinosaur parade!"],
      steer: [
        "To steer along the curvy path, we draw the letter S, for star.",
        "Swish, like a dinosaur tail! Watch the magic pencil.",
      ],
      "steer:success": ["Wheee! You steered the rocket, {name}!", "The baby triceratops cheers. Stomp, stomp, hooray!"],
      count: ["These planets are as round as dinosaur eggs!", "How many planets do you see?"],
      "count:success": ["Five planets, a whole nest of eggs!", "Great counting, {name}. Stomp, stomp, hooray!"],
      moon: [
        "We made it to the Moon, and there's our star!",
        "Some dinosaurs had feathers, just like birds!",
        "If you drop this feather on the Moon, what do you think happens?",
      ],
      "moon:success": [
        "The Moon pulls gently, so the feather falls slowly. That's called gravity.",
        "Here on the Moon, our friend could hop six times higher than on Earth. Boing!",
      ],
      home: ["Read the magic word to send our star back to the sky."],
      "home:success": [
        "Thank you, {name}!",
        "Back in its cozy nest, the baby triceratops waves to its star.",
        "Tomorrow, the star wants to show you Saturn's rings.",
      ],
    },
  },
  // A baby sea turtle, no bigger than a cookie, rides along, finds the star in the crater, and paddles back to the sea.
  {
    id: "ocean",
    interests: TELLING_INTERESTS.ocean,
    screens: {
      wake: [
        "Hello, {name}.",
        "A little star fell last night.",
        "Far away, a baby sea turtle, no bigger than a cookie, saw it fall.",
        "Only you can bring it home to the sky. Will you help us?",
      ],
      go: ["To start the rocket, read the word on the button."],
      "go:success": ["Whoosh! You did it, {name}!", "The turtle rides along, cheering. Flip, flap, hooray!"],
      steer: ["To steer along the curvy path, we draw the letter S, for swim.", "Watch the magic pencil first."],
      "steer:success": [
        "Wheee! You steered like a sea turtle, {name}!",
        "Sea turtles find their way across the ocean.",
      ],
      count: ["The turtle thinks planets look like bubbles.", "How many planets do you see?"],
      "count:success": ["Five planets! Great counting, {name}.", "Flip, flap, hooray!"],
      moon: [
        "We made it to the Moon!",
        "The turtle spots our star, snug in the crater like a shell in the sand.",
        "If you drop a feather here, what do you think happens?",
      ],
      "moon:success": [
        "The Moon pulls gently, so things fall slowly there. That's called gravity.",
        "That same pull moves the ocean's tides in and out.",
      ],
      home: ["Read the magic word to send our star back to the sky."],
      "home:success": [
        "Thank you, {name}! Our star is home in the sky.",
        "The turtle paddles home to the sea. Flip, flap, goodbye!",
        "Tomorrow, the star wants to show you Saturn's rings.",
      ],
    },
  },
  // A fluffy owl from the cottage trees hops aboard, spots every planet, and gives the child a spare feather.
  {
    id: "animals",
    interests: TELLING_INTERESTS.animals,
    screens: {
      wake: [
        "Hello, {name}.",
        "Last night, a fluffy owl in the trees saw a star tumble down.",
        "Only you can bring it home. Will you help me?",
      ],
      go: ["The owl hops aboard to help.", "To start the rocket, read the word on the button."],
      "go:success": ["You did it, {name}! The owl hoots, hoo hoo!"],
      steer: [
        "To steer along the curvy path, we draw the letter S.",
        "It bends like a swan's neck. Watch the magic pencil.",
      ],
      "steer:success": ["Wheee! You steered the rocket, {name}!", "Hoo hoo, what a swoop!"],
      count: [
        "The owl turns its head way round to spot every planet. Owls really can!",
        "How many planets do you see, {name}?",
      ],
      "count:success": ["Five planets, round as owl eggs! Great counting, {name}."],
      moon: [
        "We made it to the Moon! Hoo hoo, there's our star, snug in the crater.",
        "The owl gives you a spare feather.",
        "If you drop it on the Moon, what do you think happens?",
      ],
      "moon:success": [
        "The Moon pulls gently, so the feather falls slowly. A rock would too!",
        "That's called gravity.",
      ],
      home: ["Read the magic word to send the star back to the sky."],
      "home:success": [
        "Thank you, {name}. The star is back in the sky.",
        "The owl waves a fluffy wing goodnight.",
        "Tomorrow, the star wants to show you Saturn's rings.",
      ],
    },
  },
  // A little digger who can't fly backs aboard, beeping, and scoops the star out of the crater.
  {
    id: "trucks",
    interests: TELLING_INTERESTS.trucks,
    screens: {
      wake: [
        "Hello, {name}.",
        "A little digger saw a star fall, but diggers can't fly.",
        "Will you help us bring the star home?",
      ],
      go: ["The digger backs aboard. Beep beep!", "To start the rocket, read the word on the button."],
      "go:success": ["You did it, {name}!", "Our rocket rumbles like a dump truck. Up, up, up!"],
      steer: [
        "The dotted path curves like a road.",
        "To steer, we draw the letter S, for Scoop.",
        "Watch the magic pencil.",
      ],
      "steer:success": ["Wheee! You steered us, {name}!", "The digger cheers, beep beep!"],
      count: ["The digger says planets look like tires.", "How many planets do you see, {name}?"],
      "count:success": ["Five planets, like four car tires and a spare tire! Great counting."],
      moon: [
        "We made it to the Moon, and our star is in a crater.",
        "The digger loves big holes.",
        "What happens if you drop a feather on the Moon?",
      ],
      "moon:success": ["The Moon pulls gently, so even big rocks fall slowly.", "That's called gravity, {name}."],
      home: [
        "The digger's arm scooped our star from the crater, like a big hand.",
        "Read the magic word to send the star back to the sky.",
      ],
      "home:success": [
        "Thank you, {name}. The star is back in the sky.",
        "The digger waves its scoop. Beep beep!",
        "Tomorrow, the star wants to show you Saturn's rings.",
      ],
    },
  },
  // A little star falls humming, and a songbird follows the hum all the way to the Moon.
  {
    id: "music",
    interests: TELLING_INTERESTS.music,
    screens: {
      wake: [
        "Hello, {name}.",
        "A little star fell from the sky, humming. Hum, hum.",
        "Only you can bring it back.",
        "Will you help me?",
      ],
      go: ["A songbird hops in, to follow the hum.", "To start the rocket, read the word on the button."],
      "go:success": [
        "You did it, {name}! The rocket rumbles like a big drum.",
        "The songbird cheers, tweet, tweet, hooray!",
      ],
      steer: ["To steer along the curvy path, we draw the letter S, for Song.", "Watch the magic pencil dance."],
      "steer:success": ["Wheee! You steered the rocket, {name}!", "The songbird cheers, tweet, tweet, hooray!"],
      count: ["The planets are round, like the tops of drums.", "How many planets do you see, {name}?"],
      "count:success": ["Five planets, {name}! Let's drum them: tap, tap, tap, tap, tap!"],
      moon: [
        "We made it to the Moon, and there is our star!",
        "The songbird brought a feather.",
        "If you drop the feather on the Moon, what do you think happens?",
      ],
      "moon:success": [
        "The Moon pulls gently, so the feather falls slowly, like a lullaby.",
        "That pull is called gravity.",
      ],
      home: ["Read the magic word to send our star back to the sky."],
      "home:success": [
        "Thank you, {name}! Hum, hum, our star is back in the sky.",
        "The songbird sings goodnight, tweet, tweet.",
        "Tomorrow, the star wants to show you Saturn's rings.",
      ],
    },
  },
  // The book's own magic pencil is the drawing friend who hops aboard, eraser first.
  {
    id: "drawing",
    interests: TELLING_INTERESTS.drawing,
    screens: {
      wake: [
        "Hello, {name}.",
        "Last night, my magic pencil saw a little star fall far, far away.",
        "Only you can bring it home. Will you help me?",
      ],
      go: ["The pencil hops aboard, eraser first. Silly pencil!", "To start the rocket, read the word on the button."],
      "go:success": ["You did it, {name}! Whoosh, up we zoom!"],
      steer: [
        "To steer along the curvy path, we draw the letter S, for swirl.",
        "Watch the magic pencil draw it first.",
      ],
      "steer:success": ["Wheee! Your swirl steered the rocket, {name}!", "The pencil cheers: swish, swirl, sparkle!"],
      count: ["Watch the planets light up like dots of paint.", "How many planets do you see, {name}?"],
      "count:success": ["Five planets! Great counting, {name}.", "Swish, swirl, sparkle!"],
      moon: [
        "We made it to the Moon! There is our star.",
        "Long ago, artists drew with feather pens like this.",
        "If you drop a feather on the Moon, what do you think happens?",
      ],
      "moon:success": ["The Moon pulls gently, {name}, so the feather falls slowly.", "That's called gravity."],
      home: ["The magic word shines like wet paint.", "Read it to send the star back to the sky."],
      "home:success": [
        "Thank you, {name}! The star is back in the sky.",
        "The pencil waves goodbye to the star. Swish, swirl, sparkle!",
        "Tomorrow, the star wants to show you Saturn's rings.",
      ],
    },
  },
  // A tiny firefly, who blinks like a little star, rides along and counts the planets in blinks.
  {
    id: "bugs",
    interests: TELLING_INTERESTS.bugs,
    screens: {
      wake: [
        "Hello, {name}.",
        "Blink, blink! A tiny firefly says hello.",
        "It saw a little star fall far, far away.",
        "Only you can bring it back to the sky. Will you help me?",
      ],
      go: ["Let's find the star! The firefly rides with you.", "To start the rocket, read the word on the button."],
      "go:success": ["You did it, {name}! Rumble, rumble, whoosh!", "The firefly holds on tight."],
      steer: [
        "To steer along the curvy path, we draw the letter S.",
        "Wiggly, like a caterpillar! Watch the magic pencil draw it first.",
      ],
      "steer:success": ["Wheee! You steered the rocket, {name}!", "The firefly does a happy loop."],
      count: ["Planets are round, like ladybug spots.", "How many planets do you see, {name}?"],
      "count:success": ["Five planets! Great counting.", "Blink, blink, blink, blink, blink! The firefly counts too."],
      moon: [
        "We made it to the Moon! There is our star.",
        "The firefly brought a feather.",
        "If you drop a feather on the Moon, what do you think happens?",
      ],
      "moon:success": [
        "The Moon pulls gently, so feathers and rocks fall slowly here.",
        "That pull is called gravity.",
      ],
      home: ["Read the magic word to send the star back to the sky."],
      "home:success": [
        "Thank you, {name}! Our star twinkles in the sky again.",
        "The firefly blinks back. Blink, blink, goodbye!",
        "Tomorrow, the star wants to show you Saturn's rings.",
      ],
    },
  },
  // A friendly castle dragon, no bigger than a teacup, knows that magic words open gates, and the sky.
  {
    id: "castles",
    interests: TELLING_INTERESTS.castles,
    screens: {
      wake: [
        "Hello, {name}.",
        "A friendly castle dragon, no bigger than a teacup, saw a little star fall.",
        "Will you help us bring it home?",
      ],
      go: ["Castle gates open with a magic word.", "Read the word on the button to start our rocket."],
      "go:success": ["You did it, {name}! Hold on tight, tiny dragon!"],
      steer: ["To steer, we draw the letter S, for star.", "It curls like a dragon's tail. Watch the magic pencil."],
      "steer:success": [
        "Wheee! You steered the rocket, {name}!",
        "The tiny dragon flaps its wings. Flap, flap, hooray!",
      ],
      count: ["Planets like jewels in a crown!", "How many planets do you see?"],
      "count:success": ["Five planets, five jewels! Great counting, {name}.", "Flap, flap, hooray!"],
      moon: [
        "We made it to the Moon! There's our star, in the crater.",
        "Our dragon brought a quill, a feather pen.",
        "If you drop a feather on the Moon, what do you think happens?",
      ],
      "moon:success": [
        "The Moon pulls gently, so the feather falls slowly. That's called gravity.",
        "Our dragon writes it down!",
      ],
      home: ["The sky opens with a magic word too.", "Read it to send the star back up."],
      "home:success": [
        "Thank you, {name}! The star is back in the sky.",
        "Our dragon flies back to its castle. Flap, flap, goodbye!",
        "Tomorrow, the star wants to show you Saturn's rings.",
      ],
    },
  },
  // A tiny steam train can't fly, so it rides the rocket from station to station: last stop, the Moon.
  {
    id: "trains",
    interests: TELLING_INTERESTS.trains,
    screens: {
      wake: [
        "Hello, {name}.",
        "A little star fell on the hill and bounced, boing, up to the Moon!",
        "A tiny steam train puffed a worried cloud of steam.",
        "Trains can't fly! Will you help us bring the star home?",
      ],
      go: ["All aboard the rocket, tiny train!", "To start the rocket, read the word on the button."],
      "go:success": ["You did it, {name}!"],
      steer: ["To steer along our curvy track, we draw the letter S.", "Watch the magic pencil."],
      "steer:success": [
        "Wheee! You steered around every bend, {name}!",
        "The tiny train cheers, puff puff, choo choo!",
      ],
      count: ["The planets are our train stations.", "How many planets do you see, {name}?"],
      "count:success": ["Five planets, five stations! Great counting, {name}."],
      moon: [
        "The tiny train rings its bell. Last stop, the Moon!",
        "There is our star, in the crater!",
        "If you drop a feather on the Moon, what do you think happens?",
      ],
      "moon:success": [
        "The Moon pulls gently, so feathers, and even tiny trains, fall slowly.",
        "That's called gravity.",
      ],
      home: ["Read the magic word to send the star back to the sky."],
      "home:success": [
        "Thank you, {name}! The star is twinkling in the sky again.",
        "The tiny train whistles goodbye. Puff puff, choo choo!",
        "Tomorrow, the star wants to show you Saturn's rings.",
      ],
    },
  },
];
