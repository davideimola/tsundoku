import Link from "next/link";
import { cn } from "@/lib/utils";

// **HOW A WALL IS NARROWED**, and it is a component rather than two copies of six class names
// because two screens narrow by the same axis now: the Story wall by Type and state, and the
// Pile by Type (#64). One control, so the same act cannot come to look like two — a chip that
// is on here and a chip that is on there have to be the same chip, or the owner learns that
// the two screens are different things.
//
// **A link and never a control that needs a script**, which is the pattern every wall after
// #18 follows: a narrowed wall is a `GET`, so it is linkable, survives a refresh and works
// with nothing running in the browser (ADR-0010). What the address is belongs to the screen —
// its parameters are its own — so this takes one and never builds one.

/**
 * One axis of a narrowing: what it is called, and the values it offers.
 *
 * The label is the width of the chips' own gutter, so two axes on one screen line their values
 * up in a column rather than starting wherever their names end.
 */
export function Axis({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="w-11 shrink-0 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * One value of one axis, as a link.
 *
 * The one that is on is marked for the eye and with `aria-current`, and it still leads
 * somewhere — to itself — because a chip that stopped being clickable when it was chosen would
 * be a target that moves under the thumb.
 */
export function Chip({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className={cn(
        "rounded-full border px-2.5 py-1 font-mono text-eyebrow uppercase tracking-eyebrow transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on
          ? "border-foreground bg-accent text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
