import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type Acquisition,
  findVolume,
  listAcquisitions,
  type RecordedVolume,
} from "@/core/queries/collection";
import { findEditionNote } from "@/core/queries/edition-note";
import { listStories } from "@/core/queries/story";
import { listStoriesInVolume } from "@/core/queries/story-to-volume";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import {
  acquire,
  carry,
  forgetCover,
  lookUpCover,
  recordIsbn,
  release,
  removeOwnImage,
  stopCarrying,
  useOwnImage,
  writeNote,
} from "./actions";
import { facedWith, timesSaid, whatTheHouseSays, whatTheLookupSaid } from "./standing";

// ONE VOLUME: the object as the library catalogues it, whether it is in the house, what it
// holds, and what the owner thinks of it.
//
// **The screen is laid out along ADR-0007, and that is the whole of its structure** (#30).
// *What it is* — publisher, edition line, Binding, language, the line it stands in, the ISBN
// — is one section. *In the house* is another, and it is a history rather than a state: an
// acquisition that ends is not deleted, so an object sold and bought again reads here as one
// object acquired twice, at two prices, which is the thing the model makes true and no screen
// had ever said out loud. Being catalogued is not being owned, and the page must not blur the
// two; two headings side by side is the least ambiguous way to say so.
//
// **The ISBN is a field here, and this is the only place a human can put one.** 0 of 96
// Volumes carry one, the spreadsheets had no such column, and until the Inbox starts
// delivering them from an assistant this box is the answer — after which it is where a wrong
// one is fixed. It is set through the same verb an approved Amendment calls (ADR-0011).
//
// **The Stories are a list with a score column**, so *L'uomo che ride* prints three titles and
// three different numbers under one object's title, and the thing the spreadsheet destroyed —
// one `Voto` cell for three opinions — is visible in one glance. The scores are the Stories'
// and are shown here only because this is where the mismatch is legible; nothing on this page
// attaches a number to the object.
//
// **The Edition note sits beside them, and says in its own words that it is not one of those
// numbers.** Two judgements, in two places, in two registers — a column of digits, and a box
// of prose set in the serif, which in this application is the owner's own voice and nothing
// else. It is nowhere called a Rating, because it is not one: it is an opinion of the *object*.
//
// A thin adapter over the core (ADR-0002): four queries, six verbs behind the forms, and no
// SQL. Nothing runs in the browser — every write is a plain form post, so the page works
// one-handed on a shop's signal with no JavaScript executing.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function VolumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Asked>;
}) {
  await requireOwner();

  const { id } = await params;
  const volume = await findVolume(id);
  if (!volume) notFound();

  const [carried, note, stories, history] = await Promise.all([
    listStoriesInVolume(volume.id),
    findEditionNote(volume.id),
    listStories(),
    listAcquisitions(volume.id),
  ]);

  const said = await searchParams;
  const refused = asked(said, "refused");
  const cover = asked(said, "cover");
  // Every Story is offerable: a Story the object already carries is filtered out here, so
  // the picker only ever proposes something that would change the record.
  const held = new Set(carried.map((story) => story.id));
  const offerable = stories.filter((story) => !held.has(story.id));

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        {/* **No breadcrumb.** `tsundoku / collection` was the way back to the wall on a screen
            that had no navigation; the shell has one now, at both widths, and it marks
            *Collection* while the owner is standing here. A trail of one step is a second
            answer to a question the chrome is already answering.

            The tile the wall laid this object out as opens the page instead, in the same
            colour — so arriving here from the Collection is arriving at the thing that was
            tapped. **It carries no href**, because this is the page it would lead to: a link
            to where the owner already is would be a focusable no-op that lifts under the
            pointer as though it went somewhere (`@/components/cover`). */}
        <div className="flex items-start gap-4 sm:gap-6">
          <div className="w-20 shrink-0 sm:w-28">
            <Cover
              title={volume.title}
              tint={tint(volume.series?.id)}
              detail={objectSaid(volume)}
              foot={volume.seriesNumber ?? volume.binding.name}
              image={volume.cover}
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-pretty font-heading text-2xl leading-tight sm:text-3xl">
              {volume.title}
            </h1>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{[volume.publisher, volume.editionLine].filter(Boolean).join(" · ")}</span>
              <Badge variant="outline" className="shrink-0">
                {volume.binding.name}
              </Badge>
            </p>
            {volume.series ? (
              <p className="mt-2 text-sm text-muted-foreground">
                <Link
                  href={`/series/${volume.series.id}`}
                  className="underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {[volume.series.name, volume.series.editionLine].filter(Boolean).join(", ")}
                </Link>{" "}
                <span className="font-mono tabular-nums">{volume.seriesNumber}</span>
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {refused ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}
      {cover ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {whatTheLookupSaid(cover, asked(said, "because"))}
        </p>
      ) : null}

      {/* **The two halves of ADR-0007, side by side.** What the object is, and whether the
          house holds it. They are two facts about one thing, so they are two headings and
          never one paragraph mixing a publisher with a price. */}
      <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-8">
        <section>
          <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
            What it is
          </h2>
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            The object as the library catalogues it. All of it is true whether or not the thing is
            in your house.
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs">
            <Fact term="Publisher" detail={volume.publisher} />
            <Fact term="Edition line" detail={volume.editionLine ?? "— the standard printing"} />
            <Fact term="Binding" detail={volume.binding.name} />
            <Fact term="Language" detail={volume.language} mono />
          </dl>

          {/* The ISBN is a field rather than a fact, because it is the one thing on this
              screen the owner is here to *put right*: nothing in the catalogue carries one,
              and this box is where the first one lands and where a wrong one is corrected. */}
          <form
            action={recordIsbn}
            className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          >
            <input type="hidden" name="volumeId" value={volume.id} />
            <div className="grid gap-1.5">
              <Label htmlFor="volume-isbn" className="text-xs text-muted-foreground">
                ISBN
              </Label>
              <Input
                id="volume-isbn"
                name="isbn"
                defaultValue={volume.isbn ?? ""}
                placeholder="9788828765431"
                inputMode="numeric"
                autoComplete="off"
                required
                className="h-11 font-mono sm:h-10"
              />
            </div>
            <Button type="submit" variant="outline" className="h-11 sm:h-10 sm:px-6">
              {volume.isbn ? "Correct it" : "Record it"}
            </Button>
            <p className="max-w-prose text-xs text-muted-foreground sm:col-span-2">
              Ten or thirteen characters, no spaces and no dashes. A wrong one is corrected here;
              there is nothing on this screen that empties the field, because taking a fact out of
              the record is a different act from putting one in.
            </p>
          </form>

          <TheCover volume={volume} />
        </section>

        <section>
          <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
            In the house
          </h2>
          {/* The sentence comes off `findVolume` and the rows off `listAcquisitions`, and the
              two agree by construction: both order the acquisitions the same way, so *the
              latest* is the same row in each, and whether the house holds the object stays the
              core's answer rather than one this screen re-derives from the history. */}
          <p className="mt-2 max-w-prose text-pretty text-sm">{whatTheHouseSays(volume)}</p>

          <History acquisitions={history} />

          {/* The two acts that change the answer above, and only ever one of them at a time.
              Coming home is asked for with the day and the price, because that is the moment
              they become true; leaving costs a deliberate second tap, because nothing undoes
              it. */}
          {volume.inTheHouse ? (
            <details className="group mt-6 rounded-xl ring-1 ring-foreground/10">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
                It left the house
                <span className="ml-2 text-muted-foreground group-open:hidden">
                  — sold, given away or lost
                </span>
              </summary>

              <form action={release} className="border-t border-border p-4">
                <input type="hidden" name="volumeId" value={volume.id} />
                <Button type="submit" variant="destructive" className="h-11 sm:h-10 sm:px-6">
                  Release it
                </Button>
                <p className="mt-2 max-w-prose text-xs text-muted-foreground">
                  The Collection stops claiming it and it leaves the wall. Nothing is erased: this
                  page stays, the acquisition above becomes a record of having had it, and so do the
                  Edition note and the Readings made through it. Buying it again is a second
                  acquisition of the same object, not a second object.
                </p>
              </form>
            </details>
          ) : (
            <form
              action={acquire}
              className="mt-6 grid gap-4 rounded-xl ring-1 ring-foreground/10 p-4 sm:grid-cols-2"
            >
              <input type="hidden" name="volumeId" value={volume.id} />
              <Field name="pricePaid" label="Price paid" placeholder="6.50" inputMode="decimal" />
              <Field name="acquiredOn" label="Came home" type="date" />

              <div className="sm:col-span-2">
                <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
                  It is in the house
                </Button>
                <p className="mt-2 max-w-prose text-xs text-muted-foreground">
                  Leave both empty where the receipt is gone — the fact does not depend on the day.
                  {history.length > 0
                    ? " Saying it again after a release records a second acquisition of this same object."
                    : null}
                </p>
              </div>
            </form>
          )}
        </section>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stories it holds</CardTitle>
            <CardDescription className="text-pretty">
              One object can hold several narratives, and each one is read and judged on its own.
              The number beside a Story is that Story&apos;s — this object has none, and cannot have
              one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {carried.length === 0 ? (
              <p className="max-w-prose text-pretty text-sm text-muted-foreground">
                Nothing recorded yet. Say what is inside this object below, and it appears on each
                Story too — it is one fact, read from both ends.
              </p>
            ) : (
              <ul className="-my-1">
                {carried.map((story) => (
                  <li
                    key={story.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border py-3 first:border-t-0"
                  >
                    <Link
                      href={`/stories/${story.id}`}
                      className="min-w-0 flex-1 basis-full outline-none focus-visible:ring-2 focus-visible:ring-ring sm:basis-auto"
                    >
                      <span className="font-heading underline decoration-border underline-offset-4 hover:decoration-foreground">
                        {story.title}
                      </span>{" "}
                      <span className="whitespace-nowrap font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                        {story.type.name}
                      </span>
                    </Link>

                    <span className="flex items-baseline gap-3">
                      {/* Tabular, so three judgements of three narratives in one object line
                          up under each other and read as the three different numbers they
                          are. An em dash where the owner has judged nothing yet. */}
                      <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {story.latestScore === null ? "—" : story.latestScore.toFixed(1)}
                      </span>
                      <form action={stopCarrying}>
                        <input type="hidden" name="volumeId" value={volume.id} />
                        <input type="hidden" name="storyId" value={story.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="-mr-2.5 h-8 text-xs text-muted-foreground"
                        >
                          Not in here
                        </Button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* An id is never typed, so the Story is chosen rather than named. A native select
                opens the platform picker on a phone and submits without JavaScript. */}
            <form
              action={carry}
              className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-[1fr_auto] sm:items-end"
            >
              <input type="hidden" name="volumeId" value={volume.id} />
              <div className="grid gap-1.5">
                <Label htmlFor="carry-story" className="text-xs text-muted-foreground">
                  A Story inside this object
                </Label>
                <select
                  id="carry-story"
                  name="storyId"
                  required
                  disabled={offerable.length === 0}
                  defaultValue=""
                  className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:h-10 md:text-sm dark:bg-input/30"
                >
                  <option value="" disabled>
                    {offerable.length === 0 ? "Every Story is already in here" : "Choose a Story"}
                  </option>
                  {offerable.map((story) => (
                    <option key={story.id} value={story.id}>
                      {story.title} — {story.type.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="submit"
                disabled={offerable.length === 0}
                className="h-11 w-full sm:h-10 sm:w-auto sm:px-6"
              >
                Record it
              </Button>
              <p className="max-w-prose text-xs text-muted-foreground sm:col-span-2">
                A Story spanning twenty objects is recorded twenty times, once on each. Record the
                Story first if it is not in the list — being read and being owned are separate
                facts, and so are the two records.
              </p>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Edition note</CardTitle>
            <CardDescription className="text-pretty">
              What you think of this as an object — print quality, translation, value for money,
              whether the Must Have was the right way to try the saga. It decides what to buy.{" "}
              <strong className="font-medium text-foreground">It is not a score</strong>, it stands
              beside no Rating, and nothing recommending you a Story will ever read it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Set in the serif, in the box it is typed in as much as anywhere it is read
                back: what the owner thinks of an object is theirs, and the box that says so
                while they are writing is the box that will say so afterwards. */}
            <form action={writeNote} className="grid gap-3">
              <input type="hidden" name="volumeId" value={volume.id} />
              <Label htmlFor="edition-note" className="sr-only">
                Edition note
              </Label>
              <textarea
                id="edition-note"
                name="note"
                rows={6}
                defaultValue={note?.note ?? ""}
                placeholder="Thin paper, good translation, and cheap enough to try the saga on."
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2.5 font-serif text-base leading-relaxed outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-prose dark:bg-input/30"
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button type="submit" className="h-11 sm:h-10 sm:px-6">
                  {note ? "Rewrite it" : "Write it"}
                </Button>
                <span className="max-w-prose text-xs text-muted-foreground">
                  {note
                    ? `Written ${note.writtenAt}. Rewriting replaces it — an opinion of an object is a verdict, not an event. Empty the box to take it back.`
                    : "One note per object. Rewriting it later replaces this one."}
                </span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

/**
 * THE COVER, on the object's own page: where the image on the tile comes from, and the two
 * ways the owner changes it.
 *
 * **The distinction the block is laid out along is whose bytes they are** (ADR-0013). A
 * looked-up cover is a *reference* — the source's own address, pointed at and never copied
 * here, revocable by them at any moment — and it is 128 pixels wide, which is the only size
 * that exists. An image of the owner's own is hosted, is theirs, and overrides the other one:
 * it is the only thing that will ever face a Bonelli monthly, and the only image this
 * application is allowed to keep.
 *
 * The lookup is offered only where there is an ISBN to look one up by, and where there is
 * not the block says so instead of standing a button there that can only ever be refused.
 */
function TheCover({ volume }: { volume: RecordedVolume }) {
  const own = volume.cover?.from === "own";

  return (
    <details className="group mt-6 rounded-xl ring-1 ring-foreground/10">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
        Cover
        <span className="ml-2 text-muted-foreground group-open:hidden">— {facedWith(volume)}</span>
      </summary>

      <div className="grid gap-5 border-t border-border p-4">
        <p className="max-w-prose text-pretty text-sm text-muted-foreground">
          {facedWith(volume)}
          {volume.lookedUp.at ? ` Last asked about on ${volume.lookedUp.at}.` : null}{" "}
          {/* Off the **record**, not off the tile. `cover.at` describes the image being shown,
              so it is absent the moment an image of the owner's own covers the looked-up one
              — and the source's page for the book is still a fact about this object, and is
              the exact column a public page owes Google a link to (ADR-0013). */}
          {volume.lookedUp.infoUrl ? (
            <a
              href={volume.lookedUp.infoUrl}
              // A link off this application entirely, so it says so and takes nothing with it.
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              The source&apos;s own page for it
            </a>
          ) : null}
        </p>

        {volume.isbn ? (
          <div className="flex flex-wrap items-start gap-2">
            <form action={lookUpCover}>
              <input type="hidden" name="volumeId" value={volume.id} />
              <Button type="submit" variant="outline" className="h-11 sm:h-10 sm:px-6">
                {volume.lookedUp.source ? "Ask again" : "Look up a cover"}
              </Button>
            </form>

            {/* **The way out of a wrong cover, and it is the fast one.** Asking again depends
                on the source having a better answer; this depends on nothing at all, and a
                blank tile is better than another book's jacket. Offered only where there is
                something to forget. */}
            {volume.lookedUp.source ? (
              <form action={forgetCover}>
                <input type="hidden" name="volumeId" value={volume.id} />
                <Button type="submit" variant="ghost" className="h-11 sm:h-10 sm:px-4">
                  Take it off
                </Button>
              </form>
            ) : null}

            <p className="max-w-prose basis-full text-xs text-muted-foreground">
              Google Books first, then Open Library. The image is <em>pointed at</em> where it lives
              and never copied here, so it is 128 pixels wide — which is all there is — and whoever
              owns it can withdraw it. <strong>Asking again always reaches the source</strong>,
              whatever is recorded here: a jacket fetched against an ISBN that has since been
              corrected still loads perfectly, and is still the wrong book.
            </p>
          </div>
        ) : (
          <p className="max-w-prose text-pretty text-xs text-muted-foreground">
            Every source is keyed by ISBN, and this object has none — so there is nothing to ask.
            Record its ISBN above, or give it an image of your own below. A Bonelli monthly never
            gets one: those carry a periodical EAN and no ISBN at all.
          </p>
        )}

        <form action={useOwnImage} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <input type="hidden" name="volumeId" value={volume.id} />
          <div className="grid gap-1.5">
            <Label htmlFor="volume-image" className="text-xs text-muted-foreground">
              An image of your own
            </Label>
            <Input
              id="volume-image"
              name="imageUrl"
              type="url"
              defaultValue={own ? volume.cover?.url : ""}
              placeholder="https://…/one-piece-100.jpg"
              autoComplete="off"
              required
              className="h-11 sm:h-10"
            />
          </div>
          <Button type="submit" variant="outline" className="h-11 sm:h-10 sm:px-6">
            {own ? "Use this one" : "Use my own"}
          </Button>
          <p className="max-w-prose text-xs text-muted-foreground sm:col-span-2">
            A photograph or a scan you host yourself. It overrides whatever the lookup found, at
            whatever size you took it — and it is the only image this library keeps, because it is
            yours and no third party can withdraw it. An address on a source&apos;s own domain is
            refused: that would be their bytes under your name.
          </p>
        </form>

        {own ? (
          <form action={removeOwnImage}>
            <input type="hidden" name="volumeId" value={volume.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="-ml-2.5 h-8 text-xs text-muted-foreground"
            >
              Take my image off
            </Button>
          </form>
        ) : null}
      </div>
    </details>
  );
}

/**
 * What the tile at the head of the page is, said in one line — the Collection wall's own
 * `detailOf`, for the object this page is about.
 *
 * It is what a pointer and a screen reader get off a drawing that carries a title, a colour
 * and one number, and it says the two things the colour and the number stand for: which
 * Series, and where in it.
 */
function objectSaid(volume: RecordedVolume): string {
  const standing = volume.series
    ? `${[volume.series.name, volume.series.editionLine].filter(Boolean).join(", ")} ${volume.seriesNumber}`
    : "In no Series";

  const object = [volume.publisher, volume.editionLine].filter(Boolean).join(", ");

  return [volume.title, standing, object, volume.binding.name].join(" — ");
}

/**
 * Every acquisition of the object, newest first — **which is how one object acquired twice
 * reads as one object** (ADR-0007, #30).
 *
 * An acquisition that ends is a record of having had the thing rather than a deleted row, so
 * a Volume sold and bought again has two of them here, at two prices, under one title. That
 * is the sentence the heading prints when there is more than one; with a single acquisition
 * there is nothing to count and it is not printed, because *acquired once* is noise.
 *
 * A price nobody wrote down is an em dash with the reason said, never a zero: a gift and a
 * book owned since before any of this was written down are acquisitions with no purchase in
 * them, and `€ 0.00` would be a claim about money rather than an absence of one.
 */
function History({ acquisitions }: { acquisitions: readonly Acquisition[] }) {
  if (acquisitions.length === 0) return null;

  return (
    <div className="mt-5">
      {acquisitions.length > 1 ? (
        <p className="text-sm text-muted-foreground">
          One object, acquired {timesSaid(acquisitions.length)}.
        </p>
      ) : null}

      <ul className="mt-2 border-t border-border">
        {acquisitions.map((acquisition) => (
          <li
            key={acquisition.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3 text-sm"
          >
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono tabular-nums">{acquisition.acquiredOn ?? "—"}</span>
              <span className="text-muted-foreground">
                {acquisition.releasedOn ? (
                  <>
                    to <span className="font-mono tabular-nums">{acquisition.releasedOn}</span>
                  </>
                ) : (
                  "and still here"
                )}
              </span>
            </span>
            <span className="font-mono tabular-nums">
              {acquisition.pricePaid ? (
                `€ ${acquisition.pricePaid}`
              ) : (
                <span className="font-sans text-muted-foreground">— no price recorded</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {acquisitions.some((acquisition) => acquisition.acquiredOn === null) ? (
        <p className="mt-2 max-w-prose text-xs text-muted-foreground">
          A dash for a day means the object was here before anyone was writing this down.
        </p>
      ) : null}
    </div>
  );
}

function Fact({ term, detail, mono }: { term: string; detail: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={mono ? "font-mono" : undefined}>{detail}</dd>
    </div>
  );
}

function Field({
  name,
  label,
  ...props
}: {
  name: string;
  label: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`acquire-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`acquire-${name}`} name={name} className="h-11 sm:h-10" {...props} />
    </div>
  );
}
