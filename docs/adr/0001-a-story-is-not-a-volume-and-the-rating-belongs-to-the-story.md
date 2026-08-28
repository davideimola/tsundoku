# A story is not a volume, and the rating belongs to the story

Every tool in this space, the owner's own spreadsheets included, hangs the rating off the
object you bought. Two cases in the owner's actual collection break that: *L'uomo che ride*
is **one volume holding three stories** he reviewed separately, and *Slam Dunk* is **one
story across twenty volumes** he would never rate one by one. So **Story** and **Volume**
are separate entities in a **many-to-many** relation, and the **Rating** hangs off the
Story. A Volume carries only an **Edition note** — a judgement of the object (print
quality, translation, value for money) that decides what to buy and never feeds
recommendation.

The granularity of a Story is the owner's choice case by case, which is what lets the same
model hold *Gotham Noir* and *Slam Dunk*.

## Consequences

- Migration turns each volume-level rating in the spreadsheets into a Story rating. The
  two scales in use — 1–10 in half points for comics, 1–5 for books — unify on **1–10 in
  half points**, and a score converted from the coarser scale carries its **Provenance**
  so the recommender can weigh it accordingly.
- A Story may have **no Volume at all** (read digitally, borrowed, or known only from
  Goodreads history), so nothing may assume a story is reachable from an object.
