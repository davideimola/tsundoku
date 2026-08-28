# One model for reading, and other collections are a second context

One model covers manga, comics, graphic novels, novels and non-fiction, separated only by a
**Type** attribute — the owner's two spreadsheets had built the same structure twice, down
to duplicating the reading-paths tab. Non-reading collections (board games were named as a
possibility) are **deliberately out of this model**: they would arrive as a **second
bounded context** with its own glossary, listed from a root `CONTEXT-MAP.md`, never by
widening this one.

Generalising now — a neutral word for Volume, an optional Story — would cost Story,
Reading, Series and rating-on-story, which is everything that makes this model good at
reading, in exchange for a use case the owner put out of focus.

## Consequences

- **Type is stored as data, not as an enum in code.** It costs nothing and it is the one
  cheap thing that keeps the door open.
