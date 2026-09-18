# The project instructions

What the owner pastes into an assistant's project so that it reads the library the way the
library means to be read. This app holds no recommender (ADR-0002): the assistant the owner
already pays for is the recommender, and these three documents are the only place its behaviour
is written down.

- [`comics-and-manga.md`](comics-and-manga.md) — the *Comics & Manga* project: Manga, Comic
  and Graphic Novel.
- [`books-and-reading.md`](books-and-reading.md) — the *Biblioteca & Letture* project: Novel
  and Non-fiction.
- [`videogames.md`](videogames.md) — the *Videogiochi* project: Videogame.

**Three projects over one library, not three libraries.** One model covers everything the owner
goes through and a **Type** attribute is the whole of the difference (ADR-0006), so all three
documents speak the same vocabulary and cross the same write boundary; what changes is the lens,
and the questions each lens is actually asked — completeness, editions and what is already on
the shelf on the first; routes, reading order and what can be started tonight on the second.

**The third one is the lens with no object behind it**, and that is why it is a document rather
than a paragraph in the other two. A videogame is a Story by the same test a manga is (ADR-0021)
and carries no Volume at all, so half of what the printed projects say — the Collection, the
Series ledger, a Wish, what a shop costs — is not narrowed for it, it is **absent**, and an
assistant handed the comics instructions goes looking on a shelf for something that was never
there. What replaces it is the **Want** and the **Path**: the two sources the Pile has left when
nothing is carried by an object, and the only way a saga is held together.

## Using one

Copy the whole file, `#` heading included, into the project's custom instructions, and connect
the assistant to `/mcp` — the root [`README.md`](../../README.md#pointing-an-assistant-at-it)
has the Claude Code command and the custom connector settings. A file has to stay **under 8000
characters**, which is the limit the projects impose; check with `wc -m` before committing an
edit, because there is no warning when it runs out.

**Two of these three are over it and want trimming** — `comics-and-manga.md` is at ~8900 and
`books-and-reading.md` at ~8500, both from before this was checked. `videogames.md` is under,
and the room left is about a line.

**Each file is self-contained, and that is a hard rule rather than a style.** What is pasted is
**only that one file**: the assistant is not handed this repository and cannot open anything
these documents point at. So a file may name a **tool** — the assistant has those — and it may
name the other **projects**, so a question can be redirected. It may **not** cite an ADR, a
migration, `CONTEXT.md`, a path under `src/`, an issue number or this README: every one of those
reads as evidence the assistant is expected to go and check, and it is evidence it cannot reach.
An argument worth making inside a project file is one worth **making there, in full**, rather
than referred to. This directory is where the pointers live; the files in it carry none.

## Editing one

The vocabulary in these files is [`CONTEXT.md`](../../CONTEXT.md) said shorter, and the rules
about writing are [ADR-0005](../adr/0005-the-mcp-runs-verbs-directly-and-creates-entities-only-through-the-inbox.md)
said in the second person. **When the model changes, they change**: a new Type, a Binding
nobody had met, a console the owner bought, a fourth entity behind the Inbox. What does *not*
belong here is anything a tool description already says — the door carries its own prose for the assistant to read
(`src/lib/mcp/README.md`, rule 4), and duplicating it here is how the two drift apart. These
files say what the owner wants an assistant to *do*; the tools say what each answer *is*.
