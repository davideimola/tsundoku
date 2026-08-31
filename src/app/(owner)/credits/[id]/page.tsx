import Link from "next/link";
import { notFound } from "next/navigation";
import { type CreditedStory, findCreditedPerson } from "@/core/queries/credit";
import { requireOwner } from "@/lib/auth/owner";

// Everything read by one Credit — the screen user story 15 asks for, and the reason a
// Person is a row and not a name repeated on every Credit.
//
// The two lists are the design: **read first, and read means it went through a Reading.**
// A Story credited to them and never opened is not an answer to *what have I read by
// him*, but hiding it would answer the next question with silence, so it is below and
// quieter. A thin adapter over one query (ADR-0002).
export const dynamic = "force-dynamic";

export default async function CreditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();

  const { id } = await params;
  const person = await findCreditedPerson(id);
  if (!person) notFound();

  return (
    <main className="px-5 pb-16 sm:px-8">
      {/* No breadcrumb: the shell marks *Credits* while the owner is standing here. */}
      <header className="pt-8 sm:pt-12">
        <h1 className="text-pretty font-heading text-2xl leading-tight sm:text-3xl">
          {person.name}
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {person.read.length} read
          {person.notRead.length > 0 ? ` · ${person.notRead.length} not read` : null}
        </p>
      </header>

      <section className="mt-8">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Read
        </h2>
        {person.read.length === 0 ? (
          <p className="mt-3 max-w-prose text-pretty text-sm text-muted-foreground">
            Nothing by {person.name} has been read yet. Record a Reading on one of the Stories below
            and it moves up here.
          </p>
        ) : (
          <ul className="mt-2">
            {person.read.map((story) => (
              <CreditedStoryRow key={story.id} story={story} />
            ))}
          </ul>
        )}
      </section>

      {person.notRead.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Credited, not read
          </h2>
          <p className="mt-1 max-w-prose text-pretty text-xs text-muted-foreground">
            In the library and never opened. Which is the other half of the shelf question.
          </p>
          <ul className="mt-2">
            {person.notRead.map((story) => (
              <CreditedStoryRow key={story.id} story={story} />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 max-w-prose text-pretty text-xs leading-relaxed text-muted-foreground">
        The score is the most recent judgement of the Story, which is where every judgement here
        hangs: what the owner thinks of an object is an Edition note, and it is on the Volume.
      </p>
    </main>
  );
}

/** One Story credited to this person: the title, their roles on it, and the judgement. */
function CreditedStoryRow({ story }: { story: CreditedStory }) {
  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        href={`/stories/${story.id}`}
        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3.5 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 basis-full sm:basis-auto">
          <span className="font-heading">{story.title}</span>{" "}
          <span className="whitespace-nowrap font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {story.type.name}
          </span>
          {/* Their roles **on this Story**, which is not necessarily every role they
              hold: ONE wrote One-Punch Man and both wrote and drew Mob Psycho 100. */}
          <span className="mt-0.5 block font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {story.roles.map((role) => role.name).join(" · ")}
          </span>
        </span>
        <span className="flex items-baseline gap-3">
          <span className="whitespace-nowrap font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {story.readingCount === 0
              ? "no reading"
              : `${story.readingCount} ${story.readingCount === 1 ? "reading" : "readings"}`}
          </span>
          {/* An em dash where there is no judgement rather than a zero, as the Stories
              list does — the two columns of scores are read the same way. */}
          <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {story.latestScore === null ? "—" : story.latestScore.toFixed(1)}
          </span>
        </span>
      </Link>
    </li>
  );
}
