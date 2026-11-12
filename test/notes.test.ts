import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.ts";
import { addNote, deleteNote, formatList, formatSearch, NotesError, searchNotes, type Note } from "../src/notes.ts";

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

describe("search", () => {
  const sample = (): Note[] => addNote(addNote(addNote([], "buy Milk", DAY), "call Ana", DAY), "MILK run", DAY);

  it("returns only matching notes, case-insensitively, keeping ids and order", () => {
    expect(searchNotes(sample(), "MILK").map((n) => n.id)).toEqual([1, 3]);
    expect(searchNotes(sample(), "milk").map((n) => n.text)).toEqual(["buy Milk", "MILK run"]);
    expect(searchNotes(sample(), "ana").map((n) => n.id)).toEqual([2]);
  });

  it("returns [] when nothing matches", () => {
    expect(searchNotes(sample(), "zzz")).toEqual([]);
  });

  it("refuses empty or whitespace queries", () => {
    expect(() => searchNotes(sample(), "")).toThrow(NotesError);
    expect(() => searchNotes(sample(), "   ")).toThrow(NotesError);
  });

  it("formats search results", () => {
    expect(formatSearch([])).toBe("No matching notes.");
    expect(formatSearch(sample())).toBe(formatList(sample()));
  });
});

describe("cli search", () => {
  const seeded = () => {
    const file = tmpFile();
    run(["add", "buy", "milk"], file, DAY);
    run(["add", "call", "Ana"], file, DAY);
    return file;
  };

  it("finds notes case-insensitively", () => {
    expect(run(["search", "MILK"], seeded(), DAY)).toEqual({ code: 0, out: "1. buy milk (2026-11-06)" });
  });

  it("joins multi-word queries", () => {
    expect(run(["search", "buy", "milk"], seeded(), DAY).out).toBe("1. buy milk (2026-11-06)");
  });

  it("reports no match", () => {
    expect(run(["search", "zzz"], seeded(), DAY)).toEqual({ code: 0, out: "No matching notes." });
  });

  it("errors without text", () => {
    const res = run(["search"], seeded(), DAY);
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/^error:/);
  });

  it("does not modify the notes", () => {
    const file = seeded();
    const before = run(["list"], file, DAY).out;
    run(["search", "milk"], file, DAY);
    expect(run(["list"], file, DAY).out).toBe(before);
  });

  it("mentions search in usage", () => {
    expect(run(["fly"], tmpFile(), DAY).out).toContain("search");
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
