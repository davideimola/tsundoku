import { cn } from "@/lib/utils";

// THE RATING, as a bookmark.
//
// A score out of ten was printed as a mono figure — *9.0 / 10* — which is how a spreadsheet
// says it, and on a wall of covers it was a number stuck over somebody's jacket. The owner's
// judgement is the one thing in the library that is entirely theirs, so it is drawn as the
// thing a reader leaves in a book: **a ribbon bookmark**, filled with cloth from the top to
// the score and left soft below it, with the figure beside it in the serif — *9*, *7.5*.
//
// It is an image with a sentence for a name (`role="img"`, *Rated 9 out of 10*), because the
// ribbon is a picture of the figure and the figure is printed beside it: a screen reader is
// given the sentence once, rather than *9* and a shape it cannot see.
//
// Two sizes: `small` beside a row and on a Pass, `large` in a detail page's hero. An absent
// score is not drawn as an empty ribbon — that would be a nought — but said in words where it
// stands (`Unrated`).

/** The ribbon's outline: a strip of cloth with a notch cut in its foot. */
const RIBBON = "[clip-path:polygon(0_0,100%_0,100%_100%,50%_80%,0_100%)]";

/** A score as the owner would say it: *9*, *7.5* — never *9.0*. */
export function scoreSaid(score: number): string {
  return Number.isInteger(score) ? String(score) : String(Math.round(score * 10) / 10);
}

export function RatingMark({
  score,
  size = "small",
  className,
}: {
  /** Out of ten, as the core keeps it. */
  score: number;
  size?: "small" | "large";
  className?: string;
}) {
  const filled = Math.round(Math.min(10, Math.max(0, score)) * 10);
  const said = scoreSaid(score);

  return (
    <span
      role="img"
      aria-label={`Rated ${said} out of 10`}
      className={cn(
        "inline-flex shrink-0 items-center",
        size === "large" ? "gap-2.5" : "gap-1.5",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn("block shrink-0", RIBBON, size === "large" ? "h-11 w-[1.875rem]" : "h-6 w-4")}
        style={{
          background: `linear-gradient(to bottom, var(--cloth-fill) ${filled}%, var(--cloth-soft) ${filled}%)`,
        }}
      />
      <span
        aria-hidden="true"
        className={cn(
          "font-heading font-semibold leading-none tabular-nums",
          size === "large" ? "text-4xl" : "text-xl"
        )}
      >
        {said}
      </span>
    </span>
  );
}

/**
 * What stands where a score would be: the absence said in words, and the act that fills it
 * where the screen has one.
 */
export function Unrated({ rate, className }: { rate?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-sm text-muted-foreground", className)}>
      Not rated yet.{rate ? <> {rate}</> : null}
    </span>
  );
}
