import { Button } from "@/components/ui/button";
import type { PathConstraint } from "@/core/queries/path";
import { declare, withdraw } from "./actions";

// The owner's **declared constraints**, on both screens that show them: over the whole
// library on `/paths`, and over one route on `/paths/[id]`.
//
// They are set apart from everything else on the page, and quoted rather than listed as
// data, because of what they are: **instructions to the external advisor** and not notes
// to self (ADR-0002). Nothing in this application acts on them — no count is enforced, no
// warning is shown when the pile grows — so printing them as if they were settings the app
// obeys would be a lie the screen told. What the screen can say honestly is *this is what
// the recommender is told*, and that is what it says.

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
      <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        What I have said about {scope}
      </h2>
      <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
        Read by the assistant that recommends, as instructions rather than as notes. Nothing here is
        enforced by this app — it is repeated to whoever is asked what to read next.
      </p>

      {constraints.length === 0 ? null : (
        <ul className="mt-4 space-y-3">
          {constraints.map((constraint) => (
            <li key={constraint.id} className="flex items-start justify-between gap-3">
              {/* A quotation, because these are the owner's sentences and the only
                  element on the page that is. */}
              <blockquote className="border-l-2 border-foreground/25 pl-3 text-pretty text-sm italic">
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

      <form action={declare} className="mt-4 flex flex-col gap-2 sm:flex-row">
        {pathId ? <input type="hidden" name="pathId" value={pathId} /> : null}
        <input type="hidden" name="back" value={back} />
        <label className="flex-1">
          <span className="sr-only">A constraint, in your own words</span>
          {/* A textarea rather than an input: these are sentences, and one that has to be
              typed into a slot the width of a name gets shortened until it stops being one. */}
          <textarea
            name="prose"
            rows={2}
            required
            placeholder={placeholder}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
        </label>
        <Button type="submit" variant="outline" className="h-11 sm:h-auto sm:self-start sm:px-5">
          Say it
        </Button>
      </form>
    </section>
  );
}
