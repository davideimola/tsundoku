# Multilingual story titles

**Researched:** 2026-09-14 · Question: is there an automatic source of multilingual work titles — specifically **Italian** ones — keyed by a stable *work* identifier, good enough that the owner never has to type a second title by hand? And if not, what fraction of the problem is left over, and what is the shape of the thing that would hold it? A recommendation is made at the end.

## How to read this

- Every claim is traced to the source that owns it: the vendor's own documentation, its own terms page, a GraphQL or OpenAPI schema introspected in this session, or an endpoint this session actually called. Where only a third-party wrapper documents something, that is said inline rather than promoted to a fact about the upstream API.
- **The coverage numbers are measured, not quoted.** A 36-work sample spanning every Type the owner actually has was built (§1), plus two population-scale measurements that do not depend on my choice of sample: 500 MangaDex series (§3c) and the entire 759-title published catalogue of one Italian manga publisher (§3e). Every command is written out.
- Two questions are asked of every source and they are **not** the same question: *does the Italian title exist in there at all*, and *can a program tell which of the thirty strings is the Italian one*. Most sources pass the first and fail the second, and the second is the one that matters.
- Quotas, rate limits and terms are as observed on **2026-09-14** — record them next to the citation, since they move.
- **Several probes in this session were wrong before they were right**, and the wrong versions produced plausible numbers. §9 lists all five, with the corrected method for each. Any re-run must apply them.
- The local Postgres was reachable and is **empty** (`select count(*) from story` → `0`; the memory note is right that `pnpm test` wipes it, and it is in any case a stale copy of production). So nothing in this note is a statement about the owner's live data; the title *shapes* come from the import spreadsheets in the repository and from publishers' own catalogues.
- A recommendation is made at the end, and it is not the one the brief hoped for.

---

## Answer

**One source can do this and it is Wikidata; it is the only free source that both keys titles to a work and tags them with a language code, and it still leaves roughly half of a real Italian publisher's catalogue uncovered. No source at all has the owner's own motivating example.**

The decisive fact is structural, not statistical. Of the twelve sources examined, exactly **four** attach a language to a title at the work level: **Wikidata** (a label and any number of aliases *per language code*, plus `P1476` with a language-tagged monolingual value), **Anime News Network** (`<info type="Alternative title" lang="IT">`), **MangaDex** (`attributes.altTitles`, an array of single-key language-code maps), and **OPAC SBN** (a *titolo uniforme* authority record distinct from the publication title). Everything else — **AniList**, **MangaUpdates**, **MyAnimeList**, **ComicVine**, **IGDB**, **RAWG** — stores alternative titles in an untyped bag. AniList's `Media` has exactly three named slots (`title { romaji english native }`) plus `synonyms: [String]`, introspected in this session; MangaUpdates' `associated` is an array of `{title}` and nothing else; ComicVine's is "*a `\n` (newline) seperates each alias*"; IGDB's `alternative_names` has a free-text `comment` field described as "*(Acronym, Working title, Japanese title etc)*". *L'attacco dei giganti* is genuinely present in AniList's synonym array for Attack on Titan — sitting between a Turkish title and a Czech one, with nothing whatsoever marking it as the Italian one. That is the whole problem in one line: the string is there and it is unaddressable.

On the seven works in the sample whose published Italian title actually differs from both the romaji and the English — the only cases where any of this matters — the sources split and none of them wins: **Wikidata 6/7** (language-tagged), **MangaUpdates 5/7** (untyped), **AniList 4/7** (untyped), **ANN 4/7** (language-tagged), **MangaDex 2/7** (language-tagged). Each source holds a *different* subset. And **all five miss the same one**: *黒岩メダカに私の可愛いが通じない*, which Star Comics publishes as *Medaka Kuroiwa è impenetrabile*, has a Wikidata item labelled "My Charms Are Wasted", an AniList entry whose only synonym is "Kuroiwa Medaka doesn't understand my cuteness", and no Italian string anywhere in any of them. The exact case the owner used to describe the problem is the case the automatic answer does not cover.

Scaled up, Wikidata's recall is far worse than the hand-picked sample suggests, and it fails in a specific direction. Against Edizioni Star Comics' **own published catalogue of 759 titles** (§3e), a random 40 were reconciled to Wikidata by exact Italian label or alias: **21 hit (52%) — but four of those are false positives** (the title *YUKO* matched a female given name, *DUCK AND COVER* a Mad Caddies album), so the honest figure is **17/40 ≈ 43%**, with a ~10% false-positive rate on exact-string matching. Worse, the hits are concentrated where the problem does not exist: of the nine titles in that random slice that are *actually in Italian* (*La culla dei demoni*, *La processione funebre di K*, *L'arte del sushi*, *La madonna del Pellini*, …), **two** reconciled. **Wikidata resolves the titles that did not need resolving.** Population-wide the localisation is real — of 2,563 Wikidata manga series carrying both an English and an Italian label, **1,222 (47.7%) differ**, 974 (38.0%) by more than case and punctuation — but the items that *have* an Italian label are the famous ones.

**Videogames are a different and much smaller problem, and it is mostly not a problem.** Of 13,290 Wikidata video games with both labels, only 2,572 (19.4%) differ at all and **1,830 (13.8%) by more than punctuation** — and inspecting them, most of the "divergence" is a dropped subtitle or British spelling (`Sonic Colors` → `Sonic Colours`, `007: Licence to Kill` → `Licence to Kill`), not a translation. Genuine Italian game titles exist (`Uncharted 3: Drake's Deception` → *Uncharted 3: L'inganno di Drake*, `LEGO Star Wars: The Video Game` → *LEGO Star Wars: Il videogioco*) but they are the minority of a minority. Meanwhile the two game-specific sources both fail the structural test and both need credentials: IGDB requires a Twitch Client-ID plus a bearer token and caps at "*4 requests per second*"; RAWG requires a key and its free tier is "*Non-commercial projects only*" with "*Required backlinks to RAWG from pages where the data is used*" and "*No data redistribution*". For the Videogame half of the library, **Wikidata alone is the answer and it is nearly always the identity function.**

**The ISBN→work path is dead, re-verified rather than inherited.** Of the 54 real Italian comics ISBNs from `cover-images-by-isbn.md`, Wikidata's `P212`/`P957` match **1 (1.9%)** — and that one is *Dimentica il mio nome*, an Italian original. Open Library holds an edition record for **3 (5.6%)**, unchanged from 2026-08-30, and each of those three works has exactly one edition, in Italian, so even the bridge that exists leads nowhere. Google Books' v1 REST API is **still refusing keyless callers on 2026-09-14** with `"quota_limit_value": "0"`, the keyless Dynamic Links endpoint returns no title at all (`jscmd=data` 302s away), and Google Books has no work identifier in the first place — only per-edition volume IDs. The one surprise is **OPAC SBN**: it has a bibliographic record for **50/54 (92.6%)** of these ISBNs, and **26/54 (48%)** of those records are linked to a *Titolo di opera* authority record with a stable id — *Ken il guerriero* → `MOD0784838` "Hokuto no Ken", the two Slam Dunk volumes → `UBO4531200` "Suramu Danku". That is a genuine ISBN→work bridge, it is Italian, and it is the only one that works; whether the authority record itself carries variant titles could not be established (§4d).

**Indexing cannot close the gap, and the boundary is sharp.** Measured on a throwaway Postgres 18.6 with `pg_trgm` (§6): `similarity('l''attacco dei giganti', 'attack on titan')` = **0.152**, below the 0.3 default; `'la via del grembiule'` vs `'the way of the househusband'` = **0.000**; `'ken il guerriero'` vs `'fist of the north star'` = **0.000**. Every multilingual full-text configuration — `italian`, `english`, `simple` — returns false on every cross-language pair, because a text search configuration stems words, it does not translate them. Trigram similarity earns its place on a different axis entirely and does so convincingly: accents (1.000), macron-stripped romaji (1.000), typos (0.680), romaji variants (0.786), dropped subtitles (0.567). The one cross-language pair it does catch — *Medaka Kuroiwa è impenetrabile* ↔ *Medaka Kuroiwa Is Impregnable*, 0.463 — it catches because the proper noun survives translation, which is exactly the class of case that needs no help. And lowering the threshold to reach the real misses is worse than useless: searching *The Way of the Househusband* against a 39-title corpus of the owner's real titles ranks **The Legend of Zelda: Breath of the Wild first** (0.191) while the correct answer scores zero.

**Machine translation is not viable, and the evidence is unambiguous** (§7). Italian commercial titles are editorial decisions with no translational relationship to the original: 北斗の拳 (*Hokuto no Ken*, "Fist of the North Star") is published in Italy as *Ken il guerriero* — "Ken the warrior" — which reads the character 拳 "fist" as the protagonist's name; no translator produces that. 極主夫道 ("the way of the extreme househusband") is published by Edizioni BD as *La via del grembiule : lo yakuza casalingo* — "the way of the apron" — confirmed on the Italian national catalogue's own record `ITICCUBCT0060261`; French independently chose *La voie du tablier*, the same apron, which is evidence of an editorial convention rather than a translation. 黒岩メダカに私の可愛いが通じない ("my cuteness doesn't get through to Medaka Kuroiwa") becomes *Medaka Kuroiwa è impenetrabile*. In the other direction, a translator handed *Berserk*, *Naruto* or *Dylan Dog* will cheerfully translate a proper noun it should have left alone. Wikidata's own manga corpus is full of the same shape: *Barefoot Gen* → *Gen di Hiroshima*, *Himitsu no Akko-chan* → *Lo specchio magico*, *Man of Many Faces* → *Il ladro dalle mille facce*.

The honest summary: **an automatic source seeds roughly half of the manga and comics and nearly all of the videogames, gets the famous ones right, gets the long tail wrong or not at all, misses the owner's own example entirely, and carries a false-positive rate high enough that no unattended write should be built on it.** Manual entry for the long tail is unavoidable. The good news is that the two halves of the owner's complaint have very different tolerances — a wrong search alias costs one bad hit, a wrong public display title is a lie on a page — and separating them is what makes the manual residue small enough to live with. That is the recommendation.

---

## 1. The sample, and why it is what it is

**The owner's own titles could not be read out of the database**, because the local copy is empty:

```
$ docker exec tsundoku-pg psql -U postgres -d tsundoku -c "select count(*) from story;"
 count
-------
     0
```

The container is up (`tsundoku-pg`, `postgres:18-alpine`, `127.0.0.1:5432`, `postgres:18.6`) and every table exists, but there are no rows — consistent with the memory note that `pnpm test` wipes seeded data and that this copy is stale in any case. The `.env.local` connection is `postgres://postgres:postgres@localhost:5432/tsundoku`. Everything read from it in this note is read-only and is about *shapes*, never about current truth.

Production could not be read either: `GET https://tsundoku.davideimola.dev/api/showcase` returns `401 {"error":"unauthorized","message":"This endpoint needs the API bearer token."}`, and `/` 307s to `/signin` (ADR-0025 — the API is gated by `API_BEARER_TOKEN`, and `src/app/(public)/` holds only the sign-in page).

**So the sample was built from the two things in the repository that are the owner's own**: `db/import/sheets/collezione-collezione.csv` (77 rows, real titles and publishers) and `collezione-wishlist.csv`. Their distribution:

| Series / universe | n | Publisher |
|---|---:|---|
| One-Punch Man | 22 | Panini / Planet Manga |
| Slam Dunk | 20 | Panini / Planet Manga – Shinsōban |
| La via del grembiule | 6 | J-POP / Edizioni BD |
| Fullmetal Alchemist | 4 | Panini / Planet Manga – Ultimate Deluxe |
| Your Name. | 3 | J-POP / Edizioni BD |
| Spider-Man, Batman, Marvel, DC (Must Have, DC Library, …) | 11 | Panini |
| Death Note, Berserk, Junji Ito, Naruto, Devilman, Divina Commedia/Go Nagai | 11 | Panini, J-POP |

Note that `biblioteca-biblioteca.csv` — the *books* half, which is what carries the novels, the Play and the videogames — is a header line and nothing else in this repository; the memory note says that half was imported into production on 4 Sep 2026 and both importers now refuse to run. So the novel/play/videogame part of the sample had to be constructed rather than read.

**Final sample: 36 works**, deliberately spanning every Type in the vocabulary and deliberately over-weighted towards the cases where the Italian title diverges, because the trivial cases are the ones every source gets right and they would flatter every number in this note:

| Type | n | Works |
|---|---:|---|
| Manga | 18 | One-Punch Man, Slam Dunk, Gokushufudou, Fullmetal Alchemist, Death Note, Berserk, Naruto, Kimi no Na wa., Devilman, Kuroiwa Medaka…, Tomie, Shingeki no Kyojin, Kimetsu no Yaiba, One Piece, Meitantei Conan, Hokuto no Ken, Rurouni Kenshin, Captain Tsubasa |
| Comic | 8 | Batman: The Man Who Laughs, Daredevil: Yellow, Spider-Man: Blue, Superman: For All Seasons, Batman: The Long Halloween, Marvels, Watchmen, Dylan Dog |
| Graphic Novel | 1 | Dimentica il mio nome (Zerocalcare) |
| Novel | 2 | The Fellowship of the Ring, The Catcher in the Rye |
| Play | 1 | Harry Potter and the Cursed Child |
| Videogame | 6 | Hades, Zelda: Breath of the Wild, Tetris, Dark Souls, Elden Ring, Final Fantasy VII |

**Seven of the eighteen manga are the "localised subset"** — the ones whose published Italian title differs from *both* the romaji and the English: Gokushufudou, Kuroiwa Medaka, Shingeki no Kyojin, Meitantei Conan, Hokuto no Ken, Rurouni Kenshin, Captain Tsubasa. Every table in §3 reports that subset separately, because it is the only subset the question is about. The sample's overall 7/18 = 39% localisation rate is in the same range as the population figure measured independently in §3d (38.0%), which is a check that the sample is not eccentric.

**Two ISBN sets are reused rather than rebuilt**: the 54 Italian comics ISBNs from `docs/research/cover-images-by-isbn.md` §7, so §4's numbers are directly comparable to that note's, and they were re-measured rather than inherited.

---

## 2. What each source's schema can actually say about a language

This is the make-or-break section and it is answered from schemas, not prose.

### 2a. Wikidata — labels, aliases, and `P1476`, all language-tagged

Three distinct places a title can live, and they mean three different things:

- **`labels`** — at most one per language code. Conventionally, for a work, the localised title. Retrieved with `action=wbgetentities&props=labels&languages=it`.
- **`aliases`** — any number per language code. Other names the thing goes by *in that language*.
- **`P1476` ("title")** — a `monolingualtext` claim: a `{language, text}` pair. Reserved for the *official* title, normally the original, usually with one or two values.

Measured shape, `Q586025` (Attack on Titan, manga):

```
$ curl -s -A 'tsundoku-research/1.0 (https://tsundoku.davideimola.dev; davide.imola@redcarbon.ai)' \
  'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q586025&props=labels|aliases|claims&languages=it|en|ja&format=json'
  labels.it   = "L'attacco dei giganti"
  aliases.it  = ["attacco dei giganti", "Shingeki no Kyojin"]
  P1476       = [("ja","進撃の巨人"), ("en","Attack on Titan"), ("zh-hant","進擊的巨人")]
```

That is the only free source in this survey that gives all three of the distinctions §5 is about, in one record, on a stable work identifier.

**Data licence: CC0.** "*All data in Wikidata has a CC0 license*" and "*When any Wikidata user makes a contribution to Wikidata, that user applies a CC0 license to their contribution as a term of use of the Wikidata website*" ([Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing), 2026-09-14). **Storing the returned titles is unambiguously permitted, privately and publicly, with no attribution obligation** — the only source here of which that is true. That matters against ADR-0013: the house posture on third-party content is "point at it, do not keep it", and this is the one case where the source itself says keeping it is fine.

**Rate limit:** not a published number. Wikimedia enforces a User-Agent policy and this session was served HTTP 429 at roughly 3 requests/second with a generic agent string (§9). One request every 1.5–2 s with a descriptive `User-Agent` carrying a contact ran clean for the whole session.

### 2b. Anime News Network — `lang="IT"`, and it means it

The encyclopedia API is XML and language-tags every alternative title:

```
$ curl -s 'https://cdn.animenewsnetwork.com/encyclopedia/api.xml?manga=~Attack+on+Titan'
<manga id="12308" ...>
  <info type="Main title" lang="EN">Attack on Titan</info>
  <info type="Alternative title" lang="IT">L'attacco dei Giganti</info>
  <info type="Alternative title" lang="ES">Ataque a los Titanes</info>
  ...
```

Nine language codes on that one record. The Italian values it does hold are editorially correct — `Ken il guerriero`, `Kenshin, Samurai Vagabondo`, `Capitan Tsubasa - Holly e Benji` — which is to say a human who knows the Italian market typed them.

**Terms**, quoted verbatim from ANN's own API page ([animenewsnetwork.com/encyclopedia/api.php](https://www.animenewsnetwork.com/encyclopedia/api.php), 2026-09-14):

> "We provide this API free of charge but you must list Anime News Network as the source of the data"
> "include a link to the relevant Encyclopedia entry (like "full details at Anime News Network") on any page that displays anime/manga/person details"
> "The API is rate-limited to 1 request per second per IP address; requests over this threshold will be delayed."

And, explicitly permitting storage:

> "please try to spare our poor servers by fetching (and then caching) details from this API only as needed … your backend would fetch the details for that single title and cache them for a week (older titles especially tend not to change so much)."

So: caching is invited, **a week is the number they name**, and any page displaying the data owes a visible credit and a per-title link back. That is a heavier obligation than Wikidata's none, and on the public showcase it would mean an ANN link on every tile.

The same page carries the sentence that explains a probe failure in this session, and it is a trap worth knowing:

> "You can also get results by name by specifying ~name instead of an id. Please note this does not match alternative titles, only the **primary** name (the one in the page title)."

### 2c. MangaDex — language-keyed, but the keys are user-contributed

`attributes.title` is a single-key map and `attributes.altTitles` is an **array of single-key maps**, each key a language code:

```
$ curl -s -A 'tsundoku-research/1.0' 'https://api.mangadex.org/manga?title=Gokushufudou&limit=1'
  attributes.title     = {"ja-ro": "Gokushufudou"}
  attributes.altTitles = [{"ja":"極主夫道"},{"fr":"La Voie du Tablier"},
                          {"en":"The Way of the Househusband"},{"es":"Yakuza Amo de Casa"},
                          {"pl":"Yakuza w fartuszku"},{"de":"Der Pfad des Hausmanns"},
                          {"pt-br":"Gokushufudou - Tatsu Imortal"},{"vi":"Đạo Làm Chồng Đảm"}, …]
```

Note what is *not* there: `it`. French, Spanish, Polish, German, Portuguese, Vietnamese and Nepali, but not the language the owner reads it in. That is representative — §3c measures it.

**The `it` values that do exist are frequently fan translations rather than published titles**, which is the finding that disqualifies MangaDex as an authority even where it has data. From the top-500 sweep (§3c): `Black Clover` → `Trifoglio nero` (Panini publishes it as *Black Clover*); `Kingdom` → `Il Regno` (Star Comics publishes it as *Kingdom*); `Mushoku Tensei` → `Reincarnazione senza lavoro: Ci proverò seriamente se vado in un altro mondo` (a literal gloss, not J-POP's title); `Real mo Tama ni wa Uso o Tsuku` → `Avvolte anche la realta mente`, which contains a spelling error (`avvolte` for `a volte`). And `Hokuto no Ken` carries **two** `it` values: `Ken il guerriero`, which is correct, and `Ken the Warrior`, which is English mis-tagged as Italian.

**Terms** ([api.mangadex.org/docs](https://api.mangadex.org/docs/), 2026-09-14): "*We make our API entirely public and free to use exclusively for projects that satisfy the following: You **MUST** credit MangaDex … You **CANNOT** run ads or paid services on your website and/or apps*". Nothing addresses storing metadata. **Rate limit**: "*A global limit of approximately 5 requests per second per IP address*", and "*The request MUST have a User-Agent header, and it must not be spoofed*" ([Limitations](https://api.mangadex.org/docs/2-limitations/)). No key.

### 2d. AniList — three named slots and a flat bag, introspected

Not taken from prose. The GraphQL schema, asked directly:

```
$ curl -s -X POST https://graphql.anilist.co -H 'Content-Type: application/json' \
   -H 'User-Agent: tsundoku-research/1.0' \
   -d '{"query":"{ __type(name:\"MediaTitle\"){ fields{ name type{name kind} } } }"}'
  romaji        String
  english       String
  native        String
  userPreferred String
```

and on `Media` itself: `title: MediaTitle`, `synonyms: [String]`, `countryOfOrigin: CountryCode`. **Four title fields, three of which name a script-or-market rather than a language, plus a list of bare strings.** There is no map, no locale, no type on a synonym. `userPreferred` is a per-viewer rendering of the same three slots, not a fifth title.

The consequence is concrete. Attack on Titan's 21 synonyms, verbatim as returned:

```
['Atak Tytanów','SnK','AoT','Ataque dos Titãs','Ataque a los Titanes',"L'Attacco dei Giganti",
 'Titana Saldırı','Útok titánů','Titaanien sota - Attack on Titan','Атака на титанов','Napad titana',
 'ผ่าพิภพไททัน',"L'Attaque des Titans",'Atacul Titanilor','進擊的巨人','진격의 거인','Đại chiến Titan',
 ' Ataque de los Titanes','Atac als Titans','Атака титанів','Атаката на титаните']
```

The Italian title is in there. Position six. Nothing distinguishes it from the Catalan one. To use it you would have to language-detect a two-to-five-word string, and *Marvels*, *Tomie* and *Berserk* would defeat any detector.

**Terms** ([docs.anilist.co/guide/terms-of-use](https://docs.anilist.co/guide/terms-of-use), 2026-09-14), and these bear directly on ADR-0013's question of whether you may *keep* what you fetched:

> "Free for non-commercial usage."
> "**Using the AniList API as a backup or data storage service is strictly prohibited.**"
> "**Hoarding or mass collection of data from the AniList API is strictly prohibited.**"
> "Use of the AniList API within competing, non-complementary services of the same nature is prohibited. This includes, but is not limited to, anime and manga list or tracker services. The restriction applies to all data provided through the API, including both user data and media data."

That third clause is worth reading twice. tsundoku is a personal library tracker; the exclusion names "anime and manga list or tracker services" and says it applies to media data as well as user data. Whether a single-owner reading log is a "competing, non-complementary service" is a judgement AniList would make, not one this note can make for them — but it is not an obviously comfortable fit, and combined with the storage prohibition it is not a source to build a stored-titles feature on. **Rate limit**: "*The AniList API has a rate limit of 90 requests per minute*", currently reduced — "*The API is currently in a degraded state and is limited to 30 requests per minute. This is a temporary measure until the API is fully restored.*" ([Rate Limiting](https://docs.anilist.co/guide/rate-limiting), 2026-09-14).

### 2e. MangaUpdates — `associated`, and the language written into the string

Live, `GET /v1/series/76941273872` (Hokuto no Ken):

```json
"associated": [{"title":"El Puño de la Estrella del Norte"},{"title":"Fist of the North Star"},
               {"title":"Ken il guerriero"},{"title":"Pięść Gwiazd Północy (Polish)"},
               {"title":"Кулак Северной Звезды"},{"title":"北斗の拳"}]
```

An array of objects with exactly one key, `title`. **The tell is the fourth entry**: a contributor needed to say "this one is Polish" and the only place to put it was inside the string. The same pattern recurs — Kuroiwa Medaka has `"Craque pour moi, Medaka ! (French)"`, Rurouni Kenshin has `"Kenshin Le Vagabond (French)"`. A schema with no language field produces a convention of parenthesising the language, which is exactly the failure mode a `text` column with no language column produces, and it is the failure mode this whole note is about.

`publishers[].type` is also worth noting, because it looks like it might help and does not: the only values observed are `"Original"` and `"English"`. There is no Italian publisher in MangaUpdates' model, so there is no route from "who published it in Italy" to "what they called it".

**Terms and rate limits: none published.** `mangaupdates.com/tos.html` and `/about.html` both 404; the API reference at `api.mangaupdates.com` (3.7 MB of Redoc) contains no rate-limit statement and no terms-of-use section. Authentication is `bearerAuth` on write endpoints only; the reads used here were unauthenticated. **Treat both the licence and the limit as undocumented**, which for a public page means not relying on either.

### 2f. MyAnimeList — `"synonyms" or ISO 639-1`, but only `en` and `ja` exist

MAL's own OpenAPI schema, from its own reference page ([myanimelist.net/apiconfig/references/api/v2](https://myanimelist.net/apiconfig/references/api/v2), 2026-09-14):

```json
"alternative_titles": {
  "type": "object",
  "description": "\"synonyms\" or ISO 639-1\n",
  "properties": {
    "synonyms": {"type":"array","items":{"type":"string"}},
    "en": {"type":"string"},
    "ja": {"type":"string"}
  }
}
```

The description gestures at ISO 639-1 and then declares two properties. There is no `it`, and the schema does not contemplate one. Authentication: "*When user login is not required, the `X-MAL-CLIENT-ID` request header can be used to authenticate the client by setting your API client ID*" — so a registered client id is required even for public reads; `GET https://api.myanimelist.net/v2/manga?q=berserk` without one returns **403**.

**MAL could not be probed live in this session.** Jikan, the community wrapper, returned `{"status":504,"type":"BadResponseException","message":"Jikan failed to connect to MyAnimeList. MyAnimeList may be down/unavailable or refuses to connect"}` on every attempt across several hours. No coverage figure is offered for MAL rather than a guessed one. The schema above is MAL's own and stands regardless; it is enough to answer the only question that matters here, which is *no Italian*.

### 2g. ComicVine — a newline-separated string

From the API documentation's own field tables ([comicvine.gamespot.com/api/documentation](https://comicvine.gamespot.com/api/documentation), 2026-09-14), repeated identically on every resource:

> "`aliases` — List of aliases the character is known by. A \n (newline) seperates each alias."

One string, newline-delimited, no language, no type. Keyless calls are refused (`{"error":"Invalid API Key","status_code":100}`, verified 2026-09-14). The restrictive terms are already recorded in `cover-images-by-isbn.md` §5 and have not changed: 200 requests per resource per hour, non-commercial only, mandatory link-back, and "*Do not edit, manipulate or reproduce on any other medium*". ComicVine also has no ISBN (that note's finding), so it cannot be reached from a Volume either. **Structurally inapplicable, twice over.**

### 2h. IGDB — a free-text `comment`

From IGDB's own endpoint reference ([api-docs.igdb.com](https://api-docs.igdb.com/), 2026-09-14), the `alternative_names` field table verbatim:

| field | type | description |
|---|---|---|
| `checksum` | uuid | Hash of the object |
| `comment` | String | **"A description of what kind of alternative name it is (Acronym, Working title, Japanese title etc)"** |
| `game` | Reference ID for Game | The game this alternative name is associated with |
| `name` | String | An alternative name |

`comment` is prose typed by a contributor. "Japanese title" is given as an *example* of what someone might write, not as a value from a vocabulary. **Authentication**: `Client-ID` plus `Authorization: Bearer <App Access Token>` from Twitch; keyless calls return an authorization failure (verified 2026-09-14). **Rate limit**: "*There is a rate limit of 4 requests per second. If you go over this limit you will receive a response with status code 429 Too Many Requests.*"

**Unmeasured**, deliberately: obtaining a Twitch app registration was out of scope for this session, and no coverage figure is offered rather than a guessed one. If it is ever tested, test it against the six videogames in §10 so the numbers are comparable. The structural answer — no language code — does not depend on measuring it.

### 2i. RAWG — a key, and terms that forbid keeping it

`GET https://api.rawg.io/api/games?search=Hades` without a key returns `{"error": "The key parameter is not provided"}` (2026-09-14). From RAWG's own API page ([rawg.io/apidocs](https://rawg.io/apidocs), 2026-09-14):

> "Free — For personal and hobby projects · **Non-commercial projects only** · up to 20,000 requests per month · **Required backlinks to RAWG from pages where the data is used**"
> "Free for personal use as long as you attribute RAWG as the source of the data and/or images and add an active hyperlink from every page where the data of RAWG is used."
> "**No data redistribution.** It would not be cool if you used our API to resell our data or make it available for other businesses. In other words, you may use the data with your API access only for your projects."

A backlink on **every page** where the data is used is a heavier obligation than any cover source in ADR-0013, for a type of story where §3f shows there is almost nothing to gain.

### 2j. Open Library — the language is on the *edition*, never on a title

Open Library does not have language-tagged titles. It has a **Work/Edition split**, and the language lives on the edition, which carries its own title. Their own words ([openlibrary.org/dev/docs/api/books](https://openlibrary.org/dev/docs/api/books), 2026-09-14):

> "A Work is a logical collection of similar Editions. "Fantastic Mr. Fox" could be a Work which contains a Spanish translation edition, or perhaps a 2nd edition which has an additional chapter or corrections. Work metadata will include general umbrella information about a book, whereas an Edition will have a publisher, an ISBN, a book-jacket, and other specific information."

When the data is there, this works beautifully. `/works/OL3335245W/editions.json?limit=300` — The Catcher in the Rye — returns 204 editions in 17 languages, and reading the title off the first edition of each language gives:

```
eng  The Catcher in the Rye        ita  Il Giovane Holden
fre  L'Attrape-Coeurs              ger  Der Fänger im Roggen
spa  El guardián entre el centeno  por  O Apanhador no Campo de Centeio
pol  Buszujący w zbożu             chi  麦田里的守望者
```

**That is a correct, language-attributed, work-keyed multilingual title list, derived rather than stored.** The catch is §4b: Open Library holds records for 5.6% of Italian comics ISBNs, and the three works it does hold have exactly one edition each.

### 2k. Google Books — no work identifier at all

Google Books is keyed by *volume*, one id per edition, with `industryIdentifiers` carrying ISBNs. There is no work entity and therefore nothing to key a multilingual title list to; a Google Books lookup returns the Italian edition's Italian title, which is a fact tsundoku already has on the Volume.

Re-verified 2026-09-14, unchanged from `cover-images-by-isbn.md`:

```
$ curl -s "https://www.googleapis.com/books/v1/volumes?q=isbn:9788822632753"
{"error":{"code":429,"message":"Quota exceeded for quota metric 'Queries' and limit
 'Queries per day' of service 'books.googleapis.com' …"}}

$ curl -s "https://books.google.com/books?bibkeys=ISBN:9788822632753&jscmd=data&callback=x"
<TITLE>302 Moved</TITLE>   # jscmd=data is not served on this host
```

The keyless Dynamic Links path (`jscmd=viewapi`) still works and still returns only `info_url`, `thumbnail_url`, `preview` and `embeddable` — **no title**. So Google Books cannot supply a title without a Cloud project and key, and with one it supplies an edition title and no work id. **Structurally the wrong shape for this question**, independent of its excellent 91% cover rate.

### 2l. OPAC SBN — *titolo uniforme*, which is exactly the right idea

The Italian national catalogue is the one source in this survey that models the distinction the way a cataloguer would. Its record for the 2024 Panini *Extreme edition* of Ken il guerriero, `ITICCUMOD1786630`, carries **both** of these as distinct fields:

```
Titolo             : Ken il guerriero / storia originale Buronson, manga Tetsuo Hara
Titolo parallelo   : Hokuto no Ken
Titolo di opera    : Hokuto no Ken   → authority record MOD0784838
                     ("Scheda di autorità", /c/opac/opere/view?id=MOD0784838)
```

A publication title, a parallel title, and a *work* authority with its own stable identifier that other publications point at — *Ken il guerriero* (Panini 2024), *Ken il guerriero* (Kappa 1999) and the Planet Manga 2025 edition all hang off the same opera. That is a Work/Edition split with a uniform title, in the national catalogue, for Italian comics, which is precisely the population every other source is empty on. §4d measures it.

The API is the site's own undocumented XHR surface (`/o/opac-api/…`, a Liferay app), unauthenticated, and as flaky as `cover-images-by-isbn.md` §6a reported. **No terms of use, licence or rate-limit statement covering the catalogue data could be found** on `opac.sbn.it` or `iccu.sbn.it` in this session — the same gap that note recorded for the Alphabetica cover images. Treat the public case as unsettled.

### 2m. The structural table

| Source | Work identifier | Shape of the alternative-title field | Language-tagged? | Italian possible? |
|---|---|---|:--:|:--:|
| **Wikidata** | QID | `labels[lang]`, `aliases[lang][]`, `P1476` monolingualtext | **yes** | **yes** |
| **Anime News Network** | encyclopedia id | `<info type="Alternative title" lang="XX">` | **yes** | **yes** |
| **MangaDex** | UUID | `altTitles: [{<lang>: string}]` | **yes** | yes, thin & unvetted |
| **OPAC SBN** | opera id (`MOD0784838`) | *Titolo* vs *Titolo parallelo* vs *Titolo di opera* | partly (work vs publication, not by code) | **yes** |
| **Open Library** | Work OLID | title is on the *Edition*; language is on the Edition | via editions | yes, if the edition exists |
| AniList | media id | `title {romaji english native}` + `synonyms: [String]` | no | no field |
| MangaUpdates | series_id | `associated: [{title}]` | no | no field |
| MyAnimeList | mal id | `alternative_titles {synonyms[], en, ja}` | `en`/`ja` only | no |
| ComicVine | id | `aliases`: one `\n`-separated string | no | no |
| IGDB | id | `alternative_names {name, comment}`, comment free text | no | no |
| RAWG | id | untyped alternative names | no | no |
| Google Books | **none** (volume ids only) | n/a — edition title only | n/a | n/a |

---

## 3. Measured Italian coverage

### 3a. The sample, source by source, on the seven works where it matters

The full 36-row table is in §10. This is the subset that decides the question — the seven manga whose Italian title differs from both the romaji and the English:

| Work | published Italian title | Wikidata | ANN | MangaDex | AniList | MangaUpdates |
|---|---|:--:|:--:|:--:|:--:|:--:|
| 進撃の巨人 Shingeki no Kyojin | L'attacco dei giganti | **it** ✓ | **IT** ✓ | **it** ✓ | in bag | in bag |
| 北斗の拳 Hokuto no Ken | Ken il guerriero | **it** ✓ | **IT** ✓ | **it** ✓ | — | in bag |
| るろうに剣心 Rurouni Kenshin | Kenshin - Samurai vagabondo | **it** ~ | **IT** ✓ | — | in bag | in bag |
| キャプテン翼 Captain Tsubasa | Capitan Tsubasa | **it** ✓ | **IT** ✓ | — | — | — |
| 名探偵コナン Meitantei Conan | Detective Conan | **it** ✓ | — | — | in bag | in bag |
| 極主夫道 Gokushufudou | La via del grembiule : lo yakuza casalingo | **it** ✓ | *absent* | — | in bag | in bag |
| 黒岩メダカに… Kuroiwa Medaka | Medaka Kuroiwa è impenetrabile | **✗** | *absent* | — | — | — |
| | **found at all** | **6/7** | 4/7 | 2/7 | 4/7 | 5/7 |
| | **and identifiable as Italian** | **6/7** | **4/7** | **2/7** | **0/7** | **0/7** |

`✓` = present and language-tagged; `~` = present but not byte-identical to the published title (Wikidata's label is `Kenshin Samurai vagabondo`, without Panini's hyphen — its *sitelink* has the hyphen); "in bag" = the string is present in an untyped synonyms array, unaddressable; "—" = absent; "*absent*" = the source has no record for the work at all.

**Read the last two rows together.** MangaUpdates finds more Italian titles than ANN and MangaDex do, and delivers none of them, because nothing in the response says which is which.

**The row that matters most is the last one.** Kuroiwa Medaka is the example the owner used to describe the problem. Its Wikidata item `Q109368327` is labelled **"My Charms Are Wasted"** — not the Italian, not even the official English (*Medaka Kuroiwa Is Impervious to My Charms*, which Wikidata holds as a separate anime item). Searching Wikidata for the Italian title returns nothing:

```
$ curl -s 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=Medaka%20Kuroiwa%20%C3%A8%20impenetrabile&language=it&format=json'
  {"search": []}
```

### 3b. The whole 36-work sample, by Type — Wikidata

| Type | n | has an `it` label | label == published Italian title |
|---|---:|---:|---:|
| Manga | 18 | 18 | 15 |
| Comic | 8 | 6 | 6 |
| Graphic Novel | 1 | 1 | 1 |
| Novel | 2 | 2 | 2 |
| Play | 1 | 1 | 1 |
| Videogame | 6 | 3 | 3 |
| **Total** | **36** | **31 (86%)** | **28 (78%)** |

Three caveats keep this number honest and all three cut the same way:

1. **The sample is famous.** §3e repeats the measurement against a publisher's whole catalogue and gets half this.
2. **The three videogames with no `it` label** (Breath of the Wild, Elden Ring, Final Fantasy VII) all have an Italian Wikipedia sitelink whose title is byte-identical to the English one. The label is missing; the answer is not.
3. **Two of the three "label ≠ published title" manga misses are my sample's fault, not Wikidata's.** For Gokushufudou I recorded the short form *La via del grembiule* as expected; Wikidata's label is *La via del grembiule - Lo yakuza casalingo*, and OPAC SBN record `ITICCUBCT0060261` confirms Wikidata is right and I was wrong (§9). For Rurouni Kenshin the difference is one hyphen. That leaves Kuroiwa Medaka as the only genuine content miss.

### 3c. MangaDex, at population scale: 9.6%

Not a sample of my choosing — the 500 most-followed series on the platform:

```bash
for off in 0 100 200 300 400; do
  curl -s -A 'tsundoku-research/1.0' \
    "https://api.mangadex.org/manga?limit=100&offset=$off&order[followedCount]=desc" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(sum(1 for m in d['data'] if any('it' in t for t in m['attributes']['altTitles'])))"
  sleep 1
done
```

**48 of 500 (9.6%)** carry an `it` alt title. And, as §2c shows, a meaningful fraction of those 48 are fan glosses rather than the published title — *Trifoglio nero* for a series Panini publishes as *Black Clover*, *Il Regno* for one Star Comics publishes as *Kingdom*. **MangaDex is not an authority on Italian commercial titles; it is a crowd with a language field.** The language field is the valuable part and the values are not.

### 3d. How often the Italian title actually differs — Wikidata SPARQL, population-scale

This is the number that says how big the problem is at all, and it is measured against Wikidata's whole corpus, not a sample:

```bash
curl -s -H 'Accept: application/sparql-results+json' \
  -H 'User-Agent: tsundoku-research/1.0 (https://tsundoku.davideimola.dev; davide.imola@redcarbon.ai)' \
  --data-urlencode 'query=SELECT (COUNT(*) AS ?n) (SUM(IF(STR(?en)=STR(?it),1,0)) AS ?same) WHERE {
    ?w wdt:P31 wd:Q21198342 ; rdfs:label ?en , ?it .
    FILTER(LANG(?en)="en") FILTER(LANG(?it)="it") }' \
  https://query.wikidata.org/sparql
```

| Wikidata class | items with **both** `en` and `it` labels | labels differ | differ beyond case/punctuation/accents |
|---|---:|---:|---:|
| manga series (`Q21198342`) | 2,563 | 1,222 — **47.7%** | 974 — **38.0%** |
| comic book series (`Q1760610`) | 78 | 15 — 19.2% | *(n too small)* |
| video game (`Q7889`) | 13,290 | 2,572 — 19.4% | 1,830 — **13.8%** |
| literary work (`Q7725634`) | 22,851 | *(query timed out; see §11)* | — |

`STR()` is load-bearing: without it, two literals with different language tags are never equal in SPARQL and the "same" count is silently 0 (§9).

Samples of genuine manga divergence, straight out of the query:

```
'Barefoot Gen'          -> 'Gen di Hiroshima'
'Himitsu no Akko-chan'  -> 'Lo specchio magico'
'Man of Many Faces'     -> 'Il ladro dalle mille facce'
'Future Diary'          -> 'Mirai nikki - Future Diary'
'Chūka Ichiban!'        -> 'True Cooking Master Boy'
'Black God'             -> 'Kurokami'
```

Note the last three: the Italian title is sometimes *more* Japanese than the English one, and sometimes a different English one. There is no direction to the transformation, which is why §7's conclusion is what it is.

### 3e. The number that should decide this: a whole Italian publisher's catalogue

Every figure above is drawn from works somebody thought to put in a sample. This one is not. Edizioni Star Comics publishes its complete list of titles on one page:

```bash
curl -s -A '<browser UA>' -L 'https://www.starcomics.com/catalogo-fumetti?search=' \
  | grep -oE 'href="/titoli-fumetti/[^"]+"[^>]*>.*?</a>'   # 759 distinct titles
```

**759 published Italian titles**, from one of the five publishers on the owner's shelf.

**Bulk match**, against every Wikidata item of class manga / manga series / comics / comic book series that has an Italian label (3,666 items), normalising case, accents and punctuation: **157/759 — 20.7%**.

**Search-based match**, which is fairer because it is not restricted by class — a random 40 (seed 20260914) put through `wbsearchentities` in Italian and counted as a hit only if some returned item's label or alias matches the catalogue title exactly after normalisation:

```
Star Comics random 40: Wikidata item with a matching Italian label/alias  21/40 (52%)
```

**But four of the 21 are wrong**, and they are wrong in an instructive way:

| Catalogue title | Matched | Which is actually… |
|---|---|---|
| `YUKO` | `Q4023333` "Yūko" | a female given name |
| `DUCK AND COVER` | `Q629826` "Duck and Cover" | a Mad Caddies album |
| `RINNE` | `Q27891016` "Rinne" | a surname |
| `WORLD APARTMENT HORROR` | `Q17040370` | the 1991 Ōtomo *film*, not the manga |

So the honest recall is **17/40 ≈ 43%**, at a **~10% false-positive rate on exact string equality**. An exact string match on a short title is not a reconciliation; it is a coincidence detector with a good hit rate.

**And now the finding that matters more than the percentage.** Split those 40 by whether the title is *actually in Italian*:

| Slice | n | reconciled |
|---|---:|---:|
| Titles that are English/romaji/Japanese in Italy (`FAIRY TAIL`, `THERMAE ROMAE`, `PHANTOM SEER`, `BEYBLADE X`, …) | 31 | 15 |
| **Titles that are genuinely Italian** (`LA CULLA DEI DEMONI`, `LA PROCESSIONE FUNEBRE DI K`, `L'ARTE DEL SUSHI`, `LA MADONNA DEL PELLINI`, `LE BIZZARRE AVVENTURE DI JOJO: CRAZY DIAMOND`, `ONE PIECE FILM RED - ROMANZO`, `3650 GIORNI SENZA TE`, `I PUFFI`, `COME DOPO LA PIOGGIA`) | 9 | **2** |

**22% on the titles that are the problem, 48% on the titles that are not.** Every headline coverage number in this note is inflated by the works whose Italian title is the English one.

### 3f. Videogames

Three things, and together they say the videogame half is nearly solved and not by any of the game APIs:

1. **The divergence rate is low and mostly cosmetic** — 13.8% of Wikidata video games with both labels differ beyond punctuation, and inspecting them, the bulk is subtitle presence (`Fire Emblem: The Blazing Blade` → `Fire Emblem`), British spelling (`Sonic Colors` → `Sonic Colours`), or bracket style. Genuine Italian titles exist — `LEGO Star Wars: Il videogioco`, `Uncharted 3: L'inganno di Drake`, `Star Wars: L'Impero in guerra`, `L'incredibile Hulk` — and they are the tail of a tail.
2. **Wikidata covers the sample**: 3/6 have an `it` label and the other three have an Italian Wikipedia sitelink identical to the English title. Searching by the stored title found the right item for **6/6**.
3. **The two game-specific sources fail structurally and need credentials** (§2h, §2i) — IGDB's language information is a free-text `comment`, RAWG's is nothing, and RAWG's free tier demands a backlink on every page.

There is nothing here worth registering an API client for. The games half costs one Wikidata lookup and usually returns the string you already had.

---

## 4. The ISBN → work-identifier path

tsundoku has `volume.isbn`, `volume.language` and `volume.title` on the object, and `story.title` on the work; Story↔Volume is many-to-many (`volume_story`). So the question is whether an *edition* identifier can reach a *work* identifier. Four candidates, all measured on the same 54 Italian comics ISBNs as `cover-images-by-isbn.md` §7.

### 4a. Wikidata `P212` / `P957`: 1/54

Wikidata stores ISBN-13 **hyphenated**, so a naive `VALUES` join on bare digits returns 0 and looks like a clean negative (§9). Corrected method — pull every Italian-prefix ISBN-13 in Wikidata and match locally:

```bash
curl -s -H 'Accept: application/sparql-results+json' -H 'User-Agent: …' \
  --data-urlencode 'query=SELECT ?raw ?w WHERE { ?w wdt:P212 ?raw .
     FILTER(STRSTARTS(?raw,"978-88") || STRSTARTS(?raw,"97888")
         || STRSTARTS(?raw,"979-12") || STRSTARTS(?raw,"97912")) }' \
  https://query.wikidata.org/sparql
```

- **367,196** `P212` statements in the whole of Wikidata.
- **2,502** with an Italian registrant prefix, after hyphen-stripping.
- **1 of the 54 sample ISBNs matches**: `9788865432549` → `Q18397554`, *Dimentica il mio nome*. An Italian original by a famous Italian author — i.e. an item somebody made for the *work*, to which an ISBN happened to get attached.

**Wikidata is not an ISBN index and should not be used as one.** Its items are works; the ISBNs on them are incidental.

### 4b. Open Library: 3/54, and the three lead nowhere

Re-measured, not inherited. `/isbn/<isbn>.json` **302s** to the edition, so the request must follow redirects (§9):

```bash
while read isbn; do
  curl -sL -A 'tsundoku-research/1.0 (davide.imola@redcarbon.ai)' \
       "https://openlibrary.org/isbn/${isbn}.json"
  sleep 1.2
done < isbns.txt
```

- **Edition record: 3/54 (5.6%)** — identical to 2026-08-30. All three Bao Publishing.
- **Linked to a Work OLID: 3/3.** The Work/Edition split is real where the data is.
- **Editions in more than one language, on those three works: 0.** `OL24323074W`, `OL22913083W` and `OL24346541W` each have `"size": 1` and `["ita"]`.

So the mechanism that produced seventeen languages for *The Catcher in the Rye* (§2j) produces, on Italian comics, three works with one Italian edition each. The 403-vs-404 trap from the earlier note still applies and the probe above records raw status.

### 4c. Google Books: no work identifier exists

Covered in §2k. Re-verified 2026-09-14. Even with a Cloud key the return is a per-edition volume record whose `title` is the Italian edition's title — a string tsundoku already stores on the Volume — and there is no work entity to hang anything else off.

### 4d. OPAC SBN: 50/54 records, 26/54 with a work authority — and it is the only path that works

```bash
# ISBN -> record id.  ISBN:7 is the access code; the generic Numerostandard:1016
# silently degrades to free text and returns 0 (cover-images-by-isbn.md §6a).
curl -s -X POST 'https://opac.sbn.it/o/opac-api/titles-search-full-post' \
  --data-urlencode 'core=sbn' --data-urlencode 'fieldstruct[1]=ricerca.parole_tutte:4=6' \
  --data-urlencode "fieldvalue[1]=${isbn}" --data-urlencode 'fieldaccess[1]=ISBN:7'
# record id -> full record, then read the "Titolo di opera" authority link
curl -s "https://opac.sbn.it/o/opac-api/title?id=${rid}&core=sbn" \
  | grep -o 'Titolo_uniforme:@frase@=[A-Z0-9]*'
```

| | count | share |
|---|---:|---:|
| Bibliographic record for the ISBN | **50/54** | **92.6%** |
| Record linked to a *Titolo di opera* authority | **26/54** | **48.1%** |

A selection of what comes back, which is worth reading because it shows both the promise and the limit:

| ISBN | Publication | Opera id | Uniform title |
|---|---|---|---|
| `9791256292271` | Dylan Dog. Amore e morte | `MIL1180384` | Ascensore per l'inferno |
| `9788891298294` / `9788891298737` | Slam Dunk 17, 18 | `UBO4531200` | Suramu Danku |
| `9788891254306` / `9788891295613` | Naruto 33, Naruto 6 | `LZ10247106` | Naruto |
| `9788863464801` | Death Note 10 | `BCT0001886` | Death note |
| `9788891237613` | Spider-Man: Blu | `BVE0871287` | Spider-Man. Blue |
| `9788832750430` | Tomie | `CSA0186462` | Ito Junji Kassakushu, vol. 1 |
| `9788865432549` | Dimentica il mio nome | `UFE0987894` | Dimentica il mio nome |

**Two ISBNs of the same work land on the same opera id** (both Slam Dunk volumes → `UBO4531200`; both Naruto volumes → `LZ10247106`). That is exactly what a work identifier is for, and it is the only place in this entire survey where an Italian comics ISBN reaches one.

The limits are real. The uniform title is a *cataloguer's* title following REICAT, not a display title — `Suramu Danku` is a romanisation nobody would print. It does not carry a language code. And **whether the authority record itself holds variant titles could not be established**: `/c/opac/opere/view?groupId=20122&id=UBO4531200` is client-rendered and returns no data server-side, and no `/o/opac-api/` route for authority records could be found (`opere`, `authority-opere`, `opera-detail` all 404; `title?id=UBO4531200` returns `{"status":"success","data":null}`). That is §11's first open question and it is the one most worth ten more minutes.

### 4e. What this means for the model

An ISBN identifies an *edition of an object*. tsundoku's Story↔Volume is many-to-many precisely because that is not the same thing as a work — *Batman: L'uomo che ride* holds three Stories in one object, *Slam Dunk* is one Story across twenty. So even a perfect ISBN→work bridge would answer for one Volume at a time and would have to be reconciled against which of the Stories on that Volume it meant. **For the 39 of the owner's 77 catalogued objects that are One-Punch Man and Slam Dunk volumes, twenty ISBNs would resolve to one work each — twenty lookups for two answers.** The reconciliation this library needs is Story→work, which is title-shaped, not ISBN-shaped.

### 4f. Does an opera authority carry variant titles? The route exists, the field exists, and it is empty on comics — 2026-09-14

§4d left this open because `/c/opac/opere/view?id=…` is client-rendered and no API route was found. Both are now settled.

**The route.** The page is not client-rendered at all — it 302s to a server-rendered detail URL, and that HTML contains the API core name the previous session was missing. The whole discovery is two commands:

```bash
curl -sL 'https://opac.sbn.it/c/opac/opere/view?id=MOD0784838' -o opera.html
#   -> 200 https://opac.sbn.it/risultati-opere/-/opac-opere/detail/MOD0784838
grep -o 'opac-api[^"'"'"' ]*' opera.html | sort -u
#   opac-api/detail/print-pdf?core=opere&id=MOD0784838
#   opac-api/title
```

`core=opere`, not `core=sbn`. That one token is why `title?id=UBO4531200&core=sbn` returned `"data":null`. Three working routes follow:

```bash
# 1. the authority record as JSON
curl -s 'https://opac.sbn.it/o/opac-api/title?id=MOD0784838&core=opere'
# 2. the authority record as UNIMARC/A (ISO 2709), which is the field-level truth
curl -sL 'https://opac.sbn.it/c/opac/opere/unimarc/export?id=MOD0784838'
# 3. free-text search of the *authority* index
curl -s -X POST 'https://opac.sbn.it/o/opac-api/titles-search-full-post' \
  --data-urlencode 'core=opere' --data-urlencode 'fieldstruct[1]=ricerca.parole_tutte:4=6' \
  --data-urlencode 'fieldvalue[1]=Hokuto no Ken' --data-urlencode 'fieldaccess[1]=Any:1016'
```

There is also a stable permalink the record hands you itself, `https://opac.sbn.it/opera/MOD0784838`, and a UNIMARC HTML view at `/c/opac/opere/unimarc?groupId=20122&id=…`. No SRU endpoint was found (`/sru`, `/o/opac-api/sru` both 404; `sru.sbn.it` does not resolve) and `dati.sbn.it` does not resolve either.

**The answer for `MOD0784838`: no. It knows only *Hokuto no Ken*.** Its whole UNIMARC/A record is:

```
100  a20030314xitaa50      ba0
101  ajpn
152  aREICAT
241 1231  aHokuto no Ken
500 03MODV1661155xxxxaaBuronson4070
501 13MODV166116aHarab, Tetsuo4440
501 13MODV166116aHarab, Tetsuo4901
801  3aITbICCUc20260907
```

One `241` uniform title, a language of the *work* (`101 $a jpn` — the language the work was written in, not a tag on a title), two name-authority links, and nothing else. `UBO4531200` (`241 $a Suramu Danku`), `LZ10247106` (`Naruto`), `MIL1180384` (`Ascensore per l'inferno`), `BVE0871287` (`Spider-Man. Blue`), `CSA0186462`, `UFE0987894` and `BCT0001886` are all the same shape.

**The field exists and SBN does populate it — just not here.** UNIMARC/A `431`, labelled **"Forme varianti"** in the UI. `SBL0039467`, the authority for *Le petit prince*, carries five:

```
241 1231  aLe petit princed1943
431   aIl Piçul Princip3BVE1025644
431   aEl principe picenin 3BVE1025646
431   aThe little prince3BVE1025649
431   aEl picio principe 3BVE1025650
431   aIl piccolo principe3VIA0617802
```

So the Italian national catalogue's work authority *can* hold *Il piccolo principe* next to *Le petit prince*. That is exactly the shape this note was hoping for — and it comes with two caveats that matter as much as the coverage number below:

- **The bag is flat and untagged.** Friulian, Piedmontese, English, Venetian and Italian sit in one list with no language code anywhere in the field. This is the MangaUpdates `associated` shape (§2e), not the Wikidata shape (§2a). A consumer would have to guess which of the five is the Italian one.
- **The `$3` subfield is not a resolvable id.** `BVE1025644`, `BVE1025649` and `VIA0617802` all return `numFound="0"` from the opere core, so the language cannot be recovered by following the link either. (The export route leaks its backing Solr on a miss — `<str name="q">bid:"VIA0617802"</str>`, `fl=nome,titolo,id,data_agg,unimarc`.)

**The negative for Ken is a real negative, not a gap in the probe.** The authority index searches `431` — searching `core=opere` for the Venetian variant returns the French record:

```bash
# fieldvalue[1]=El picio principe  ->  {"id": "SBL0039467", "title": {"text": "Le petit prince"}}
# fieldvalue[1]=Hokuto no Ken      ->  {"id": "MOD0784838", ...}  (rank 1 of 17)
# fieldvalue[1]=Ken il guerriero   ->  3 results, MOD0784838 among none of them:
#   VIA0209171  "Ken il guerriero : la *leggenda di Raoul <film ; 2007>"
#   MOD1534057  "Ken il guerriero <film ; 1986>"
#   RAV2221653  "Ken il guerriero. La leggenda di Hokuto <manifesto ; 2006>"
```

The Italian title *does* exist in the opere archive — as three separate opera records for the 1986 film, the 2007 OVA and a poster, each with its own Italian uniform title, none of them linked to the manga's opera. **The manga work authority and the Italian commercial title never meet.**

**Coverage, measured over the whole 54-ISBN sample.** Re-run of §4d's pipeline, then the UNIMARC export for each distinct opera, 1.5 s between requests:

| | count |
|---|---:|
| Bibliographic record for the ISBN | 50/54 |
| Record linked to a *Titolo di opera* authority | 25/54 |
| Distinct opera authorities reached | **21** |
| …of which carry **any** `4XX` field | **0/21** |
| …of which carry a "Forme varianti" title | **0/21** |

(25/54 against §4d's 26/54 — one ISBN's link differs between runs; the catalogue is live and both figures round to the same ~47%.) Every one of the twenty-one records has the same field set: `001 003 005 100 [101] [102] 152 241|231 500 [501…] 801`. **Not one variant title in the entire Italian-comics half of the sample.**

**Where the Italian title actually lives, and why that is not a win.** It is on the *bibliographic* record, which the ISBN already reached in one hop:

```
Titolo             : Ken il guerriero / storia originale Buronson, manga Tetsuo Hara
Titolo parallelo   : Hokuto no Ken
Titolo di opera    : Hokuto no Ken   -> MOD0784838
```

So the ISBN→opera bridge adds the *romanised Japanese* uniform title to a record that already had the Italian one — and the Italian one is `volume.title`, a string tsundoku stores already. The bridge runs in the wrong direction for this note's question. Its value is unchanged from §4d and §4e: it is a **work identifier** that collapses several ISBNs onto one id, not a source of language-tagged titles.

**A second bridge, and it is smaller than the first.** Wikidata does mint an external-id property for this — `P10396` "SBN work ID", formatter `https://opac.sbn.it/opera/$1`, which is precisely the permalink the API returns. It is not usable:

```bash
curl -s -H 'Accept: application/sparql-results+json' \
  --data-urlencode 'query=SELECT (COUNT(*) AS ?n) WHERE { ?w wdt:P10396 ?id }' \
  https://query.wikidata.org/sparql          # -> 211
# same for P5485 "SBN books ID" (the bid)     # -> 2449
# VALUES over the eight sample opera ids      # -> 0 rows
```

**211 statements in the whole of Wikidata**, and none of the eight sampled opera ids among them. Recorded so nobody re-discovers it hopefully.

**Licence, cheaply, still unsettled but narrowed.** `opac.sbn.it` carries no terms link at all — only a privacy policy (`/web/opacsbn/privacy`, plus `beniculturali.it/privacy-policy`). `iccu.sbn.it` has exactly one, `/it/footer/sito/termini-duso/`, and it is scoped to the website rather than the catalogue:

> "Ai testi redazionali e alle immagini del sito dell'ICCU, salvo specificamente indicato, è applicata la licenza Creative Commons Attribuzione - Non commerciale - Condividi allo stesso modo 3.0 Italia (CC BY-NC-SA 3.0 IT)"

*Testi redazionali e immagini del sito* — editorial copy, not bibliographic records, and on a different host from the OPAC. The one CC0 declaration ICCU does make covers the **Anagrafe delle Biblioteche** (the library registry: `anagrafe.iccu.sbn.it/it/open-data/`), which is a different dataset. ICCU's own Linked Open Data page (`/it/attivita-servizi/attivita-nazionali/pagina_0007.html`) describes the LOD working group and names no licence and no SPARQL endpoint. **So: no licence statement covering OPAC SBN catalogue data exists that this session could find, and the nearest statement is explicitly about something else.** Unchanged verdict from §2l — treat the public case as unsettled and ask ICCU.

**Verdict.** The bridge is real, the route is now known, and it leads to a uniform title and nothing more. On this population the authority's variant-title slot is empty 21 times out of 21, so **OPAC SBN is not a source of language-tagged work titles for Italian comics.** The recommendation in §11 stands exactly as written, and the "one thing worth ten more minutes" has been spent: the answer is no.

---

## 5. Prior art: canonical title, localised display title, search alias

The three-way distinction the brief asks about is drawn cleanly by exactly one of these systems and approximated by the rest.

### 5a. MusicBrainz — the rigorous precedent, and it draws all three

MusicBrainz has an entity **name** (canonical), and **aliases** which carry a *type*, a *locale*, a *primary-for-locale* flag, a *sort name*, and *start/end dates*. Verbatim ([musicbrainz.org/doc/Aliases](https://musicbrainz.org/doc/Aliases), 2026-09-14):

> "Aliases come in two main types: {entity} name and search hint. … **{Entity} name aliases show how people refer to the entity. Search hints are mainly used for common misspellings, name variants with different encoding and other incorrect ways of displaying the entity's name that can still be useful to redirect to the entity.**"
> "Except for search hints, each alias can be paired with extra information. For example, you can set a locale to reflect the area in which an alias is used. … You can also supply a sort name, which is used in place of the alias's primary name when sorting."

And from the style guideline ([musicbrainz.org/doc/Style/Aliases](https://musicbrainz.org/doc/Style/Aliases)), the rule that makes the *display* title fall out of the alias list rather than needing a field of its own:

> "The locales should be used to indicate an alias is a name used for an entity in a particular language and/or country. **The most common name used for the entity in a given locale should be marked as primary.** This includes the locale of the main entity name itself; as such, the primary alias name in said locale is expected to match the main entity name."
> "Aliases for a specific locale can be **translations** into the language in question, but this is not a requirement. An alias is valid for a locale as long as it is commonly used as a name in that language. It can also be a **transliteration**, or even **exactly the same as in the original language**."

So the three-way distinction is: **canonical** = the entity name; **localised display** = the alias for locale *X* marked primary; **search-only** = an alias typed *search hint*, which deliberately carries no locale because it is not a name anyone should ever be shown. Worked examples from their own page: *Nine Inch Nails* has the primary Japanese alias ナイン・インチ・ネイルズ and primary aliases in most European locales that are just "Nine Inch Nails" — the identity case is *stored*, not inferred. And *Led Zepplin* is a search hint, never displayed.

That last point is the sharpest one for tsundoku: **MusicBrainz stores the identity case explicitly rather than falling back to the canonical name**, because "there is no Italian alias" and "the Italian name is the same as the English one" are different facts and only one of them means *go and look it up*.

### 5b. Wikidata — label vs alias vs `P1476`

- **Label**: one per language. Not, strictly, a title — it is the item's name in that language, and Wikidata's conventions make it the localised title for works. That looseness is why `Q109368327` is labelled "My Charms Are Wasted": nobody was obliged to put a *title* there.
- **Aliases**: many per language, untyped beyond the language. Both "also called this" and "also searchable as this" live here undifferentiated — `Q586025` has `attacco dei giganti` (a search convenience, missing the article) next to `Shingeki no Kyojin` (a real alternative name) in the same Italian alias list.
- **`P1476` "title"**: monolingual text, the *official* title. Populated for 28 of my 36 items, almost always with the original-language form and sometimes English.

So Wikidata has the three-way distinction *available* but does not enforce it: the canonical/display line is the label, and the display/search line is not drawn at all.

### 5c. AniList — why three named slots and not a map

Because the slots are not languages. `romaji`, `english`, `native` are **scripts and markets**: `romaji` is a transliteration policy, `native` is "whatever script the country of origin uses" (hence `countryOfOrigin: CountryCode` beside it), `english` is "the licensed English-market title". For a site whose corpus is ~95% Japanese-origin and whose users read English, three slots covers the case and a map would be three keys with an open-ended tail nobody fills in. `synonyms: [String]` is that tail, and it has exactly the property such a tail always has: it accumulates everything and distinguishes nothing. **The lesson is not "they were wrong"; it is that a fixed set of slots encodes an assumption about who is reading, and this library's assumption is different.**

### 5d. MangaUpdates — untyped, and the workaround proves the point

`associated: [{title}]`. §2e's evidence stands as the whole analysis: contributors write `"Pięść Gwiazd Północy (Polish)"` and `"Craque pour moi, Medaka ! (French)"` because there is nowhere else to say it. A bag of strings does not stay a bag of strings; it becomes a bag of strings with a private convention inside them, and the convention is applied inconsistently (most entries have no parenthesis at all).

### 5e. Open Library and BookBrainz — the split, and where the title lives

**Open Library**: Work and Edition, "*A Work is a logical collection of similar Editions*". The Work has a `title`; each Edition has its own `title` *and* a `languages` array. **The language is on the object, not on the title** — which is exactly tsundoku's current shape (`volume.language`, `volume.title`), and it is why §2j works: the multilingual title list is *derived* from the editions rather than stored on the work.

**BookBrainz** inherits MusicBrainz's machinery onto books: **Work** ("*a distinct intellectual or artistic creation expressed in words and/or images … not, for example, about a physical book*"), **Edition** ("*a published physical or digital version of one or more Works*"), **Edition Group** ("*a logical grouping of different Editions of the same book*"), plus **Aliases** ("*Variant names for an entity such as alternate spelling, different script, stylistic representation, acronyms, etc.*"). Its own example is explicitly language-bearing: "*Name: 村上 春樹 – Alias (english): Haruki Murakami*" ([bookbrainz.org/help](https://bookbrainz.org/help), 2026-09-14). Note that an Edition holds *one or more Works* — the same many-to-many tsundoku has, arrived at for the same reason.

### 5f. OPAC SBN — a work authority with a uniform title

Already shown in §2l and §4d, and it belongs in this list because it is the *Italian* institutional answer to the same question: a publication title (*Ken il guerriero*), a parallel title (*Hokuto no Ken*), and a separate authority record for the opera that several publications share. The canonical/display line is drawn as publication-vs-work; there is no search-alias layer at all.

### 5g. Calibre — the weakest precedent, and worth knowing why

Calibre has `title` and `title_sort` as separate metadata fields (both are among the fields a plugboard may rewrite, per [manual.calibre-ebook.com/template_lang.html](https://manual.calibre-ebook.com/template_lang.html)), and anything else goes in a user-defined **custom column**. `title_sort` is a *sort key*, not a localised title — it exists so *The Hobbit* files under H. Calibre has no language-aware title concept at all; the multilingual case is a custom column the user maintains by hand. It is included here because it is the closest thing to "what a single-owner library manager actually ships with", and what it ships with is: one title, one sort key, and a column you fill in yourself.

### 5h. What the precedents agree on

| System | canonical | localised display | search-only |
|---|---|---|---|
| **MusicBrainz** | entity name | alias, locale + **primary** flag, type *{entity} name* | alias, type **search hint**, no locale |
| BookBrainz | entity name | alias with language | alias (undifferentiated) |
| Wikidata | — (label doubles as it) | label per language | alias per language (undifferentiated) |
| AniList | `romaji` | `english` / `native` (market, not locale) | `synonyms[]` |
| OPAC SBN | *titolo di opera* (authority) | *titolo* (publication) | — |
| Open Library / BookBrainz | Work title | Edition title + Edition language | — |
| MangaUpdates / ComicVine / IGDB / RAWG | name | — | one untyped bag |
| Calibre | `title` | — | `title_sort`, plus custom columns |

**Every system that took the problem seriously separated "a name to show" from "a name to find by", and every system that did not ended up with a bag.** MusicBrainz is the only one that separates all three and it is the only one whose alias list is usable without a human reading it.

---

## 6. Cross-language search in Postgres without new columns

### 6a. What the app does today

`src/core/queries/finder.ts` matches with `strpos(lower(unaccent(title)), lower(unaccent(term))) > 0` — a substring match with accent folding, `unaccent` applied to both sides, chosen over `ilike '%…%'` so that what the owner typed is a word and not a pattern. `unaccent` is installed by `db/migrations/0003_the_finder_folds_accents.sql` and is version 1.1 on the local server. **`pg_trgm` is available but not installed** (`pg_available_extensions` shows it with a null `installed_version`).

### 6b. The demo

Run on a **throwaway container**, so nothing was installed into the owner's database:

```bash
docker run -d --rm --name tsundoku-trgm-demo -e POSTGRES_PASSWORD=demo -p 55499:5432 postgres:18-alpine
docker exec tsundoku-trgm-demo psql -U postgres -c "create extension pg_trgm; create extension unaccent;"
docker exec -i tsundoku-trgm-demo psql -U postgres -f - < demo.sql
```

```sql
with pair(work, stored, searched) as (values
 ('Kuroiwa Medaka',        'Medaka Kuroiwa è impenetrabile', 'Medaka Kuroiwa Is Impregnable'),
 ('Shingeki no Kyojin',    'L''attacco dei giganti',         'Attack on Titan'),
 ('Gokushufudou',          'La via del grembiule',           'The Way of the Househusband'),
 ('Hokuto no Ken',         'Ken il guerriero',               'Fist of the North Star'),
 ('Batman: Man Who Laughs','Batman: L''uomo che ride',       'Batman: The Man Who Laughs'),
 ('Catcher in the Rye',    'Il giovane Holden',              'The Catcher in the Rye'),
 ('accent fold',           'Medaka Kuroiwa è impenetrabile', 'medaka kuroiwa e impenetrabile'),
 ('typo',                  'L''attacco dei giganti',         'attaco dei gigannti'),
 ('romaji variant',        'Gokushufudou',                   'Gokushufudo'),
 ('romaji macron',         'Kōsuke Ōno',                     'Kosuke Ono'),
 ('subtitle drop',         'Demon Slayer - Kimetsu no yaiba','Kimetsu no Yaiba'))
select work,
       round(similarity(lower(unaccent(stored)), lower(unaccent(searched)))::numeric,3) as trgm_sim,
       (lower(unaccent(stored)) % lower(unaccent(searched)))                            as trgm_match_at_0_3,
       (strpos(lower(unaccent(stored)), lower(unaccent(searched))) > 0)                 as app_substring_today,
       (to_tsvector('italian', stored) @@ websearch_to_tsquery('italian', searched))    as fts_italian,
       (to_tsvector('english', stored) @@ websearch_to_tsquery('english', searched))    as fts_english,
       (to_tsvector('simple',  stored) @@ websearch_to_tsquery('simple',  searched))    as fts_simple
from pair;
```

| work | trgm_sim | trgm ≥ 0.3 | app today | fts italian | fts english | fts simple |
|---|---:|:--:|:--:|:--:|:--:|:--:|
| Kuroiwa Medaka | **0.463** | **t** | f | f | f | f |
| Shingeki no Kyojin | 0.152 | f | f | f | f | f |
| Gokushufudou | **0.000** | f | f | f | f | f |
| Hokuto no Ken | **0.000** | f | f | f | f | f |
| Batman: The Man Who Laughs | 0.237 | f | f | f | f | f |
| Catcher in the Rye | 0.028 | f | f | f | f | f |
| *accent fold* | 1.000 | t | **t** | t | f | f |
| *typo* | 0.680 | **t** | f | f | f | f |
| *romaji variant* | 0.786 | **t** | t | f | f | f |
| *romaji macron* | 1.000 | t | t | f | f | f |
| *subtitle drop* | 0.567 | t | t | t | t | t |

### 6c. What the numbers say

**The full-text configurations never help, in any of the three flavours, on any cross-language pair.** This is not a tuning failure; it is what a text search configuration *is*. `to_tsvector('italian', …)` applies an Italian snowball stemmer and an Italian stopword list to Italian input. It has no bilingual dictionary and Postgres ships none. There is no `to_tsvector('multilingual', …)`, and constructing one by concatenating configurations produces a vector that stems Italian words with an English stemmer — noise, not translation. The one `true` in the `fts_*` columns for a cross-language pair is `subtitle drop`, and that pair shares four literal words.

**Trigram similarity fails wherever no proper noun survives.** *Gokushufudou* → *La via del grembiule* and *Hokuto no Ken* → *Ken il guerriero* both score **0.000**: two titles about the same work with not one three-character sequence in common. *L'attacco dei giganti* ↔ *Attack on Titan* scores 0.152, which is what "shares the letters *att*" is worth.

**The one cross-language hit is a hit for the wrong reason.** *Medaka Kuroiwa è impenetrabile* ↔ *Medaka Kuroiwa Is Impregnable* scores 0.463 because the character's name is a proper noun and proper nouns are not translated. So the boundary is: **trigram matching solves cross-language search exactly when the title contains a proper noun that survives translation, which is the class of case that was never broken.**

**And lowering the threshold is worse than doing nothing**, which is the finding that closes the door. Against a 39-title corpus of the owner's real titles:

```
term                           best match                                sim
The Way of the Househusband -> The Legend of Zelda: Breath of the Wild  0.191   ← wrong
Attack on Titan             -> L'attacco dei giganti                    0.152   ← right, but below Zelda's score
Medaka Kuroiwa Is Impregnable-> Medaka Kuroiwa è impenetrabile          0.463   ← right
```

A threshold low enough to surface *L'attacco dei giganti* at 0.152 surfaces *Breath of the Wild* for a househusband manga first. The ranking is inverted, not merely noisy.

### 6d. The honest split

Of the owner's stated problem — "I search the English title and find nothing" — indexing alone solves:

- **accents and diacritics**: already solved, by `unaccent`, today.
- **macrons and romaji variants** (`Kosuke Ono` → `Kōsuke Ōno`, `Gokushufudo` → `Gokushufudou`): **solved by `pg_trgm`**, and `unaccent` alone already handles the macron case. Real value, cheap.
- **typos**: solved by `pg_trgm` (0.680 on a two-typo string), and by nothing else available.
- **dropped or added subtitles** (`Kimetsu no Yaiba` → `Demon Slayer - Kimetsu no yaiba`): already solved by the substring match, and `pg_trgm` agrees.
- **a title containing a shared proper noun**: solved by `pg_trgm` if the threshold is tuned, and it was already half-solved.
- **a genuinely translated title**: **not solvable by any index, at any threshold, ever.** It is a missing fact, not a missing index.

`pg_trgm` is worth installing for the first three. It is not an answer to the question this note is about, and installing it in the belief that it is would be the expensive mistake.

---

## 7. Is machine translation of work titles viable at all?

**No, and the evidence is not close.**

### 7a. Published Italian titles are editorial decisions

Each of these pairs a primary Italian source with the original, and in every case the Italian is not a translation of anything:

| Original | Literal sense | Published in Italy as | Primary source |
|---|---|---|---|
| 北斗の拳 *Hokuto no Ken* | "Fist of the North Star" | **Ken il guerriero** — *Ken the warrior* | OPAC SBN `ITICCUMOD1786630`, Panini 2024, *Titolo di opera* → "Hokuto no Ken" |
| 極主夫道 *Gokushufudou* | "the way of the extreme househusband" | **La via del grembiule : lo yakuza casalingo** — *the way of the apron* | OPAC SBN `ITICCUBCT0060261`, "Milano : BD, [2020- ]" |
| 黒岩メダカに私の可愛いが通じない | "my cuteness doesn't get through to Medaka Kuroiwa" | **Medaka Kuroiwa è impenetrabile** — *Medaka Kuroiwa is impenetrable* | Star Comics catalogue (§3e) |
| 名探偵コナン *Meitantei Conan* | "Great Detective Conan"; sold in the US as *Case Closed* | **Detective Conan** | [starcomics.com/titoli-fumetti/detective-conan](https://www.starcomics.com/titoli-fumetti/detective-conan) — "DETECTIVE CONAN", 107 volumes listed |
| 鬼滅の刃 *Kimetsu no Yaiba* | "Blade of Demon Destruction" | **Demon Slayer - Kimetsu no yaiba** — the *English* title, plus the Japanese one | Star Comics catalogue; Wikidata `Q24862683` `it` label |
| るろうに剣心 *Rurouni Kenshin* | "Kenshin the wanderer" | **Kenshin - Samurai vagabondo** — a word (*samurai*) that is not in the original | ANN `manga id 1995`, `lang="IT"` |

*Ken il guerriero* is the clearest single proof. 拳 in 北斗の拳 is the common noun "fist"; the Italian reads it as the protagonist's given name and replaces the entire rest of the title with a generic epithet. No translation engine, given 北斗の拳, produces "Ken il guerriero" — it produces "Il pugno dell'Orsa Maggiore" or similar, which is not what is printed on any Italian book. And *La via del grembiule* has an independent corroboration that it is a convention rather than an accident: French publishes the same work as *La Voie du Tablier* — the same apron, chosen independently (MangaDex `altTitles`, `fr`; AniList synonyms, "La voie du tablier").

Wikidata's own manga corpus supplies the same shape at scale (§3d): *Barefoot Gen* → *Gen di Hiroshima* (a place name substituted for the whole title), *Himitsu no Akko-chan* → *Lo specchio magico* (a prop substituted for a character's name), *Man of Many Faces* → *Il ladro dalle mille facce* (a thousand faces where there were many).

### 7b. The inverse failure: it will translate what it must not

The owner's shelf is full of titles that are proper nouns and must pass through untouched: **Berserk**, **Naruto**, **Tomie**, **Marvels**, **Watchmen**, **Dylan Dog**, **Hades**, **Tetris**, **Elden Ring**. A translator given *Berserk* has a perfectly good Italian word available (*furia berserker*, *furioso*); given *Marvels* it has *Meraviglie*; given *Watchmen* it has *I guardiani*, which is in fact the title of the Italian *film* and not of the comic, which Panini publishes as *Watchmen*. And the errors are silent: nothing in the output says "I was not sure whether this was a name".

MangaDex's crowd demonstrates precisely this failure with human contributors, which is the strongest possible evidence that an automaton would do it too: *Kingdom* is tagged `it` as **Il Regno**, and *Black Clover* as **Trifoglio nero** — both of which are correct translations and neither of which is what is printed on the Italian book.

### 7c. The direction is not even consistent

Sometimes Italy keeps the Japanese (*One Piece*, *Naruto*, *Berserk*). Sometimes it adopts the English (*Demon Slayer*, *Your Name.*). Sometimes it translates (*L'attacco dei giganti*). Sometimes it invents (*Ken il guerriero*). Sometimes it is *more* Japanese than the English edition (*Meitantei Conan* is *Case Closed* in the US and *Detective Conan* in Italy; *Black God* is *Kurokami* in Italy). A function that must choose among "keep", "adopt English", "translate" and "invent" — per work, per publisher, per decade — is not a translation function. **It is a lookup, and the only correct implementation of a lookup is a table.**

### 7d. Verdict

Machine translation of work titles is not a partial solution to be used with caution. It is a source of confident, silent, permanent errors of exactly the kind the Inbox exists to keep out of this library (`CONTEXT.md`: "*a hallucinated title or a fabricated edition the owner carries for years*"). **It should not be used, not even as a fallback, and not even behind an approval step — because a plausible wrong title is harder for the owner to catch than no title at all.**

---

## 8. Terms, keys, rate limits, and whether you may keep the string

The question ADR-0013 forces on every third-party source: may we *store* it, or only point at it? For an image the answer was "point at it". For a title the answers differ sharply by source, and one of them is a clean yes.

| Source | Key / auth | Rate limit (2026-09-14) | May we store the returned titles? | Public-page obligation |
|---|---|---|---|---|
| **Wikidata** | none | unpublished; 429 observed above ~3 req/s; descriptive `User-Agent` required by policy | **Yes, unconditionally.** "*All data in Wikidata has a CC0 license*" | none |
| **Anime News Network** | none | "*1 request per second per IP address*" | **Yes** — caching is invited: "*cache them for a week*" | "*must list Anime News Network as the source*" + "*a link to the relevant Encyclopedia entry … on any page that displays anime/manga/person details*" |
| **MangaDex** | none | "*approximately 5 requests per second per IP address*"; non-spoofed `User-Agent` mandatory | silent on metadata | "*You MUST credit MangaDex*"; "*You CANNOT run ads or paid services*" |
| **AniList** | none for reads | "*90 requests per minute*", currently degraded to "*30 requests per minute*" | **No.** "*Using the AniList API as a backup or data storage service is strictly prohibited*"; "*Hoarding or mass collection … is strictly prohibited*" | free below $150/mo revenue; tracker-service exclusion (§2d) |
| **MangaUpdates** | bearer for writes only | **undocumented** | **undocumented** | undocumented |
| **MyAnimeList** | `X-MAL-CLIENT-ID` required (403 without) | not established | not established | not established |
| **ComicVine** | key required | 200/resource/hour | **No** — "*Do not edit, manipulate or reproduce on any other medium*" | mandatory link-back; non-commercial only |
| **IGDB** | Twitch Client-ID + bearer | "*4 requests per second*" | not established | not established |
| **RAWG** | key required | 20,000/month on free | **No redistribution** — "*you may use the data with your API access only for your projects*" | "*Required backlinks to RAWG from pages where the data is used*"; free tier non-commercial |
| **Open Library** | none | 1 req/s anonymous, 3 req/s identified; ISBN path 100 req/5 min/IP | yes (data is open; bulk crawling discouraged) | courtesy link appreciated |
| **OPAC SBN** | none | undocumented; 502/503 observed | **no statement found** | unsettled — treat public use as not permitted absent a statement |

**Two conclusions the recommendation rests on.**

First, **AniList is disqualified by its own terms, not by its coverage.** It is the most convenient API in this survey — no key, one GraphQL call, excellent manga data — and it forbids exactly the thing that would be built: keeping the titles in a database. Its synonyms bag would have made them unusable anyway (§2d), so nothing is lost, but it is worth writing down that the convenient answer is also the prohibited one.

Second, **Wikidata's CC0 is the only licence in this survey that is simpler than ADR-0013's cover situation rather than more complicated.** Where a Google Books cover may be held for 24 hours in a private cache and never copied, a Wikidata title may be copied, stored, published, and republished, with no attribution and no link-back. **That asymmetry is the single most important operational fact in this note**, because it means a stored Italian title is not a compliance liability the way a stored cover byte is — the ADR-0013 reflex to hotlink rather than host does not carry over, and should not be applied here by analogy.

---

## 9. What went wrong in this session

Five probes produced plausible, wrong numbers before they were corrected. Each is a trap for the re-run.

1. **AniList returned HTTP 403 for every request** made with Python's default `User-Agent`, while the identical query through `curl` succeeded. The first pass of the AniList probe therefore recorded eighteen errors and would, with less careful error handling, have recorded eighteen "no Italian title". **Corrected method:** send a descriptive `User-Agent` on every request, and never treat a transport error as a negative result. The same rule applies to Wikimedia, which served 429 at ~3 req/s with a generic agent (§2a).

2. **My first "does the Italian title exist" test was trivially true.** It compared the expected Italian title against the source's `english` slot as well as its synonyms — so *One-Punch Man*, whose Italian title *is* "One-Punch Man", scored a hit for AniList and inflated the result to 15/18. **Corrected method:** partition the sample into the works whose Italian title differs from both the romaji and the English (the "localised subset", 7 of 18) and report that subset separately. Every headline number in this note that is not so partitioned is flagged as inflated (§3b, §3e).

3. **Searching ANN by the romaji title returned "no result" for four works that ANN holds**, because ANN's `~name` search is documented to match "*only the primary name (the one in the page title)*" and ANN's primary name for 進撃の巨人 is "Attack on Titan". The uncorrected run reported ANN as having no record for Shingeki no Kyojin, Meitantei Conan and Hokuto no Ken — all three of which it has, and two of which carry an Italian title. **Corrected method:** query ANN by the English title as well as the romaji, and union the results.

4. **The Wikidata ISBN query returned a clean 0/54 because Wikidata stores `P212` hyphenated** (`978-88-…`) and the `VALUES` block held bare digits. Zero is a believable answer to that question, which is what makes it dangerous. **Corrected method:** pull the ISBNs out and normalise locally, or `REPLACE(?raw,"-","")` — and never accept a zero from a string-equality join without a control. Separately, `SUM(IF(?en = ?it, …))` returns 0 for every class, because two literals with different language tags are never equal in SPARQL; `STR()` on both sides is required (§3d).

5. **Open Library's `/isbn/<isbn>.json` returns 302, not 200.** A `curl` without `-L` reports "no record" for every ISBN Open Library actually holds. The scripted probe used `urllib`, which follows redirects by default and got the right answer; the ad-hoc control check did not and produced a false miss on *The Catcher in the Rye*. **Corrected method:** `curl -sL`, and record the raw status so that 302 (found), 404 (absent) and 403 (rate-limited — still the trap `cover-images-by-isbn.md` names) stay distinct.

A sixth, smaller one, recorded because it distorted a coverage figure in the owner's favour rather than against him: **my "expected Italian title" for Gokushufudou was wrong.** I used the short form *La via del grembiule*, and both Wikidata and MangaUpdates were scored as misses for returning *La via del grembiule - Lo yakuza casalingo*. OPAC SBN record `ITICCUBCT0060261` gives the published title as "La via del grembiule : lo yakuza casalingo", so the sources were right and the sample was wrong. **Corrected method:** source the expected Italian title from a publisher's or national catalogue's own record, never from memory.

---

## 10. Raw probe data

### 10a. The 36-work sample against Wikidata

| key | Type | QID | `it` label | matches published |
|---|---|---|---|:--:|
| one-punch-man | Manga | `Q5102879` | One-Punch Man | ✓ |
| slam-dunk | Manga | `Q714760` | Slam Dunk | ✓ |
| gokushufudou | Manga | `Q82818688` | La via del grembiule - Lo yakuza casalingo | ✓ (§9.6) |
| fullmetal-alchemist | Manga | `Q189562` | Fullmetal Alchemist | ✓ |
| death-note | Manga | `Q1834` | Death Note | ✓ |
| berserk | Manga | `Q18558978` | Berserk | ✓ |
| naruto | Manga | `Q26971382` | Naruto | ✓ |
| kimi-no-na-wa | Manga | `Q21697406` | Your Name. | ✓ |
| devilman | Manga | `Q2632547` | Devilman | ✓ |
| **kuroiwa-medaka** | Manga | `Q109368327` | **My Charms Are Wasted** | **✗** |
| tomie | Manga | `Q1139780` | Tomie | ✓ |
| shingeki-no-kyojin | Manga | `Q586025` | L'attacco dei giganti | ✓ |
| kimetsu-no-yaiba | Manga | `Q24862683` | Demon Slayer - Kimetsu no yaiba | ✓ |
| one-piece | Manga | `Q28667972` | One Piece | ✓ |
| meitantei-conan | Manga | `Q185143` | Detective Conan | ✓ |
| hokuto-no-ken | Manga | `Q733498` | Ken il guerriero | ✓ |
| rurouni-kenshin | Manga | `Q216439` | Kenshin Samurai vagabondo | ~ (no hyphen) |
| captain-tsubasa | Manga | `Q647486` | Capitan Tsubasa | ✓ |
| batman-man-who-laughs | Comic | `Q1439807` | Batman: L'uomo che ride | ✓ |
| **daredevil-yellow** | Comic | `Q97380216` | *(none)* | ✗ |
| **spider-man-blue** | Comic | `Q4049919` | *(none)* | ✗ |
| superman-for-all-seasons | Comic | `Q3977956` | Superman: Stagioni | ✓ |
| long-halloween | Comic | `Q512835` | Batman: Il lungo Halloween | ✓ |
| marvels | Comic | `Q784338` | Marvels | ✓ |
| watchmen | Comic | `Q128444` | Watchmen | ✓ |
| dylan-dog | Comic | `Q12098` | Dylan Dog | ✓ |
| dimentica-il-mio-nome | Graphic Novel | `Q18397554` | Dimentica il mio nome | ✓ |
| cursed-child | Play | `Q20711488` | Harry Potter e la maledizione dell'erede | ✓ |
| lotr-fellowship | Novel | `Q208002` | La Compagnia dell'Anello | ✓ |
| catcher-in-the-rye | Novel | `Q183883` | Il giovane Holden | ✓ |
| hades | Videogame | `Q59756366` | Hades | ✓ |
| **zelda-botw** | Videogame | `Q17185964` | *(none; itwiki title identical to English)* | — |
| tetris | Videogame | `Q71910` | Tetris | ✓ |
| dark-souls | Videogame | `Q1166232` | Dark Souls | ✓ |
| **elden-ring** | Videogame | `Q64826862` | *(none; itwiki title identical)* | — |
| **ff7** | Videogame | `Q214232` | *(none; itwiki title identical)* | — |

### 10b. Reconciling *from* the stored Italian title

The realistic direction — the owner has a title, the program must find the work. `wbsearchentities`, `language=it`, top 5, counted as a hit only if the expected QID appears:

```
search-from-stored-title finds the same QID: 30/36 (83%)
```

Six failures, and their causes are more interesting than the number:

| key | query | what happened |
|---|---|---|
| kuroiwa-medaka | `Medaka Kuroiwa è impenetrabile` | `{"search": []}` — no item carries the Italian title |
| **rurouni-kenshin** | `Kenshin - Samurai vagabondo` | `{"search": []}` — **but `Kenshin Samurai vagabondo` returns `Q216439` immediately. One hyphen.** |
| daredevil-yellow | `Daredevil: Giallo` | none; the item `Q97380216` exists with an English label only |
| tomie / superman-for-all-seasons / dimentica-il-mio-nome | — | found by search, missed by my earlier enwiki-title lookup; my QID guesses were wrong, not Wikidata |

Two precision notes: the top result for `Naruto` is `Q460812`, **a city in Tokushima Prefecture**; the top result for `Hades` is `Q41410`, **the Greek god**. The manga and the game are in the top five, but a program taking the first result is wrong in both cases.

### 10c. The full MangaUpdates `associated` arrays for the localised subset

Reproduced because the untyped-bag problem is only obvious when you see one:

```
hokuto-no-ken  (5/13 are non-Latin, 1 has the language inside the string)
  ['El Puño de la Estrella del Norte','Fist of the North Star','Fist of the North Star Origins',
   'Hokuto no Ken – Fist of the North Star','Ken il guerriero','Pencak Nujum',
   'Pięść Gwiazd Północy (Polish)','Tinju Bintang Utara','Кулак Полярної Зорі',
   'Кулак Северной Звезды','उत्तर तारा को मुट्ठी','หมัดดาวเหนือ','北斗の拳']

captain-tsubasa  (no Italian at all; 'Olive et Tom' is the French)
  ['Kapitan Tsubasa','Kaptan Tsubasa','Kyaputen Tsubasa','Olive et Tom',
   'Tsubasa - Giấc mơ sân cỏ','كابتن تسوباسا','كابتن ماجد','क्याप्टेन सुबासा',
   'กัปตันซึบาสะ','キャプテン翼','足球小将']

kuroiwa-medaka  (no Italian; note the inline '(French)')
  ['Craque pour moi, Medaka ! (French)','Kuroiwa Medaka ni Watashi no Kawaii ga Tsūjinai',
   'Medaka Kuroiwa Is Impervious to My Charms','My Charms Are Wasted on Kuroiwa Medaka',
   'मेदाका कुरोइवाले मेरो सुन्दरता बुझ्दैन','คุโรอิวะ เมดากะ ไม่เข้าใจความน่ารักของฉันเลย',
   '黒岩メダカに私の可愛いが通じない','쿠로이와 메다카에게 내 귀여움이 통하지 않아']
```

### 10d. How to re-run everything

```bash
# sample.tsv:  key \t Type \t romaji \t native \t published-Italian-title
# full.tsv:    key \t Type \t original \t enwiki-title \t published-Italian-title
# isbns.txt:   the 54 ISBNs from cover-images-by-isbn.md §7

UA='tsundoku-research/1.0 (https://tsundoku.davideimola.dev; davide.imola@redcarbon.ai)'

# AniList — a User-Agent is mandatory or every request is 403
curl -s -X POST https://graphql.anilist.co -H 'Content-Type: application/json' -H "User-Agent: $UA" \
  -d '{"query":"query($s:String){Media(search:$s,type:MANGA){id title{romaji english native} synonyms}}",
       "variables":{"s":"Shingeki no Kyojin"}}'

# MangaDex — resolve by matching the native title, not by taking result[0]
curl -s -H "User-Agent: $UA" 'https://api.mangadex.org/manga?limit=10&title=Shingeki%20no%20Kyojin'

# ANN — query by English title too; ~name matches only the primary name
curl -s -H "User-Agent: $UA" 'https://cdn.animenewsnetwork.com/encyclopedia/api.xml?manga=~Attack+on+Titan'

# MangaUpdates
curl -s -H "User-Agent: $UA" -X POST https://api.mangaupdates.com/v1/series/search \
  -H 'Content-Type: application/json' -d '{"search":"Hokuto no Ken","perpage":5}'
curl -s -H "User-Agent: $UA" https://api.mangaupdates.com/v1/series/76941273872

# Wikidata — 1.5-2s pacing, descriptive UA, and STR() in any label comparison
curl -s -H "User-Agent: $UA" \
 'https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=Attack%20on%20Titan&props=labels|aliases|claims|sitelinks&languages=it|en|ja&format=json'
curl -s -H "User-Agent: $UA" \
 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=L%27attacco%20dei%20giganti&language=it&uselang=it&type=item&limit=5&format=json'

# Open Library — -L is mandatory (302), and record raw status so 403 != 404
curl -sL -H "User-Agent: $UA" https://openlibrary.org/isbn/9788865432549.json
curl -sL -H "User-Agent: $UA" 'https://openlibrary.org/works/OL3335245W/editions.json?limit=300'

# OPAC SBN — ISBN:7, never Numerostandard:1016; expect 502/503 and retry
curl -s -X POST https://opac.sbn.it/o/opac-api/titles-search-full-post \
  --data-urlencode core=sbn --data-urlencode 'fieldstruct[1]=ricerca.parole_tutte:4=6' \
  --data-urlencode 'fieldvalue[1]=9788891298294' --data-urlencode 'fieldaccess[1]=ISBN:7'
curl -s 'https://opac.sbn.it/o/opac-api/title?id=ITICCUBVE0884498&core=sbn' \
  | grep -o 'Titolo_uniforme:@frase@=[A-Z0-9]*'
```

---

## Recommendation

**Take Wikidata, take it as a suggestion and never as a write, and accept that the long tail is manual.** And before any of that: **split the problem in two, because it is two problems with different failure costs.**

### 1. The two halves are not one field

The owner described one symptom and it is two facts:

- **(a) Search fails across languages.** He wants to type *Medaka Kuroiwa Is Impregnable* and land on the row. What that needs is a **search alias** — a string that is never shown to anybody, whose only job is to make a row findable. A wrong one costs one spurious hit in a finder that already returns several. It can be wrong cheaply, it can be plural, and it does not need a language.
- **(b) The public showcase renders Italian titles on an English page.** What that needs is a **localised display title** — one string per language, shown to strangers. A wrong one is a lie on a public page, published through a door (ADR-0025) that deliberately exposes renderings rather than records precisely so that nothing leaks by accident. It must be right, it is singular per language, and it must know which language it is.

**These have opposite tolerances and therefore should not be the same thing.** MusicBrainz reached this conclusion independently and expressed it as *alias type* — `{entity} name` with a locale and a primary flag for (b), `search hint` with no locale at all for (a) — and it is the only one of the eight prior-art systems whose alias list is usable by a program without a human reading it. That is the distinction to bring to `/grill-with-docs`, and it is the whole crux of this note.

The third thing already exists and does not need inventing: `story.title` is the canonical title, it is what the owner typed, and nothing here should move it.

### 2. Wikidata, through the Inbox, and nowhere near an automatic write

**Source: Wikidata, by title search, one work at a time, as a proposal the owner approves.** It is the only source that language-tags a title on a work identifier *and* permits storage *and* covers every Type in the vocabulary including videogames. ANN is a decent second for manga specifically (4/7 on the localised subset, correctly tagged `IT`) but it covers only anime and manga, has no record for two of my eighteen, and would put an attribution link on every tile of the public page. MangaDex has the right schema and unvetted crowd values. AniList's terms forbid the storage this would require. Everything else has no language field at all.

**But the measured numbers forbid an unattended path.** 43% correct recall on a random slice of a real Italian catalogue, ~10% false positives on exact string match, top-result-is-a-Japanese-city for *Naruto* and top-result-is-a-Greek-god for *Hades*, and a search that returns nothing for *Kenshin - Samurai vagabondo* and everything for *Kenshin Samurai vagabondo*. That profile is precisely what the Inbox exists for: `CONTEXT.md` reserves the Inbox for proposals that are "*a permanent fact — a hallucinated title or a fabricated edition the owner carries for years*", and a wrong alias attached to the wrong work is exactly that shape. An Amendment (ADR-0011) carrying *here is the Italian title Wikidata thinks this work has, and here is the item it came from* is legible beside what stands there today, and approving it is the act — which is the machinery this repository already has and already trusts.

Store the QID when the owner approves it, the way ADR-0013 stores the Google volume id: it is a fact about the record rather than a copy of anybody's content, and it turns every future lookup into a fetch instead of a search. That is the single highest-value thing to keep, because **the reconciliation is the expensive step and it is the one a human just paid for.**

### 3. Install `pg_trgm`, and be clear about what it buys

It buys accents (already had them), macrons, romaji variants, typos and dropped subtitles — measured in §6b, and genuinely useful on a shelf full of `Kōsuke Ōno` and `Gokushufudou`. It buys **nothing** on translated titles, at any threshold, and lowering the threshold to chase them ranks *Breath of the Wild* above the right answer. Install it for what it does; do not let it be mistaken for an answer to this note's question.

### 4. What to expect to be missing, in plain numbers

On a shelf like the owner's:

- **Videogames: essentially solved.** ~14% of games have any Italian-specific title and most of that is punctuation. One Wikidata lookup, usually returning the string you already had.
- **Novels, plays, graphic novels: well covered.** Wikidata had an Italian label for all four in the sample, all exact.
- **Famous manga and mainstream US comics: well covered**, 6/7 on the localised subset.
- **The long tail of Italian manga: roughly half, and the wrong half.** 43% on a random slice of Star Comics' catalogue, and **22% on the titles that are actually in Italian** — the ones that are the problem. *Daredevil: Giallo* and *Spider-Man: Blu* have Wikidata items with no Italian label at all.
- **Bonelli monthlies, small-press, art books, guides, and anything the Italian Wikipedia has not got round to: nothing.** Same population `cover-images-by-isbn.md` found has no cover and no ISBN.
- **And the owner's own example: nothing, from any source.** *Medaka Kuroiwa è impenetrabile* is not in Wikidata, not in ANN, not in MangaDex, not in AniList's synonyms, not in MangaUpdates' associated names.

**So the honest finding, stated as the brief asked it to be stated if true: no automatic source covers this library, and manual entry for the long tail is unavoidable.** What the automation is worth is not *avoiding* the typing — it is *not having to type the famous half*, and having somewhere to put the rest when he does. A design that assumes automation will close the gap will ship a half-empty field and a public page with a mix of languages on it; a design that assumes the owner will sometimes type a second title, and makes that cheap and optional, will work on day one and get better as Wikidata fills in.

### 5. One thing worth ten more minutes before the decision

**Find out whether an OPAC SBN *opera* authority record carries variant titles.** It is the only ISBN→work bridge in existence for Italian comics (48% of the sample ISBNs reach one, against Wikidata's 1.9% and Open Library's 5.6%), it is the Italian institution's own model of exactly the work/publication distinction this note is about, and the one thing that would make it decisive — does `MOD0784838` know both *Hokuto no Ken* and *Ken il guerriero*? — could not be answered because its page is client-rendered and its API route is undiscovered. If it does, the shape of the recommendation does not change, but the seeding gets materially better for precisely the population every other source is empty on.

---

## Open questions

- ~~**Does an OPAC SBN *opera* authority record hold variant titles, and is there a JSON route to it?**~~ **Settled 2026-09-14, §4f: yes to the route, no to the titles.** The route is `core=opere`, not `core=sbn` — `/o/opac-api/title?id=MOD0784838&core=opere` and `/c/opac/opere/unimarc/export?id=…` both work, and `/c/opac/opere/view` merely 302s to a server-rendered page. The variant-title field exists (UNIMARC/A `431`, "Forme varianti") and SBN populates it for *Le petit prince*, but it is untagged by language and it is empty on **0 of 21** opera authorities reached from the 54-ISBN comics sample. `MOD0784838` knows *Hokuto no Ken* and not *Ken il guerriero*. What remains genuinely open is narrower: **is the comics emptiness a cataloguing-practice gap that will fill in, or is `431` reserved for works whose translations were themselves catalogued as opere?** Nothing here measures that.
- **Is there a licence or terms-of-use statement covering OPAC SBN catalogue data?** Still no, and re-checked 2026-09-14 (§4f). `opac.sbn.it` carries only a privacy policy. The single terms page on `iccu.sbn.it` (`/it/footer/sito/termini-duso/`) applies CC BY-NC-SA 3.0 IT to "*testi redazionali e … immagini del sito*" — editorial copy on a different host, explicitly not catalogue records. The one CC0 declaration ICCU makes covers the Anagrafe delle Biblioteche, a different dataset. This mirrors the gap `cover-images-by-isbn.md` §6b found for the Alphabetica images. Until someone asks ICCU, the public case stays unsettled.
- **Would AniList consider tsundoku a "competing, non-complementary service … manga list or tracker"?** Their terms name that category and say the restriction "*applies to all data provided through the API, including both user data and media data*". A single-owner personal log is not obviously what they mean, but it is not obviously not. Moot under this recommendation, which does not use AniList — recorded because the question will come up again if anyone reaches for the convenient API.
- **MyAnimeList's real Italian coverage.** Unmeasured: Jikan answered `504 "Jikan failed to connect to MyAnimeList"` on every attempt across this session, and MAL's own v2 API returns 403 without a registered `X-MAL-CLIENT-ID`. The schema (`alternative_titles {synonyms[], en, ja}`, MAL's own OpenAPI) says the answer is *no Italian field*, so measuring it would confirm rather than discover — but it is unmeasured and is not claimed otherwise.
- **IGDB's real coverage on the Videogame half.** Unmeasured, because it needs a Twitch app registration. Its `alternative_names.comment` is free text, so it cannot answer the language question either way; if it is ever tested, test it against the six games in §10a.
- **Does Wikidata's Italian-label coverage of manga grow fast enough to matter?** 20.7% of Star Comics' catalogue matched by bulk label today. Nothing here measures the trend, and the answer changes how much of the long tail is worth typing now versus waiting for.
- **The `Q7725634` (literary work) divergence rate**, which is the number for the Novel/Non-fiction half: 22,851 items carry both labels, but the divergence query timed out at the public SPARQL endpoint twice. Needs a chunked query or the dumps.
- **How many of the ~10% false positives survive a second signal?** Every wrong match in §3e (*Yuko* the given name, *Duck and Cover* the album) would be eliminated by also requiring the item to be an instance of a work-ish class, or to have an author in common with the Story's Credits. That was not measured, and it would raise the usable recall figure — possibly a lot.
- **Whether any source distinguishes a *display* title from a *search* alias in a way this library could adopt wholesale.** MusicBrainz does and is not a book database; BookBrainz inherits the machinery and is thin on manga and empty on videogames. Nobody in the manga/comics/games space draws the line at all.
