// PROTOTYPE — throwaway, and not production. Three variants of **how a Volume's page reads
// back the Instalments one object holds**, mounted on the real screen behind `?variant=`.
//
// The question: standing on an object's page, can the owner tell *"this takes only
// Instalment 1"* apart from *"this takes 1 to 12"* at a glance — and can they tell whether
// that range is one they wrote or one the line supplied?
//
// What the shipped screen does today, and why it did not answer: the range is two input
// boxes and nothing else, so the record has to be read out of a form; and the sentence under
// them promises *"empty both to follow this object's place in its line again"* even for an
// object that stands in no line, which is a promise it cannot keep.
//
// Every variant is read-only except the boxes, which post to the real verb. No new query, no
// core change — the four cases are the ones the data already has.

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CarriedStory } from "@/core/queries/story-to-volume";

import { coverInstalments } from "./actions";
import { SpanDrag } from "./span-drag";

export const PROTOTYPE_VARIANTS = [
  { key: "A", name: "The sentence" },
  { key: "B", name: "The span" },
  { key: "C", name: "The record card" },
  { key: "D", name: "The span, dragged" },
] as const;

const NUMBER =
  "h-9 w-16 rounded-lg border border-input bg-transparent px-2 text-center font-mono text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const EYEBROW = "font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground";

/** A row as every variant needs it: the Story, and whether the object stands in a line. */
type Row = { story: CarriedStory; inALine: boolean };

// ─── the words, which are the actual proposal ────────────────────────────────────────────

/** *Instalment 1* / *Instalments 1–12* — the shipped `whatItCovers`, unchanged. */
function span(covers: { from: number; to: number }): string {
  return covers.from === covers.to
    ? `Instalment ${covers.from}`
    : `Instalments ${covers.from}–${covers.to}`;
}

/** What this object holds of the work, in one clause. */
function holds({ story }: Row): string {
  if (!story.covers) return `Doesn't say which of the ${story.instalments} it holds`;
  return `${span(story.covers)} of ${story.instalments}`;
}

/** Where that answer came from — the half the shipped screen never says out loud. */
function saidBy({ story, inALine }: Row): string {
  if (!story.covers) return inALine ? "nothing said, nothing to follow" : "nothing said";
  return story.covers.written ? "you wrote it" : "from its place in the line";
}

/**
 * The truthful footnote: four cases, not three. The shipped `howTheRangeIsKept` knows only
 * about `covers` and so promises a line to an object that stands in none.
 */
function whatEmptyingDoes({ story, inALine }: Row): string {
  if (story.covers?.written && inALine) {
    return "Empty both to follow this object's place in its line again.";
  }
  if (story.covers?.written) {
    return "This object stands in no line, so emptying both leaves it saying nothing about which parts it holds.";
  }
  if (story.covers) return "Empty, so it follows the line. Type here to say otherwise.";
  return "This object stands in no line to follow, so nothing is filled in until you say so.";
}

// ─── the boxes, shared, because they are not what is being decided ───────────────────────

function Boxes({
  volumeId,
  story,
  size,
  id,
}: {
  volumeId: string;
  story: CarriedStory;
  size: string;
  id?: string;
}) {
  return (
    <form
      id={id}
      action={coverInstalments}
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
    >
      <input type="hidden" name="volumeId" value={volumeId} />
      <input type="hidden" name="storyId" value={story.id} />
      <input
        name="coversFrom"
        type="number"
        min={1}
        max={story.instalments ?? undefined}
        aria-label={`First Instalment of ${story.title} in this object`}
        defaultValue={story.covers?.written ? story.covers.from : ""}
        placeholder={story.covers ? String(story.covers.from) : "1"}
        className={NUMBER}
      />
      <span className={size}>to</span>
      <input
        name="coversTo"
        type="number"
        min={1}
        max={story.instalments ?? undefined}
        aria-label={`Last Instalment of ${story.title} in this object`}
        defaultValue={story.covers?.written ? story.covers.to : ""}
        placeholder={story.covers ? String(story.covers.to) : String(story.instalments)}
        className={NUMBER}
      />
      <Button type="submit" variant="ghost" size="sm" className="h-9 text-xs">
        Record it
      </Button>
    </form>
  );
}

function Title({ story }: Row) {
  return (
    <span className="min-w-0">
      <span className="font-heading">{story.title}</span>{" "}
      <span className={`whitespace-nowrap ${EYEBROW}`}>{story.type.name}</span>
    </span>
  );
}

function Score({ story }: Row) {
  return (
    <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
      {story.latestScore === null ? "—" : story.latestScore.toFixed(1)}
    </span>
  );
}

// ─── A — THE SENTENCE ────────────────────────────────────────────────────────────────────
// The record is a line of English above the form. Nothing to decode: *It holds Instalment 1
// of 12 — you wrote it.* The boxes stay exactly where they are and stop being the only place
// the fact lives.

function VariantA({ volumeId, rows }: { volumeId: string; rows: Row[] }) {
  return (
    <ul className="-my-1">
      {rows.map((row) => (
        <li key={row.story.id} className="border-t border-border py-3 first:border-t-0">
          <div className="flex items-baseline justify-between gap-4">
            <Title {...row} />
            <Score {...row} />
          </div>
          {row.story.instalments === null ? null : (
            <>
              <p className="mt-1 text-pretty text-sm">
                {row.story.covers ? (
                  <>
                    It holds <span className="font-medium">{holds(row)}</span>
                    <span className="text-muted-foreground"> — {saidBy(row)}.</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    It doesn&apos;t say which of the {row.story.instalments} Instalments it holds.
                  </span>
                )}
              </p>
              <div className="mt-2">
                <Boxes volumeId={volumeId} story={row.story} size="text-sm text-muted-foreground" />
              </div>
              <p className="mt-1.5 max-w-prose text-xs text-muted-foreground">
                {whatEmptyingDoes(row)}
              </p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── B — THE SPAN ────────────────────────────────────────────────────────────────────────
// The work drawn as its own parts, filled where this object reaches. One tick lit out of
// twelve and twelve lit out of twelve are two different pictures before either is read, which
// is the whole complaint the prototype exists for. A written range is solid; one followed from
// the line is outlined, so *where the fact came from* is in the drawing rather than in a word.

function Track({ story, inALine }: Row) {
  const total = story.instalments ?? 0;
  // A long work is drawn as a bar rather than as 200 ticks; a short one is drawn part by part.
  const ticks = total <= 40;
  const covered = (n: number) =>
    story.covers !== null && n >= story.covers.from && n <= story.covers.to;

  if (!story.covers) {
    return (
      <div
        className="mt-2 h-2 rounded-full border border-dashed border-border"
        title="Nothing said"
      />
    );
  }

  const filled = story.covers.written ? "bg-foreground" : "bg-transparent border border-foreground";

  return (
    <div className="mt-2 flex h-2 gap-px" aria-hidden>
      {ticks ? (
        Array.from({ length: total }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: prototype, and the index is the Instalment
            key={i}
            className={`h-full flex-1 rounded-xs ${covered(i + 1) ? filled : "bg-muted"}`}
          />
        ))
      ) : (
        <div className="relative h-full w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`absolute inset-y-0 rounded-full ${filled}`}
            style={{
              left: `${((story.covers.from - 1) / total) * 100}%`,
              width: `${((story.covers.to - story.covers.from + 1) / total) * 100}%`,
            }}
          />
        </div>
      )}
      <span className="sr-only">
        {holds({ story, inALine })} — {saidBy({ story, inALine })}
      </span>
    </div>
  );
}

function VariantB({ volumeId, rows }: { volumeId: string; rows: Row[] }) {
  return (
    <ul className="-my-1">
      {rows.map((row) => (
        <li key={row.story.id} className="border-t border-border py-3.5 first:border-t-0">
          <div className="flex items-baseline justify-between gap-4">
            <Title {...row} />
            <Score {...row} />
          </div>
          {row.story.instalments === null ? null : (
            <>
              <Track {...row} />
              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm">
                  {holds(row)}{" "}
                  <span className={EYEBROW}>
                    {row.story.covers?.written === false ? "from the line" : ""}
                  </span>
                </span>
                <Boxes volumeId={volumeId} story={row.story} size="text-xs text-muted-foreground" />
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── C — THE RECORD CARD ─────────────────────────────────────────────────────────────────
// The two facts split into named columns — what it holds, out of how many, and who said so —
// so the third one stops being a footnote. The form drops to its own line under them, which
// makes the row read as a record with an act beside it rather than as a form with a caption.

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className={EYEBROW}>{label}</div>
      <div className="mt-0.5 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function VariantC({ volumeId, rows }: { volumeId: string; rows: Row[] }) {
  return (
    <ul className="-my-1">
      {rows.map((row) => (
        <li key={row.story.id} className="border-t border-border py-3.5 first:border-t-0">
          <div className="flex items-baseline justify-between gap-4">
            <Title {...row} />
            <Score {...row} />
          </div>
          {row.story.instalments === null ? null : (
            <div className="mt-2 rounded-lg bg-muted/50 p-3">
              <div className="grid grid-cols-[1fr_auto_auto] items-start gap-x-4 gap-y-2">
                <Field
                  label="Holds"
                  value={row.story.covers ? span(row.story.covers) : "Not said"}
                />
                <Field label="Of" value={String(row.story.instalments)} />
                <Field
                  label="Said by"
                  value={
                    row.story.covers === null ? "—" : row.story.covers.written ? "You" : "The line"
                  }
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-2.5">
                <span className={EYEBROW}>Change</span>
                <Boxes volumeId={volumeId} story={row.story} size="text-xs text-muted-foreground" />
              </div>
              <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                {whatEmptyingDoes(row)}
              </p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── D — THE SPAN, DRAGGED ───────────────────────────────────────────────────────────────
// B, with the ticks made into the control. Drag across the parts of the work to say which of
// them are in this object; tap one to say it holds only that. The two boxes stay underneath
// and are still the specification — the gesture fills them in and presses the form the server
// rendered (`./span-drag.tsx`), so with nothing running the row is exactly B.

const TOO_MANY_TO_TAP = 60;

function DraggableTrack({ story, inALine }: Row) {
  const total = story.instalments ?? 0;
  const covered = (n: number) =>
    story.covers !== null && n >= story.covers.from && n <= story.covers.to;
  const filled = story.covers?.written ? "bg-foreground" : "border border-foreground";

  if (total > TOO_MANY_TO_TAP) {
    return (
      <>
        <Track story={story} inALine={inALine} />
        <p className="mt-1 text-xs text-muted-foreground">
          {total} parts is more than a finger can pick apart — this one stays typed.
        </p>
      </>
    );
  }

  return (
    <SpanDrag
      formId={`covers-${story.id}`}
      className="mt-2 flex h-5 items-stretch gap-px rounded-xs"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: prototype, and the index is the Instalment
          key={i}
          data-instalment={i + 1}
          title={`Instalment ${i + 1}`}
          className={`flex-1 rounded-xs data-[pending=in]:bg-foreground ${covered(i + 1) ? filled : "bg-muted"}`}
        />
      ))}
    </SpanDrag>
  );
}

function VariantD({ volumeId, rows }: { volumeId: string; rows: Row[] }) {
  return (
    <ul className="-my-1">
      {rows.map((row) => (
        <li key={row.story.id} className="border-t border-border py-3.5 first:border-t-0">
          <div className="flex items-baseline justify-between gap-4">
            <Title {...row} />
            <Score {...row} />
          </div>
          {row.story.instalments === null ? null : (
            <>
              <DraggableTrack {...row} />
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm">
                  {holds(row)}
                  <span className="text-muted-foreground"> — {saidBy(row)}</span>
                </span>
                <Boxes
                  volumeId={volumeId}
                  story={row.story}
                  size="text-xs text-muted-foreground"
                  id={`covers-${row.story.id}`}
                />
              </div>
              <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                {whatEmptyingDoes(row)}
              </p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── the four cases, so one screen shows all of them ─────────────────────────────────────
// A page shows the cases its own object is in, and an object is in at most two of the four:
// whether it stands in a line is a fact about the thing. These are stubs, in memory, drawn in
// the same variant under the real list — nothing is written and nothing is seeded.

const TYPE = { id: "comic", name: "Comic" };

const THE_FOUR_CASES: Row[] = [
  {
    inALine: false,
    story: {
      id: "case-1",
      title: "All-Star Superman n. 1 – Edizione Speciale",
      type: TYPE,
      latestScore: 7.5,
      alsoCarriedElsewhere: true,
      instalments: 12,
      covers: { from: 1, to: 1, written: true },
    },
  },
  {
    inALine: false,
    story: {
      id: "case-2",
      title: "All-Star Superman — the omnibus",
      type: TYPE,
      latestScore: 7.5,
      alsoCarriedElsewhere: true,
      instalments: 12,
      covers: { from: 1, to: 12, written: true },
    },
  },
  {
    inALine: true,
    story: {
      id: "case-3",
      title: "Slam Dunk 7 — follows the line",
      type: { id: "manga", name: "Manga" },
      latestScore: 9,
      alsoCarriedElsewhere: true,
      instalments: 20,
      covers: { from: 7, to: 7, written: false },
    },
  },
  {
    inALine: false,
    story: {
      id: "case-4",
      title: "One-Punch Man — in no line, nothing said",
      type: { id: "manga", name: "Manga" },
      latestScore: null,
      alsoCarriedElsewhere: true,
      instalments: 22,
      covers: null,
    },
  },
];

const VARIANTS: Record<string, (props: { volumeId: string; rows: Row[] }) => React.ReactNode> = {
  A: VariantA,
  B: VariantB,
  C: VariantC,
  D: VariantD,
};

/**
 * The prototype, standing where the shipped *Stories it holds* card stands: the object's own
 * rows first, then the four cases so a variant can be judged on all of them at once.
 */
export function TheContentsPrototype({
  volumeId,
  carried,
  inALine,
  variant,
}: {
  volumeId: string;
  carried: CarriedStory[];
  inALine: boolean;
  variant: string;
}) {
  const Variant = VARIANTS[variant] ?? VariantA;
  const rows: Row[] = carried.map((story) => ({ story, inALine }));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Stories it holds</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This object holds nothing yet — the four cases below are the whole prototype.
            </p>
          ) : (
            <Variant volumeId={volumeId} rows={rows} />
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className={EYEBROW}>Prototype — the four cases</CardTitle>
        </CardHeader>
        <CardContent>
          {/* The boxes here post the stub ids and would be refused; they are drawn, not used. */}
          <Variant volumeId={volumeId} rows={THE_FOUR_CASES} />
        </CardContent>
      </Card>
    </>
  );
}
