# Cover images by ISBN

**Researched:** 2026-08-30/31 · Question: where do we get cover images for volumes, keyed by ISBN, and what is the *real* coverage on manga and comics published in Italy (Star Comics, Panini / Planet Manga, J-POP, Bao Publishing, Sergio Bonelli Editore)? A recommendation is made at the end.

## How to read this

- Every claim is traced to the vendor's own docs, its own terms page, or to an endpoint this session actually called. Where a fact came from a live probe rather than a document, the probe is written out so it can be re-run.
- **The coverage numbers here are measured, not quoted.** 54 real Italian-market ISBNs were sourced from primary catalogues, then every source that permits an unauthenticated probe was called once per ISBN. The commands are in §6 and the raw per-ISBN table is in §7.
- The licence question is asked **twice** for every source: once for the private single-owner app that exists today, once for the public unauthenticated page that is on the roadmap. These answers diverge sharply, and where they do it is stated in the source's own words.
- Prices, quotas and headers are as observed on **2026-08-30/31** — record them next to the citation, since they move.
- One probe in this session was wrong before it was right: the first Open Library run recorded HTTP 403 (rate-limited) as "no cover" and produced a false 0%. The corrected method distinguishes 302/404/403 explicitly. Any re-run must do the same.

---

## Answer

**Google Books is the only source that works, and it works far better than expected — but it hands you one 128-pixel-wide image and a licence that forbids you to keep it.**

On 54 real Italian comics ISBNs spanning all five publishers, **Google Books returned a genuine cover for 49 (91%)** and had a bibliographic record for 52 (96%). **Open Library returned a cover for 3 (5.6%)** — the same 3 for which it had any record at all, all three Bao Publishing graphic novels, and *zero* manga from any publisher. **OPAC SBN / Alphabetica, Italy's own legal-deposit catalogue, returned a cover for the same 3 (5.6%)**. A control set of six mainstream Italian trade novels scored 4/6 on both Open Library and SBN, which proves the failure is specific to comics rather than to Italy or to the probe.

Three things complicate the win. First, **the Google Books v1 REST API is now unusable without a key**: keyless requests are refused with HTTP 429 and `"quota_limit_value": "0"`. The working path is the older, still-documented, still-keyless *Dynamic Links* endpoint at `books.google.com/books?jscmd=viewapi`. Second, **128×195 is the only resolution that exists** for these records — every larger `zoom` value returns a byte-identical "image not available" placeholder, verified across five separate volumes. Third, and decisively for hosting: Google's cover CDN sends `cache-control: private, max-age=86400`, and the Google APIs ToS §5.e.1 forbids you to "*Scrape, build databases, or otherwise create permanent copies of such content, or keep cached copies longer than permitted by the cache header*". **Downloading and hosting Google Books covers is a terms breach.** Hotlinking is the only compliant use, and on a public page the Books branding guidelines add that "*the 'powered by Google' graphic must always be displayed alongside any search modules or results*" and that "*Every book result displayed in your application must have a prominent link to ... the Google Books page for that book*".

Open Library is the mirror image: it permits — indeed asks for — exactly what Google forbids ("*If you want to display covers on public-facing pages, please use a src URL that points to covers.openlibrary.org*"), with only "*a courtesy link back*" appreciated rather than required. It is simply empty for Italian manga.

Two more findings the cover-wall design has to absorb. **Bonelli's monthly albi have no ISBN at all** — verified on the publisher's own product pages, which carry `977112365904850039`, an ISSN-derived periodical EAN, not an ISBN. Nothing keyed by ISBN will ever find them. And **the owner's database currently holds 96 volumes and zero ISBNs** (`select count(*), count(isbn) from volume` → `96 | 0`); neither spreadsheet the importer reads has an ISBN column. The 91% is therefore a ceiling on a column that does not yet have a single value in it — populating ISBNs is the prerequisite work, not the cover lookup.

---

## 1. The sample, and why it is what it is

**The owner's own ISBNs could not be used, because there are none.** The database was up (`tsundoku-pg-55400`, `postgres:18-alpine`, port 55400) and was queried read-only:

```
$ psql -h 127.0.0.1 -p 55400 -U tsundoku -d tsundoku \
    -c "select count(*) total, count(isbn) with_isbn from volume;"
 total | with_isbn
-------+-----------
    96 |         0
```

`volume.isbn` is nullable `text` with a check constraint accepting 10- or 13-character forms (`db/schema.ts:177,195`). Every one of the 96 rows is null. The two source spreadsheets (`db/import/sheets/collezione-collezione.csv`, `biblioteca-biblioteca.csv`) have no ISBN column either — the collection sheet's headers are `Titolo, Serie / Universo, Tipo, Volume, Editore / Edizione, Lingua, Formato, …`. So the ISBN is not merely unimported; it was never recorded.

The next-most-honest sample was therefore built by taking **the owner's actual titles and publishers** and sourcing their real ISBNs from primary catalogues, then topping up the publishers his shelf does not cover (Star Comics, Bao, Bonelli). The 96 rows break down as: Panini / Planet Manga 56 (including Shinsōban, Ultimate Deluxe, Black Edition lines), Marvel/DC via Panini 13, J-POP / Edizioni BD 13, other 14 — so the sample is weighted the same way.

**ISBNs were sourced independently of the sources under test**, which matters: sampling ISBNs *from* Google Books would guarantee Google Books a 100% hit rate. Two primary sources were used:

- **Publisher product pages** — Star Comics `/fumetto/<slug>` pages carry `Codice ISBN: <strong>9788822667915</strong>` in the HTML; Bao's WooCommerce pages carry `<strong>ISBN: </strong>978-88-6543-254-9`; Bonelli's carry the EAN or ISBN in the product schema.
- **OPAC SBN**, via its own site's XHR endpoint (§5), searching by title and publisher and reading the ISBN out of the record detail.

Final sample: **54 ISBNs, all checksum-valid**, across Planet Manga (18), Star Comics (15), J-POP (9), Bao Publishing (5), Sergio Bonelli Editore (4), Panini Marvel/DC (3). It mixes long-running series (One Piece 100–102, Detective Conan 100–102, Slam Dunk, Naruto, Berserk, Death Note), recent releases (Kaiju No. 8, Oshi no Ko, Chainsaw-era J-POP), art books and guides, Bao graphic novels, and Bonelli bookshop volumes.

**Two publishers resisted scraping entirely, which is itself worth recording:** `panini.it`'s shop sits behind a Queue-it waiting room (every request 302s to a `queueittoken` URL), and `jpop.it` sits behind a Cloudflare browser challenge (`<title>Checking your browser...</title>`). Neither is usable as an automated data source.

---

## 2. Open Library Covers API

**Query by ISBN.** `https://covers.openlibrary.org/b/$key/$value-$size.jpg`, where "*`key` can be any one of ISBN, OCLC, LCCN, OLID and ID (case-insensitive)*" and "*`size` can be one of S, M and L*" ([Covers API](https://openlibrary.org/dev/docs/api/covers), 2026-08-30). Worked example, a Bao volume that *is* present:

```
$ curl -sI "https://covers.openlibrary.org/b/isbn/9788865432549-L.jpg?default=false"
HTTP/2 302
location: https://archive.org/download/l_covers_0010/l_covers_0010_87.zip/0010870361-L.jpg
```

Following the redirects lands on `ia800404.us.archive.org` and yields a 48,806-byte JPEG. **The images are served out of Internet Archive item zips, not from an Open Library store of its own** — relevant to §2's licence question.

The 404-vs-blank distinction the brief asks about is documented and real: "*By default it returns a blank image if the cover cannot be found. If you append `?default=false` to the end of the URL, then it returns a 404 instead.*" Every probe here used `?default=false`, and the raw status was recorded so that **403 (rate-limited) is never collapsed into 404 (no cover)** — the trap that produced a false 0% on the first run.

To separate "no cover" from "no record at all", a second call was made per ISBN to `https://openlibrary.org/api/books?bibkeys=ISBN:<isbn>&format=json&jscmd=data`, which returns literally `{}` when Open Library holds no edition.

**Formats and resolutions.** JPEG in three sizes, S/M/L, with no pixel dimensions documented — "*S: Small, suitable for use as a thumbnail …, M: Medium, suitable for display on a details page …, L: Large*". The one Italian comic that resolved returned a 48 KB L-size JPEG.

**Rate limit, no key.** No API key is mentioned anywhere. The limit is explicit: "*The cover access by ids other than CoverID and OLID are rate-limited. Currently only 100 requests/IP are allowed for every 5 minutes. If any IP tries to access more that the allowed limit, the service will return "403 Forbidden" status.*" The general API docs add "*Default (non-identified requests): 1 request per second*" and "*Identified requests (with User-Agent and email): 3 requests per second*" ([APIs overview](https://openlibrary.org/developers/api)). Note the ISBN-keyed cover path is the *slow* path; Cover ID and OLID are not rate-limited.

**Licence — private app: permitted. Public page: permitted, and explicitly encouraged.** This is the most permissive source found, and it says so directly:

> "If you want to display covers on public-facing pages, please use a src URL that points to covers.openlibrary.org."
> "The covers API is intended for displaying covers on public facing websites and not for bulk download."
> "A courtesy link back to Open Library is appreciated, whether it be on each individual book's page … or on your About page or in your footer."
> "Please, do not crawl our cover API. If you do, we may decide to block your crawl."
> — [Covers API](https://openlibrary.org/dev/docs/api/covers)

So: **hotlink yes, on a public page, by explicit invitation. Bulk-download-and-host no** — that is what "do not crawl" and "not for bulk download" rule out, with the sanctioned alternative being the archive.org bulk dumps rather than a crawl. Attribution is "appreciated", not required — the only source here that does not make a link-back mandatory.

One caveat the licensing page does not resolve. Open Library says "*The Internet Archive does not assert any new copyright or other proprietary rights over any of the material in the Open Library database*" ([Licensing](https://openlibrary.org/developers/licensing)) — a disclaimer of *their* rights, not a grant of the underlying publisher's. Since the covers are redirects into Internet Archive scans, a public page is relying on the Archive's own position on those images, not on a licence Open Library has given.

**Coverage: 3/54 (5.6%).** All three are Bao Publishing. **Zero manga, from any of the four manga publishers.** Open Library had no bibliographic record whatsoever for 51 of 54 — this is not "record exists but no cover", it is "the book is not in Open Library".

---

## 3. Google Books

### 3a. The v1 REST API is closed to keyless callers

`https://www.googleapis.com/books/v1/volumes?q=isbn:<isbn>` is the documented path, and "*isbn: Returns results where the text following this keyword is the ISBN number*" ([Using the API](https://developers.google.com/books/docs/v1/using)). Keyless, it now fails outright:

```
$ curl -s "https://www.googleapis.com/books/v1/volumes?q=isbn:9788822632753"
{"error":{"code":429,"message":"Quota exceeded for quota metric 'Queries' and limit
 'Queries per day' of service 'books.googleapis.com' …
 "quota_limit": "defaultPerDayPerProject", "quota_limit_value": "0" …}}
```

`"quota_limit_value": "0"` is unambiguous: **the anonymous per-day quota for the Books API is zero.** This matches the docs — "*If the request doesn't require authorization (such as a request for public data), then the application must provide either the API key or an OAuth 2.0 token*". Adding `&country=IT` does not help. Retried across a day boundary, same result. The v1 API therefore could not be used for the coverage measurement, and would need a Google Cloud project and key in production.

### 3b. Dynamic Links is the keyless path, and it still works

The older *Dynamic Links* endpoint (formerly the Book Viewability API) is separately documented and explicitly needs nothing: "*No API key or other authorization is needed to use dynamic links*" ([Dynamic Links](https://developers.google.com/books/docs/dynamic-links)). Request shape and worked example:

```
$ curl -s "https://books.google.com/books?bibkeys=ISBN:9788822632753&jscmd=viewapi&callback=x"
x({"ISBN:9788822632753":{"bib_key":"ISBN:9788822632753",
  "info_url":"https://books.google.com/books?id=njT-zgEACAAJ&source=gbs_ViewAPI",
  "thumbnail_url":"https://books.google.com/books/content?id=njT-zgEACAAJ&printsec=frontcover&img=1&zoom=5",
  "preview":"noview","embeddable":false, …}});
```

This gives exactly the three-way discrimination the brief asks for:

| Response | Meaning |
|---|---|
| The `ISBN:<isbn>` key is absent from the object | **No record at all** |
| Key present, no `thumbnail_url` | **Record exists, no cover** |
| Key present with `thumbnail_url` | **Cover available** |

It is a two-step lookup: ISBN → `thumbnail_url` (which embeds the Google volume ID) → image. There is no way to construct the image URL from the ISBN alone, so the volume ID has to be stored if you want to skip the first hop later.

The documented rate limit is a shrug rather than a number: "*Because developers often issue an atypical quantity of requests, you may accidentally tip the security precautions found in Google Books*". No figure is published. 54 sequential requests at 1.5 s intervals ran clean.

### 3c. Resolution: 128 pixels, and that is the whole story

The `thumbnail_url` returns `zoom=5`. The `zoom` parameter is *not* documented — it appears only inside the URL the API hands you — so the following was measured, on `id=njT-zgEACAAJ` (One Piece 100) and then confirmed on four more volumes:

| `zoom` | Dimensions | Bytes | What it actually is |
|---|---|---|---|
| 1 | 128×195 | 20,009 | **the real cover** |
| 5 | 128×195 | 20,009 | the real cover (same image) |
| 2 | 300×391 | 15,567 | "image not available" placeholder |
| 0 / 3 | 575×750 | 9,103 | "image not available" placeholder |
| 4 | 800×1043 | 46,838 | "image not available" placeholder |
| 6 | 1280×1670 | 82,451 | "image not available" placeholder |

The placeholders were confirmed by eye, and the byte counts at `zoom=2` and `zoom=0` are **identical across five different volumes** (15,567 B and 9,103 B respectively) — the same file, not five different covers. Every volume's real cover is 128 px wide with a height varying by trim size (170–195 px observed). `&w=` is ignored.

This is a consequence of the records all being `"preview":"noview"` — Google has the jacket but not the book, so only the thumbnail tier exists. The v1 API's richer `imageLinks` sizes (`small`, `medium`, `large`, `extraLarge`) are documented but are not populated for no-preview records.

Measured weight of the real thumbnails across the 49 hits: **mean 13.3 KB, median 12.9 KB, range 5.2–20.9 KB**. A wall of 100 covers is ~1.3 MB, 300 is ~4.0 MB, 500 is ~6.6 MB.

### 3d. Licence — private app: permitted. Public page: permitted, but with mandatory attribution and a per-book link back

The Books-specific ToS is short and covers fees, takedowns, and privacy only ([Books API ToS](https://developers.google.com/books/terms)) — the substantive constraints live in the two documents it incorporates.

**The caching prohibition, which is the load-bearing one here.** Google APIs ToS §5.e opens "*Unless expressly permitted by the content owner or by applicable law, you will not, and will not permit your end users or others acting on your behalf to, do the following with content returned from the APIs*", and §5.e.1 is:

> "Scrape, build databases, or otherwise create permanent copies of such content, or keep cached copies longer than permitted by the cache header"
> — [Google APIs Terms of Service](https://developers.google.com/terms) §5.e.1

And the cache header, measured:

```
$ curl -sI "https://books.google.com/books/content?id=njT-zgEACAAJ&printsec=frontcover&img=1&zoom=1"
cache-control: private, max-age=86400
content-type: image/jpeg
```

**24 hours, and `private`.** So the permitted ceiling on storing a Google Books cover is one day, in a cache that is not shared between users. A `cover_image` blob or an object-store copy in this app would be a permanent copy, and would breach §5.e.1. §5.e.2 separately bars you from "*Copy, translate, modify, create a derivative work of, sell, lease, lend, convey, distribute, publicly display, or sublicense to any third party*" the content — which reads as barring redistribution rather than in-app display, but it is not a clause to lean on while also holding a permanent copy.

**Attribution, which bites only on the public page.** §6.b: "*You agree to display any attribution(s) required by Google as described in the documentation for the API.*" The Books documentation duly requires it:

> "Google attribution is required." … "the 'powered by Google' graphic must always be displayed alongside any search modules or results."
> "Every book result displayed in your application must have a prominent link to either (1) a page on your site featuring Google Preview capabilities, or (2) the Google Books page for that book."
> — [Branding Guidelines](https://developers.google.com/books/branding)

The branding page says nothing specific to cover thumbnails, so whether a wall of jackets counts as "results" requiring the badge is a judgement call — but the conservative reading, and the one a public page should take, is yes: a "Powered by Google" mark on the wall, and each tile linking to that volume's `info_url` (which the Dynamic Links response already hands you).

There is also a fee bar that matters if the public page ever monetises: "*You may not charge users any fee for the use of your application, unless you have entered into a separate agreement with Google*".

**Verdict.** Private app: fine, hotlinked, no badge needed in practice. Public page: **permitted, but only hotlinked, and only with the "Powered by Google" mark and a per-book link to Google Books.** Under no circumstances hosted.

**Coverage: 49/54 covers (90.7%), 52/54 records (96.3%).** Every one of the 49 was downloaded and a sample inspected visually — they are the correct Italian editions, including the right volume number (One Piece 100's Luffy jacket, Dylan Dog *Amore e morte*, the Ranma 1/2 Collection box art).

---

## 4. ISBNdb

**Query by ISBN.** `GET /book/<isbn>` against `api2.isbndb.com`, with the key in a header: "*Include your API key in the HTTP headers of every request: `GET /book/9780134093413 HTTP/1.1` / `Host: api2.isbndb.com` / `Authorization: YOUR_REST_KEY`*", and "*Passing your API key via query parameters is not supported and will result in an error*" ([API docs](https://isbndb.com/apidocs/v2), 2026-08-30).

**A key is mandatory, and it is paid.** Verified:

```
$ curl -s "https://api2.isbndb.com/book/9788822632753"
{"message":"Full authentication is required to access this resource.", …}   # HTTP 401
```

The free plan is website-only — "*Look up any book metadata on ISBNdb.com*" — and API access starts at **Basic $14.99 USD/month** (5,000 daily searches, "*1 call per second limit*"), then **Premium $35.99/month** (15,000 daily, "*3 call per second limit*"), then **Pro $99.99/month** ([pricing](https://isbndb.com/isbn-database), 2026-08-30). Live limits are exposed per-response: "*You can programmatically monitor your usage and limits by inspecting the standard `ratelimit-policy` and `ratelimit` headers we send with every response*".

**Formats.** The record includes a "*cover thumbnail*" among its fields (alongside pages, list price, language, edition, format, synopsis, subject, weight, dimensions). No resolution is documented, and none could be measured without a subscription.

**Licence.** Terms live at [`isbndb.com/terms-and-conditions`](https://isbndb.com/terms-and-conditions); no clause specific to cover-image redisplay, private or public, was located in this session. Treat both cases as **unclear** — and note the operator is a Portuguese company (ESTELAR SOFTWARE UNIPESSOAL LDA, Funchal) rather than the US entity older write-ups describe.

**Coverage: unmeasured.** The API is paywalled, so no probe was possible, and no figure is offered here rather than a guessed one. Given Google Books already reaches 91% for free, spending $14.99/month to find out is hard to justify; if it is ever tested, test it on the same 54 ISBNs in §7 so the numbers are comparable.

---

## 5. Comic Vine — and why it cannot answer this question at all

**Comic Vine has no ISBN.** ISBN is not a searchable or filterable field on any documented resource (characters, issues, volumes, series, …) ([API documentation](https://comicvine.gamespot.com/api/documentation)). The database is keyed by its own issue and volume IDs. There is no ISBN → cover path to measure, so no coverage number exists to report — the source is structurally inapplicable, not merely thin.

For completeness, since the terms are unusually restrictive and worth knowing about:

- **Key required**: "*You must log in to get a Comic Vine API Key.*"
- **Rate limit**: "*We restrict the number of requests made per user/hour. We officially support 200 requests per resource, per hour.*" Plus undocumented "*velocity detection*" causing "*temporary blocks*" if too many requests land per second.
- **Non-commercial only**: "*The API is strictly for non-commercial use only. Commercial use will result in your API key being revoked.*"
- **Attribution is mandatory**: "*Give credit where credit is due — On any page you use our data, please link back to us.*"
- **Hosting the images is forbidden outright**: "*Don't redistribute in another form — Do not edit, manipulate or reproduce on any other medium.*"
- All ([API Terms of Use](https://comicvine.gamespot.com/api/), 2026-08-31; the site is operated by Fandom.)

Private app and public page alike: the "link back to us" requirement applies to any page using the data, and "reproduce on any other medium" rules out local hosting either way. Moot here, given no ISBN key.

---

## 6. OPAC SBN, Alphabetica, and the Italian national catalogue

This is the one source the brief expected to be a guaranteed floor, on legal-deposit grounds. It is not, and the reason is interesting.

### 6a. It does expose machine-readable access — three ways, two undocumented

**Z39.50 is the documented, official interface.** Verbatim parameters ([Accesso Z39.50 a OPAC SBN](https://opac.sbn.it/accesso-z39.50-a-opac-sbn), 2026-08-30): host **`opac.sbn.it`**, ports **"2100 e 3950"**, database **`nopac`**, record syntaxes **"UNIMARC, MARC21 o SUTRS"**, attribute set **"BIB1 (parte)"**, charset **UTF-8**, with the advisory "*si prega di evitare l'utilizzo di caratteri diacritici (accenti ecc.) nelle ricerche*". MARC records carry no images, by construction.

**There is no SRU and no unAPI.** `/sru`, `/services/sru`, `/o/opac-api/sru` and `/unapi` all return 404. Nothing in ICCU's own interface documentation ([Le interfacce web dell'OPAC SBN](https://www.iccu.sbn.it/it/SBN/il-catalogo-sbn-aperto-al-pubblico-opac/le-interfacce-web-dellopac-sbn/index.html)) describes an SRU, OAI-PMH, REST or SPARQL endpoint.

**But the site drives itself off a JSON API**, `/o/opac-api/…` (the OPAC is a Liferay application). It is undocumented and unsupported — it is the site's own XHR surface, not a published contract — but it is unauthenticated and it works. Search by ISBN:

```
$ curl -s -X POST "https://opac.sbn.it/o/opac-api/titles-search-full-post" \
    --data-urlencode "core=sbn" \
    --data-urlencode "fieldstruct[1]=ricerca.parole_tutte:4=6" \
    --data-urlencode "fieldvalue[1]=9788822632753" \
    --data-urlencode "fieldaccess[1]=ISBN:7"
{"status":"success","data":{ … "total": 2, "results":[
  {"id":"ITICCUROV0014297", … "info":"{One piece}100 / Eiichiro Oda",
   "infos":["Bosco (Pg) : Star Comics, 2022", …]}, … ]}}
```

(`ISBN:7` is the access code for ISBN; `EAN:1214` and `ISSN:8` also exist. Using the generic `Numerostandard:1016` silently degrades to a free-text `any_notitle` search and returns 0 — a trap worth knowing.) `/o/opac-api/title?id=<id>&core=sbn` returns the full record, ISBNs included, one per reprint.

**Reliability is poor.** During this session the API returned HTTP 502 and then 503 (*"No server is available to handle this request"*) for extended stretches while the homepage still served 200. Anything built on it needs retries and must tolerate the backend being down.

### 6b. It *does* carry cover images — from an endpoint nobody documents

This is the discovery the brief asked for. The record-detail JSON embeds an image reference:

```json
"img": { "src": "/o/alphabetica-api/detail-image?id=8822632753&format=preview" }
```

So covers come from **Alphabetica**, ICCU's discovery portal, and the endpoint is keyed by ISBN. It accepts **both ISBN-10 and ISBN-13** (verified: `8822632753` and `9788822632753` return the same thing).

```
$ curl -s -o cover.bin -w "%{http_code} %{size_download}\n" \
    "https://opac.sbn.it/o/alphabetica-api/detail-image?id=9788866320326&format=preview"
200 17838
$ file cover.bin
cover.bin: JPEG image data, 180 x 291
```

**The hit/miss discriminator is byte-exact and must be used**, because a miss still returns HTTP 200:

| Response | Meaning |
|---|---|
| JPEG, ~17–18 KB, 180×291 | **real cover** |
| PNG, **exactly 2,813 bytes**, 800×600 | **"no image" placeholder** (a grey picture icon) |

**Formats and resolutions: one, and it is small.** `format=preview`, `full`, `thumbnail`, `large`, `medium` and `original` were all tried; every one returns the identical 180×291 JPEG. There is no larger tier.

**Two mechanical problems for a browser.** The response carries `content-type: application/octet-stream` together with `x-content-type-options: nosniff` — a combination that tells the browser not to sniff the type, and which may prevent an `<img>` from rendering it at all. And `cache-control: private` means no shared caching. Neither was tested in a real browser here; both are risks a spike would have to settle before this source is used for display.

**Licence: unclear, in both cases.** No terms-of-use, copyright or licence statement covering the cover images could be found on `opac.sbn.it`, on `alphabetica.it/informazioni`, or on ICCU's site. The images are plainly not ICCU's own creations, and no supplier is named. Absent a statement, **treat the public case as not permitted** and the private case as tolerated-but-undocumented.

**Coverage: 3/54 (5.6%)** — the same three Bao volumes as Open Library. Zero manga.

### 6c. The control set — this is a comics problem, not an Italy problem

Six mainstream Italian trade novels (Ferrante/e-o, Mondadori, Feltrinelli, Einaudi, Rizzoli, Garzanti) were run through the same three probes:

| Source | Italian comics (n=54) | Italian trade novels (n=6) |
|---|---|---|
| Open Library cover | 3 (5.6%) | 4 (67%) |
| OPAC SBN / Alphabetica cover | 3 (5.6%) | 4 (67%) |
| Google Books cover | 49 (91%) | 6 (100%) |

The probes work. Open Library and the Italian national catalogue simply do not carry jacket images for manga — the legal-deposit *record* may exist (SBN had bibliographic records for One Piece 100 and the One-Punch Man volumes), but the **cover image supply is a book-trade service bolted onto the catalogue, and the comics trade is not in it.**

---

## 7. Publisher sites — good images, no ISBN key

The brief allows for "a publisher's own site with a predictable cover URL pattern". All five were examined. **None of them has one.**

| Publisher | Site reachable | ISBN on product page | Cover URL shape | Derivable from ISBN? |
|---|---|---|---|---|
| **Star Comics** | yes | yes — `Codice ISBN: <strong>9788822667915</strong>` | `/files/immagini/fumetti-cover/thumbnail/<slug>-1200px` | **no** — slugs are inconsistent even within one series (`onepiece-ne-100`, `onepiece-newedition-102`, `one-piece-101` all coexist) |
| **Bao Publishing** | yes | yes — `<strong>ISBN: </strong>978-88-6543-254-9` | `img.baopublishing.it/uploads/YYYY/MM/<TITLE>-936x1024.jpg` | **no** — WordPress upload path, keyed by upload date |
| **Sergio Bonelli** | yes | ISBN on books; **EAN-ISSN on monthlies** (see below) | `sergiobonelli.it/wp-content/uploads/YYYY/MM/<name>.png` | **no** — same WordPress shape |
| **Panini / Planet Manga** | **no** | — | — | shop is behind a Queue-it waiting room |
| **J-POP** | **no** | — | — | behind a Cloudflare browser challenge |

Star Comics is genuinely attractive on quality — its `og:image` is 1200 px and served with `cache-control: max-age=31536000` (one year), which is the opposite of Google's 24-hour private cache. But since the URL cannot be derived from an ISBN, using it means crawling the catalogue (755 series pages) and storing a slug per volume. That is a scraping project with its own maintenance burden, for one publisher out of five, and only the two that block scraping are the ones the owner's shelf is actually full of.

**The Bonelli finding, which no API can fix.** Bonelli's monthly albi are periodicals and carry no ISBN:

```
$ curl -s "https://www.sergiobonelli.it/prodotto/ai-confini-del-crepuscolo/" | grep -oE '\b97[789][0-9]{10,15}\b' | head -1
977112365904850039        # Dylan Dog monthly — 977 prefix = ISSN-derived periodical EAN
$ curl -s "https://www.sergiobonelli.it/prodotto/dylan-dog-amore-e-morte/" | grep -oE '\b97[789][0-9]{10,15}\b' | head -1
9791256292271             # bookshop volume — a real ISBN, 979-12 range
```

Any Bonelli monthly in the collection is unreachable by ISBN from *any* source, because it has no ISBN. Only the bookshop volumes do — and those are on the newer **979-12** Italian range, which is worth watching: everything in the sample on that prefix was found by Google Books, but 979-12 is recent and thinner in older aggregators.

---

## 8. The measurement

### How to reproduce it

Sample file `sample.tsv`, one ISBN per line with publisher, title and a checksum flag. Open Library must be probed **separately and slowly** — its ISBN-keyed cover path allows only 100 requests per IP per 5 minutes and answers 403 when exceeded, which is trivially mistaken for "no cover":

```bash
# Open Library — 4s pacing, raw status recorded so 403 ≠ 404
printf "isbn\tpublisher\tol_http\tol_bytes\tol_record\n"
while IFS=$'\t' read -r -u 3 isbn pub ttl valid; do
  read -r code bytes < <(curl -s -o /dev/null -w "%{http_code} %{size_download}" --max-time 30 \
        "https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false")
  rec=$(curl -s --max-time 30 "https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data")
  [ "$rec" = "{}" ] && olrec=no || olrec=yes
  printf "%s\t%s\t%s\t%s\t%s\n" "$isbn" "$pub" "$code" "$bytes" "$olrec"
  sleep 4
done 3< sample.tsv
```

```bash
# Google Books (Dynamic Links) + OPAC SBN / Alphabetica — 1.5s pacing
printf "isbn\tpublisher\tgb_record\tgb_thumb\tgb_bytes\tsbn_http\tsbn_bytes\n"
while IFS=$'\t' read -r -u 3 isbn pub ttl valid; do
  gb=$(curl -s --max-time 30 "https://books.google.com/books?bibkeys=ISBN:${isbn}&jscmd=viewapi&callback=x")
  echo "$gb" | grep -q "\"ISBN:${isbn}\"" && rec=yes || rec=no
  turl=$(echo "$gb" | grep -oE 'thumbnail_url":"[^"]+' | sed 's/thumbnail_url":"//;s/\\u0026/\&/g')
  if [ -n "$turl" ]; then th=yes; gbb=$(curl -s -o /dev/null -L --max-time 30 -w "%{size_download}" "$turl")
  else th=no; gbb=0; fi
  read -r sc sb < <(curl -s -o /dev/null --max-time 30 -w "%{http_code} %{size_download}" \
      "https://opac.sbn.it/o/alphabetica-api/detail-image?id=${isbn}&format=preview")
  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$isbn" "$pub" "$rec" "$th" "$gbb" "$sc" "$sb"
  sleep 1.5
done 3< sample.tsv
```

Decision rules: Open Library cover = HTTP **302** (404 = no cover, 403 = rate-limited, retry). Google cover = `thumbnail_url` present **and** the fetched image exceeds ~3 KB. SBN cover = HTTP 200 **and** size ≠ **2813** bytes.

Note the `-u 3` / `3<` construction — without it `curl` eats the loop's stdin and the script silently processes one row. That bug also occurred in this session.

### Headline numbers

| Source | Bibliographic record | **Cover image** | Key needed | Max resolution |
|---|---|---|---|---|
| **Google Books** (Dynamic Links) | 52/54 — **96.3%** | **49/54 — 90.7%** | no | 128 × ~190 |
| Open Library Covers | 3/54 — 5.6% | **3/54 — 5.6%** | no | (L; 48 KB on the one measured) |
| OPAC SBN / Alphabetica | most (records exist) | **3/54 — 5.6%** | no | 180 × 291 |
| ISBNdb | unmeasured (paywalled) | unmeasured | yes, $14.99/mo+ | undocumented |
| Comic Vine | **not keyed by ISBN** | n/a | yes | n/a |
| Publisher sites | n/a | good, but **not addressable by ISBN** | no | up to 1200 px (Star Comics) |

**Union of all three free sources: 49/54 (91%)** — identical to Google Books alone. Open Library and SBN add nothing Google does not already have; their three hits are a strict subset.

### Per publisher

| Publisher | n | OL record | OL cover | GB record | **GB cover** | SBN cover |
|---|---:|---:|---:|---:|---:|---:|
| Planet Manga | 18 | 0/18 | 0/18 | 16/18 | **14/18 — 78%** | 0/18 |
| Star Comics | 15 | 0/15 | 0/15 | 15/15 | **15/15 — 100%** | 0/15 |
| J-POP | 9 | 0/9 | 0/9 | 9/9 | **9/9 — 100%** | 0/9 |
| Bao Publishing | 5 | 3/5 | 3/5 | 5/5 | **5/5 — 100%** | 3/5 |
| Sergio Bonelli (books) | 4 | 0/4 | 0/4 | 4/4 | **4/4 — 100%** | 0/4 |
| Panini Marvel/DC | 3 | 0/3 | 0/3 | 3/3 | **2/3 — 67%** | 0/3 |

**Planet Manga is the weak spot, and it is the owner's largest publisher by far** — 56 of his 96 volumes. Four of the five misses are Panini imprints. Worth noting *what* misses: two are art books and guides (`The Art of Fullmetal Alchemist`, an older Death Note volume), two are records Google does not hold at all (`Naruto 33`, an Evangelion volume) — i.e. deep-backlist and ancillary items, not current numbered releases. All 15 Star Comics volumes and all 9 J-POP volumes hit.

### Per-ISBN detail

| ISBN | Publisher | Title | OL record | OL cover | GB record | GB cover | SBN cover |
|---|---|---|---|---|---|---|---|
| `9788822632753` | Star Comics | One Piece 100 | — | — | yes | yes | — |
| `9788822633132` | Star Comics | One Piece 101 | — | — | yes | yes | — |
| `9788822634597` | Star Comics | One Piece 102 | — | — | yes | yes | — |
| `9788822632821` | Star Comics | Detective Conan 100 | — | — | yes | yes | — |
| `9788822636065` | Star Comics | Detective Conan 101 | — | — | yes | yes | — |
| `9788822639134` | Star Comics | Detective Conan 102 | — | — | yes | yes | — |
| `9788822618221` | Star Comics | Ranma 1/2 Collection 3 | — | — | yes | yes | — |
| `9788822618276` | Star Comics | Ranma 1/2 Collection 4 | — | — | yes | yes | — |
| `9788822618283` | Star Comics | Ranma 1/2 Collection 5 | — | — | yes | yes | — |
| `9788822617194` | Star Comics | Dragon Ball Super 10 | — | — | yes | yes | — |
| `9788822618467` | Star Comics | Dragon Ball Super 11 | — | — | yes | yes | — |
| `9788822619617` | Star Comics | Dragon Ball Super 12 | — | — | yes | yes | — |
| `9788822632135` | Star Comics | Kaiju No. 8 — 1 | — | — | yes | yes | — |
| `9788822644817` | Star Comics | Kaiju No. 8 — 10 | — | — | yes | yes | — |
| `9788822647214` | Star Comics | Kaiju No. 8 — 11 | — | — | yes | yes | — |
| `9788891268761` | Planet Manga | One-Punch Man — fanbook | — | — | yes | yes | — |
| `9788828750468` | Planet Manga | One-Punch Man 27 | — | — | yes | yes | — |
| `9788891292346` | Planet Manga | One-Punch Man 21 | — | — | yes | yes | — |
| `9788828787969` | Planet Manga | One-Punch Man 20 | — | — | yes | yes | — |
| `9788828769200` | Planet Manga | The First Slam Dunk re:source | — | — | yes | yes | — |
| `9788891298737` | Planet Manga | Slam Dunk 18 | — | — | yes | yes | — |
| `9788891298294` | Planet Manga | Slam Dunk 17 | — | — | yes | yes | — |
| `9788828762645` | Planet Manga | Fullmetal Alchemist character guide | — | — | yes | yes | — |
| `9788828742937` | Planet Manga | Fullmetal Alchemist 20th anniversary book | — | — | yes | yes | — |
| `9788863461350` | Planet Manga | The Art of Fullmetal Alchemist | — | — | yes | **—** | — |
| `9788828756125` | Planet Manga | Death Note — Short Stories | — | — | yes | yes | — |
| `9788863464801` | Planet Manga | Death Note 10 | — | — | yes | **—** | — |
| `9788828742418` | Planet Manga | Berserk Collection | — | — | yes | yes | — |
| `9788891285119` | Planet Manga | Berserk official guide book | — | — | yes | yes | — |
| `9788891254306` | Planet Manga | Naruto 33 | — | — | **—** | **—** | — |
| `9788891295613` | Planet Manga | Naruto 6 | — | — | yes | yes | — |
| `9788828721055` | Planet Manga | Evangelion Anima 5 | — | — | yes | yes | — |
| `9788891287083` | Planet Manga | Evangelion 2 | — | — | **—** | **—** | — |
| `9788891237613` | Panini Marvel/DC | Spider-Man: Blu | — | — | yes | yes | — |
| `9788828777069` | Panini Marvel/DC | Daredevil: Giallo | — | — | yes | **—** | — |
| `9788828733881` | Panini Marvel/DC | Batman: Anno 100 | — | — | yes | yes | — |
| `9788832750379` | J-POP | Your Name — Another Side | — | — | yes | yes | — |
| `9788834901335` | J-POP | Your Name — Another Side (rist.) | — | — | yes | yes | — |
| `9788868831417` | J-POP | Devilman vs Getter Robot | — | — | yes | yes | — |
| `9788834907221` | J-POP | La via del grembiule 7 | — | — | yes | yes | — |
| `9788834909287` | J-POP | La via del grembiule 8 | — | — | yes | yes | — |
| `9788834902653` | J-POP | La via del grembiule 1 | — | — | yes | yes | — |
| `9788834913178` | J-POP | Oshi no Ko 11 | — | — | yes | yes | — |
| `9788834911426` | J-POP | Oshi no Ko 4 | — | — | yes | yes | — |
| `9788832750430` | J-POP | Tomie | — | — | yes | yes | — |
| `9788865436189` | Bao | Kobane Calling (Zerocalcare) | — | — | yes | yes | — |
| `9788865432549` | Bao | Dimentica il mio nome (Zerocalcare) | yes | **yes** | yes | yes | **yes** |
| `9788832735512` | Bao | A Babbo morto | yes | **yes** | yes | yes | **yes** |
| `9788865431801` | Bao | Dodici | yes | **yes** | yes | yes | **yes** |
| `9788865434918` | Bao | Green Manor | — | — | yes | yes | — |
| `9791256292271` | Bonelli | Dylan Dog. Amore e morte | — | — | yes | yes | — |
| `9791256292776` | Bonelli | Anche i sogni uccidono | — | — | yes | yes | — |
| `9791256292837` | Bonelli | Dampyr. Magioni maledette | — | — | yes | yes | — |
| `9791256292318` | Bonelli | Apocalisse — Nuova edizione | — | — | yes | yes | — |

---

## 9. Hotlink or host?

For this app the question is almost entirely settled by one clause and one header, and the answer differs between the two futures.

**The terms make the choice for you, per source:**

| Source | May we cache/host it? | Private app | Public page |
|---|---|---|---|
| Google Books | **No.** §5.e.1 forbids "permanent copies" and caching "*longer than permitted by the cache header*"; the header is `private, max-age=86400` | hotlink, permitted | hotlink, permitted **with** "Powered by Google" + per-book link to Google Books |
| Open Library | **No bulk download** ("*do not crawl our cover API*"), but hotlinking is the documented intent | hotlink, permitted | hotlink, **explicitly encouraged**; courtesy link-back appreciated, not required |
| OPAC SBN / Alphabetica | no terms found | tolerated, undocumented | **treat as not permitted** absent a statement |
| Comic Vine | **No** — "*Do not … reproduce on any other medium*" | link-back required | link-back required |
| Publisher sites | no API terms; ordinary site content | grey | grey, and not addressable by ISBN anyway |

**The operational trade-offs, honestly:**

*For hotlinking.* Weight is a non-issue: 13.3 KB average × 300 volumes ≈ 4 MB for a full wall, and lazy-loading below the fold makes the first paint trivial. Google's CDN is about as reliable as CDNs get. Nothing has to live in the cluster. Open Library's CORS headers are permissive (`access-control-allow-origin: *`), and Google's covers render in an `<img>` without CORS at all.

*Against hotlinking.* Link rot is real but modest — the Google volume ID is stable and the image is the same asset the Google Books web UI uses. The sharper cost is that **every viewer's browser tells Google which books are on the wall**, which on a public indexable page is a privacy leak the owner should make deliberately, not by accident. Open Library's ISBN path costs two redirect hops before the bytes arrive, and its 100-req/5-min-per-IP limit is per *server* IP if you proxy, which is a reason not to proxy.

*For hosting.* Independence, one origin, no third-party beacon, and the freedom to serve WebP at whatever size the wall wants. And ADR-0003 already puts Postgres in-cluster on k3s with CloudNativePG and Backblaze B2 backups, so an object bucket for a few hundred 13 KB JPEGs is a rounding error next to what already exists — B2 is provisioned, SOPS holds the credentials, Flux delivers it.

*Against hosting.* **It is a terms breach for the only source that actually has the images.** That is not a risk to be weighed against convenience; it is the answer. And it buys nothing at 128 px: hosting a 128-pixel image locally gets you a 128-pixel image with more moving parts.

**Recommendation: hotlink, in both the private and the public case.** Store the Google Books *volume ID* and the `thumbnail_url` alongside the ISBN — those are facts about the record, not copies of the content, and storing them means one Dynamic Links call per volume for the lifetime of the row rather than one per page render. Refresh the URL lazily when an image 404s. Do not store the bytes.

The one place hosting is legitimate is **an owner-supplied cover** — a photograph or a scan for the ~9% Google misses and for every Bonelli monthly. That image is the owner's, is not covered by anyone's API terms, and belongs in the same bucket ADR-0003 already provisions. Model it as a nullable `cover_url` on the volume that overrides the looked-up one, and the fallback chain has an escape hatch that no third party can revoke.

---

## Recommendation

**Source: Google Books, via the keyless Dynamic Links endpoint, with a narrow fallback.**

1. **Google Books Dynamic Links** — `books.google.com/books?bibkeys=ISBN:<isbn>&jscmd=viewapi&callback=…`. 91% measured. No key, no cost, no quota published. Store the returned volume ID and thumbnail URL on the volume row.
2. **Open Library Covers** — `covers.openlibrary.org/b/isbn/<isbn>-L.jpg?default=false`, for the handful Google misses. It adds nothing on this sample, but it is free, it is the one source that *wants* to be hotlinked from a public page, and its stock of Italian graphic novels will plausibly grow.
3. **Owner-supplied image**, hosted in the cluster's own bucket. This is the only thing that will ever cover a Bonelli monthly.

Do **not** buy ISBNdb on the strength of this research — Google already reaches 91% for nothing, and ISBNdb's own coverage on Italian comics is unmeasured. Do **not** reach for Comic Vine: it has no ISBN key at all. Do **not** build a publisher-site scraper: the two publishers that dominate the shelf both block automation, and none of the three that don't expose a URL derivable from an ISBN.

**Hotlink, do not host.** Google's terms forbid permanent copies and cap caching at the 24-hour `private` header; Open Library asks you to point `src` at its own domain. Hosting is reserved for images the owner supplies himself.

**If the public page ships**, the source ranking does not change but the obligations do: Google Books requires a "Powered by Google" mark alongside the results and a prominent per-book link to that volume's Google Books page — both satisfiable from the `info_url` the same response already returns. Open Library asks only for a courtesy link. OPAC SBN's images should be dropped entirely on a public page, since no licence statement exists to rely on and they cover 5.6% anyway. Budget one line of footer and one link per tile; that is the whole cost of going public with this source.

**What the owner should expect to be missing.** On today's shelf: roughly **1 volume in 10**, concentrated in Panini / Planet Manga (78% hit rate — and Panini is 56 of his 96 volumes), and skewed towards art books, guides, and deep-backlist reprints rather than current numbered releases. Every Bonelli monthly, always, because it has no ISBN to look up. And the covers he does get will be **128 pixels wide** — enough for a dense grid of thumbnails, not enough for a large-format wall or a detail view. If the design wants big covers, it wants owner-supplied photographs, and the honest thing is to design the wall around 128 px and treat anything larger as a bonus.

**Before any of this can run at all**, the ISBN column has to be filled: it is empty on all 96 rows and absent from both source spreadsheets. That is the real first task, and it is a data-entry problem, not an API problem.

---

## Open questions

- **Does the Google Books v1 API return larger `imageLinks` (`small`/`medium`/`large`/`extraLarge`) for these records with a key?** Unresolved — keyless quota is 0, so it could not be tested. The `zoom` evidence strongly suggests no (only the thumbnail tier exists for `"preview":"noview"` records), but the v1 response was never seen. Worth ten minutes with a free Google Cloud key before accepting 128 px as final.
- **Do the `zoom` values on `books.google.com/books/content` have any stability guarantee?** They are undocumented — they appear only inside URLs the API itself returns. `zoom=1` and `zoom=5` are behaving identically today; nothing promises they will.
- **Does the "Powered by Google" branding requirement actually attach to cover thumbnails**, or only to search modules and result lists? The branding page addresses previews and results and says nothing about jackets specifically. The conservative reading is assumed above.
- **Will the Alphabetica image endpoint render in a browser at all**, given `content-type: application/octet-stream` plus `x-content-type-options: nosniff`? Not tested in a real browser. Moot unless SBN coverage improves.
- **Who supplies Alphabetica's cover images, and under what terms?** No supplier is named and no licence statement was found on `opac.sbn.it`, `alphabetica.it`, or `iccu.sbn.it`. Until someone asks ICCU directly, the public case stays unclear.
- **ISBNdb's real coverage on Italian comics** — unmeasured, and unmeasurable without $14.99. If it is ever bought, run it against the exact 54 ISBNs in §7.
- **How much of the 9% gap is a bad ISBN rather than a missing cover?** The sample's ISBNs came from SBN records and publisher pages, and several manga have multiple reprint ISBNs for the same volume; a miss on one printing may be a hit on another. A retry across all reprint ISBNs of a title would probably lift the number, and was not attempted here.
- **Whether the `/o/opac-api/` endpoints are stable enough to depend on.** They are undocumented internals of a Liferay site, and they returned 502/503 for long stretches during this session. Fine for a one-off ISBN backfill; not something to put on a page-render path.
