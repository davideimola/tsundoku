import { type Finding, FOUND_KINDS, type FoundKind } from "@/core/queries/finder";

// **What each kind of record is called, and where it lives** — the finder's own derivation,
// beside the screen because it is the screen's (`AGENTS.md`).
//
// Two things are here and neither is the core's. The **words** are the owner's vocabulary
// for the five groups, which is a decision about what to print and would be nonsense inside
// a query the MCP door also calls. The **route** is a fact about this application's URL
// tree, which the core module knows nothing about and must not: `findInTheLibrary` answers
// with a kind and an id, and turning that pair into `/stories/9f2c` is the web door's
// business alone.
//
// It is data in, data out — the licence `vitest.config.ts` states — so it is tested beside
// itself, and what the test is for is the half that fails silently: a kind whose route
// stopped existing is a suggestion the owner presses enter on and lands on a 404. The
// suggestion **list** has no test, deliberately (#25); the table it reads does.

/** One group of the finder's answer: the heading, and the records under it. */
export type FoundGroup = {
  kind: FoundKind;
  /** What the group is called, plural, because a group of one is still a group. */
  heading: string;
  findings: Finding[];
};

/**
 * The owner's word for each kind, and the segment its records are under.
 *
 * *People* rather than *Persons*, and *Credits* is deliberately not the word: the screen
 * under `/credits` is a list of people, and what the owner is looking for here is a person
 * rather than the attribution. *Series* is its own plural, which is why the word is stated
 * per kind rather than derived by adding an `s`.
 */
const KINDS: Readonly<Record<FoundKind, { heading: string; under: string }>> = {
  story: { heading: "Stories", under: "/stories" },
  volume: { heading: "Volumes", under: "/collection" },
  series: { heading: "Series", under: "/series" },
  person: { heading: "People", under: "/credits" },
  path: { heading: "Paths", under: "/paths" },
};

/** Where the record itself is: the screen enter lands on, never a search for it. */
export function recordHref(finding: Pick<Finding, "kind" | "id">): string {
  return `${KINDS[finding.kind].under}/${finding.id}`;
}

/** What the group of a kind is called. */
export function headingFor(kind: FoundKind): string {
  return KINDS[kind].heading;
}

/**
 * The finder's answer, banded by what each record is.
 *
 * **Grouping and not narrowing**, which is the distinction every wall in this application
 * is held to: the query answered with these rows in this order, and this walks them once
 * into the five bands. An empty band is dropped rather than drawn as a heading over
 * nothing — one word rarely reaches all five kinds, and four headings with nothing under
 * them would say less than one.
 *
 * The order is `FOUND_KINDS`, which is the core's, so the owner's screen and the assistant
 * read the library in the same order and neither invents one.
 */
export function groupFindings(findings: readonly Finding[]): FoundGroup[] {
  return FOUND_KINDS.map((kind) => ({
    kind,
    heading: headingFor(kind),
    findings: findings.filter((finding) => finding.kind === kind),
  })).filter((group) => group.findings.length > 0);
}
