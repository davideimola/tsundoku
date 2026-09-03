import Link from "next/link";
import { Drawer } from "@/components/drawer";
import { ScanAnIsbn } from "@/components/scan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listBindings } from "@/core/queries/binding";
import { type Finding, findInTheLibrary } from "@/core/queries/finder";
import { listSeries } from "@/core/queries/series";
import { listTypes, type Type, theTypeEachBindingOffers } from "@/core/queries/type";
import type { WhatWasSaid } from "@/core/verbs/what-happened";
import { requireOwner } from "@/lib/auth/owner";
import { bought, identify, read, suggestStories, wanted, wished } from "./actions";
import {
  aboutAnObject,
  type CarriedField,
  type Half,
  THE_FIELDS_A_REFUSAL_CARRIES,
  THE_HALVES,
  theSentence,
  whatFilledItIn,
} from "./door";
import { Picker } from "./fields";
import { theNarrativesNamedBefore } from "./inside";
import { ASKED, THE_FIELD, THE_NARRATIVES_INSIDE } from "./panels";
import { TheObject } from "./the-object";

// THE ONE DOOR (#45). The owner writes a title or scans a barcode and says one of four
// things — *I bought it*, *I want to buy it*, *I read it*, *I want to read it* — and the
// library works out what to record. Nobody is asked whether they are creating a Story or a Volume, because the answer is
// always both and `CONTEXT.md` already decided it.
//
// **What used to be silent about that is now shown** (#48, ADR-0019). The default was still one
// Volume, one Story, and the verb wrote it from the volume's *title* whenever no line had named
// a work — which on an omnibus is a narrative named after the jacket. The two sentences about an
// object now name what is inside it, in a list that arrives with that same default standing in
// it, and the owner corrects the one case it was always wrong in. The object half is
// `./the-object.tsx` and runs in the browser (ADR-0020); the two sentences about a narrative are
// unchanged and still need no object at all.
//
// **What this screen replaced.** Recording an object was a drawer on the Collection, recording
// its narrative was a drawer on the Stories wall, and joining the two was a picker on a third
// screen. Three acts, two screens, and the drift is on the shelves: twenty-two Volumes against
// twenty-one Stories. All three of those doors are gone, and their triggers are links to this
// one.
//
// **It is two steps at one address, and which step it is is whether a title is known.** The
// first is one field and a camera. The second is that title, set in the serif the owner's own
// prose is reserved for, over the four sentences they may say about it. *Steps* and never
// halves, because on this screen a **half** is one of the two things a sentence can be about
// (`THE_HALVES` in `./door.ts`, #49) and one word cannot mean both.
//
// Five things are decided here.
//
//   1. **The sentences are the screen.** They are not a row of buttons under a form:
//      they are four full-width statements in the owner's voice, hairline-ruled, each one a
//      press the size of a thumb. That is the whole of the interface, because that is the
//      whole of the decision — everything else on this screen is either the title they are
//      about or the fields one of them needs.
//   2. **An act that needs a field is a panel of its own** (`@/components/drawer`, #29). Only
//      the two sentences about an object have fields worth the name, and all four open a
//      drawer anyway, because acts that behave four ways are four things to learn. Every panel's state is the
//      URL, so the whole screen works with nothing running in the browser and the back button
//      closes what the last tap opened (ADR-0010).
//   3. **The camera is an enhancement over a field that already works** (`@/components/scan`). Typed,
//      pasted or read out of the printed digits by the phone's own text scanner, the field
//      posts and answers on a shop's signal with no script at all.
//   4. **What the library already knows is offered before a second copy of it is made.** A
//      title the owner has said before is one link away, and the sentence under it says why
//      that is the better door — a Story is the spine, and two of them for one narrative is
//      the drift this screen exists to end.
//   5. **The four stand in two named halves** (#49) — the object, and the narrative. Same
//      four and the same one press each: what was missing was the grouping rather than fewer
//      choices, and the two headings name *what the half is about* and never the records it
//      writes. A fork above them was refused, because after choosing the owner would still
//      have to say bought-or-wished or read-or-wanted, and that is a screen for nothing.
//
// A thin adapter over the core like every page here (ADR-0002): it calls queries and one
// Server Function, lays out the answer, and holds no SQL, no rule about what may be recorded
// and no colour of its own.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

/** One asked-for value, as a string, or nothing. */
function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * **Every field a refused press came back carrying**, as a table.
 *
 * A table rather than a reader because the object half runs in the browser and a function
 * cannot cross into it — and it is built off `THE_FIELDS_A_REFUSAL_CARRIES` rather than by
 * hand, so a field the action sends and this forgets cannot arise (`./door.ts` is the one list
 * both halves spell).
 */
function whatWasTypedBefore(params: Asked): Record<CarriedField, string | undefined> {
  return Object.fromEntries(
    THE_FIELDS_A_REFUSAL_CARRIES.map((field) => [field, asked(params, field)])
  ) as Record<CarriedField, string | undefined>;
}

/**
 * Every value under one name, which is what the narratives inside an object come back as.
 *
 * A repeated parameter arrives as an array, and as a bare string where there is one of it —
 * which is the case an object holding a single narrative is, and therefore very nearly all of
 * them. Both are one list here, so nothing downstream has to know.
 */
function askedAll(params: Asked, name: string): string[] {
  const value = params[name];
  if (Array.isArray(value)) return value;
  return typeof value === "string" ? [value] : [];
}

/** How many Stories by that name are worth offering before the owner records another one. */
const A_FEW = 4;

/**
 * **What the door has heard so far**, as an address: the title, the barcode it arrived with,
 * where the answer came from and the publisher that answer named.
 *
 * It is a function because every address on this screen composes it — the four sentences, the
 * way back to the field, and the way out of every panel — and a press that dropped one of the four would answer
 * the owner by throwing away work they had already given the door. It is this screen's version
 * of the Collection's `panelled()`, and the rule is the same one.
 */
function theDoorHeard(params: Asked, title?: string): URLSearchParams {
  const asking = new URLSearchParams();
  if (title) asking.set("title", title);

  for (const carried of ["isbn", "from", "publishedBy"]) {
    const value = asked(params, carried);
    if (value) asking.set(carried, value);
  }

  return asking;
}

/**
 * **The Server Function behind each sentence**, as a map rather than as a chain of ternaries.
 *
 * It is `Record<WhatWasSaid, …>`, so a fifth sentence added to the model is a type error here
 * rather than a press that quietly posts the wrong verb — which is what the third arm of a
 * chain of ternaries would have done, silently, to whichever sentence was added last.
 */
const THE_ACT: Record<WhatWasSaid, (form: FormData) => Promise<void>> = {
  bought,
  wished,
  read,
  wanted,
};

/**
 * The eyebrow a block of this screen stands under, as every wall here spells it.
 *
 * Quiet on purpose: the four statements are the signature of this screen, and a heading that
 * competed with them would be a second thing to read before the one press.
 */
const EYEBROW = "font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground";

export default async function AddPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const [params, types, bindings, series] = await Promise.all([
    searchParams,
    listTypes(),
    listBindings(),
    listSeries(),
  ]);

  // Which Type a new narrative arrives as, for each Binding and for none at all. The whole
  // table, because the Binding it depends on is a picker in the panel below rather than a fact
  // about an object that already exists (`theTypeEachBindingOffers`, #48).
  const typeEachBindingOffers = await theTypeEachBindingOffers(bindings.map((one) => one.id));

  const title = asked(params, "title");
  const isbn = asked(params, "isbn");
  const filledIn = whatFilledItIn(asked(params, "from"));
  const refused = asked(params, "refused");
  // Read against the three the model has rather than trusted: `?panel=banana` opens nothing.
  const saying = title ? theSentence(asked(params, "panel")) : undefined;

  // What the library already holds under that name — the finder's own question, asked in the
  // core (`AGENTS.md`) rather than by a pass over a wall this screen has no business reading.
  // Only the Stories, because only a Story can be said twice: a second Volume of one title is
  // a second object and an ordinary thing to own.
  const known = title
    ? (await findInTheLibrary({ term: title, perKind: A_FEW })).filter(
        (found) => found.kind === "story"
      )
    : [];

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-2xl sm:text-3xl">Add to the library</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          Say what happened to a title. You are never asked whether you are recording an object or a
          narrative — the library works that out, and what an object holds it shows you rather than
          deciding behind your back.
        </p>
      </header>

      {title ? (
        <TheSentences
          title={title}
          isbn={isbn}
          filledIn={filledIn}
          known={known}
          heard={theDoorHeard(params, title)}
        />
      ) : (
        <TheField
          asked={asked(params, ASKED)}
          isbn={isbn}
          from={asked(params, "from")}
          filledIn={filledIn}
          refused={refused}
        />
      )}

      {saying && title ? (
        <Drawer
          title={saying.sentence}
          description={saying.records}
          refused={refused}
          closesTo={`/add?${theDoorHeard(params, title)}`}
        >
          {/* Every panel carries the same two hidden facts and the same Type picker, because
              all four sentences end in a Story and a Story has a Type. Nothing else is shared:
              the object's fields belong to the two sentences that are about an object. */}
          <form action={THE_ACT[saying.said]} className="grid gap-4">
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="from" value={asked(params, "from") ?? ""} />
            {/* The two sentences about an object show the ISBN as a field the owner can
                correct; the two about a narrative have nowhere to show it and carry it. */}
            {!aboutAnObject(saying.said) && isbn ? (
              <input type="hidden" name="isbn" value={isbn} />
            ) : null}

            <p className="font-serif text-xl text-balance">{title}</p>

            {/* **What the owner had typed, where this is a press coming back refused.** A
                refusal is a sentence about one field and every other field was right; a panel
                that reopened empty would answer a duplicate position by making the owner fill
                the object in again, standing in a shop. `./actions.ts` sends them, this reads
                them back, and `THE_FIELDS_A_REFUSAL_CARRIES` is the one list both spell.

                **The Type is asked here only by the two sentences about a narrative**, which
                end in exactly one Story and no object. The two about an object ask it once for
                the whole object, beside the field that names what is inside it (ADR-0019), so
                a second box up here would be the same question twice on one form — and the two
                answers could differ. */}
            {aboutAnObject(saying.said) ? (
              <TheObject
                said={saying.said}
                title={title}
                bindings={bindings}
                lines={series}
                types={types}
                typeEachBindingOffers={typeEachBindingOffers}
                named={theNarrativesNamedBefore(
                  askedAll(params, THE_NARRATIVES_INSIDE.story),
                  askedAll(params, THE_NARRATIVES_INSIDE.storyTitle),
                  askedAll(params, THE_NARRATIVES_INSIDE.newStory)
                )}
                isbn={isbn}
                typed={whatWasTypedBefore(params)}
                publishedBy={asked(params, "publishedBy")}
                find={suggestStories}
              />
            ) : (
              <Picker
                id="say-type"
                name="type"
                label="Type"
                chosen={asked(params, "type")}
                required
                any="Which kind?"
              >
                {types.map((one: Type) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </Picker>
            )}

            <div>
              <Button type="submit" className="h-11 w-full sm:h-10">
                {saying.sentence}
              </Button>
              <p className="mt-2 text-pretty text-xs text-muted-foreground">{saying.atLength}</p>
            </div>
          </form>
        </Drawer>
      ) : null}
    </main>
  );
}

/**
 * The first step: one field, and a camera under it.
 *
 * **One field for two quite different things**, which is the whole gesture the door is worth
 * having for — a title and a barcode go in the same place, and which of them arrived is
 * `./door.ts`'s to read. It is not autofocused: a keyboard opening over a panel whose other
 * control is a camera button is a keyboard in the way of the faster answer.
 */
function TheField({
  asked: heard,
  isbn,
  from,
  filledIn,
  refused,
}: {
  asked: string | undefined;
  isbn: string | undefined;
  /** The core's own word for what the source said about that ISBN, carried on unchanged. */
  from: string | undefined;
  filledIn: string | null;
  refused: string | undefined;
}) {
  return (
    <div className="mt-8 max-w-prose">
      {refused ? (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}
      {filledIn ? (
        <p className="mb-4 text-pretty text-sm text-muted-foreground">{filledIn}</p>
      ) : null}

      <form action={identify} className="grid gap-4">
        {/* The barcode the owner scanned a moment ago, remembered while they type what the
            object is called. SBN had no record; the ISBN is still true. */}
        {isbn ? <input type="hidden" name="isbn" value={isbn} /> : null}
        {isbn && from ? <input type="hidden" name="from" value={from} /> : null}

        <div className="grid gap-1.5">
          <Label htmlFor={THE_FIELD.id} className="font-serif text-xl">
            {isbn ? "What is it called?" : "What is it?"}
          </Label>
          <Input
            id={THE_FIELD.id}
            name={THE_FIELD.name}
            defaultValue={heard ?? ""}
            placeholder={isbn ? "Slam Dunk 21" : "Slam Dunk 21 — or the barcode on the back"}
            autoComplete="off"
            required
            className="h-12 text-base"
          />
          {isbn ? (
            <p className="text-xs text-muted-foreground">
              On <span className="font-mono">{isbn}</span>, which is remembered.
            </p>
          ) : null}
        </div>

        <div>
          <Button type="submit" className="h-11 w-full sm:h-10">
            Say what happened
          </Button>
          <p className="mt-2 text-pretty text-xs text-muted-foreground">
            A title goes straight through. Digits are looked up: your own catalogue first — so an
            object already on the shelf goes to its own page rather than being recorded twice — and
            then SBN, Italy&apos;s legal-deposit catalogue, for the title and the publisher.
          </p>
        </div>
      </form>

      <div className="mt-6 border-t border-border pt-5">
        <ScanAnIsbn into={THE_FIELD.id} />
        <p className="mt-2 text-pretty text-xs text-muted-foreground">
          The camera reads the barcode and looks it up on its own. A Bonelli monthly has no ISBN to
          read — its barcode is a periodical&apos;s — and neither has anything sold without one, so
          those are named by hand.
        </p>
      </div>
    </div>
  );
}

/**
 * The second step: the title, and the four things that can be said about it, in two named halves.
 *
 * **The signature of this screen, and deliberately not a row of buttons.** Four statements in
 * the owner's own voice, in the face reserved for their prose, one under the other with a
 * hairline between them: the screen reads as a sentence being finished rather than as a form
 * being filled in, and every one of them is a full-width press on a phone held one-handed.
 */
function TheSentences({
  title,
  isbn,
  filledIn,
  known,
  heard,
}: {
  title: string;
  isbn: string | undefined;
  filledIn: string | null;
  known: Finding[];
  /** Everything the door has heard so far, carried into every address on this step. */
  heard: URLSearchParams;
}) {
  return (
    <div className="mt-8">
      <p className="font-serif text-3xl text-balance sm:text-4xl">{title}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
        {isbn ? <span className="font-mono">{isbn}</span> : null}
        <Link
          href={`/add?${asking(heard, { title: null, [ASKED]: title })}`}
          className="rounded underline decoration-foreground/25 underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Not what it is called
        </Link>
      </p>

      {filledIn ? (
        <p className="mt-3 max-w-prose text-pretty text-sm text-muted-foreground">{filledIn}</p>
      ) : null}

      {/* Offered before a second copy of it is made. A Story is the spine, and the whole cost
          of a duplicate is that the score, the passes and the objects end up split across two
          of them. */}
      {known.length > 0 ? (
        <div className="mt-6 max-w-prose rounded-xl border border-dashed border-border p-4">
          <p className="text-pretty text-sm text-muted-foreground">
            The library already knows {known.length === 1 ? "a Story" : "Stories"} by that name.
            Saying it there keeps one narrative rather than two:
          </p>
          <ul className="mt-2 grid gap-1">
            {known.map((story) => (
              <li key={story.id}>
                <Link
                  href={`/stories/${story.id}`}
                  className="rounded text-sm underline decoration-foreground/25 underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {story.name}
                </Link>{" "}
                <span className="text-xs text-muted-foreground">{story.qualifier}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* **Two named halves and not one undivided set** (#49). Same four sentences, same one
          press each: what was missing was the grouping. A fork above them — object or
          narrative, and then the sentences — was considered and refused, because after
          choosing the owner would still have to say bought-or-wished or read-or-wanted, which
          is a screen for nothing. So nothing stands between the title and the presses, and the
          division is a heading rather than a step. */}
      <div className="mt-8 grid gap-9 sm:gap-10">
        {THE_HALVES.map((half) => (
          <TheHalf key={half.about} half={half} heard={heard} />
        ))}
      </div>
    </div>
  );
}

/**
 * One half of the door: what it is about, and the two sentences that are about that.
 *
 * The heading is the quietest thing on the screen and the sentences the loudest, which is the
 * hierarchy the press deserves — the owner is choosing between four statements, and the
 * headings are there to halve the choice rather than to be read.
 */
function TheHalf({ half, heard }: { half: Half; heard: URLSearchParams }) {
  const id = `about-${half.about}`;

  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={`flex items-baseline gap-3 ${EYEBROW}`}>
        {half.heading}
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </h2>
      <p className="mt-1.5 max-w-prose text-pretty text-sm text-muted-foreground">{half.says}</p>

      <ul className="mt-3 border-t border-border">
        {half.sentences.map((one) => (
          <li key={one.said}>
            <Link
              href={`/add?${asking(heard, { panel: one.said })}`}
              className="group flex items-center justify-between gap-4 border-b border-border py-5 outline-none focus-visible:bg-muted sm:py-6"
            >
              <span className="min-w-0">
                <span className="block font-serif text-2xl group-hover:underline group-hover:decoration-foreground/25 group-hover:underline-offset-4 sm:text-3xl">
                  {one.sentence}
                </span>
                <span className="mt-1 block max-w-prose text-pretty text-sm text-muted-foreground">
                  {one.records}
                </span>
              </span>
              <span
                aria-hidden
                className="shrink-0 font-mono text-muted-foreground transition-colors group-hover:text-foreground"
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The door's address with a few things set on it, and everything else it heard left alone.
 *
 * `null` takes one off, which is what the way back to the field needs: the title stops being
 * something the door knows and becomes what is in the field again.
 */
function asking(heard: URLSearchParams, changes: Record<string, string | null>): URLSearchParams {
  const asked = new URLSearchParams(heard);

  for (const [name, value] of Object.entries(changes)) {
    if (value === null) asked.delete(name);
    else asked.set(name, value);
  }

  return asked;
}
