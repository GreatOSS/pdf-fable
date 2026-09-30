import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, StandardFonts } from "pdf-lib";
import * as ops from "../src/pageops";
import { readFileSync } from "node:fs";

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

  it("retargets bookmarks and links that pointed at deleted pages", async () => {
    const doc = await PDFDocument.load(base);
    const ctx = doc.context;
    const pages = doc.getPages();
    const item = (title: string, page: number) => ctx.register(ctx.obj({ Title: title, Dest: [pages[page].ref, "Fit"] }));
    const first = item("Part A", 1), second = item("Part B", 4);
    ctx.lookup(first, PDFDict).set(PDFName.of("Next"), second);
    const outlines = ctx.register(ctx.obj({ Type: "Outlines", First: first, Last: second, Count: 2 }));
    doc.catalog.set(PDFName.of("Outlines"), outlines);
    const link = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 10, 10], A: { S: "GoTo", D: [pages[1].ref, "Fit"] } }));
    pages[0].node.set(PDFName.of("Annots"), ctx.obj([link]));
    doc.catalog.set(PDFName.of("Dests"), ctx.obj({ chapter: [pages[4].ref, "Fit"] }));
    const out = await PDFDocument.load(await ops.deletePages(await doc.save(), [1, 4]));
    const target = (arr: PDFArray) => out.getPages().findIndex((p) => p.ref.toString() === (arr.get(0) as PDFRef).toString());
    const octx = out.context;
    const o1 = octx.lookup(octx.lookup(doc.catalog.get(PDFName.of("Outlines")) as PDFRef, PDFDict).get(PDFName.of("First")) as PDFRef, PDFDict);
    const dest1 = o1.lookup(PDFName.of("Dest"), PDFArray);
    expect(target(dest1)).toBe(1); // old page 3 is the next survivor after deleted page 2
    const o2 = octx.lookup(o1.get(PDFName.of("Next")) as PDFRef, PDFDict);
    expect(target(o2.lookup(PDFName.of("Dest"), PDFArray))).toBe(2); // last page deleted: falls back to the previous one
    const annot = octx.lookup((out.getPage(0).node.Annots() as PDFArray).get(0) as PDFRef, PDFDict);
    expect(target(annot.lookup(PDFName.of("A"), PDFDict).lookup(PDFName.of("D"), PDFArray))).toBe(1);
    expect(target(out.catalog.lookup(PDFName.of("Dests"), PDFDict).lookup(PDFName.of("chapter"), PDFArray))).toBe(2);
  });

  async function outlined(): Promise<Uint8Array> {
    const doc = await PDFDocument.load(base);
    const ctx = doc.context;
    const pages = doc.getPages();
    const mk = (title: string, page: number | null, extra: Record<string, unknown> = {}) =>
      ctx.register(ctx.obj({ Title: PDFString.of(title), ...(page === null ? {} : { Dest: [pages[page].ref, "XYZ", 0, 400, null] }), ...extra }));
    const s1 = mk("Section 1", 1), s2 = mk("Section 2", 3);
    const chapter = mk("Chapter", 0, { First: s1, Last: s2, Count: 2 });
    ctx.lookup(s1, PDFDict).set(PDFName.of("Next"), s2);
    ctx.lookup(s1, PDFDict).set(PDFName.of("Parent"), chapter);
    ctx.lookup(s2, PDFDict).set(PDFName.of("Parent"), chapter);
    const appendix = mk("Appendix", 4);
    ctx.lookup(chapter, PDFDict).set(PDFName.of("Next"), appendix);
    doc.catalog.set(PDFName.of("Outlines"), ctx.register(ctx.obj({ Type: "Outlines", First: chapter, Last: appendix, Count: 4 })));
    return doc.save();
  }

  function outlineTitles(doc: PDFDocument): unknown[] {
    const ctx = doc.context;
    const walk = (first: unknown): unknown[] => {
      const out: unknown[] = [];
      for (let ref = first; ref instanceof PDFRef; ref = ctx.lookup(ref, PDFDict).get(PDFName.of("Next"))) {
        const d = ctx.lookup(ref, PDFDict);
        const dest = d.get(PDFName.of("Dest"));
        const page = dest instanceof PDFArray ? doc.getPages().findIndex((p) => p.ref.toString() === (dest.get(0) as PDFRef).toString()) : null;
        const title = d.get(PDFName.of("Title"));
        out.push([title instanceof PDFString || title instanceof PDFHexString ? title.decodeText() : "?", page, walk(d.get(PDFName.of("First")))]);
      }
      return out;
    };
    const root = doc.catalog.lookupMaybe(PDFName.of("Outlines"), PDFDict);
    return root ? walk(root.get(PDFName.of("First"))) : [];
  }

  it("keeps the matching part of the outline when extracting and splitting", async () => {
    const src = await outlined();
    const out = await PDFDocument.load(await ops.extractPages(src, [3, 4]));
    expect(outlineTitles(out)).toEqual([["Chapter", null, [["Section 2", 0, []]]], ["Appendix", 1, []]]);
    const parts = await ops.splitPages(src);
    expect(outlineTitles(await PDFDocument.load(parts[1]))).toEqual([["Chapter", null, [["Section 1", 0, []]]]]);
    expect(outlineTitles(await PDFDocument.load(parts[2]))).toEqual([]);
  });

  it("appends the merged document's outline after the existing one", async () => {
    const src = await outlined();
    const merged = await PDFDocument.load(await ops.insertPdf(src, src));
    const titles = outlineTitles(merged);
    expect(titles.map((t) => (t as unknown[])[0])).toEqual(["Chapter", "Appendix", "Chapter", "Appendix"]);
    expect((titles[3] as unknown[])[1]).toBe(9); // second copy's appendix points at the copied page
    expect(merged.catalog.lookup(PDFName.of("Outlines"), PDFDict).lookup(PDFName.of("Count"), PDFNumber).asNumber()).toBe(8);
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

  it("keeps form fields fillable after merging, renaming clashes", async () => {
    const other = await makeDoc(2, "other");
    const doc = await PDFDocument.load(await ops.insertPdf(base, other));
    expect(doc.getForm().getFields().map((f) => f.getName())).toEqual(["f1", "f1 (2)"]);
    expect(doc.getForm().getTextField("f1 (2)").acroField.getWidgets().length).toBe(1);
  });

  it("keeps form fields fillable after extracting and splitting", async () => {
    const extracted = await PDFDocument.load(await ops.extractPages(base, [0]));
    expect(extracted.getForm().getFields().map((f) => f.getName())).toEqual(["f1"]);
    const [first, second] = await ops.splitPages(base);
    expect((await PDFDocument.load(first)).getForm().getFields().map((f) => f.getName())).toEqual(["f1"]);
    expect((await PDFDocument.load(second)).getForm().getFields()).toEqual([]);
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

  it("keeps in-place operations working on encrypted files but refuses cross-document copies", async () => {
    const enc = new Uint8Array(readFileSync(new URL("./fixtures/encrypted.pdf", import.meta.url)));
    const out = await ops.deletePages(enc, [1]);
    expect(await ops.pageCount(out)).toBe(6);
    const rotated = await ops.rotatePages(enc, [0], 90);
    expect((await PDFDocument.load(rotated, { ignoreEncryption: true })).getPage(0).getRotation().angle).toBe(90);
    await expect(ops.insertPdf(enc, base)).rejects.toThrow(/password-protected/);
    await expect(ops.insertPdf(base, enc)).rejects.toThrow(/password-protected/);
    await expect(ops.extractPages(enc, [0])).rejects.toThrow(/password-protected/);
  });

  it("splits into single-page documents", async () => {
    const parts = await ops.splitPages(base);
    expect(parts).toHaveLength(5);
    expect(await widths(parts[2])).toEqual([303]);
  });
});
