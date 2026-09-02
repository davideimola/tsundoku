import Link from "next/link";
import { Drawer } from "@/components/drawer";
import { ScanAnIsbn } from "@/components/scan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Binding, listBindings } from "@/core/queries/binding";
import { type Finding, findInTheLibrary } from "@/core/queries/finder";
import { listSeries } from "@/core/queries/series";
import { listTypes, type Type } from "@/core/queries/type";
import { requireOwner } from "@/lib/auth/owner";
import { bought, identify, read, wanted } from "./actions";
import { type CarriedField, THE_SENTENCES, theSentence, whatFilledItIn } from "./door";
import { ASKED, THE_FIELD } from "./panels";

// THE ONE DOOR (#45). The owner writes a title or scans a barcode and says one of three
// things — *I bought it*, *I read it*, *I want to read it* — and the library works out what to
// record. Nobody is asked whether they are creating a Story or a Volume, because the answer is
// always both and `CONTEXT.md` already decided it: the default is one Volume, one Story.
//
// **What this screen replaced.** Recording an object was a drawer on the Collection, recording
// its narrative was a drawer on the Stories wall, and joining the two was a picker on a third
// screen. Three acts, two screens, and the drift is on the shelves: twenty-two Volumes against
// twenty-one Stories. All three of those doors are gone, and their triggers are links to this
// one.
//
// **It is two halves at one address, and which half it is is whether a title is known.** The
// first is one field and a camera. The second is that title, set in the serif the owner's own
// prose is reserved for, over the three sentences they may say about it.
//
// Four things are decided here.
//
//   1. **The three sentences are the screen.** They are not a row of buttons under a form:
//      they are three full-width statements in the owner's voice, hairline-ruled, each one a
//      press the size of a thumb. That is the whole of the interface, because that is the
//      whole of the decision — everything else on this screen is either the title they are
//      about or the fields one of them needs.
//   2. **An act that needs a field is a panel of its own** (`@/components/drawer`, #29). Only
//      *I bought it* has fields worth the name, and all three open a drawer anyway, because
//      three acts that behave three ways are three things to learn. Every panel's state is the
//      URL, so the whole screen works with nothing running in the browser and the back button
//      closes what the last tap opened (ADR-0010).
//   3. **The camera is an enhancement over a field that already works** (`@/components/scan`). Typed,
//      pasted or read out of the printed digits by the phone's own text scanner, the field
//      posts and answers on a shop's signal with no script at all.
//   4. **What the library already knows is offered before a second copy of it is made.** A
//      title the owner has said before is one link away, and the sentence under it says why
//      that is the better door — a Story is the spine, and two of them for one narrative is
//      the drift this screen exists to end.
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

/** How many Stories by that name are worth offering before the owner records another one. */
const A_FEW = 4;

/**
 * **What the door has heard so far**, as an address: the title, the barcode it arrived with,
 * where the answer came from and the publisher that answer named.
 *
 * It is a function because five places compose it — the three sentences, the way back to the
 * field, and the way out of every panel — and a press that dropped one of the four would answer
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

export default async function AddPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const [params, types, bindings, series] = await Promise.all([
    searchParams,
    listTypes(),
    listBindings(),
    listSeries(),
  ]);

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
          Say what happened to a title. The object, the narrative and the link between them are the
          library&apos;s to work out — you are never asked which of them you are recording.
        </p>
      </header>

      {title ? (
        <TheThreeSentences
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
              all three sentences end in a Story and a Story has a Type. Nothing else is
              shared: the object's fields belong to the one sentence that is about an object. */}
          <form
            action={saying.said === "bought" ? bought : saying.said === "read" ? read : wanted}
            className="grid gap-4"
          >
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="from" value={asked(params, "from") ?? ""} />
            {saying.said !== "bought" && isbn ? (
              <input type="hidden" name="isbn" value={isbn} />
            ) : null}

            <p className="font-serif text-xl text-balance">{title}</p>

            {/* **What the owner had typed, where this is a press coming back refused.** A
                refusal is a sentence about one field and every other field was right; a panel
                that reopened empty would answer a duplicate position by making the owner fill
                the object in again, standing in a shop. `./actions.ts` sends them, this reads
                them back, and `THE_FIELDS_A_REFUSAL_CARRIES` is the one list both spell. */}
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

            {saying.said === "bought" ? (
              <TheObjectInHand
                bindings={bindings}
                series={series}
                isbn={isbn}
                typed={(name: CarriedField) => asked(params, name)}
                publishedBy={asked(params, "publishedBy")}
              />
            ) : null}

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
 * The long half of the sentence *I bought it*: what the object is, what was paid, and where it
 * stands in a line.
 *
 * **The Series picker is the one control on this screen that changes what gets recorded**, and
 * it is here rather than on the Series screen because this is the moment the owner knows the
 * answer — the object is in their hand and its number is on its spine. Where the line they
 * choose names a Story, the object joins that work and no narrative is minted (#39); where it
 * names none, the default applies and the object gets its own.
 */
function TheObjectInHand({
  bindings,
  series,
  isbn,
  typed,
  publishedBy,
}: {
  bindings: Binding[];
  series: Awaited<ReturnType<typeof listSeries>>;
  isbn: string | undefined;
  /**
   * What this field held on a press that came back refused, where there was one.
   *
   * Its argument is `CarriedField` rather than a string, so a field prefilled here and left off
   * the list `actions.ts` sends is a type error rather than a box that quietly comes back empty.
   */
  typed: (name: CarriedField) => string | undefined;
  publishedBy: string | undefined;
}) {
  return (
    <>
      <Field
        name="publisher"
        label="Publisher"
        defaultValue={typed("publisher") ?? publishedBy ?? ""}
        placeholder="Planet Manga"
        required
      />
      <Field
        name="editionLine"
        label="Edition line"
        defaultValue={typed("editionLine") ?? ""}
        placeholder="DC Must Have"
      />

      <Picker
        id="say-binding"
        name="binding"
        label="Binding"
        chosen={typed("binding")}
        required
        any="How is it bound?"
      >
        {bindings.map((one) => (
          <option key={one.id} value={one.id}>
            {one.name}
          </option>
        ))}
      </Picker>

      <Field name="language" label="Language" defaultValue={typed("language") ?? "it"} required />
      {/* Carried from the lookup where there was one, and typed here otherwise — where a
          printed ISBN's hyphens are refused by the column rather than laundered. The field
          that reads a barcode is the lenient door, and what it hands over is bare digits. */}
      <Field
        name="isbn"
        label="ISBN"
        defaultValue={typed("isbn") ?? isbn ?? ""}
        placeholder="9788828765431"
        inputMode="numeric"
      />

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[1fr_7rem]">
        <Picker
          id="say-series"
          name="seriesId"
          label="Series"
          chosen={typed("seriesId")}
          any="In no Series"
        >
          {series.map((one) => (
            <option key={one.id} value={one.id}>
              {[one.name, one.editionLine].filter(Boolean).join(", ")}
              {one.publishes ? ` — ${one.publishes.title}` : ""}
            </option>
          ))}
        </Picker>
        <Field
          name="seriesNumber"
          label="Position"
          defaultValue={typed("seriesNumber") ?? ""}
          placeholder="21"
          inputMode="numeric"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="pricePaid"
          label="Price paid"
          defaultValue={typed("pricePaid") ?? ""}
          placeholder="6,50"
          inputMode="decimal"
        />
        <Field
          name="acquiredOn"
          label="Came home"
          type="date"
          defaultValue={typed("acquiredOn") ?? ""}
        />
      </div>
    </>
  );
}

/**
 * The first half: one field, and a camera under it.
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
 * The second half: the title, and the three things that can be said about it.
 *
 * **The signature of this screen, and deliberately not a row of buttons.** Three statements in
 * the owner's own voice, in the face reserved for their prose, one under the other with a
 * hairline between them: the screen reads as a sentence being finished rather than as a form
 * being filled in, and every one of them is a full-width press on a phone held one-handed.
 */
function TheThreeSentences({
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
  /** Everything the door has heard so far, carried into every address on this half. */
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

      <ul className="mt-8 border-t border-border">
        {THE_SENTENCES.map((one) => (
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
    </div>
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

/**
 * A picker over a vocabulary — Type, Binding, Series.
 *
 * A native select rather than a scripted one: on a phone it opens the platform picker, and it
 * submits whether JavaScript ran or not. Every vocabulary here is read rather than written
 * down (ADR-0006), so a seventh Binding appears on this screen without this file being touched.
 */
function Picker({
  id,
  name,
  label,
  chosen,
  any,
  required,
  children,
}: {
  id: string;
  name: string;
  label: string;
  /** What was chosen on a press that came back refused, where there was one. */
  chosen?: string;
  /** The wording for "none in particular", or for the choice nobody has made yet. */
  any?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        name={name}
        defaultValue={chosen ?? ""}
        required={required}
        className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30"
      >
        {any ? <option value="">{any}</option> : null}
        {children}
      </select>
    </div>
  );
}

function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  const fieldId = `say-${name}`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {/* 44px under a thumb, and the desk's own 40px from `sm` up. Every control the owner
          reaches for one-handed in a shop is drawn at this height. */}
      <Input id={fieldId} name={name} className="h-11 sm:h-10" {...props} />
    </div>
  );
}
