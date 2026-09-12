import { describe, expect, it } from "vitest";
import {
  googleVolumeId,
  hotlinkable,
  readDynamicLinks,
  readOpenLibraryProbe,
  whoIsAsking,
} from "./covers.ts";

// **What this is, in the words `vitest.config.ts` asks for: the licensed pure derivation,
// not a third seam.** Every function under test here takes text or a status code and
// answers data — the readers of `src/core/covers.ts`, which this application would still
// have if `fetch` were replaced by a courier. Nothing here opens a socket and nothing here
// touches Postgres: what the *verb* does with these answers is Seam 1, and it is
// `verbs/cover.test.ts`, which hands the verb a source of its own.
//
// It earns the licence twice over, because the two failures it catches are exactly the two
// the research this is built on hit in the field (`docs/research/cover-images-by-isbn.md`):
// a 403 written down as "no cover", which produced a false 0%, and an unreadable body
// written down as an answer. Both are silent, both are permanent, and neither is visible
// from anywhere else in the app.

// The real shape of a Dynamic Links response, from a probe on 2026-08-30 (One Piece 100,
// Planet Manga). `String.raw` so that `\u0026` reaches the reader as the six characters the
// endpoint actually sends: unescaping it into an ampersand is `JSON.parse`'s job, and the
// URLs asserted below are what proves it happened.
const ONE_PIECE = String.raw`x({"ISBN:9788828765431":{"bib_key":"ISBN:9788828765431","info_url":"https://books.google.com/books?id=njT-zgEACAAJ\u0026source=gbs_ViewAPI","preview_url":"https://books.google.com/books?id=njT-zgEACAAJ","thumbnail_url":"https://books.google.com/books/content?id=njT-zgEACAAJ\u0026printsec=frontcover\u0026img=1\u0026zoom=5","preview":"noview","embeddable":false,"can_download_pdf":false,"can_download_epub":false,"is_pdf_drm_enabled":false,"is_epub_drm_enabled":false}});`;

describe("reading a Google Books answer", () => {
  it("takes the cover, the volume id and the book's own page off a record that has one", () => {
    expect(readDynamicLinks("9788828765431", ONE_PIECE)).toEqual({
      answer: "found",
      cover: {
        source: "google-books",
        reference: "njT-zgEACAAJ",
        url: "https://books.google.com/books/content?id=njT-zgEACAAJ&printsec=frontcover&img=1&zoom=5",
        infoUrl: "https://books.google.com/books?id=njT-zgEACAAJ&source=gbs_ViewAPI",
      },
    });
  });

  it("keeps the URL exactly as it was given, because zoom=5 is the only size that exists", () => {
    const answer = readDynamicLinks("9788828765431", ONE_PIECE);

    // Every larger zoom returns a byte-identical "image not available" placeholder, verified
    // across five volumes. A wall that widened this parameter would be a wall of placeholders.
    expect(answer.answer === "found" && answer.cover.url).toContain("zoom=5");
  });

  it("answers no cover where Google holds no record at all", () => {
    expect(readDynamicLinks("9788822667915", "x({});")).toEqual({ answer: "none" });
  });

  it("answers no cover where the record exists and carries no thumbnail", () => {
    const body = `x({"ISBN:9788822667915":{"bib_key":"ISBN:9788822667915","preview":"noview"}});`;

    expect(readDynamicLinks("9788822667915", body)).toEqual({ answer: "none" });
  });

  it("answers no cover where the record is for a different ISBN than the one asked", () => {
    expect(readDynamicLinks("9788822667915", ONE_PIECE)).toEqual({ answer: "none" });
  });

  // The one that matters: an error page, a challenge or a truncated response must never
  // reach the record as "this book has no cover", because nothing ever reads that back.
  it.each([
    ["nothing at all", ""],
    ["an error page", "<html><title>Error 500</title></html>"],
    ["a callback wrapped round nothing readable", "x(not json);"],
    ["a callback wrapped round a string", `x("no");`],
  ])("leaves %s unanswered rather than calling it an absence", (_, body) => {
    expect(readDynamicLinks("9788828765431", body)).toMatchObject({ answer: "unanswered" });
  });

  it("leaves an image Google put somewhere else unanswered, since it may not be hotlinked", () => {
    const body = `x({"ISBN:9788828765431":{"thumbnail_url":"https://example.invalid/cover.jpg"}});`;

    expect(readDynamicLinks("9788828765431", body)).toMatchObject({ answer: "unanswered" });
  });
});

describe("reading an Open Library probe", () => {
  it("takes the redirect into the Internet Archive as a cover, and points at Open Library", () => {
    expect(readOpenLibraryProbe("9788865432549", 302)).toEqual({
      answer: "found",
      cover: {
        source: "open-library",
        reference: null,
        url: "https://covers.openlibrary.org/b/isbn/9788865432549-L.jpg?default=false",
        infoUrl: "https://openlibrary.org/isbn/9788865432549",
      },
    });
  });

  it("keeps default=false in the address it hands over, so a placeholder is never a cover", () => {
    const answer = readOpenLibraryProbe("9788865432549", 302);

    expect(answer.answer === "found" && answer.cover.url).toContain("default=false");
  });

  it("answers no cover on a 404, which is what default=false buys", () => {
    expect(readOpenLibraryProbe("9788822667915", 404)).toEqual({ answer: "none" });
  });

  // The false 0%: 100 requests per IP per five minutes, and 403 over it. Recorded as an
  // absence it would take every Bao cover off the wall and never look again.
  it("leaves a rate limit unanswered rather than calling it an absence", () => {
    expect(readOpenLibraryProbe("9788865432549", 403)).toMatchObject({ answer: "unanswered" });
  });

  it.each([429, 500, 502, 503])("leaves %i unanswered", (status) => {
    expect(readOpenLibraryProbe("9788865432549", status)).toMatchObject({ answer: "unanswered" });
  });
});

describe("what may be pointed at", () => {
  it.each([
    "https://books.google.com/books/content?id=njT-zgEACAAJ&img=1&zoom=5",
    // Google's own numbered cover hosts. Refusing one would turn a real cover into a
    // permanent `unanswered`, which is a gap on the wall nothing would ever explain.
    "https://bks0.books.google.com/books/content?id=njT-zgEACAAJ&img=1",
    "https://bks9.books.google.com/books/content?id=njT-zgEACAAJ&img=1",
    "https://covers.openlibrary.org/b/isbn/9788865432549-L.jpg?default=false",
  ])("accepts %s, which is the source's own domain", (url) => {
    expect(hotlinkable(url)).toBe(true);
  });

  // ADR-0013 in one assertion: an address this app serves is not a cover with an unusual
  // URL, it is bytes somebody downloaded — which is the thing the decision forbids.
  it.each([
    "https://tsundoku.davideimola.dev/covers/9788828765431.jpg",
    "http://books.google.com/books/content?id=njT-zgEACAAJ",
    "https://books.google.com.example.invalid/books/content?id=x",
    "https://bks0.books.google.com.example.invalid/books/content?id=x",
    "https://notbooks.google.com/books/content?id=x",
    "https://opac.sbn.it/o/alphabetica-api/detail-image?id=9788828765431",
  ])("refuses %s", (url) => {
    expect(hotlinkable(url)).toBe(false);
  });
});

describe("a Google volume id", () => {
  it("is read off the thumbnail URL, which is the only place it appears", () => {
    expect(
      googleVolumeId("https://books.google.com/books/content?id=njT-zgEACAAJ&img=1&zoom=5")
    ).toBe("njT-zgEACAAJ");
  });

  it("is absent rather than invented where the URL carries none", () => {
    expect(googleVolumeId("https://books.google.com/books/content?img=1")).toBeNull();
    expect(googleVolumeId("not a url at all")).toBeNull();
  });
});

describe("saying who is asking", () => {
  it("names the address the deployment was given", () => {
    expect(whoIsAsking({ COVER_CONTACT_URL: "https://tsundoku.davideimola.dev" })).toBe(
      "tsundoku/1.0 (single-owner library; https://tsundoku.davideimola.dev)"
    );
  });

  // The one that matters now that anybody can clone this: a copy that says nothing about
  // itself must not go around wearing the original deployment's domain, because the
  // complaint about its traffic would land on somebody who never made the request.
  it("names the project, not this deployment, when nothing is configured", () => {
    for (const env of [{}, { COVER_CONTACT_URL: "" }, { COVER_CONTACT_URL: "   " }]) {
      expect(whoIsAsking(env)).toBe(
        "tsundoku/1.0 (single-owner library; https://github.com/davideimola/tsundoku)"
      );
    }
  });

  // Never omitted, whatever it says: an anonymous caller gets one request a second at Open
  // Library where an identified one gets three.
  it("is always a header with a contact in it", () => {
    expect(whoIsAsking({})).toMatch(/^tsundoku\/1\.0 \(single-owner library; https:\/\/\S+\)$/);
  });
});
