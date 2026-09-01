// **How the Credit screens say a set of roles**, and the one reason it is a file: three
// places say it — the people on `/credits`, one person's Stories on `/credits/[id]`, and the
// row under the name field the picker fills (#28) — and the picker's row is drawn on the
// server precisely so that it says the same thing as the other two (`./suggestion.ts` claims
// exactly that). Three copies of one separator is that claim going quietly untrue.
//
// A screen's own derivation, in the terms `vitest.config.ts` licenses: data in, data out, a
// function this application would still have if React were replaced — so it is tested beside
// itself and it is not a helper of any one page.
//
// Nothing imported: it is reached from server components and from a Server Function, so it may
// not reach `@/core` (which is `server-only`), and it takes the little of a role it needs
// rather than the type — a role is a data row (ADR-0006), and this only ever reads its name.

/**
 * Roles said in one line — *Writer · Artist* — in the order they arrive, which is the order a
 * comic is credited in.
 *
 * A vocabulary rather than prose, which is why the separator is a middle dot and not a comma:
 * every screen that spends this sets it in mono caps. No roles at all is the empty string,
 * because a person with none is somebody nothing credits and the line has nothing to say.
 */
export function rolesSaid(roles: readonly { name: string }[]): string {
  return roles.map((role) => role.name).join(" · ");
}
