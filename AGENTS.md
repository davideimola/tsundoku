# tsundoku

## Agent skills

### Issue tracker

Issues live as GitHub issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## The application

### Stack and local loop

Next.js, TypeScript, Tailwind, shadcn, biome, vitest, and a Postgres in Docker driven
by one variable. `README.md` has the commands, the migration naming convention and the
testing seam.

### Where code goes

Both doors — the web view and the MCP route handler — are thin adapters over
`src/core`, and neither holds domain logic (ADR-0002). Read `src/core/README.md`
before adding a verb or a query: it says which file yours goes in, and why there is no
barrel index to edit.

### Where a page goes

**`src/app/(owner)/`, and it calls `requireOwner()` before it reads anything.** The
route group is the owner gate; a page outside it is a page served to anyone with the
URL. `src/app/gated.test.ts` fails when either half stops being true. See the README's
owner gate section.
