// Pure page operations on PDF bytes, implemented with pdf-lib.
// All page indexes are 0-based. Functions never mutate their input.
import { PDFDocument, PDFDict, PDFName, PDFRef, PDFString, PDFHexString, PDFObjectCopier, degrees, type PDFPage } from "pdf-lib";

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

async function save(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true });
}

function fieldName(dict: PDFDict): string {
  const t = dict.get(PDFName.of("T"));
  return t instanceof PDFString || t instanceof PDFHexString ? t.decodeText() : "";
}

/**
 * Registers the form fields behind the widget annotations on `pages` (just copied from `src`)
 * in `doc`'s AcroForm. pdf-lib's copyPages brings the field dictionaries along but never lists
 * them, which leaves the form flat in most viewers. Colliding top-level names get a suffix so
 * both forms stay independently fillable; default resources come along when `doc` has none.
 */
function adoptFields(doc: PDFDocument, pages: PDFPage[], src: PDFDocument): void {
  const tops = new Map<string, PDFRef>();
  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      let ref = annots.get(i);
      const first = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
      if (!(first instanceof PDFDict) || first.get(PDFName.of("Subtype")) !== PDFName.of("Widget")) continue;
      let dict: PDFDict = first;
      for (let parent = dict.get(PDFName.of("Parent")); parent instanceof PDFRef; parent = dict.get(PDFName.of("Parent"))) {
        const d = doc.context.lookup(parent);
        if (!(d instanceof PDFDict)) break;
        ref = parent;
        dict = d;
      }
      if (ref instanceof PDFRef) tops.set(ref.toString(), ref);
    }
  }
  if (tops.size === 0) return;
  const acro = doc.catalog.getOrCreateAcroForm();
  const listed = new Set(acro.normalizedEntries().Fields.asArray().map((r) => r.toString()));
  const names = new Set(acro.getFields().map(([f]) => fieldName(f.dict)));
  for (const [key, ref] of tops) {
    if (listed.has(key)) continue;
    const dict = doc.context.lookup(ref) as PDFDict;
    const base = fieldName(dict);
    if (base && names.has(base)) {
      let n = 2;
      while (names.has(`${base} (${n})`)) n++;
      dict.set(PDFName.of("T"), PDFHexString.fromText(`${base} (${n})`));
    }
    names.add(fieldName(dict));
    acro.addField(ref);
  }
  const srcAcro = src.catalog.AcroForm();
  if (srcAcro) {
    const copier = PDFObjectCopier.for(src.context, doc.context);
    for (const key of ["DR", "DA", "NeedAppearances"]) {
      const v = srcAcro.get(PDFName.of(key));
      if (v && !acro.dict.has(PDFName.of(key))) acro.dict.set(PDFName.of(key), copier.copy(v));
    }
  }
}

function normalize(indexes: number[], count: number): number[] {
  return [...new Set(indexes)].filter((i) => i >= 0 && i < count).sort((a, b) => a - b);
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await load(bytes)).getPageCount();
}

export async function deletePages(bytes: Uint8Array, indexes: number[]): Promise<Uint8Array> {
  const doc = await load(bytes);
  const targets = normalize(indexes, doc.getPageCount());
  if (targets.length === 0) return bytes;
  if (targets.length >= doc.getPageCount()) throw new Error("A document must keep at least one page.");
  for (const i of [...targets].reverse()) doc.removePage(i);
  return save(doc);
}

export async function rotatePages(bytes: Uint8Array, indexes: number[], delta: number): Promise<Uint8Array> {
  const doc = await load(bytes);
  for (const i of normalize(indexes, doc.getPageCount())) {
    const page = doc.getPage(i);
    const current = page.getRotation().angle;
    page.setRotation(degrees((((current + delta) % 360) + 360) % 360));
  }
  return save(doc);
}

/** Moves the page at `from` so that it ends up at index `to`. */
export async function movePage(bytes: Uint8Array, from: number, to: number): Promise<Uint8Array> {
  const doc = await load(bytes);
  const n = doc.getPageCount();
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return bytes;
  const page = doc.getPage(from);
  doc.removePage(from);
  doc.insertPage(to, page);
  return save(doc);
}

/** Moves a set of pages (kept in their relative order) so the block starts at `to`
 *  measured in the document *after* removal of the moved pages. */
export async function movePages(bytes: Uint8Array, indexes: number[], to: number): Promise<Uint8Array> {
  const doc = await load(bytes);
  const n = doc.getPageCount();
  const moving = normalize(indexes, n);
  if (moving.length === 0) return bytes;
  const pages = moving.map((i) => doc.getPage(i));
  for (const i of [...moving].reverse()) doc.removePage(i);
  const target = Math.max(0, Math.min(to, doc.getPageCount()));
  pages.forEach((p, k) => doc.insertPage(target + k, p));
  return save(doc);
}

export async function insertBlankPage(bytes: Uint8Array, index: number): Promise<Uint8Array> {
  const doc = await load(bytes);
  const n = doc.getPageCount();
  const at = Math.max(0, Math.min(index, n));
  const ref = doc.getPage(Math.min(Math.max(at - 1, 0), n - 1));
  const { width, height } = ref.getSize();
  const page = doc.insertPage(at, [width, height]);
  page.setRotation(ref.getRotation());
  return save(doc);
}

/** Inserts all pages of `other` into `bytes` at `index` (defaults to the end). */
export async function insertPdf(bytes: Uint8Array, other: Uint8Array, index?: number): Promise<Uint8Array> {
  const doc = await load(bytes);
  const src = await load(other);
  // pdf-lib passes encrypted objects through untouched; pages copied between documents with
  // different encryption would be unreadable.
  if (doc.isEncrypted) throw new Error("Merging into a password-protected PDF is not supported.");
  if (src.isEncrypted) throw new Error("The file to merge is password-protected; remove its password first.");
  const copied = await doc.copyPages(src, src.getPageIndices());
  const at = index === undefined ? doc.getPageCount() : Math.max(0, Math.min(index, doc.getPageCount()));
  copied.forEach((p, k) => doc.insertPage(at + k, p));
  adoptFields(doc, copied, src);
  return save(doc);
}

/** Creates a new document containing only the given pages, in the given order. */
export async function extractPages(bytes: Uint8Array, indexes: number[]): Promise<Uint8Array> {
  const src = await load(bytes);
  if (src.isEncrypted) throw new Error("Extracting pages from a password-protected PDF is not supported.");
  const wanted = normalize(indexes, src.getPageCount());
  if (wanted.length === 0) throw new Error("Select at least one page to extract.");
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, wanted);
  copied.forEach((p) => doc.addPage(p));
  adoptFields(doc, copied, src);
  const title = src.getTitle();
  if (title) doc.setTitle(`${title} (extract)`);
  return save(doc);
}

/** Reorders the document so page `order[k]` becomes page k. `order` must be a permutation. */
export async function reorderPages(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  const doc = await load(bytes);
  const n = doc.getPageCount();
  if (order.length !== n || new Set(order).size !== n || order.some((i) => i < 0 || i >= n)) {
    throw new Error("Invalid page order.");
  }
  const pages = order.map((i) => doc.getPage(i));
  for (let i = n - 1; i >= 0; i--) doc.removePage(i);
  pages.forEach((p) => doc.addPage(p));
  return save(doc);
}

/** Splits every page into its own single-page document. */
export async function splitPages(bytes: Uint8Array): Promise<Uint8Array[]> {
  const src = await load(bytes);
  if (src.isEncrypted) throw new Error("Splitting a password-protected PDF is not supported.");
  const out: Uint8Array[] = [];
  for (const i of src.getPageIndices()) {
    const doc = await PDFDocument.create();
    const [p] = await doc.copyPages(src, [i]);
    doc.addPage(p);
    adoptFields(doc, [p], src);
    out.push(await save(doc));
  }
  return out;
}
