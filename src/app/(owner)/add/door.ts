import type { WhatIsOnThisIsbn } from "@/core/queries/isbn";
import type { WhatWasSaid } from "@/core/verbs/what-happened";
import { ASKED } from "./panels";

// WHAT THE ONE FIELD HELD, AND WHERE THE ANSWER LEADS — this screen's own derivation, under
// the licence `vitest.config.ts` states: data in, data out, no render and no database. It is a
// file rather than a lump inside `page.tsx` so that it can be tested beside itself.
//
// The door has **one field** and the owner may put two quite different things in it: what a
// title is, or the thirteen digits under the barcode on the object's back. Telling those apart is
// not the core's question — the core answers *what is on this ISBN* and deliberately does not
// know what a URL or a form field is — so it is decided here, and three of the decisions are
// worth stating out loud because all three were arguable.
//
// **Digits are a barcode from ten digits up, and everything else is a title.** A shorter run of
// digits is *1984* far more often than it is a mis-scanned EAN, and answering a novel's title
// with "an ISBN is 13 digits, that is 4" would be the door refusing the plainest thing anybody
// types into it. Ten is the floor because ten is the shortest ISBN there is, so nothing that
// could be one is read as prose.
//
// **A barcode that is not an ISBN comes back as a refusal rather than as a title.** The owner
// who scanned a Bonelli monthly's periodical EAN, or the price add-on beside the barcode, is
// holding a specific object and needs to be told which barcode they read (`@/core/isbn`) — and
// silently recording `977112365904850039` as the name of a narrative would be the worst answer
// available.
//
// **An ISBN the library already knows leads to the object's own page**, exactly as it did from
// the Collection's panel before this door existed. The question being asked one-handed in a
// shop is *do I already have this?*, and the Volume's page answers it and then some. The cost
// is the same one it always was and is not hidden: a genuine second copy of an object already
// on the shelf is catalogued by typing its title rather than by scanning it.

/** What the one field held: something to look up, or something to call a narrative. */
export type WhatWasTyped =
  | { readonly it: "a-barcode"; readonly digits: string }
  | { readonly it: "a-title"; readonly title: string };

/** What a camera, a keyboard and a phone's text scan put between the digits of an ISBN. */
const SEPARATORS = /[\s-‐‑‒–—−]/g;

/** The shortest ISBN there is, and therefore the shortest run of digits that could be one. */
const SHORTEST_ISBN = 10;

/** Digits, or nine digits and the check letter an older ISBN is allowed to end with. */
const A_RUN_OF_DIGITS = /^[0-9]+$/;
const NINE_AND_A_CHECK_LETTER = /^[0-9]{9}X$/i;

/**
 * Read the one field: a barcode to look up, or a title to say something about.
 *
 * The digits are handed back with their separators removed, because that is what the core
 * reads leniently and the column stores strictly; a title is handed back trimmed and otherwise
 * exactly as it was typed.
 */
export function whatWasTyped(typed: string): WhatWasTyped {
  const bare = typed.replace(SEPARATORS, "").toUpperCase();

  if (NINE_AND_A_CHECK_LETTER.test(bare)) return { it: "a-barcode", digits: bare };
  if (A_RUN_OF_DIGITS.test(bare) && bare.length >= SHORTEST_ISBN) {
    return { it: "a-barcode", digits: bare };
  }

  return { it: "a-title", title: typed.trim() };
}

/** The door's own address, with whatever it has to carry. */
function theDoor(carrying: Record<string, string>): string {
  return `/add?${new URLSearchParams(carrying)}`;
}

/**
 * Where to go with a title the owner typed: the door's second half, which is the three
 * sentences.
 *
 * `known` is what the library already answered about the ISBN this title arrived with, where
 * it arrived with one — carried through so that the object about to be catalogued keeps the
 * digits that were scanned off its back.
 */
export function whereATitleLeads(
  title: string,
  known?: { isbn?: string; from?: string; publishedBy?: string }
): string {
  const carrying: Record<string, string> = { title };
  if (known?.isbn) carrying.isbn = known.isbn;
  if (known?.from) carrying.from = known.from;
  // Under its own name and never as `publisher`, which is what the form's own field is called:
  // a prefill sharing a name with a field is a value the page has to guess the provenance of.
  if (known?.publishedBy) carrying.publishedBy = known.publishedBy;

  return theDoor(carrying);
}

/**
 * Where to go with what a barcode turned out to be.
 *
 * `typed` is what was in the field — the camera's digits or the owner's — and it is carried
 * back on a refusal so that a misread digit is one keystroke from right rather than a field to
 * fill in again. Every other destination gets the ISBN the core read and normalised.
 *
 * **Two of the five answers land back on the field rather than on the four sentences**, and
 * that is the interesting half. A record filled the title in, so there is something to say
 * something about; no record and an unanswered source did not, so the owner is asked what the
 * object is called with the ISBN already remembered underneath — which is one question rather
 * than a form with an empty first field and no explanation.
 */
export function whereTheBarcodeLeads(typed: string, said: WhatIsOnThisIsbn): string {
  // The only destination that is not this screen. `volumes` is never empty on this answer: the
  // core says `already-catalogued` *because* it found one, and landing on the first is what
  // shows the owner there are two where an ISBN was catalogued twice.
  if (said.it === "already-catalogued") return `/collection/${said.volumes[0].id}`;

  if (said.it === "not-an-isbn") {
    return theDoor({ [ASKED]: typed, refused: said.because });
  }

  if (said.it === "a-record") {
    return whereATitleLeads(said.record.title, {
      isbn: said.isbn,
      from: said.it,
      // Omitted rather than empty: a field prefilled with nothing is a field the owner has to
      // notice is not prefilled.
      publishedBy: said.record.publisher || undefined,
    });
  }

  // `no-record` and `unanswered`: an ISBN and no title. Back to the one field, which now asks
  // for the name rather than for the barcode — and the barcode rides along.
  return theDoor({ isbn: said.isbn, from: said.it });
}

/**
 * What the door says about where its answer came from, or nothing where the owner typed a
 * title into an empty field.
 *
 * Three sentences and not one, because the three states are three different things for the
 * owner to do. *Filled in* means check it against the object in your hand. *No record* means
 * type what it is called, and is ordinary rather than a failure — SBN holds legal deposit, and
 * a volume out this month may simply not be in it yet. *Could not be asked* means type it
 * **and** that scanning the next one may well work, which a sentence about an absent book
 * would have quietly denied.
 */
export function whatFilledItIn(from: string | undefined): string | null {
  switch (from) {
    case "a-record":
      return "Filled in from SBN's record for this ISBN — check it against the object in your hand before you say anything about it.";
    case "no-record":
      return "SBN has no record under that ISBN, so what it is called is yours to type. Ordinary rather than wrong: a volume out this month may not be in the national catalogue yet.";
    case "unanswered":
      return "SBN could not be asked just now, so what it is called is yours to type. The next scan may well reach it — its backend goes down and comes back.";
    default:
      return null;
  }
}

/**
 * **Every field a refused press carries back into its panel**, in the order the form asks for
 * them.
 *
 * It is a list rather than a habit, and it is here rather than in either of the two files that
 * spell it, for the reason `./panels.ts` gives about itself: `actions.ts` writes these into the
 * address and `page.tsx` reads them back off it, and a name left out of one side is a field
 * that quietly comes back empty. A refusal is a sentence about *one* field — the position of
 * the line the house already holds — and every other field was right; a panel that reopened
 * blank would answer that by making the owner fill the object in again, standing in a shop.
 *
 * `title` is not here because it is carried by the door itself, and `from` and `publishedBy`
 * because they are what the *lookup* said rather than what the owner typed.
 */
export const THE_FIELDS_A_REFUSAL_CARRIES = [
  "type",
  "publisher",
  "editionLine",
  "binding",
  "language",
  "isbn",
  "seriesId",
  "seriesNumber",
  "pricePaid",
  "acquiredOn",
  "priority",
  "targetPrice",
  "priceFound",
  "shop",
] as const;

/** One field a refused press carries, named by the list above rather than by hand. */
export type CarriedField = (typeof THE_FIELDS_A_REFUSAL_CARRIES)[number];

/** One of the four sentences, as the owner reads it and as the screen offers it. */
export type Sentence = {
  readonly said: WhatWasSaid;
  /** The owner's own words, set in the serif that is reserved for them. */
  readonly sentence: string;
  /** What the library will record, in one line, because none of it is asked for. */
  readonly records: string;
  /**
   * The same thing at length, read under the press that does it.
   *
   * Two lengths and not one, because they are read at two moments: `records` is what the owner
   * chooses between, on a screen holding all three, and this is what they check before pressing,
   * in a panel holding only one. Both are here so that one act cannot come to say two things.
   */
  readonly atLength: string;
};

/**
 * **The four sentences, in the order the door offers them.**
 *
 * They are the screen's words and they live here for the reason every screen's words do: the
 * label on the press, the title of the panel it opens and the heading of the form inside it
 * are one vocabulary, and an act that is called two things is two acts to the owner.
 *
 * The order is neither alphabetical nor the model's: it is **the two sentences about the object
 * first and the two about the narrative after**, because the door is opened in a shop far more
 * often than on a sofa and what is under the thumb there is a thing being held. Inside each
 * pair the fact comes before the intention — *bought* before *want to buy*, *read* before *want
 * to read* — so the last of the four is the one that is furthest from having happened.
 */
export const THE_SENTENCES: readonly Sentence[] = [
  {
    said: "bought",
    sentence: "I bought it.",
    records:
      "The object joins the catalogue and the house, and the narrative it carries appears with it.",
    atLength:
      "The object joins the catalogue and the house in one act. A line that names a work takes the object into that work; every other object gets its own narrative, which is the default and is never asked about. Leave the price and the day empty where the receipt is gone.",
  },
  {
    said: "wished",
    sentence: "I want to buy it.",
    records:
      "The object joins the catalogue without joining the house, and a Wish for it joins the shopping list.",
    atLength:
      "The object is recorded and the shopping list gains it — catalogued is not owned, so nothing here says it came home and there is nothing to undo when you decide against it. A line that names a work takes the object into that work, exactly as buying it would; which position it is waits until it is on the shelf. Nothing about reading follows either — wanting the object and wanting to read the work are two sentences, and this is the one about the object.",
  },
  {
    said: "read",
    sentence: "I read it.",
    records: "A pass through it, and no object at all — the digital case needs nothing more.",
    atLength:
      "A finished pass, first-hand, through no object — which is what a digital read is. Read it on somebody else's paperback? Say it here and correct the medium on the Story, which is one press.",
  },
  {
    said: "wanted",
    sentence: "I want to read it.",
    records: "A Want, which joins the Reading list and falls quiet by itself once you have.",
    atLength:
      "It joins the Reading list and nothing else follows: no Path, no order, no Wish. Nobody closes a Want — it falls quiet by itself once a Reading has begun since.",
  },
];

/** The sentence a `?panel=…` names, or nothing where it names none. */
export function theSentence(panel: string | undefined): Sentence | undefined {
  return THE_SENTENCES.find((one) => one.said === panel);
}

// **WHAT AN OBJECT IS SHOWN AS HOLDING**, which is where the silent default went (#48,
// ADR-0019).
//
// `sayWhatHappened` used to mint a Story from the volume's title whenever no line had named a
// work. It fired **only outside a Series** — with a line the object joined the work the line
// publishes — so the one place it ever ran was the omnibus, the graphic novel and the novel.
// On a novel it is right. On *Batman: Il lungo Halloween* it minted a narrative named after
// the jacket, for an object that carries several tales named nothing like it: the default was
// loudest exactly where it was least likely to be true, and silent.
//
// What replaces it is not its removal. **The same default arrives as a line already standing
// in a list** — the Story the line publishes where there is a line, the volume's own title
// where there is not — so the ordinary case still costs nothing and the omnibus costs one
// gesture. It is here rather than in the core because it is not a fact about the library: it
// is what a screen puts in front of somebody before they have said anything, which is the
// definition of this file.

/**
 * One narrative named inside the object being catalogued, as the screen holds it before
 * anything at all is written.
 *
 * The two shapes are the two kinds of answer, and the difference is whether a record has to
 * appear: a Story the library holds is linked at submit, a title is minted and then linked.
 */
export type NamedNarrative =
  | {
      readonly it: "a-story";
      /** The Story, which is also the row's identity — a narrative is named once. */
      readonly storyId: string;
      readonly title: string;
      /**
       * The Type by name, where the screen was told it. The row the field found carries one;
       * the work a line publishes does not, because a picker over lines knows what each one
       * prints and not what kind of thing that is.
       */
      readonly type?: string;
    }
  | {
      readonly it: "a-title";
      /**
       * What identifies this row, since a title is not yet anything and two of them may be
       * typed over to read the same thing mid-word. It is the screen's own and reaches no
       * record.
       */
      readonly key: string;
      readonly title: string;
    };

/** The name a title row that has been emptied stands under, so the row can still be read. */
export const A_NARRATIVE_WITH_NO_NAME = "Untitled";

/**
 * **The row the list arrives with**: the Story the line publishes where there is a line, and
 * the volume's own title where there is not.
 *
 * `publishes` is what the Series picker already knows about the line the owner chose — the one
 * arrow between a line and a narrative (#39) — so choosing a line changes what the row says
 * rather than what the owner has to type. A line that names no work is the ordinary case and
 * falls through to the title, which is the object's own name and the answer for every novel
 * and every one-off object.
 *
 * `null` where the door has heard no title yet, which is a list with nothing to show rather
 * than a row saying nothing.
 */
export function theNarrativeAlreadyStanding(
  title: string,
  publishes: { id: string; title: string } | null | undefined
): NamedNarrative | null {
  if (publishes) return { it: "a-story", storyId: publishes.id, title: publishes.title };

  const named = title.trim();
  if (named === "") return null;

  return { it: "a-title", key: "the-volumes-own-title", title: named };
}

/**
 * The two lists the submission carries: the Stories named by id, and the titles to mint.
 *
 * **A title with nothing in it is not a narrative**, so it is dropped here rather than refused
 * — the owner emptying the box is on their way to typing something else, and the press that
 * matters is refused by the core in its own words when nothing is left at all. Both lists are
 * folded, because the same narrative named twice is one fact: the field will not offer a Story
 * the rows already hold, but a title typed over to match one already standing can.
 */
export function theNarrativesInside(named: readonly NamedNarrative[]): {
  stories: { storyId: string; title: string }[];
  newStories: string[];
} {
  const stories = new Map<string, string>();
  const newStories = new Map<string, string>();

  for (const one of named) {
    if (one.it === "a-story") {
      stories.set(one.storyId, one.title);
      continue;
    }

    const title = one.title.trim();
    // Folded on the title as a person reads two titles as the same one, which is the rule the
    // field's own enter key is held to (`@/components/stories-on-offer`). The **first**
    // spelling stands, because the row that came later is the accidental one.
    const same = title.toLowerCase();
    if (title !== "" && !newStories.has(same)) newStories.set(same, title);
  }

  return {
    stories: [...stories].map(([storyId, title]) => ({ storyId, title })),
    newStories: [...newStories.values()],
  };
}

/**
 * The rows read back off a refused press, as the owner had them.
 *
 * **A refusal is a sentence about one field and every other field was right** — which is the
 * rule `THE_FIELDS_A_REFUSAL_CARRIES` states for the object, and the narratives are the part
 * of it that would cost the most to lose: a position of the line the house already holds would
 * otherwise answer the owner by making them name an omnibus's three tales again.
 *
 * What comes back is what was submitted, so a Story is a Story and a title is a title. What
 * does not come back is what the field knew about a Story beyond its id and its name — its
 * Type, read off a row that is no longer on the screen — and the row reads without it rather
 * than the screen inventing one.
 */
export function theNarrativesNamedBefore(
  stories: readonly string[],
  storyTitles: readonly string[],
  newStories: readonly string[]
): NamedNarrative[] {
  return [
    ...stories.map(
      (storyId, at): NamedNarrative => ({
        it: "a-story",
        storyId,
        // Paired by position with the ids, which is how they were written. They come apart
        // only if the address was edited by hand, and a row with no name still reads as a row
        // rather than as a uuid: the id is what is about to be recorded either way.
        title: storyTitles[at] ?? A_NARRATIVE_WITH_NO_NAME,
      })
    ),
    ...newStories.map(
      (title, at): NamedNarrative => ({ it: "a-title", key: `named-${at}`, title })
    ),
  ];
}
