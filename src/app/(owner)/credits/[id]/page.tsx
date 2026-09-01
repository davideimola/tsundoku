import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { type CreditedStory, findCreditedPerson } from "@/core/queries/credit";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { StoryScore, StoryStateLabel, storyDetail } from "../../stories/story-state";
import { type BandOfWork, bodyOfWork } from "../body-of-work";
import { rolesSaid } from "../roles";

// ONE PERSON, and **everything the library credits them with, in the role they held on it**
// (#31). That is the screen: a body of work, reachable, split the way a colophon splits it.
//
// **The split is the role now, and it used to be the Reading.** Read against unread was the
// right answer to *what have I read by Jeph Loeb before I commit to the omnibus*, and it is
// still the answer the core hands over and the MCP door reads (`read` and `notRead` in
// `@/core/queries/credit`) — but it is a question about the owner, and this screen is about
// the person. So the two lists are folded back into one and cut along the role, which is
// `../body-of-work`, and where the owner stands with each thing survives **on the tile**, as
// the state it is drawn under. Nothing is lost and one thing is gained: ONE wrote One-Punch
// Man and both wrote *and drew* Mob Psycho 100, and that is now visible rather than flattened
// into one line of roles at the top.
//
// A Story they held two roles on stands in both bands. It is not a duplicate — it is the two
// facts the word Credit exists to keep apart, and showing it once would mean picking a role
// to drop.
//
// The tiles are the Story wall's, unchanged: same shape, same tint off the line the Story
// stands in, same score at the foot, same words for the state. A body of work is a wall of
// the library's own objects, so it is drawn as one.
//
// A thin adapter over one query (ADR-0002), and the banding is the screen's the way every
// band in this application is.
export const dynamic = "force-dynamic";

export default async function CreditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();

  const { id } = await params;
  const person = await findCreditedPerson(id);
  if (!person) notFound();

  const bands = bodyOfWork(person);
  // The whole body of work, counted once. Not a `Covered<Figure>` and not a proportion of
  // anything: this is a list the page holds whole and renders whole, so the length of it is
  // the thing being said rather than how far it can be trusted.
  const works = person.read.length + person.notRead.length;

  return (
    <main className="px-5 pb-16 sm:px-8">
      {/* No breadcrumb: the shell marks *Credits* while the owner is standing here. */}
      <header className="pt-8 sm:pt-12">
        <h1 className="text-pretty font-heading text-2xl leading-tight sm:text-3xl">
          {person.name}
        </h1>
        <p className="mt-2 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          {rolesSaid(person.roles)}
          {person.roles.length > 0 ? " · " : null}
          {works} {works === 1 ? "Story" : "Stories"} · {person.read.length} read
        </p>
      </header>

      {bands.length === 0 ? (
        <p className="mt-8 max-w-prose text-pretty text-sm text-muted-foreground">
          The library credits {person.name} with nothing. Which is a record of a name and not of a
          body of work — credit them on a Story and it appears here.
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          {bands.map((band) => (
            <Band key={band.role.id} band={band} />
          ))}
        </div>
      )}

      <p className="mt-12 max-w-prose text-pretty text-xs leading-relaxed text-muted-foreground">
        Read means it went through a Reading, abandoned included — not that the Story is in the
        library. The score is the most recent judgement of the Story, which is where every judgement
        here hangs: what the owner thinks of an <em>object</em> is an Edition note, and it is on the
        Volume.
      </p>
    </main>
  );
}

/**
 * One band: what they did in one role, as a wall.
 *
 * The heading carries the two numbers worth having — how much of it there is, and how much
 * of it the owner has opened — because *what have I read by them* is still the question this
 * screen is opened with, and it is now answered per role rather than over a whole career.
 */
function Band({ band }: { band: BandOfWork }) {
  return (
    <section aria-labelledby={`band-${band.role.id}`}>
      <h2
        id={`band-${band.role.id}`}
        className="flex items-baseline gap-3 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground"
      >
        {band.title}
        <span className="tabular-nums">
          {band.stories.length} · {band.read} read
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </h2>

      {/* The Story wall's own grid: as many tiles as the window holds, at the width a title
          is legible across, two of them on a phone held one-handed. */}
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 sm:gap-4">
        {band.stories.map((story) => (
          <li key={story.id}>
            <Work story={story} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One thing they are credited on: the tile, and where the owner stands with it.
 *
 * The state is printed **under** the tile rather than on it, because it is the owner's
 * standing and the tile is the object's: the wall on `/stories` says the same thing by which
 * shelf a Story is on, and here the shelf is the role. It is the same four words either way
 * (`../../stories/story-state`), so a Story cannot read as *abandoned* on one screen and
 * *read* on the other.
 */
function Work({ story }: { story: CreditedStory }) {
  return (
    <>
      <Cover
        href={`/stories/${story.id}`}
        title={story.title}
        tint={tint(story.series?.id)}
        detail={storyDetail(story)}
        foot={<StoryScore of={story.latestScore} />}
        image={story.cover}
      />
      <p className="mt-1.5">
        <StoryStateLabel state={story.state} />
      </p>
    </>
  );
}
