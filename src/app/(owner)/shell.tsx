"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { signOutOwner } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import {
  BEHIND_MORE,
  currentDestination,
  type Destination,
  NAVIGATION,
  ON_THE_BAR,
} from "./navigation";

// THE SHELL. Every screen in the group is rendered inside it, which is the whole of what
// this file is for: before it there was no `<nav>` anywhere in the project, the nine
// screens were linked from the home page alone, and every one of them was a dead end left
// to the browser's back button.
//
// **Two shapes of the same map** (`./navigation`), and no third one: a persistent sidebar
// at the desk, and a bottom bar on a phone carrying the four destinations worth opening
// away from it. The map is shared so the two cannot disagree about what exists; the
// *shapes* differ because the postures do — a mouse at a desk reaches anywhere, a thumb on
// a phone reaches the bottom of the screen and little else.
//
// The two swap at `lg` (1024px) and not sooner: the sidebar costs 15rem, and a tablet in
// portrait would rather spend that on the library and reach the bar with a thumb it
// already has on the glass.
//
// It is a client component, which ADR-0010 allows and which nothing here abuses: the only
// thing it wants from the browser is `usePathname()`, so that the navigation can say where
// the owner is without them reading the URL. It renders on the server like everything
// else, so that answer is already in the HTML — and the one form in here is a plain POST
// to a Server Function, so no write depends on a script arriving.

/** The house's focus ring, the same one the links inside the screens carry. */
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const here = currentDestination(pathname);

  return (
    <>
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Desk here={here} />
        <div className="min-w-0">
          <PhoneChrome />
          {/* Room for the bar the phone floats over its own content. */}
          <div className="pb-24 lg:pb-0">{children}</div>
        </div>
      </div>
      {/* Keyed on the path so that following a link out of *More* leaves it shut: a
          client-side navigation keeps the DOM, and a `<details>` nobody remounts would
          still be hanging open over the next screen. */}
      <Phone key={pathname} here={here} />
    </>
  );
}

/**
 * The desk. A sidebar that is always there, grouped into the three questions and labelled
 * with them, because at this width there is room to name a group and the owner meets all
 * nine destinations at once.
 */
function Desk({ here }: { here: string | undefined }) {
  return (
    <nav
      aria-label="Sections"
      className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex"
    >
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground",
          FOCUS
        )}
      >
        <Mark className="size-5 shrink-0 text-foreground" />
        tsundoku
      </Link>

      <div className="mt-8 flex-1 space-y-7 overflow-y-auto">
        {NAVIGATION.map((section) => (
          <div key={section.title}>
            <h2 className="px-2 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
              {section.title}
            </h2>
            <ul className="mt-1.5">
              {section.destinations.map((destination) => (
                <li key={destination.href}>
                  <Row destination={destination} here={here} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <SignOut className="mt-6 border-t border-sidebar-border pt-3" />
    </nav>
  );
}

/**
 * The phone's chrome above the fold: the mark, and the application's name, linking home.
 *
 * It is a strip and not a bar of controls. The navigation on a phone lives at the bottom
 * where a thumb is, and the only thing this carries is the one affordance that has to be
 * at the top of a page rather than the bottom of it — the way back to the front of the
 * application, which is also the mark.
 */
function PhoneChrome() {
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background lg:hidden">
      <Link
        href="/"
        className={cn(
          "flex h-12 items-center gap-2.5 px-5 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground sm:px-8",
          FOCUS
        )}
      >
        <Mark className="size-5 shrink-0 text-foreground" />
        tsundoku
      </Link>
    </div>
  );
}

/**
 * The phone. Four destinations and a fifth tab, fixed to the bottom of the window and
 * inside the reach of one thumb.
 *
 * The four are the ones worth opening away from the desk — which destination carries which
 * is argued for in `./navigation` — and the rest are one tap behind the fifth, which is a
 * plain `<details>`: it opens with nothing running in the browser, which is what a screen
 * used on a shop's signal needs (ADR-0010), and it costs no state, no listener and no
 * dependency.
 *
 * No icons, because #19 bought none and a glyph invented for *Wishes* would have to be
 * learned. What marks the destination the owner is on is a rule above its name — the same
 * hairline the rest of the application is drawn with, at full ink.
 */
function Phone({ here }: { here: string | undefined }) {
  // The one thing the fifth tab needs to know: whether the owner is on a screen it holds.
  // It answers both what the tab is called and whether it is marked, so it is looked up
  // once rather than asked twice in two ways.
  const beyond = BEHIND_MORE.flatMap((section) => section.destinations).find(
    ({ href }) => href === here
  );

  // *More* while the owner is on one of the four, and the **name of the screen they are
  // on** while they are behind it: the criterion is that the section is legible without
  // reading the URL, and a bar that said *More* on Stories would be telling them where
  // they are not. Opening it is the same tap either way.
  const fifth = beyond?.label ?? "More";

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex items-stretch">
        {ON_THE_BAR.map((destination) => (
          <li key={destination.href} className="min-w-0 flex-1">
            <Tab destination={destination} here={here} />
          </li>
        ))}

        <li className="min-w-0 flex-1">
          <details className="relative">
            <summary
              className={cn(
                "flex h-14 cursor-pointer list-none flex-col items-center justify-center gap-1.5 px-1 text-center text-eyebrow [&::-webkit-details-marker]:hidden",
                beyond ? "text-foreground" : "text-muted-foreground",
                FOCUS
              )}
            >
              <Rule on={beyond !== undefined} />
              {fifth}
            </summary>

            {/* Opening upwards from the right edge, which is the tap that opened it and
                the one place on a phone where there is room above. Anchored by `right`
                alone: the panel is wider than the fifth of the bar it hangs off, so
                giving it a left edge as well would over-constrain it and send it off the
                side of the window. */}
            <div className="absolute bottom-full right-1 mb-2 w-44 rounded-lg border border-border bg-popover p-2 shadow-lg">
              {BEHIND_MORE.map((section) => (
                <div key={section.title} className="mb-2 last:mb-0">
                  <h2 className="px-2 py-1 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                    {section.title}
                  </h2>
                  <ul>
                    {section.destinations.map((destination) => (
                      <li key={destination.href}>
                        <Row destination={destination} here={here} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <SignOut className="border-t border-border pt-1" />
            </div>
          </details>
        </li>
      </ul>
    </nav>
  );
}

/**
 * A destination as a row, which is the shape it takes in both places that list them: the
 * sidebar at the desk, and the panel the phone's fifth tab opens. One component because
 * they are one thing — the same word, the same mark of being where the owner is, and the
 * same `aria-current` — rather than two that happen to look alike today.
 *
 * The quiet accent is the shadcn token rather than the sidebar's own, because the two are
 * aliases of the same `--paper-quiet` (`src/app/globals.css`) and spending the general one
 * is what lets a single component stand in both surfaces.
 */
function Row({ destination, here }: { destination: Destination; here: string | undefined }) {
  const current = here === destination.href;

  return (
    <Link
      href={destination.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "block rounded-md px-2 py-1.5 text-sm transition-colors",
        current
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        FOCUS
      )}
    >
      {destination.label}
    </Link>
  );
}

/**
 * A destination as one of the phone's five tabs: a rule, then the name, centred in its
 * fifth of the bar and tall enough to be hit without aiming. A different anatomy from a
 * row rather than a variant of one, which is why it is its own component.
 */
function Tab({ destination, here }: { destination: Destination; here: string | undefined }) {
  const current = here === destination.href;

  return (
    <Link
      href={destination.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex h-14 flex-col items-center justify-center gap-1.5 px-1 text-center text-eyebrow",
        current ? "text-foreground" : "text-muted-foreground",
        FOCUS
      )}
    >
      <Rule on={current} />
      {destination.label}
    </Link>
  );
}

/** The mark above a name in the bottom bar: a hairline, at full ink where the owner is. */
function Rule({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("h-0.5 w-5 rounded-full", on ? "bg-foreground" : "bg-transparent")}
    />
  );
}

/**
 * The way out, still deliberately quiet and still at the foot of things: with a 90-day
 * session a stray tap on a phone costs a round trip to Google. It has moved from the end
 * of every page into the chrome — the foot of the sidebar, and the foot of *More* — which
 * is reachable from every screen instead of only from the bottom of one, and which on the
 * phone is now behind a tap it was not behind before.
 *
 * It earns its place because ending the session is the only way out of a cookie issued to
 * an address that is no longer the owner's.
 */
function SignOut({ className }: { className?: string }) {
  return (
    <form action={signOutOwner} className={className}>
      <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
        Sign out
      </Button>
    </form>
  );
}
