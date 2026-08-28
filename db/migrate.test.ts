import { describe, expect, it } from "vitest";
import { type Migration, pendingMigrations } from "./migrate.ts";

// Which migrations still have to run, decided from the files on disk and the ledger
// in the database. Worth a test of its own because it is the guard on a mistake that
// is otherwise silent: an applied migration edited in place leaves every developer
// and the cluster on a different schema, and nothing complains until something
// unrelated breaks. Fourteen slices add files to this directory in parallel, so this
// runs far more often than it looks.

function migration(filename: string, sql: string): Migration {
  return { filename, sql, checksum: `sum-of-${sql}` };
}

const first = migration("0002_01_type_is_a_data_row.sql", "create table type ()");
const second = migration("0007_01_story.sql", "create table story ()");

describe("which migrations are pending", () => {
  it("is nothing when the ledger has seen every file unchanged", () => {
    const applied = new Map([
      [first.filename, first.checksum],
      [second.filename, second.checksum],
    ]);

    expect(pendingMigrations([first, second], applied)).toEqual([]);
  });

  it("is the files the ledger has not seen, keeping the order it was handed", () => {
    const applied = new Map([[first.filename, first.checksum]]);

    expect(pendingMigrations([second, first], applied)).toEqual([second]);
  });

  it("refuses a file that has changed since it ran, naming it", () => {
    const applied = new Map([[first.filename, "the-checksum-it-had-before"]]);

    expect(() => pendingMigrations([first], applied)).toThrowError(
      /0002_01_type_is_a_data_row\.sql has changed since it was applied/
    );
  });

  it("refuses a ledger entry whose file is gone, naming it", () => {
    const applied = new Map([
      [first.filename, first.checksum],
      ["0004_01_deleted_by_somebody.sql", "whatever"],
    ]);

    expect(() => pendingMigrations([first], applied)).toThrowError(
      /no longer on disk: 0004_01_deleted_by_somebody\.sql/
    );
  });
});
