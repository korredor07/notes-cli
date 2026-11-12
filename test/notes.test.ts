import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.ts";
import { addNote, deleteNote, filterByTag, formatList, NotesError, type Note } from "../src/notes.ts";

const DAY = "2026-11-06";
const tmpFile = () => join(mkdtempSync(join(tmpdir(), "notes-")), "notes.json");

describe("notes", () => {
  it("adds a note with the next id", () => {
    const notes = addNote(addNote([], "first", DAY), "second", DAY);
    expect(notes.map((n) => n.id)).toEqual([1, 2]);
  });

  it("trims text and refuses empty notes", () => {
    expect(addNote([], "  hi  ", DAY)[0].text).toBe("hi");
    expect(() => addNote([], "   ", DAY)).toThrow(NotesError);
  });

  it("deletes by id and refuses unknown ids", () => {
    const notes: Note[] = addNote([], "a", DAY);
    expect(deleteNote(notes, 1)).toEqual([]);
    expect(() => deleteNote(notes, 9)).toThrow("no note with id 9");
  });

  it("formats a list", () => {
    expect(formatList([])).toBe("No notes yet.");
    expect(formatList(addNote([], "milk", DAY))).toBe("1. milk (2026-11-06)");
  });
});

describe("tags", () => {
  it("stores tags trimmed, lowercased and de-duplicated", () => {
    expect(addNote([], "a", DAY, [" Home ", "shop", "HOME"])[0].tags).toEqual(["home", "shop"]);
    expect(addNote([], "a", DAY)[0].tags ?? []).toEqual([]);
  });

  it("rejects blank tags", () => {
    expect(() => addNote([], "a", DAY, ["  "])).toThrow(NotesError);
  });

  it("filters by tag, treating legacy notes as untagged", () => {
    const legacy: Note = { id: 1, text: "old", created: DAY };
    const notes = [legacy, ...addNote([], "new", DAY, ["Home"]).map((n) => ({ ...n, id: 2 }))];
    expect(filterByTag(notes, "home").map((n) => n.id)).toEqual([2]);
    expect(filterByTag(notes, "none")).toEqual([]);
  });

  it("formats tagged and untagged notes", () => {
    expect(formatList(addNote([], "buy milk", DAY, ["home", "shop"]))).toBe("1. buy milk [home, shop] (2026-11-06)");
    expect(formatList(addNote([], "milk", DAY))).toBe("1. milk (2026-11-06)");
  });
});

describe("cli tags", () => {
  it("adds several tags, anywhere in the args", () => {
    const file = tmpFile();
    run(["add", "--tag", "home", "--tag", "shop", "buy", "milk"], file, DAY);
    run(["add", "walk", "dog", "--tag", "home"], file, DAY);
    expect(run(["list"], file, DAY).out).toBe("1. buy milk [home, shop] (2026-11-06)\n2. walk dog [home] (2026-11-06)");
  });

  it("filters the list by tag", () => {
    const file = tmpFile();
    run(["add", "--tag", "home", "a"], file, DAY);
    run(["add", "b"], file, DAY);
    expect(run(["list", "--tag", "home"], file, DAY).out).toBe("1. a [home] (2026-11-06)");
    expect(run(["list", "--tag", "nope"], file, DAY)).toEqual({ code: 0, out: "No notes yet." });
  });

  it("reports bad usage", () => {
    const file = tmpFile();
    expect(run(["add", "x", "--tag"], file, DAY).code).toBe(1);
    expect(run(["list", "--tag", "a", "--tag", "b"], file, DAY).code).toBe(2);
  });

  it("lists a legacy file without tags", () => {
    const file = tmpFile();
    writeFileSync(file, JSON.stringify([{ id: 1, text: "old", created: DAY }]));
    expect(run(["list"], file, DAY).out).toBe("1. old (2026-11-06)");
  });
});

describe("cli", () => {
  it("adds and lists notes in the file", () => {
    const file = tmpFile();
    expect(run(["add", "buy", "milk"], file, DAY)).toEqual({ code: 0, out: "Added note 1." });
    expect(run(["list"], file, DAY).out).toBe("1. buy milk (2026-11-06)");
  });

  it("deletes a note", () => {
    const file = tmpFile();
    run(["add", "x"], file, DAY);
    expect(run(["delete", "1"], file, DAY).code).toBe(0);
    expect(run(["list"], file, DAY).out).toBe("No notes yet.");
  });

  it("reports errors with exit code 1", () => {
    const file = tmpFile();
    writeFileSync(file, "{ not json");
    expect(run(["list"], file, DAY).code).toBe(1);
    expect(run(["delete", "3"], tmpFile(), DAY)).toEqual({ code: 1, out: "error: no note with id 3" });
  });

  it("prints usage for unknown commands", () => {
    expect(run(["fly"], tmpFile(), DAY).code).toBe(2);
  });
});
