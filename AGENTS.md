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

### Where an MCP tool goes

**One new file in `src/lib/mcp/tools/`, and nothing else.** The directory is the tool
list, so the route handler is never edited and there is no barrel to conflict in.
`src/lib/mcp/README.md` is the contract, including what a tool may not do.

### Where a page goes

**`src/app/(owner)/`, and it calls `requireOwner()` before it reads anything.** The
route group is the owner gate; a page outside it is a page served to anyone with the
URL. `src/app/gated.test.ts` fails when either half stops being true. See the README's
owner gate section.

### Where a screen goes in the shell

**One line in `src/app/(owner)/navigation.ts`, under one of the three questions.** The
shell renders that one map as a sidebar at the desk and as a bottom bar plus *More* on a
phone, so a destination cannot exist at one width and not the other.
`src/app/(owner)/shell.test.ts` fails when a screen in the tree is in no one's
navigation — and when a page takes the width back off the shell by centring itself in a
column.

### Where a colour and a face go

**`src/app/globals.css`, and nowhere else.** Paper, ink, two rules and **one hue**,
declared on both grounds, with every shadcn token an alias over them — and three faces
wired to three roles, the serif reserved for the owner's own prose. A screen names no
colour and picks no family: it spends the tokens. `src/app/palette.test.ts` is the wall,
and it fails when a screen names a colour of its own or when a ground stops being legible.

The mark is `src/components/mark.tsx`, drawn from one geometry that `src/app/icon.svg`
draws again as the favicon; `src/components/mark.test.ts` is what stops the two drifting.

### Where the shelf's colour comes from

**`src/lib/tint.ts`, and it is the one file in `src/` allowed to name a colour.** The chrome
has no accent, so the only colour on screen is the library's: a tint derived from a Series'
identity, the same on every deploy, worn by the spines the walls are laid out as. A screen
spends `tint()` the way it spends a token and names nothing itself — `src/lib/tint.test.ts`
walks every colour the function can produce and holds each one to the palette's own reading
threshold on both grounds, which is what buys the exception the palette wall states.

The tile that wears it is `src/components/spine.tsx`, and it is a spine rather than a
placeholder for a cover: 0 of 96 Volumes carry an ISBN, so this is the normal case.

### Where a filter goes

**In the URL, and in the core query's arguments.** A narrowed wall is a `GET` —
`/stories?type=manga&state=reading` — so it is linkable, survives a refresh and works with
nothing running in the browser (ADR-0010); every control that narrows one is a link, never a
script. **The query takes the filter as an argument**: a page never *narrows* an array it
fetched, because a wall showing four Stories must not have read seventy-seven. Grouping what
came back into bands is the screen's, and that is the whole of the distinction.
`listStoryWall` in `src/core/queries/story.ts` is the pattern, and
`src/app/(owner)/stories/page.tsx` is what reading a filter against the vocabulary looks
like — an unknown value narrows to nothing in the core, and is shown as no filter at all.
