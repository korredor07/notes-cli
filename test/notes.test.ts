import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { styleText } from "node:util";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.ts";
import { addNote, deleteNote, formatList, NotesError, type Note } from "../src/notes.ts";

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

const paint = (format: "gray" | "green", s: string) => styleText(format, s, { validateStream: false });
const coloredLine = (n: Note) => `${paint("gray", String(n.id))}. ${paint("green", n.text)} (${n.created})`;

describe("colored list", () => {
  const two = addNote(addNote([], "milk", DAY), "eggs", DAY);

  it("colors id gray and text green", () => {
    expect(formatList(addNote([], "milk", DAY), true)).toBe(coloredLine({ id: 1, text: "milk", created: DAY }));
  });

  it("stays plain by default or when color is false", () => {
    expect(formatList(two)).not.toContain("\x1b[");
    expect(formatList(two, false)).toBe("1. milk (2026-11-06)\n2. eggs (2026-11-06)");
  });

  it("does not color the empty message", () => {
    expect(formatList([], true)).toBe("No notes yet.");
  });

  it("colors every note in order", () => {
    expect(formatList(two, true)).toBe(two.map(coloredLine).join("\n"));
  });

  it("run passes color through to list", () => {
    const file = tmpFile();
    run(["add", "milk"], file, DAY);
    expect(run(["list"], file, DAY, true).out).toBe(coloredLine({ id: 1, text: "milk", created: DAY }));
    expect(run(["list"], file, DAY).out).toBe("1. milk (2026-11-06)");
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
