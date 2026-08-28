import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoryRating, StoryReading } from "@/core/queries/story";
import { findStory } from "@/core/queries/story";
import { listVolumesCarryingStory } from "@/core/queries/story-to-volume";
import { requireOwner } from "@/lib/auth/owner";
import { StoryStateLabel } from "../story-state";

export const dynamic = "force-dynamic";

// The page the whole slice exists for, and its one argument is made by the layout: the
// Readings are a **stack, newest first, each carrying its own Rating**. A reread is
// visibly a second Reading with a second opinion beside the first, which is precisely
// what the spreadsheet could not hold — one cell for `Voto`, overwritten.
//
// Monochrome shadcn tokens, one card, one rule between Readings. Nothing here is
// invented, and there is only one column, so the phone gets the same page as the desk.

/** The medium and the outcome, in the words the owner uses. */
function howItWent(reading: StoryReading): string {
  return `${reading.medium}, ${reading.outcome ?? "still reading"}`;
}

/**
 * When it happened, with whichever half of it is known — Goodreads history often carries
 * one date, and a Reading in progress has no end yet.
 */
function whenItHappened(reading: StoryReading): string {
  if (reading.startedOn && reading.endedOn) return `${reading.startedOn} → ${reading.endedOn}`;
  if (reading.startedOn) return `from ${reading.startedOn}`;
  if (reading.endedOn) return `until ${reading.endedOn}`;
  return "no date recorded";
}

function Judgement({ rating }: { rating: StoryRating }) {
  return (
    <div className="mt-2">
      <p className="font-mono text-sm tabular-nums">
        {rating.score.toFixed(1)}
        <span className="text-muted-foreground"> / 10</span>
      </p>
      {rating.prose ? <p className="mt-1 text-pretty text-sm">{rating.prose}</p> : null}
      <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        {rating.provenance.name}
      </p>
    </div>
  );
}

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();

  const { id } = await params;
  const [story, carriedBy] = await Promise.all([findStory(id), listVolumesCarryingStory(id)]);
  if (!story) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <Link
        href="/stories"
        className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        tsundoku / stories
      </Link>

      <header className="mt-8">
        <h1 className="text-pretty font-heading text-2xl leading-tight">{story.title}</h1>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {story.type.name}
          </span>
          <StoryStateLabel state={story.state} />
        </p>
      </header>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Readings</CardTitle>
          <CardDescription className="text-pretty">
            One act of reading each, newest first, with the Rating it carried. Nothing here is ever
            overwritten: reading it again adds a Reading, and the opinion from last time stays
            beside the new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {story.readings.length === 0 ? (
            <p className="text-pretty text-sm text-muted-foreground">
              No Reading yet, which is the whole of why this Story reads{" "}
              <span className="font-mono text-xs uppercase tracking-[0.18em]">to read</span>.
            </p>
          ) : (
            <ol className="-my-1">
              {story.readings.map((record) => (
                <li key={record.id} className="border-t border-border py-3.5 first:border-t-0">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="font-mono text-xs tabular-nums">{whenItHappened(record)}</span>
                    <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                      {howItWent(record)}
                    </span>
                  </p>
                  <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {record.provenance.name}
                  </p>
                  {record.rating ? (
                    <Judgement rating={record.rating} />
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No Rating on this Reading.</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {story.standaloneRatings.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Ratings with no Reading</CardTitle>
            <CardDescription className="text-pretty">
              A judgement of this Story that points at no particular act of reading — a score that
              arrived from a sheet, most often. The Provenance says how far it can be trusted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="-my-1">
              {story.standaloneRatings.map((rating) => (
                <li key={rating.id} className="border-t border-border py-2 first:border-t-0">
                  <Judgement rating={rating} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* The other half of ADR-0001, read from the narrative end. Twenty objects would be
          twenty rows and a scroll; as a wrapped set they are one shape the eye takes in at
          once, which is the whole claim — *Slam Dunk* is one thing read and rated, and twenty
          things bought. The Binding rides along on each, because it is what tells two
          editions of one Story apart. */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Volumes carrying it</CardTitle>
          <CardDescription className="text-pretty">
            The objects this narrative arrived on. One Story spans as many as it spans, and the
            judgement above is not multiplied by them: it was the story that was good or bad.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {carriedBy.length === 0 ? (
            <p className="text-pretty text-sm text-muted-foreground">
              No Volume carries this Story, and that is an ordinary answer rather than a gap: read
              digitally, borrowed, or known only from Goodreads history. Being read and being owned
              are unrelated facts.
            </p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-2">
                {carriedBy.map((volume) => (
                  <li key={volume.id}>
                    <Link
                      href={`/collection/${volume.id}`}
                      className="flex items-baseline gap-2 rounded-lg px-2.5 py-1.5 ring-1 ring-border outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={volume.releasedOn ? "text-muted-foreground" : undefined}>
                        {volume.title}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[0.65rem]">
                        {volume.binding.name}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-pretty text-xs leading-relaxed text-muted-foreground">
                {carriedBy.length} {carriedBy.length === 1 ? "Volume" : "Volumes"}. A greyed title
                is one that left the house — what it carried is still true. What the owner thinks of
                any of them as an object is an Edition note, on its own page, and it is not a score.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-pretty text-xs leading-relaxed text-muted-foreground">
        The judgement is of the Story and never of an object: a Volume carries an Edition note
        instead, and this page has no place to put one.
      </p>
    </main>
  );
}
