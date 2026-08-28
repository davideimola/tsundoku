import { describe, expect, it } from "vitest";
import { query } from "./db.ts";
import { isRefusal, Refusal, refusing } from "./refusal.ts";

// Seam 1, against the real Postgres: these are the driver's own errors, so a test that
// faked them would only be testing the fake. `type` is the one table the skeleton has
// and it carries a unique constraint and three checks, which is every case that
// matters.

describe("a refusal crossing the core's edge", () => {
  it("turns a duplicate into `already-exists`, with prose the verb wrote", async () => {
    const attempt = refusing(
      () =>
        query("insert into type (id, name, display_order) values ($1, $2, $3)", [
          "manga-again",
          "Manga",
          98,
        ]),
      "That Type is already in the library."
    );

    await expect(attempt).rejects.toBeInstanceOf(Refusal);
    await expect(attempt).rejects.toMatchObject({
      code: "already-exists",
      message: "That Type is already in the library.",
      constraint: "type_name_key",
    });
  });

  it("turns a broken check into `invalid`, and names the constraint for prose", async () => {
    const attempt = refusing(
      () =>
        query("insert into type (id, name, display_order) values ($1, $2, $3)", [
          "Not A Slug",
          "Whatever",
          99,
        ]),
      (constraint) =>
        constraint === "type_id_is_a_slug"
          ? "A Type's id has to be a slug."
          : "That Type could not be added."
    );

    await expect(attempt).rejects.toMatchObject({
      code: "invalid",
      message: "A Type's id has to be a slug.",
      constraint: "type_id_is_a_slug",
    });
  });

  it("lets our own mistakes through untouched, so they stay bugs and not advice", async () => {
    const attempt = refusing(
      () => query("select * from a_table_that_does_not_exist"),
      "The owner should never read this."
    );

    await expect(attempt).rejects.not.toBeInstanceOf(Refusal);
  });

  it("returns the work's own value when nothing is refused", async () => {
    const rows = await refusing(
      () => query<{ id: string }>("select id from type where id = $1", ["novel"]),
      "unused"
    );

    expect(rows).toEqual([{ id: "novel" }]);
  });

  it("is recognised by `isRefusal` and by nothing else", () => {
    expect(isRefusal(new Refusal("not-found", "gone"))).toBe(true);
    expect(isRefusal(new Error("gone"))).toBe(false);
  });
});
