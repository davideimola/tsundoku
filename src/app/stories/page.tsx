import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listStories } from "@/core/queries/story";
import { StoryStateLabel } from "./story-state";

// A thin adapter over one query, like every page here (ADR-0002): no SQL, no pool, no
// domain logic. Deliberately plain and monochrome — shadcn's own tokens, unchanged, and
// no design system invented on top of them.
export const dynamic = "force-dynamic";

export default async function Stories() {
  const stories = await listStories();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <h1 className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
        tsundoku / stories
      </h1>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>What I have read</CardTitle>
          <CardDescription className="text-pretty">
            The narrative unit, at whatever granularity was the right one. No Volume is involved: a
            Story read digitally, borrowed, or known only from Goodreads history counts exactly as
            much as one on the shelf.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stories.length === 0 ? (
            <p className="text-pretty text-sm text-muted-foreground">
              No Stories yet. Record one, and its state follows from the Readings you give it.
            </p>
          ) : (
            <ul className="-my-1">
              {stories.map((story) => (
                <li key={story.id} className="border-t border-border first:border-t-0">
                  <Link
                    href={`/stories/${story.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <span className="font-heading">{story.title}</span>{" "}
                      <span className="whitespace-nowrap font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                        {story.type.name}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-3">
                      <StoryStateLabel state={story.state} />
                      {/* Tabular so the column of scores lines up under itself, and an
                          em dash where there is no judgement rather than a zero. */}
                      <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {story.latestScore === null ? "—" : story.latestScore.toFixed(1)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-pretty text-xs leading-relaxed text-muted-foreground">
        {stories.length} {stories.length === 1 ? "Story" : "Stories"}. The state beside each one —
        to read, reading, read, abandoned — is derived from its Readings on this request and is
        stored nowhere.
      </p>
    </main>
  );
}
