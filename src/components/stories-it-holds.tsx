"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tint, UNWORN, WORN, worn } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { type Band, theWholeBandPress, whatEnterDoes } from "./stories-on-offer";

// **THE STORIES AN OBJECT HOLDS, SAID WHERE THE OBJECT IS** (#47, ADR-0019).
//
// The component the whole tracker is about, and it is here in `components/` rather than
// beside one screen because two screens are the same gesture: the Volume's page, where each
// row acts at once through the verbs that already exist, and — when #48 lands — the moment an
// object is catalogued, where the rows are held until one submission. **One screen mounts it
// today**; what will differ between the two is the **adapter** and nothing else, which is what
// `WhatAnObjectHolds` below is for and why it was written before its second caller exists.
//
// **The rows are the list the page already is**: a hairline, the title in the heading face,
// the Type beside it, the acts at the right. Its way in is a **single field** underneath,
// where typing searches the library, the answers arrive banded by the line each Story stands
// in, a band of more than one is taken whole in one press, and enter mints what the library
// does not know. Four shapes were built and read against the real page and this one won
// (ADR-0019); the two it beat each say why. A **toggle** onto the catalogue asks the owner to
// know, before they type, whether what they are about to name already exists — which is the
// question they opened the screen to answer. **Chips inside a field** put a narrative's title
// in a pill, and *Batman: Il lungo Halloween* does not fit in one: the rows are the chips,
// full width.
//
// **It may run client JavaScript and owes no unscripted twin** (ADR-0020, which supersedes
// ADR-0010). The rule it does still owe is `vitest.config.ts`'s, and this file is held to it:
// **a client component may exist, and it may hold no derivation.** What is searched is a core
// query; how the answer is banded, what the press over a band says and what enter does are
// `./stories-on-offer.ts`, tested beside itself. What is left in here is a field, a settling
// timer, a stale answer dropped and one armed press.
//
// **The two acts on a row are different sizes and are drawn as two things.** The cross says
// *this object does not hold that* and leaves the narrative in the library; the bin says the
// library stops knowing it. The bin is drawn **only where striking would be allowed** — which
// the row is told rather than guesses at (`whyItStands`, one expression shared with
// `strikeStoryCarriedBy`) — and never at cataloguing time, where there is nothing yet to
// strike. It costs a deliberate second press, because nothing undoes it.

/** One Story the object holds, as its row reads. */
export type HeldStory = {
  id: string;
  title: string;
  /**
   * The Type by name, which is what stands beside the title.
   *
   * **Absent where the screen has not been told it** (#48). At cataloguing time the row that
   * arrives already standing is the work a line publishes, read off the line rather than off
   * the narrative — the picker knows what it prints and not what kind of thing that is — and a
   * word invented to fill the gap would be the screen saying something it was never told.
   */
  type?: string;
  /**
   * The score the owner set most recently, or `null`. It is the **Story's** and never the
   * object's: three narratives in one book have three of these, and this is the one place
   * where that is legible at a glance.
   */
  score: number | null;
  /**
   * Why the narrative stands, or `null` where nothing holds it and it may be struck from
   * here. The row draws its bin off this and decides nothing itself.
   */
  whyItStands: string | null;
  /**
   * Whether the title in this row is **the owner's to correct here** (#48).
   *
   * True only for a narrative the library does not hold yet: the shown default at cataloguing
   * time, which is the volume's own title waiting to be minted at submit. That is the one case
   * the default was always wrong in — *Batman: Il lungo Halloween* holds three tales named
   * nothing like the jacket — so the row it stands in is the row that has to be correctable.
   *
   * Never true of a Story the library holds. Correcting one of those is an Amendment on the
   * narrative itself (ADR-0011), and it would be the same word meaning two very different
   * acts on two rows of one list.
   */
  rename?: boolean;
  /** Where the title leads, where there is a page to lead to. */
  href?: string;
  /**
   * What the screen draws under the row — on a Volume's page, which Instalments of the work
   * are inside this object. Nothing asks for a range while linking (ADR-0019): the range
   * stays where it is, on the link, and this is the slot it is drawn in.
   */
  beneath?: React.ReactNode;
};

/**
 * **The seam between this component and the moment it is standing in.**
 *
 * On a Volume's page every one of these is a Server Function that writes at once and comes
 * back with the page re-rendered; at cataloguing time they hold what was said until one
 * submission, because the object does not exist yet and it is all or nothing. The component
 * knows which of the two it is only by what this object does — it never reaches a verb, an id
 * or a URL of its own.
 */
export type WhatAnObjectHolds = {
  /** Ask the catalogue what it holds under what has been typed, banded by line. */
  find: (term: string) => Promise<Band[]>;
  /** Say this object carries these — one row, or a whole band in one press. */
  carry: (storyIds: string[]) => Promise<void>;
  /** Mint a narrative the library does not hold, of this Type, inside this object. */
  mint: (title: string, typeId: string) => Promise<void>;
  /** Take a row off: the object does not hold that after all. */
  stopCarrying: (storyId: string) => Promise<void>;
  /**
   * Unmake the narrative itself. **Optional because cataloguing has nothing to strike** — the
   * object is not written yet — and the bin is then drawn on no row at all (ADR-0019).
   */
  strike?: (storyId: string) => Promise<void>;
  /**
   * Correct the title of a narrative that is not in the library yet (#48).
   *
   * **The mirror of `strike`**: optional because a Volume's own page has nothing to rename —
   * every row on it is a Story the library holds, and correcting one of those is an Amendment.
   * At cataloguing time it is the whole point of showing the default rather than writing it.
   */
  rename?: (storyId: string, title: string) => Promise<void>;
};

/** How long the owner has to stop typing before the library is asked. */
const SETTLE = 140;

export function TheStoriesItHolds({
  held,
  types,
  typeToOffer,
  holds,
  refused,
  type,
}: {
  /** What the object holds now, in the order the screen answers with. */
  held: readonly HeldStory[];
  /** The Types, read from the library rather than enumerated (ADR-0006). */
  types: readonly { id: string; name: string }[];
  /**
   * The Type a minted narrative arrives with — guessed from the Binding where the Binding
   * decides, and otherwise the last one used (`core/queries/type.ts`). `null` on a library
   * with nothing to go on, and the owner is then asked outright.
   */
  typeToOffer: string | null;
  /** What each act does here (see `WhatAnObjectHolds`). */
  holds: WhatAnObjectHolds;
  /** What the last act was refused with, in the verb's own words. */
  refused?: string;
  /**
   * Where the Type lives, when the screen around this component is the one that submits it
   * (#48).
   *
   * Given, the box is controlled from out there and this component keeps no Type of its own;
   * absent, it holds its own and starts at `typeToOffer`, which is a Volume's page. The reason
   * the second caller needs the first shape is that **the Type it offers follows a Binding
   * being chosen in the same form**: the guess changes under the owner's hand, and a box
   * holding its own answer would ignore it.
   */
  type?: { chosen: string; choose: (typeId: string) => void };
}) {
  const field = useId();
  const answer = useId();
  const asked = useRef<HTMLInputElement>(null);

  const [term, setTerm] = useState("");
  const [bands, setBands] = useState<Band[]>([]);
  // **What the bands are an answer to.** Enter acts on the answer and never on the field, so
  // it has to know whether the two agree: a key pressed inside the settling delay, or while a
  // request is still out, would be enter deciding *the library does not hold this* against a
  // list of the previous word — and minting the duplicate this whole slice exists to prevent.
  const [answered, setAnswered] = useState("");
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  /** What this component has to say about the last key, as opposed to what a verb refused. */
  const [said, setSaid] = useState<string | null>(null);
  // The Type every narrative minted from this field takes: **one choice for the whole
  // object**, because three tales inside one comic are comics. It stays a property of the
  // narrative — the Volume gains no Type of its own (ADR-0019).
  const [ownTypeId, setOwnTypeId] = useState(typeToOffer ?? "");
  const typeId = type ? type.chosen : ownTypeId;
  const setTypeId = type ? type.choose : setOwnTypeId;

  const typed = term.trim();

  // Ask the library once the owner has stopped typing. A later keystroke drops the answer it
  // was waiting for: two requests in flight come back in whatever order the network gives
  // them, and a stale one landing last is a list that disagrees with the field above it.
  useEffect(() => {
    if (typed === "") {
      setBands([]);
      setAnswered("");
      setAsking(false);
      return;
    }

    let current = true;
    setAsking(true);
    const timer = setTimeout(async () => {
      try {
        const found = await holds.find(typed);
        if (current) {
          setBands(found);
          setAnswered(typed);
        }
      } catch {
        // An answer that did not arrive is **not** an empty answer, and the difference
        // matters at exactly one key: the bands are cleared and `answered` is not set, so
        // enter stays quiet rather than minting against a list that never came.
        if (current) setBands([]);
      } finally {
        if (current) setAsking(false);
      }
    }, SETTLE);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [typed, holds]);

  /**
   * Do one act, and leave the field ready for the next one.
   *
   * The answer to a write is the list above, which the adapter is what brings back — so what
   * this clears is only the search that led to it. `working` is what stops a double press
   * from saying the same thing twice while the first one is in flight.
   */
  async function act(work: () => Promise<void>) {
    if (working) return;
    setWorking(true);
    try {
      await work();
      setTerm("");
      setBands([]);
      setAnswered("");
      setSaid(null);
      setArmed(null);
      asked.current?.focus();
    } finally {
      setWorking(false);
    }
  }

  /** The bin's second press, narrowed to the adapter that has one. */
  async function unmake(storyId: string) {
    await holds.strike?.(storyId);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    // The field stands in a page full of forms on the Volume's own screen, and enter in a
    // text field submits the one it is in. This field submits nothing: it is the act.
    event.preventDefault();

    // The answer has to be an answer to *this* word. Until it is, the key does nothing at
    // all rather than guessing — which is a fifth of a second of nothing, against a narrative
    // recorded twice.
    if (typed !== answered) return;

    const does = whatEnterDoes(typed, bands, held);
    if (!does) return;
    if ("add" in does) return void act(() => holds.carry([does.add]));

    // Said out loud rather than swallowed: a key that does nothing is a key the owner presses
    // again. It happens on a library with no Story in it yet and no Binding that decides one.
    if (typeId === "") {
      setSaid("Choose a Type first: a narrative is recorded as one of the five.");
      return;
    }
    void act(() => holds.mint(does.mint, typeId));
  }

  return (
    <div>
      {held.length === 0 ? (
        <p className="max-w-prose text-pretty text-sm text-muted-foreground">
          Nothing recorded yet. Name what is inside this object below, and it appears on each
          narrative too — it is one fact, read from both ends.
        </p>
      ) : (
        <ul className="-my-1">
          {held.map((story) => (
            <Row
              key={story.id}
              story={story}
              armed={armed === story.id}
              onArm={() => setArmed(story.id)}
              onDisarm={() => setArmed(null)}
              onDrop={() => act(() => holds.stopCarrying(story.id))}
              onStrike={holds.strike ? () => act(() => unmake(story.id)) : undefined}
              onRename={
                holds.rename && story.rename
                  ? (title: string) => holds.rename?.(story.id, title)
                  : undefined
              }
              working={working}
            />
          ))}
        </ul>
      )}

      {/* **The one field, and it is under the list it corrects.** A drawer is for a form the
          owner opened; saying what is inside an object is a correction made while reading the
          list above it. */}
      <div className="mt-6 border-t border-border pt-5">
        <label htmlFor={field} className="text-xs text-muted-foreground">
          A narrative inside this object
        </label>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Input
            id={field}
            ref={asked}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Gotham Noir"
            autoComplete="off"
            aria-describedby={`${field}-hint`}
            aria-controls={answer}
            className="h-11 min-w-0 flex-1 text-base sm:h-10 md:text-sm"
          />

          {/* Asked **once for the whole object** and standing beside the field rather than
              behind a press, because it arrives already answered and the owner's job is to
              notice it is wrong. */}
          {types.length > 0 ? (
            <>
              <label htmlFor={`${field}-type`} className="sr-only">
                The Type a new narrative is recorded as
              </label>
              <select
                id={`${field}-type`}
                value={typeId}
                onChange={(event) => setTypeId(event.target.value)}
                className="h-11 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30"
              >
                <option value="" disabled>
                  Choose a Type
                </option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>

        <p
          id={`${field}-hint`}
          className="mt-2 max-w-prose text-pretty text-xs text-muted-foreground"
        >
          Typing searches the library. Press enter to record a narrative it has never held — it is
          created and put inside this object in one act.
        </p>

        {refused || said ? (
          <p className="mt-3 max-w-prose text-pretty text-sm text-destructive">{said ?? refused}</p>
        ) : null}

        <div id={answer} aria-live="polite">
          {bands.length > 0 ? (
            <ul className="mt-4 overflow-hidden rounded-lg border border-border">
              {bands.map((band) => (
                <Line
                  key={band.seriesId ?? band.name}
                  band={band}
                  working={working}
                  onAddAll={() => act(() => holds.carry(band.stories.map((story) => story.id)))}
                  onAdd={(storyId) => act(() => holds.carry([storyId]))}
                />
              ))}
            </ul>
          ) : null}

          {/* Three states and not two: *nothing yet* and *nothing at all* are different
              things to be told, and answering "nothing found" to a field still being typed
              into would be arguing with the owner mid-word. */}
          {typed !== "" && bands.length === 0 && !asking ? (
            <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
              The library holds nothing called {typed}. Enter records it as a narrative of its own,
              inside this object.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One narrative the object holds.
 *
 * The score is tabular so that three judgements of three narratives in one object line up
 * under each other and read as the three different numbers they are, with an em dash where
 * the owner has judged nothing yet.
 */
function Row({
  story,
  armed,
  working,
  onArm,
  onDisarm,
  onDrop,
  onStrike,
  onRename,
}: {
  story: HeldStory;
  armed: boolean;
  working: boolean;
  onArm: () => void;
  onDisarm: () => void;
  onDrop: () => void;
  onStrike?: () => void;
  /** Correct the title standing here, where it is the owner's to correct (#48). */
  onRename?: (title: string) => void;
}) {
  const type = story.type ? (
    <span className="whitespace-nowrap font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
      {story.type}
    </span>
  ) : null;

  // **The shown default, and it is shown as a word rather than as a box** (#48, ADR-0019).
  // The one case the old silent default was always wrong in is an object whose jacket names
  // none of the tales inside it, so the row it stands in has to be the row that can be typed
  // over — in the same face and at the same size the settled row reads in, with a dashed rule
  // under it saying that it is the owner's. A field with a label would answer *the default is
  // already right* with a form to fill in, which is the tax ADR-0019 refused to charge.
  const title = onRename ? (
    <span className="flex min-w-0 flex-1 basis-full items-baseline gap-2 sm:basis-auto">
      <input
        type="text"
        value={story.title}
        disabled={working}
        onChange={(event) => onRename(event.target.value)}
        aria-label="What this narrative is called"
        className="min-w-0 flex-1 border-b border-dashed border-muted-foreground/60 bg-transparent py-1.5 font-heading text-base outline-none focus-visible:border-solid focus-visible:border-ring disabled:opacity-50 sm:py-1 sm:text-sm"
      />
      {type}
    </span>
  ) : (
    <>
      <span className="font-heading">{story.title}</span> {type}
    </>
  );

  return (
    <li className="border-t border-border py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {onRename ? (
          title
        ) : story.href ? (
          <a
            href={story.href}
            className="min-w-0 flex-1 basis-full underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring sm:basis-auto"
          >
            {title}
          </a>
        ) : (
          <span className="min-w-0 flex-1 basis-full sm:basis-auto">{title}</span>
        )}

        <span className="flex items-baseline gap-2">
          <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {story.score === null ? "—" : story.score.toFixed(1)}
          </span>

          <RowPress label={`${story.title} is not in here`} onPress={onDrop} disabled={working}>
            <Cross />
          </RowPress>

          {/* Drawn only where the row already knows striking is allowed, so the owner never
              meets a press that answers with a refusal. */}
          {onStrike && story.whyItStands === null ? (
            <RowPress
              label={`Strike ${story.title} from the library`}
              onPress={onArm}
              disabled={working}
            >
              <Bin />
            </RowPress>
          ) : null}
        </span>
      </div>

      {/* Nothing undoes it, so it costs a deliberate second press — and what it takes is said
          before the press rather than discovered after it. */}
      {armed && onStrike ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-accent/50 px-3 py-2">
          <p className="max-w-prose text-pretty text-xs text-muted-foreground">
            The library stops knowing {story.title}. The Credits on it go too, and the people they
            name stay.
          </p>
          <span className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={onDisarm}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8 text-xs"
              disabled={working}
              onClick={onStrike}
            >
              Strike it
            </Button>
          </span>
        </div>
      ) : null}

      {story.beneath}
    </li>
  );
}

/**
 * A glyph that does one thing to a row, at a size a thumb can find.
 *
 * Not called an *act*: on this screen that word is a panel the owner opens
 * (`collection/[id]/standing.ts`), and these two are the opposite of one.
 */
function RowPress({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onPress}
      className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}

/**
 * One line of the answer: the band, the press that takes the whole of it, and its rows.
 *
 * **The whole-band press is what makes twenty rows one gesture** — the run the owner is
 * working through poured into the object in one press — and it wears the line's own colour,
 * which is the one the walls taught (`@/lib/tint`).
 */
function Line({
  band,
  working,
  onAddAll,
  onAdd,
}: {
  band: Band;
  working: boolean;
  onAddAll: () => void;
  onAdd: (storyId: string) => void;
}) {
  return (
    <li className="border-t border-border first:border-t-0">
      <div className="flex items-center gap-3 bg-muted/40 px-3 py-2">
        <span
          aria-hidden
          style={worn(tint(band.seriesId))}
          className={cn("h-4 w-1 shrink-0 rounded-full", band.seriesId ? WORN : UNWORN)}
        />
        <h3 className="min-w-0 flex-1 truncate font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          {band.name}
        </h3>
        {band.stories.length > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={working}
            onClick={onAddAll}
            className="-mr-2 h-8 shrink-0 text-xs"
          >
            {theWholeBandPress(band)}
          </Button>
        ) : null}
      </div>

      <ul>
        {band.stories.map((story) => (
          <li key={story.id} className="border-t border-dashed border-border first:border-t-0">
            <button
              type="button"
              disabled={working}
              onClick={() => onAdd(story.id)}
              className="flex w-full items-baseline gap-3 px-3 py-2.5 text-left transition-colors outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {/* The position, where the object carrying it stands in a line: 1, 2, 10 down
                  the gutter is what makes a run readable as a run. */}
              <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {story.standsAt ?? ""}
              </span>
              <span className="min-w-0 flex-1 truncate font-heading text-sm">{story.title}</span>
              <span className="shrink-0 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                {story.type.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

// The two glyphs, drawn here rather than fetched: one shape does not earn a dependency, a
// build step and a tree-shaking argument (#19, and `@/components/mark.tsx` says it first).
// Both are stroked in the same 24-unit square the mark is drawn in, so the pair beside a row
// is one weight of drawing.

/** The cross: this object does not hold that. */
function Cross() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className="size-4"
    >
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

/** The bin: the library stops knowing it. */
function Bin() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-4"
    >
      <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5M14 11v5" />
    </svg>
  );
}
