import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { findVolume } from "@/core/queries/collection";
import { findEditionNote } from "@/core/queries/edition-note";
import { listStories } from "@/core/queries/story";
import { listStoriesInVolume } from "@/core/queries/story-to-volume";
import { requireOwner } from "@/lib/auth/owner";
import { carry, stopCarrying, writeNote } from "./actions";

// ONE VOLUME: the object, what it holds, and what the owner thinks of it.
//
// It is the half of ADR-0001 that the Collection screen cannot show, and the argument is
// made by the layout. **The Stories are a list with a score column**, so *L'uomo che ride*
// prints three titles and three different numbers under one object's title, and the thing
// the spreadsheet destroyed — one `Voto` cell for three opinions — is visible in one glance.
// The scores are the Stories' and are shown here only because this is where the mismatch is
// legible; nothing on this page attaches a number to the object.
//
// **The Edition note sits under them, and says in its own words that it is not one of those
// numbers.** That separation is the page's only real design decision: two judgements, in two
// places, in two different registers — a column of digits, and a box of prose.
//
// A thin adapter over the core (ADR-0002): three queries, four verbs behind the forms, and
// no SQL. Nothing runs in the browser — the writes are plain form posts, so the page works
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

  const [carried, note, stories] = await Promise.all([
    listStoriesInVolume(volume.id),
    findEditionNote(volume.id),
    listStories(),
  ]);

  const said = await searchParams;
  const refused = asked(said, "refused");
  const under = [volume.publisher, volume.editionLine].filter(Boolean).join(" · ");
  // Every Story is offerable: a Story the object already carries is filtered out here, so
  // the picker only ever proposes something that would change the record.
  const held = new Set(carried.map((story) => story.id));
  const offerable = stories.filter((story) => !held.has(story.id));

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <Link
          href="/collection"
          className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          tsundoku / collection
        </Link>

        <h1 className="mt-6 text-pretty font-heading text-2xl leading-tight sm:text-3xl">
          {volume.title}
        </h1>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{under}</span>
          <Badge variant="outline" className="shrink-0">
            {volume.binding.name}
          </Badge>
        </p>

        {/* A Volume keeps its page whether or not the house holds it, because what it
            carries and what the owner learned about it are still true. Three states rather
            than two since the catalogue and the Collection came apart (ADR-0007), and the
            page says which one plainly — the object is the same, the claim is not. */}
        {volume.inTheHouse ? null : (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {volume.releasedOn
              ? `Left the house on ${volume.releasedOn}. Its record is kept: the Readings made through it and the note below are still true.`
              : "Catalogued, and not in the house. The library knows this object; the Collection does not claim it."}
          </p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs sm:grid-cols-4">
          <Fact term="Price paid" detail={volume.pricePaid ? `€ ${volume.pricePaid}` : "—"} />
          <Fact term="Came home" detail={volume.acquiredOn ?? "—"} />
          <Fact term="Language" detail={volume.language} />
          <Fact term="ISBN" detail={volume.isbn ?? "—"} mono />
        </dl>
      </header>

      {refused ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Stories it holds</CardTitle>
          <CardDescription className="text-pretty">
            One object can hold several narratives, and each one is read and judged on its own. The
            number beside a Story is that Story&apos;s — this object has none, and cannot have one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {carried.length === 0 ? (
            <p className="text-pretty text-sm text-muted-foreground">
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
                    <span className="whitespace-nowrap font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
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
            <p className="text-xs text-muted-foreground sm:col-span-2">
              A Story spanning twenty objects is recorded twenty times, once on each. Record the
              Story first if it is not in the list — being read and being owned are separate facts,
              and so are the two records.
            </p>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
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
          <form action={writeNote} className="grid gap-3">
            <input type="hidden" name="volumeId" value={volume.id} />
            <Label htmlFor="edition-note" className="sr-only">
              Edition note
            </Label>
            <textarea
              id="edition-note"
              name="note"
              rows={4}
              defaultValue={note?.note ?? ""}
              placeholder="Thin paper, good translation, and cheap enough to try the saga on."
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-base leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button type="submit" className="h-11 sm:h-10 sm:px-6">
                {note ? "Rewrite it" : "Write it"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {note
                  ? `Written ${note.writtenAt}. Rewriting replaces it — an opinion of an object is a verdict, not an event. Empty the box to take it back.`
                  : "One note per object. Rewriting it later replaces this one."}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
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
