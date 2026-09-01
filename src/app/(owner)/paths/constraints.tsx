import { Button } from "@/components/ui/button";
import type { PathConstraint } from "@/core/queries/path";
import { declare, withdraw } from "./actions";

// The owner's **declared constraints**, on both screens that show them: over the whole
// library on `/paths`, and over one route on `/paths/[id]`.
//
// They are set apart from everything else on the page, and quoted rather than listed as
// data, because of what they are: **instructions to the external advisor** and not notes
// to self (ADR-0002). Nothing in this application acts on them — no count is enforced, no
// warning is shown when the pile grows, no route is refused for breaking one — so printing
// them as if they were settings the app obeys would be a lie the screen told. What the
// screen can say honestly is *this is what the recommender is told*, and that is what it
// says, in as many words (#31): **read by the assistant, enforced by nobody.**
//
// The form under them is deliberately not a panel. A drawer is for a form the owner
// *opened*; this is a sentence added to the list it is read in, which is the same case as
// the picker under a route (#30's rule), and a door in front of it would be a door in front
// of a door.

export function DeclaredConstraints({
  constraints,
  pathId,
  back,
  scope,
  placeholder,
}: {
  constraints: PathConstraint[];
  /** The route these hold over, or nothing at all for the whole library. */
  pathId?: string;
  /** The screen to come back to. */
  back: string;
  /** What the owner is declaring about, in words: *the whole library*, *this route*. */
  scope: string;
  placeholder: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
        What I have said about {scope}
      </h2>
      <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
        Instructions to whoever is asked what to read next, in my own words.{" "}
        <strong className="font-medium">This application enforces none of them</strong> — nothing
        here is counted, checked or warned about, and no Story is refused for breaking one. They are
        repeated to the advisor and that is all they do.
      </p>

      {constraints.length === 0 ? null : (
        <ul className="mt-4 space-y-3">
          {constraints.map((constraint) => (
            <li key={constraint.id} className="flex items-start justify-between gap-3">
              {/* A quotation, because these are the owner's sentences and the only
                  element on the page that is — and set in the serif for the same reason,
                  which is the register the whole application reserves for their words. */}
              <blockquote className="border-l-2 border-foreground/25 pl-3 text-pretty font-serif text-prose italic">
                {constraint.prose}
              </blockquote>
              <form action={withdraw}>
                <input type="hidden" name="constraintId" value={constraint.id} />
                <input type="hidden" name="back" value={back} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="h-9 shrink-0 text-muted-foreground"
                >
                  Withdraw
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={declare} className="mt-4 grid gap-2">
        {pathId ? <input type="hidden" name="pathId" value={pathId} /> : null}
        <input type="hidden" name="back" value={back} />
        <label>
          <span className="sr-only">A constraint, in your own words</span>
          {/* A textarea rather than an input: these are sentences, and one that has to be
              typed into a slot the width of a name gets shortened until it stops being one. */}
          <textarea
            name="prose"
            rows={2}
            required
            placeholder={placeholder}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-serif text-base leading-relaxed outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-prose dark:bg-input/30"
          />
        </label>
        <Button type="submit" variant="outline" className="h-11 justify-self-start sm:h-10 sm:px-5">
          Say it
        </Button>
      </form>
    </section>
  );
}
