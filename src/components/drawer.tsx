import Link from "next/link";
import { cn } from "@/lib/utils";

// THE DRAWER: a panel that slides in over the screen to hold a form the owner opened
// deliberately — and **its open state is the URL, not a script** (#32, ADR-0010).
//
// That is the whole design, and it is worth saying why rather than reaching for a dialog
// component. A drawer is ordinarily a client component: state in React, a portal, a focus
// trap, an escape key. This application has a standing rule that no write depends on
// JavaScript, and the screen this drawer is for is the one the owner opens **in a shop, on
// the shop's signal**, to answer *do I already have this?* A form that only exists once a
// bundle has parsed is a form that is not there when it is wanted.
//
// So: the trigger is a `<Link>` to `?panel=…`, the panel is server-rendered when that
// parameter is present, and every way out of it is a link back. With nothing running in the
// browser it is a page that navigates and comes back with the form open. With a script it is
// a client-side navigation, which is to say it is instant and looks exactly like a drawer.
// Nothing is a scripted half with an unscripted twin here — **there is one implementation and
// it needs no script at all**, which is a stronger claim than the finder's and is only
// available because a drawer's state is genuinely one bit of navigation.
//
// Three things follow, and each is a property the scripted version would have had to earn:
// the open drawer is **linkable** (`/collection?panel=catalogue` is a bookmark for *add a
// book*), it **survives a refresh**, and the back button closes it because closing it is what
// going back means.
//
// What it does not have is a focus trap and an escape key. `<Escape>` is the browser's back
// gesture away and the close is the first thing in the panel, which is the honest trade for a
// panel that exists at all with no script running.

/**
 * A panel over the screen, open because the URL says so.
 *
 * `closesTo` is where every way out leads — the screen's own address with no panel on it.
 * It is passed rather than derived because this component knows nothing about which screen
 * it is standing on, and a drawer that guessed its way home would be a drawer that took the
 * owner's search filters off on the way.
 *
 * `refused` is **a verb's own prose about the press that just happened, and it belongs in
 * here** (#30). A refused write comes back with its panel open, because the sentence is only
 * useful beside the field it is about — and this panel covers the screen, so a banner left on
 * the page behind it is a refusal the owner cannot read. A screen that shows one here shows it
 * nowhere else: one refusal, in one place, and that place is wherever the owner is looking.
 */
export function Drawer({
  title,
  description,
  refused,
  closesTo,
  children,
}: {
  title: string;
  description?: string;
  refused?: string;
  closesTo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50">
      {/* The ground behind, dimmed — and it is a link, because tapping away from a panel is
          how a panel is closed everywhere else. It carries no accessible name of its own:
          the close button below is the one a screen reader should find, and two controls
          saying *close* is one more than there is to say. */}
      <Link
        href={closesTo}
        aria-hidden
        tabIndex={-1}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />

      {/* From the bottom on a phone, from the right at the desk — the two edges a thumb and
          a pointer respectively come from. Capped at the height of the window and scrolling
          inside itself, because the forms in here are taller than a phone. */}
      <section
        aria-label={title}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-2xl bg-background ring-1 ring-foreground/10",
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[30rem] sm:rounded-none sm:rounded-l-2xl",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:sm:slide-in-from-right motion-safe:duration-200"
        )}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="font-heading text-lg">{title}</h2>
            {description ? (
              <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>

          {/* A link and not a button, so it works with nothing running and so the panel has
              exactly one way of closing rather than two that could disagree. */}
          <Link
            href={closesTo}
            className="-mr-1.5 -mt-1 shrink-0 rounded-lg px-2 py-1 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Close
          </Link>
        </header>

        <div className="px-5 py-5">
          {refused ? (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {refused}
            </p>
          ) : null}
          {children}
        </div>
      </section>
    </div>
  );
}

/**
 * The thing that opens one: a link dressed as a button.
 *
 * It is a `<Link>` rather than a `<button>` on purpose — what it does is go somewhere, and a
 * button that navigates is a button that does nothing when the script has not arrived. The
 * height is the shell's own tap target, because these sit in a hero the owner reaches for
 * one-handed.
 */
export function OpensDrawer({
  href,
  children,
  emphasis = "quiet",
}: {
  href: string;
  children: React.ReactNode;
  /** `loud` for the one act a screen is mostly opened to perform; `quiet` for the rest. */
  emphasis?: "loud" | "quiet";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:h-10",
        emphasis === "loud"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "ring-1 ring-foreground/15 hover:bg-muted"
      )}
    >
      {children}
    </Link>
  );
}

/**
 * **One act, two doors** — a loud trigger with a glyph-sized second one flush against it.
 *
 * It exists because the Collection grew a fourth control and stopped fitting on a phone (#33).
 * Four triggers in a wrapping row is what a screen looks like when it has stopped asking which
 * of them are *peers*: on that hero, *Catalogue a Volume* and *From an ISBN* were never two
 * acts — they are the same act reached by typing or by pointing a camera at the object — while
 * the other two were a figure and a housekeeping run wearing the same pill as the screen's
 * primary verb.
 *
 * So the two doors onto one act become one control, and the two that are not acts stop being
 * buttons at all. On a phone this is full width and the segment is a 48-pixel target beside a
 * label; at a desk it is the same shape, inline.
 *
 * `second.label` is the accessible name and the tooltip, because that door carries a glyph and
 * a glyph is not a name.
 */
export function OpensTwoDrawers({
  href,
  children,
  second,
}: {
  href: string;
  children: React.ReactNode;
  second: { href: string; label: string; glyph: React.ReactNode };
}) {
  const loud = "bg-primary text-primary-foreground transition-colors hover:bg-primary/90";

  return (
    <div className="inline-flex w-full overflow-hidden rounded-lg sm:w-auto">
      <Link
        href={href}
        className={cn(
          "flex h-11 flex-1 items-center justify-center px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:h-10",
          loud
        )}
      >
        {children}
      </Link>

      {/* The seam, in the label's own ink at a quarter: two doors have to read as two, and a
          gap would have let the ground through and made them two buttons again. */}
      <span aria-hidden className="w-px shrink-0 bg-primary-foreground/25" />

      <Link
        href={second.href}
        aria-label={second.label}
        title={second.label}
        className={cn(
          "flex h-11 w-12 shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:h-10",
          loud
        )}
      >
        {second.glyph}
      </Link>
    </div>
  );
}
