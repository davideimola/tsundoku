# The project instructions

What the owner pastes into an assistant's project so that it reads the library the way the
library means to be read. This app holds no recommender (ADR-0002): the assistant the owner
already pays for is the recommender, and these two documents are the only place its behaviour
is written down.

- [`comics-and-manga.md`](comics-and-manga.md) — the *Comics & Manga* project: Manga, Comic
  and Graphic Novel.
- [`books-and-reading.md`](books-and-reading.md) — the *Biblioteca & Letture* project: Novel
  and Non-fiction.

**Two projects over one library, not two libraries.** One model covers everything the owner
reads and a **Type** attribute is the whole of the difference (ADR-0006), so both documents
speak the same vocabulary and cross the same write boundary; what changes is the lens, and the
questions each lens is actually asked — completeness, editions and what is already on the
shelf on one side; routes, reading order and what can be started tonight on the other.

## Using one

Copy the whole file, `#` heading included, into the project's custom instructions, and connect
the assistant to `/mcp` — the root [`README.md`](../../README.md#pointing-an-assistant-at-it)
has the Claude Code command and the custom connector settings. Both files stay **under 8000
characters**, which is the limit the projects impose; check with `wc -m` before committing an
edit, because there is roughly half a page of room and no warning when it runs out.

## Editing one

The vocabulary in these files is [`CONTEXT.md`](../../CONTEXT.md) said shorter, and the rules
about writing are [ADR-0005](../adr/0005-the-mcp-runs-verbs-directly-and-creates-entities-only-through-the-inbox.md)
said in the second person. **When the model changes, they change**: a new Type, a Binding
nobody had met, a fourth entity behind the Inbox. What does *not* belong here is anything a
tool description already says — the door carries its own prose for the assistant to read
(`src/lib/mcp/README.md`, rule 4), and duplicating it here is how the two drift apart. These
files say what the owner wants an assistant to *do*; the tools say what each answer *is*.
