// **What a found record looks like**, and the one reason it is a component rather than the
// six class names written twice: the suggestion list under the field and the `/find` screen
// behind it have to be recognisably the same rows. They are the scripted and unscripted
// halves of one control (ADR-0010), so a drift between them — a qualifier that is quiet in
// one place and loud in the other — is the owner learning that the two are different
// things.
//
// It is the *inside* of a row and not the row, because the two do differ in what wraps it:
// the screen's is an ordinary link, the list's is an `option` in a `listbox` carrying a
// highlight, `aria-selected` and a mouse that must not take the focus. What is shared is
// exactly what is drawn.
//
// No directive, and nothing imported: this file is reached from a client component and from
// a server one, so it may reach neither `@/core` (which is `server-only`) nor a hook.

/** The name of a record, and the one word that tells it from another of the same name. */
export function FoundRow({ name, qualifier }: { name: string; qualifier: string | null }) {
  return (
    <>
      <span className="min-w-0 truncate text-foreground">{name}</span>
      {qualifier === null ? null : (
        <span className="shrink-0 font-mono text-eyebrow uppercase tracking-eyebrow">
          {qualifier}
        </span>
      )}
    </>
  );
}

/** The shape a row is drawn in, spent by both halves so the two cannot drift apart. */
export const ROW = "flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm";
