import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as ops from "../src/pageops";

let base: Uint8Array;

async function makeDoc(n: number, label = "doc"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(label);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const page = doc.addPage([300 + i, 400]);
    page.drawText(`${label} ${i}`, { x: 20, y: 200, size: 20, font });
  }
  const form = doc.getForm();
  form.createTextField("f1").addToPage(doc.getPage(0), { x: 10, y: 10, width: 100, height: 20 });
  return doc.save();
}

async function widths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => Math.round(p.getWidth()));
}

beforeAll(async () => {
  base = await makeDoc(5);
});

describe("pageops", () => {
  it("deletes pages and keeps the rest in order", async () => {
    const out = await ops.deletePages(base, [1, 3]);
    expect(await widths(out)).toEqual([301, 303, 305]);
  });

  it("refuses to delete every page", async () => {
    await expect(ops.deletePages(base, [0, 1, 2, 3, 4])).rejects.toThrow(/at least one page/);
  });

  it("rotates pages modulo 360", async () => {
    let out = await ops.rotatePages(base, [0], 90);
    out = await ops.rotatePages(out, [0], -180);
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getRotation().angle).toBe(270);
    expect(doc.getPage(1).getRotation().angle).toBe(0);
  });

  it("moves a single page forward and backward", async () => {
    expect(await widths(await ops.movePage(base, 0, 4))).toEqual([302, 303, 304, 305, 301]);
    expect(await widths(await ops.movePage(base, 4, 0))).toEqual([305, 301, 302, 303, 304]);
    expect(await widths(await ops.movePage(base, 1, 3))).toEqual([301, 303, 304, 302, 305]);
  });

  it("moves a block of pages", async () => {
    expect(await widths(await ops.movePages(base, [0, 1], 3))).toEqual([303, 304, 305, 301, 302]);
    expect(await widths(await ops.movePages(base, [3, 4], 0))).toEqual([304, 305, 301, 302, 303]);
  });

  it("keeps form fields after moving pages", async () => {
    const out = await ops.movePage(base, 0, 2);
    const doc = await PDFDocument.load(out);
    expect(doc.getForm().getFields().map((f) => f.getName())).toEqual(["f1"]);
  });

  it("inserts a blank page sized like its neighbour", async () => {
    const out = await ops.insertBlankPage(base, 2);
    expect(await widths(out)).toEqual([301, 302, 302, 303, 304, 305]);
    const end = await ops.insertBlankPage(base, 99);
    expect(await widths(end)).toEqual([301, 302, 303, 304, 305, 305]);
  });

  it("merges another document at a position", async () => {
    const other = await makeDoc(2, "other");
    expect(await widths(await ops.insertPdf(base, other))).toEqual([301, 302, 303, 304, 305, 301, 302]);
    expect(await widths(await ops.insertPdf(base, other, 1))).toEqual([301, 301, 302, 302, 303, 304, 305]);
  });

  it("extracts pages into a new document", async () => {
    const out = await ops.extractPages(base, [4, 0]);
    expect(await widths(out)).toEqual([301, 305]);
    const doc = await PDFDocument.load(out);
    expect(doc.getTitle()).toBe("doc (extract)");
  });

  it("reorders pages by permutation", async () => {
    expect(await widths(await ops.reorderPages(base, [4, 3, 2, 1, 0]))).toEqual([305, 304, 303, 302, 301]);
    await expect(ops.reorderPages(base, [0, 0, 1, 2, 3])).rejects.toThrow(/Invalid/);
  });

  it("splits into single-page documents", async () => {
    const parts = await ops.splitPages(base);
    expect(parts).toHaveLength(5);
    expect(await widths(parts[2])).toEqual([303]);
  });
});
