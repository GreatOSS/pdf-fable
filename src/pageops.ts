// Pure page operations on PDF bytes, implemented with pdf-lib.
// All page indexes are 0-based. Functions never mutate their input.
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFNumber, PDFRef, PDFString, PDFHexString, PDFObject, PDFObjectCopier, degrees, type PDFPage } from "pdf-lib";

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

/**
 * Points every destination that targets one of `removed` pages at the nearest surviving page
 * (the next one, or the previous one at the end). Covers outline items, link annotations on the
 * remaining pages, the catalog's /Dests dictionary and the /Names destination tree. Without this,
 * bookmarks to a deleted page silently stop working in every viewer.
 */
function retargetDestinations(doc: PDFDocument, removed: Set<string>, replacement: Map<string, PDFRef>): void {
  const ctx = doc.context;
  const look = (o: PDFObject | undefined): PDFObject | undefined => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const fixArray = (arr: PDFArray) => {
    const first = arr.get(0);
    if (first instanceof PDFRef && removed.has(first.toString())) arr.set(0, replacement.get(first.toString())!);
  };
  // A destination may be an explicit array, or a dictionary holding one under /D (named dests, GoTo actions).
  const fixDest = (o: PDFObject | undefined) => {
    const v = look(o);
    if (v instanceof PDFArray) fixArray(v);
    else if (v instanceof PDFDict) { const d = look(v.get(PDFName.of("D"))); if (d instanceof PDFArray) fixArray(d); }
  };
  const fixHolder = (d: PDFDict) => {
    fixDest(d.get(PDFName.of("Dest")));
    const a = look(d.get(PDFName.of("A")));
    if (a instanceof PDFDict && a.get(PDFName.of("S")) === PDFName.of("GoTo")) fixDest(a.get(PDFName.of("D")));
  };
  const seen = new Set<string>();
  const walkOutline = (o: PDFObject | undefined) => {
    for (let ref = o; ref instanceof PDFRef && !seen.has(ref.toString()); ) {
      seen.add(ref.toString());
      const item = ctx.lookup(ref);
      if (!(item instanceof PDFDict)) break;
      fixHolder(item);
      walkOutline(item.get(PDFName.of("First")));
      ref = item.get(PDFName.of("Next"));
    }
  };
  const outlines = look(doc.catalog.get(PDFName.of("Outlines")));
  if (outlines instanceof PDFDict) walkOutline(outlines.get(PDFName.of("First")));
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) { const a = look(annots.get(i)); if (a instanceof PDFDict) fixHolder(a); }
  }
  const dests = look(doc.catalog.get(PDFName.of("Dests")));
  if (dests instanceof PDFDict) for (const [, v] of dests.entries()) fixDest(v);
  const walkNames = (o: PDFObject | undefined) => {
    const node = look(o);
    if (!(node instanceof PDFDict) || seen.has(String(o))) return;
    seen.add(String(o));
    const names = look(node.get(PDFName.of("Names")));
    if (names instanceof PDFArray) for (let i = 1; i < names.size(); i += 2) fixDest(names.get(i));
    const kids = look(node.get(PDFName.of("Kids")));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) walkNames(kids.get(i));
  };
  const nameTree = look(doc.catalog.get(PDFName.of("Names")));
  if (nameTree instanceof PDFDict) walkNames(nameTree.get(PDFName.of("Dests")));
}

function textOf(o: PDFObject | undefined): string {
  return o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : "";
}

/** Resolves an outline item's or link's destination to an explicit array within `src` (named destinations included). */
function resolveDest(src: PDFDocument, holder: PDFDict): PDFArray | undefined {
  const ctx = src.context;
  const look = (o: PDFObject | undefined): PDFObject | undefined => (o instanceof PDFRef ? ctx.lookup(o) : o);
  let dest = look(holder.get(PDFName.of("Dest")));
  if (!dest) {
    const a = look(holder.get(PDFName.of("A")));
    if (a instanceof PDFDict && a.get(PDFName.of("S")) === PDFName.of("GoTo")) dest = look(a.get(PDFName.of("D")));
  }
  if (dest instanceof PDFString || dest instanceof PDFHexString || dest instanceof PDFName) {
    const name = dest instanceof PDFName ? dest.decodeText() : dest.decodeText();
    const dests = look(src.catalog.get(PDFName.of("Dests")));
    let found: PDFObject | undefined = dests instanceof PDFDict ? look(dests.get(PDFName.of(name))) : undefined;
    if (!found) {
      const tree = look(src.catalog.get(PDFName.of("Names")));
      const visit = (node: PDFObject | undefined): PDFObject | undefined => {
        const n = look(node);
        if (!(n instanceof PDFDict)) return undefined;
        const names = look(n.get(PDFName.of("Names")));
        if (names instanceof PDFArray) for (let i = 0; i + 1 < names.size(); i += 2) if (textOf(names.get(i)) === name) return look(names.get(i + 1));
        const kids = look(n.get(PDFName.of("Kids")));
        if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) { const r = visit(kids.get(i)); if (r) return r; }
        return undefined;
      };
      if (tree instanceof PDFDict) found = visit(tree.get(PDFName.of("Dests")));
    }
    dest = found;
  }
  if (dest instanceof PDFDict) dest = look(dest.get(PDFName.of("D")));
  return dest instanceof PDFArray ? dest : undefined;
}

/**
 * Appends to `doc`'s outline the part of `src`'s outline that points at pages in `pageMap`
 * (source page ref → copied page ref). Headings whose own page was not copied stay as plain
 * headings when they still have copied descendants, so a chapter keeps its structure.
 */
function carryOutline(doc: PDFDocument, src: PDFDocument, pageMap: Map<string, PDFRef>): void {
  const sctx = src.context, ctx = doc.context;
  const slook = (o: PDFObject | undefined): PDFObject | undefined => (o instanceof PDFRef ? sctx.lookup(o) : o);
  const srcRoot = slook(src.catalog.get(PDFName.of("Outlines")));
  if (!(srcRoot instanceof PDFDict)) return;
  type Node = { title: string; dest: PDFArray | null; kids: Node[] };
  const seen = new Set<string>();
  const collect = (first: PDFObject | undefined): Node[] => {
    const out: Node[] = [];
    for (let ref = first; ref instanceof PDFRef && !seen.has(ref.toString()); ) {
      seen.add(ref.toString());
      const item = sctx.lookup(ref);
      if (!(item instanceof PDFDict)) break;
      const kids = collect(item.get(PDFName.of("First")));
      const d = resolveDest(src, item);
      const target = d?.get(0);
      let dest: PDFArray | null = null;
      if (d && target instanceof PDFRef && pageMap.has(target.toString())) {
        dest = ctx.obj([pageMap.get(target.toString())!, ...d.asArray().slice(1).map((o) => (o instanceof PDFRef ? PDFNumber.of(0) : o.clone(ctx)))]);
      }
      if (dest || kids.length) out.push({ title: textOf(item.get(PDFName.of("Title"))), dest, kids });
      ref = item.get(PDFName.of("Next"));
    }
    return out;
  };
  const nodes = collect(srcRoot.get(PDFName.of("First")));
  if (!nodes.length) return;
  const existingRef = doc.catalog.get(PDFName.of("Outlines"));
  const existing = existingRef instanceof PDFRef ? ctx.lookup(existingRef) : undefined;
  let rootRef: PDFRef;
  let root: PDFDict;
  if (existing instanceof PDFDict && existingRef instanceof PDFRef) {
    root = existing;
    rootRef = existingRef;
  } else {
    root = ctx.obj({ Type: "Outlines", Count: 0 });
    rootRef = ctx.register(root);
    doc.catalog.set(PDFName.of("Outlines"), rootRef);
  }
  const count = (list: Node[]): number => list.reduce((n, k) => n + 1 + count(k.kids), 0);
  const build = (list: Node[], parent: PDFRef): [PDFRef, PDFRef] => {
    let first: PDFRef | null = null, prev: PDFRef | null = null;
    for (const n of list) {
      const dict = ctx.obj({ Title: PDFHexString.fromText(n.title), Parent: parent });
      if (n.dest) dict.set(PDFName.of("Dest"), n.dest);
      const ref = ctx.register(dict);
      if (n.kids.length) {
        const [f, l] = build(n.kids, ref);
        dict.set(PDFName.of("First"), f);
        dict.set(PDFName.of("Last"), l);
        dict.set(PDFName.of("Count"), PDFNumber.of(count(n.kids)));
      }
      if (prev) { dict.set(PDFName.of("Prev"), prev); (ctx.lookup(prev) as PDFDict).set(PDFName.of("Next"), ref); }
      first ??= ref;
      prev = ref;
    }
    return [first!, prev!];
  };
  const [first, last] = build(nodes, rootRef);
  const oldLast = root.get(PDFName.of("Last"));
  if (oldLast instanceof PDFRef) {
    (ctx.lookup(oldLast) as PDFDict).set(PDFName.of("Next"), first);
    (ctx.lookup(first) as PDFDict).set(PDFName.of("Prev"), oldLast);
  } else {
    root.set(PDFName.of("First"), first);
  }
  root.set(PDFName.of("Last"), last);
  const old = root.get(PDFName.of("Count"));
  root.set(PDFName.of("Count"), PDFNumber.of((old instanceof PDFNumber ? Math.max(0, old.asNumber()) : 0) + count(nodes)));
}

/** Maps the refs of `indexes` in `src` to the refs of the pages copied into `doc`. */
function pageRefMap(src: PDFDocument, indexes: number[], copied: PDFPage[]): Map<string, PDFRef> {
  const m = new Map<string, PDFRef>();
  indexes.forEach((i, k) => m.set(src.getPage(i).ref.toString(), copied[k].ref));
  return m;
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
  const refs = doc.getPages().map((p) => p.ref);
  const gone = new Set(targets);
  const removed = new Set<string>();
  const replacement = new Map<string, PDFRef>();
  for (const i of targets) {
    let j = i + 1;
    while (j < refs.length && gone.has(j)) j++;
    if (j >= refs.length) { j = i - 1; while (j >= 0 && gone.has(j)) j--; }
    removed.add(refs[i].toString());
    replacement.set(refs[i].toString(), refs[j]);
  }
  for (const i of [...targets].reverse()) doc.removePage(i);
  retargetDestinations(doc, removed, replacement);
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
  carryOutline(doc, src, pageRefMap(src, src.getPageIndices(), copied));
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
  carryOutline(doc, src, pageRefMap(src, wanted, copied));
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
    carryOutline(doc, src, pageRefMap(src, [i], [p]));
    out.push(await save(doc));
  }
  return out;
}
