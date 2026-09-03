import type { WhatIsOnThisIsbn } from "@/core/queries/isbn";
import type { Medium } from "@/core/verbs/reading";
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
  // The medium of a pass, which is the narrative half's only field (#50). It is in the same
  // list as the object's fourteen for the same reason: the two sentences about a narrative can
  // be refused too — a blank title, a Type nobody chose — and a panel that reopened with the
  // radio back on its default would answer that by quietly changing what the owner said.
  "medium",
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

/**
 * **Which of the two things a sentence is about**, which is the only division this screen has.
 *
 * `CONTEXT.md` states it as the two halves of the door: *an object they have or want*, or *a
 * narrative they read or mean to read*. It is spelled as a fact about each sentence rather than
 * as two hand-kept lists, so the grouping below is a reading of the four and never a second
 * copy of them.
 */
export type WhatItIsAbout = "an-object" | "a-narrative";

/** One of the four sentences, as the owner reads it and as the screen offers it. */
export type Sentence = {
  readonly said: WhatWasSaid;
  /** Which of the door's two halves it stands in. */
  readonly about: WhatItIsAbout;
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
 * half the fact comes before the intention — *bought* before *want to buy*, *read* before *want
 * to read* — so the last of the four is the one that is furthest from having happened.
 *
 * That order is now also the grouping (`THE_HALVES`, #49), and this list stays flat: a panel is
 * read against it, the acts are looked up off it, and a screen that regroups the four has one
 * list to regroup rather than two to keep in step.
 */
export const THE_SENTENCES = [
  {
    said: "bought",
    about: "an-object",
    sentence: "I bought it.",
    records:
      "The object joins the catalogue and the house, along with the narratives you say are inside it.",
    atLength:
      "The object joins the catalogue and the house in one act, with whatever is inside it. One narrative is already named for you — the work the line publishes, or the object's own title — and you can type over it, take it off or add to it: an omnibus holds three, and none of them is called what the jacket is. Leave the price and the day empty where the receipt is gone.",
  },
  {
    said: "wished",
    about: "an-object",
    sentence: "I want to buy it.",
    records:
      "The object joins the catalogue without joining the house, and a Wish for it joins the shopping list.",
    atLength:
      "The object is recorded and the shopping list gains it — catalogued is not owned, so nothing here says it came home and there is nothing to undo when you decide against it. What is inside it is named here exactly as it is when you buy it, and a line that names a work stands that work in the list rather than minting a second one; which position it is waits until it is on the shelf. Nothing about reading follows either — wanting the object and wanting to read the work are two sentences, and this is the one about the object.",
  },
  {
    said: "read",
    about: "a-narrative",
    sentence: "I read it.",
    // **Neither length promises the digital case any more** (#50). Both used to: the panel
    // recorded a file whatever the owner had in their hands, and the copy said so honestly.
    // Now the panel asks, so what these two say is that no object is recorded — which is the
    // half's own fact and stays true on paper.
    records: "A pass through it, on paper or digital, and no object at all.",
    atLength:
      "A finished pass, first-hand, by whichever medium you say — a file, or somebody else's paperback. No object is recorded either way, and you are not asked which one it went through: a pass knows the object only if there was one, and naming it here would send you back round the shelf to say you read something.",
  },
  {
    said: "wanted",
    about: "a-narrative",
    sentence: "I want to read it.",
    records: "A Want, which joins the Reading list and falls quiet by itself once you have.",
    atLength:
      "It joins the Reading list and nothing else follows: no Path, no order, no Wish. Nobody closes a Want — it falls quiet by itself once a Reading has begun since.",
  },
] as const satisfies readonly Sentence[];

/**
 * **The two sentences that are about an object**, derived from the list above rather than
 * written out a second time.
 *
 * `satisfies` on `THE_SENTENCES` is what buys this: the list is still checked against
 * `Sentence` field by field, and the `about` each entry carries survives as a literal for this
 * to read. Written out by hand the pair would be spelled three times — twice as data and once
 * as a type — and the third copy is the one nothing checks: a fifth sentence about an object
 * would land in its half and get its heading, and then fail to reach the panel that asks what
 * the object is.
 */
export type AnObjectsSentence = Extract<
  (typeof THE_SENTENCES)[number],
  { about: "an-object" }
>["said"];

/**
 * **The two sentences that are about a narrative**, derived the same way and for the same
 * reason.
 *
 * It is here because that half now has a form of its own (`./the-narrative.tsx`, #50) rather
 * than a lone picker inline in the page, and a component drawing one half of a door has to be
 * unable to be handed the other half's sentence: *I bought it* reaching the panel that asks
 * the medium would be a Reading offered for an object nobody said they had read.
 */
export type ANarrativesSentence = Extract<
  (typeof THE_SENTENCES)[number],
  { about: "a-narrative" }
>["said"];

/**
 * **The two media, as the narrative half offers them** (#50), where the Type picker beside them
 * reads its vocabulary from the database.
 *
 * A medium is a check constraint rather than a vocabulary that grows — `@/core/verbs/reading`
 * says so at the type and the migration says so in SQL — so a third value would be a change to
 * the model rather than an insert, and `Medium` here is what makes it one: a fourth word in this
 * list is a type error rather than a press that posts something the verb refuses.
 *
 * The order is the order the two presses stand in, and it is the fact before the intention the
 * way the sentences above are: paper is the object in the owner's hands, digital is the one that
 * needs nothing.
 */
export const THE_TWO_MEDIA: readonly { value: Medium; label: string }[] = [
  { value: "paper", label: "Paper" },
  { value: "digital", label: "Digital" },
];

/**
 * **What a pass arrives as where the owner presses nothing**: digital.
 *
 * The default is the *screen's* and never the verb's, which is the whole shape of #50 — the
 * silent `digital` in the core is what ADR-0019 took out, and one written a file further down
 * would be the same mistake with a shorter reach. Here it is a radio arriving pressed: visible,
 * one tap from the other answer, and part of what the owner reads before they press.
 *
 * Digital rather than paper — which is what the Story's own panel opens on — because this half
 * is where the object is *absent*. The sentence that reached the object half already said the
 * thing is in the house.
 */
const UNLESS_SAID_OTHERWISE: Medium = "digital";

/**
 * Which medium the panel opens on: the one a refused press carried back, or the default.
 *
 * Read against the two rather than trusted, exactly as `theSentence` reads `?panel=`: a value
 * naming neither cannot come off the form — it comes off a hand-edited address — and no answer
 * is the default rather than a third medium posted at the verb.
 */
export function theMediumPressed(carried: string | undefined): Medium {
  return THE_TWO_MEDIA.find((medium) => medium.value === carried)?.value ?? UNLESS_SAID_OTHERWISE;
}

/** The sentence a `?panel=…` names, or nothing where it names none. */
export function theSentence(panel: string | undefined): Sentence | undefined {
  return THE_SENTENCES.find((one) => one.said === panel);
}

/** One half of the door: what it is about, and the sentences that are about that. */
export type Half = {
  readonly about: WhatItIsAbout;
  /**
   * The heading the block stands under.
   *
   * **It names what the half is about and never what the half writes** — *The object*, not
   * *Volume and Wish*. Which records get written is the panel's business and the sentence
   * already says it in two lengths; a heading naming them would ask the owner to know the
   * model before they can say what happened, which is the one thing this door was built to
   * stop.
   */
  readonly heading: string;
  /** The one line under it: which of the two things this is, in the words `CONTEXT.md` uses. */
  readonly says: string;
  readonly sentences: readonly Sentence[];
};

/** What each half is about, in the order the door offers them. */
const WHAT_EACH_HALF_IS: readonly Omit<Half, "sentences">[] = [
  {
    about: "an-object",
    heading: "The object",
    says: "Something you have or want to have, and what is inside it.",
  },
  {
    about: "a-narrative",
    heading: "The narrative",
    // *Owned or not* rather than *owes no object to anybody*, which is the glossary's phrase
    // and is what the sentence under it already says at two lengths. What the heading adds is
    // the fact the owner cannot read off either sentence: this half does not care.
    says: "Something you read or mean to read, owned or not.",
  },
];

/**
 * **The four sentences in two named halves** (#49): the object, then the narrative.
 *
 * Same four and the same one press each — the grouping is what was missing, not fewer choices,
 * and a fork above the sentences was refused because after choosing the owner would still have
 * to say bought-or-wished, read-or-wanted.
 *
 * It is **derived from `THE_SENTENCES` rather than written out again**, which is the whole
 * reason this is a table and not two arrays: the order inside each half is the order of the
 * flat list, every sentence stands in exactly one half by the `about` it carries, and a fifth
 * sentence added to the model appears under a heading without anybody remembering to add it
 * twice. What would otherwise go wrong is silent — a sentence in neither half is a press the
 * owner cannot reach on a screen that still renders perfectly.
 */
export const THE_HALVES: readonly Half[] = WHAT_EACH_HALF_IS.map((half) => ({
  ...half,
  sentences: THE_SENTENCES.filter((one) => one.about === half.about),
}));

/**
 * Whether a sentence is about an object, and therefore whether its panel asks what the object
 * is.
 *
 * Read off the sentence's own `about`, so the screen has one answer to *which of the two is
 * this* rather than a heading saying one thing and a form asking another.
 */
export function aboutAnObject(said: WhatWasSaid): said is AnObjectsSentence {
  return theSentence(said)?.about === "an-object";
}
