# Covers are hotlinked, and only the owner's own images are hosted

A Volume carries its cover as a **source-identified reference** — which source answered, that
source's own id for the record, the address of the image and the source's own page for the book
— and an `<img>` points at that address. **No third-party image byte is stored anywhere in this
cluster**, in Postgres or in a bucket. The one image this application hosts is one the **owner
made**: a photograph or a scan, which overrides the looked-up cover and is the only thing that
will ever face a Volume with no ISBN.

The lookup is a **verb the owner runs**. Nothing on a page render calls a third party.

## What forced it

The walls are drawn tiles because there was nothing else to draw
([#22](https://github.com/davideimola/tsundoku/issues/22),
[#23](https://github.com/davideimola/tsundoku/issues/23)), and the obvious next move — fetch the
jackets and put them on the shelf — turns out to be governed by one clause and one header.
`docs/research/cover-images-by-isbn.md` measured 54 real Italian-market ISBNs against every
source that permits an unauthenticated probe:

| Source | Bibliographic record | **Cover image** | Key |
|---|---|---|---|
| **Google Books** (Dynamic Links) | 52/54 — 96.3% | **49/54 — 90.7%** | none |
| Open Library Covers | 3/54 — 5.6% | 3/54 — 5.6% | none |
| OPAC SBN / Alphabetica | most | 3/54 — 5.6% | none |
| ISBNdb | unmeasured | unmeasured | $14.99/mo |
| Comic Vine | **not keyed by ISBN at all** | n/a | yes |

The union of the three free sources is 49/54 — **identical to Google Books alone**. So there is
exactly one source that works, and its terms say:

> "Scrape, build databases, or otherwise create permanent copies of such content, or keep cached
> copies longer than permitted by the cache header"
> — [Google APIs Terms of Service](https://developers.google.com/terms) §5.e.1

and the header, measured on their cover CDN, is `cache-control: private, max-age=86400`.
**Downloading and hosting a Google Books cover is a terms breach.** Hotlinking is the only
compliant use of the only source that has the images.

Open Library is the mirror image and points the same way: "*If you want to display covers on
public-facing pages, please use a src URL that points to covers.openlibrary.org*", and "*do not
crawl our cover API*". It asks for exactly what Google forbids, and it is empty for Italian
manga.

## What it decides

**A cover is a fact about the record, not a copy of the content.** `cover_source`,
`cover_reference`, `cover_url`, `cover_info_url` and `cover_looked_up_at` go on the Volume row.
The volume id and the URL are things the source *said*; storing them is what makes one lookup
last the life of the row rather than one per page render.

**Hosting is reserved for the owner's own image.** `own_image_url` is a photograph or a scan the
owner supplies, in the bucket
[ADR-0003](0003-postgres-runs-in-cluster-on-our-own-k3s-with-off-site-backups.md) already
provisions, and it **overrides** the looked-up cover. No third party's terms reach it and no
third party can revoke it, and it is the only escape hatch the fallback chain has.

**Postgres enforces both halves, because a prohibition nobody can violate is better than one
everybody has to remember.** `volume_cover_is_hotlinked_and_never_hosted` refuses a `cover_url`
that is not `https` on `books.google.com` or `covers.openlibrary.org`; `volume_own_image_is_the_owners_own`
refuses an `own_image_url` that *is*. An engineer who downloads the jackets into an S3 bucket
next year meets an integrity violation, not a code review.

**The image element is a plain `<img>` and never `next/image`.** The optimizer would fetch the
bytes onto our own server and cache them there, which is the permanent copy §5.e.1 forbids. The
browser goes to the source and this cluster keeps nothing.

**128 pixels is the ceiling, and the design absorbs it.** Every `zoom` above the one Google
hands over returns a byte-identical "image not available" placeholder, verified across five
volumes. The tile is already shaped like a page (`src/components/cover.tsx`), so a 128px jacket
fills it; anything larger is an owner's photograph and not a parameter.

**A rate limit is never recorded as an absence.** Open Library answers 403 over 100 requests per
IP per five minutes, and the first run of the research this rests on recorded that as "no cover"
and produced a false 0%. So the lookup has *three* answers — found, none, unanswered — and
writes nothing at all for the third.

**A cover that has gone missing is re-looked-up, lazily.** The same verb checks the covers it
already recorded, oldest first, and looks one up again where the address has gone. It is not on
the request path: an `<img>` that 404s in a shop cannot write to a database and must not try
([ADR-0010](0010-javascript-runs-on-the-owner-surface-and-no-write-depends-on-it.md)).

## Consequences

**Roughly one Volume in ten will never have a looked-up cover**, concentrated in Panini /
Planet Manga (78% hit rate, and Panini is 56 of the owner's 96 objects) — and **every Bonelli
monthly, always**, because those albi carry an ISSN-derived periodical EAN and no ISBN at all.
The drawn tile therefore stays the normal case rather than becoming a fallback, and the Series'
tint stays underneath every jacket: a cover covers the tile, it never becomes a precondition
for one.

**The lookup is the owner's door and not the assistant's.** A cover is a field on a record that
already exists, which [ADR-0011](0011-the-inbox-carries-amendments-and-approval-is-bulk.md) puts
behind the Inbox — but an Amendment is a door for a *proposal*, and a lookup proposes nothing: it
asks a source a question with an ISBN and writes the answer down. There is no judgement for the
owner to make between the assistant's word and the record's, which is the whole of what an
Amendment buys. So there is no `covers_look_up` tool on `/mcp`, and adding one would be a
decision for an ADR rather than for a tool file.

**Every viewer's browser tells Google which books are on the wall.** On the private owner
surface that viewer is the owner. On the public page on the roadmap it is everybody, and it is a
privacy cost that should be accepted deliberately rather than discovered.
`referrerPolicy="no-referrer"` withholds the page, not the request.

**Going public adds obligations and changes no source.** Google Books then requires a "Powered by
Google" mark alongside the results and "*a prominent link to … the Google Books page for that
book*" — which is why `cover_info_url` is stored now, from the same response that carries the
thumbnail, rather than fetched again later. Open Library asks only for a courtesy link. OPAC
SBN's images should be dropped entirely there: no licence statement exists to rely on, and they
cover 5.6%.

**The ISBN backfill is the real prerequisite and it is not this decision's.** The 91% is a
ceiling on a column that was empty on all 96 rows, and the ISBNs arrive as Amendments the
assistant proposes and the owner approves in bulk
([#21](https://github.com/davideimola/tsundoku/issues/21),
[#26](https://github.com/davideimola/tsundoku/issues/26),
[#27](https://github.com/davideimola/tsundoku/issues/27)).

## Considered and not taken

- **Download the covers and serve them from our own bucket.** Independence, one origin, no
  third-party beacon, WebP at whatever size the wall wants — and B2 is already provisioned, so
  a few hundred 13 KB JPEGs is a rounding error beside what ADR-0003 already runs. It is a terms
  breach for the only source that actually has the images, which is not a cost to be weighed
  against convenience; and it buys nothing at 128 px, where hosting a small image locally gets
  you a small image with more moving parts.
- **Cache the bytes for 24 hours, which the header permits.** `private` means not in a shared
  cache, so a server-side cache is not what that header licenses at all — and it would be an
  eviction policy and a storage layer built to hold a 13 KB thumbnail for a day.
- **Look a cover up on the render, for whatever is missing.** One page load becomes ninety-six
  requests to Google before the wall paints, on a phone, on a shop's signal. The Collection wall
  exists to be answerable in a shop; this is the one thing that would take that away.
- **Buy ISBNdb ($14.99/mo).** Unmeasured on Italian comics, and Google already reaches 91% for
  nothing. Reopen it with a measurement against the same 54 ISBNs, not with an assumption.
- **Comic Vine, or a publisher scraper.** Comic Vine has no ISBN key at all; and the two
  publishers that dominate this shelf sit behind Queue-it and a Cloudflare challenge, while none
  of the three that do not expose a URL derivable from an ISBN.
- **Store only the Google volume id and rebuild the URL at render time.** It is the same
  hotlink with a template in our code instead of a string the source gave us, and the `zoom`
  parameter it would have to hardcode is undocumented — it appears only inside URLs Google
  itself returns.
