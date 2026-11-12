import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.ts";
import { addNote, deleteNote, formatList, NotesError, searchNotes, type Note } from "../src/notes.ts";

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

  const sample = (): Note[] => addNote(addNote(addNote([], "buy milk", DAY), "call mom", DAY), "milk oat", DAY);

  it("finds substring matches in original order", () => {
    const found = searchNotes(sample(), "milk");
    expect(found.map((n) => n.text)).toEqual(["buy milk", "milk oat"]);
  });

  it("ignores case", () => {
    expect(searchNotes(addNote([], "Buy MILK", DAY), "milk")).toHaveLength(1);
    expect(searchNotes(sample(), "MiLk")).toHaveLength(2);
  });

  it("trims the query", () => {
    expect(searchNotes(sample(), "  milk  ")).toEqual(searchNotes(sample(), "milk"));
  });

  it("matches multi-word queries as one phrase", () => {
    const notes = addNote(addNote([], "buy milk", DAY), "milk, buy", DAY);
    expect(searchNotes(notes, "buy milk").map((n) => n.text)).toEqual(["buy milk"]);
  });

  it("returns nothing when no note matches", () => {
    expect(searchNotes(sample(), "zzz")).toEqual([]);
  });

  it("does not search ids or dates", () => {
    const notes = addNote([], "call mom", DAY);
    expect(searchNotes(notes, "2026")).toEqual([]);
    expect(searchNotes(notes, "1")).toEqual([]);
  });

  it("does not change the input", () => {
    const notes = sample();
    const before = JSON.stringify(notes);
    searchNotes(notes, "milk");
    expect(JSON.stringify(notes)).toBe(before);
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

  const seeded = () => {
    const file = tmpFile();
    run(["add", "buy", "milk"], file, DAY);
    run(["add", "call", "mom"], file, DAY);
    return file;
  };

  it("prints search matches like list", () => {
    expect(run(["search", "MILK"], seeded(), DAY)).toEqual({ code: 0, out: "1. buy milk (2026-11-06)" });
  });

  it("prints the no-match message", () => {
    expect(run(["search", "zzz"], seeded(), DAY)).toEqual({ code: 0, out: "No matching notes." });
  });

  it("joins the words of the query", () => {
    const file = seeded();
    expect(run(["search", "buy", "milk"], file, DAY).out).toBe(run(["search", "buy milk"], file, DAY).out);
  });

  it("reports an empty query as usage", () => {
    const file = seeded();
    expect(run(["search"], file, DAY).code).toBe(2);
    expect(run(["search", "   "], file, DAY).code).toBe(2);
  });

  it("does not write the file when searching", () => {
    const file = seeded();
    const before = readFileSync(file, "utf8");
    run(["search", "milk"], file, DAY);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("reports a broken notes file with exit code 1 when searching", () => {
    const file = tmpFile();
    writeFileSync(file, "{ not json");
    expect(run(["search", "x"], file, DAY).code).toBe(1);
  });
});
