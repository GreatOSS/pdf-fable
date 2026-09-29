// Leafline application: wires the PDF.js viewer, sidebar, editing tools, page operations, and I/O.
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFViewer, EventBus, PDFLinkService, PDFFindController, PDFHistory, ScrollMode, SpreadMode, FindState, LinkTarget } from "pdfjs-dist/web/pdf_viewer.mjs";
import * as ops from "./pageops";
import { Thumbnails } from "./thumbnails";
import { printDocument, clearPrint } from "./print";
import { toast, askPassword, askUrl, showDialog, confirmDialog, formatBytes, downloadBytes, debounce } from "./ui";
import { icon } from "./icons";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ASSETS = new URL("pdfjs/", document.baseURI).href;
const VERSION = "0.1.0";
const { AnnotationEditorType: EditorType, AnnotationEditorParamsType: ParamType, AnnotationMode } = pdfjs;

type Tool = "select" | "hand" | "highlight" | "freetext" | "ink" | "stamp";
const TOOL_MODE: Record<Tool, number> = {
  select: EditorType.NONE, hand: EditorType.NONE, highlight: EditorType.HIGHLIGHT,
  freetext: EditorType.FREETEXT, ink: EditorType.INK, stamp: EditorType.STAMP,
};

// File System Access API (Chromium) — minimal typings.
interface FSFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: BufferSource | Blob): Promise<void>; close(): Promise<void> }>;
  queryPermission?(o: { mode: "readwrite" }): Promise<string>;
  requestPermission?(o: { mode: "readwrite" }): Promise<string>;
}
type PickerWindow = Window & {
  showOpenFilePicker?(o?: object): Promise<FSFileHandle[]>;
  showSaveFilePicker?(o?: object): Promise<FSFileHandle>;
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const prefs = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(`leafline.${k}`); return v === null ? d : (JSON.parse(v) as T); } catch { return d; } },
  set(k: string, v: unknown): void { try { localStorage.setItem(`leafline.${k}`, JSON.stringify(v)); } catch { /* ignore */ } },
};

interface PendingView { page?: number; scaleValue?: string; }

export class LeaflineApp {
  private eventBus = new EventBus();
  private linkService: PDFLinkService;
  private findController: PDFFindController;
  private pdfHistory: PDFHistory;
  private viewer: PDFViewer;
  private container = $<HTMLDivElement>("viewerContainer");
  private app = $("app");
  private pdf: PDFDocumentProxy | null = null;
  private fileName = "document.pdf";
  private fileHandle: FSFileHandle | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private uiManager: any = null;
  private tool: Tool = "select";
  private dirty = false;
  private pendingView: PendingView | null = null;
  private thumbs: Thumbnails;
  private history: { bytes: Uint8Array; dirty: boolean }[] = [];
  private loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null;
  private docTask: ReturnType<typeof pdfjs.getDocument> | null = null;
  private busy = false;
  private fitted: { preset: string; scale: number } | null = null;
  /** Password of the open document, re-used when the document is reloaded after page operations. */
  private password: string | null = null;

  constructor() {
    this.linkService = new PDFLinkService({ eventBus: this.eventBus, externalLinkTarget: LinkTarget.BLANK });
    this.findController = new PDFFindController({ eventBus: this.eventBus, linkService: this.linkService });
    this.viewer = new PDFViewer({
      container: this.container,
      viewer: $<HTMLDivElement>("viewer"),
      eventBus: this.eventBus,
      linkService: this.linkService,
      findController: this.findController,
      textLayerMode: 1,
      annotationMode: AnnotationMode.ENABLE_FORMS,
      annotationEditorMode: EditorType.NONE,
      annotationEditorHighlightColors: "yellow=#FFFF98,green=#53FFBC,blue=#80EBFF,pink=#FFCBE6,red=#FF4F5F",
      imageResourcesPath: `${ASSETS}images/`,
      enablePrintAutoRotate: true,
    });
    this.linkService.setViewer(this.viewer);
    // Navigation history (outline/link jumps) without touching the URL; Alt+Left/Right and the
    // browser back/forward buttons work through it.
    this.pdfHistory = new PDFHistory({ linkService: this.linkService, eventBus: this.eventBus });
    this.linkService.setHistory(this.pdfHistory);
    this.thumbs = new Thumbnails($("thumbnails"), {
      onGoTo: (i) => {
        this.viewer.currentPageNumber = i + 1;
        if (window.innerWidth <= 720) this.setSidebar(false);
        this.container.focus();
      },
      onMove: (idx, before) => void this.movePages(idx, before),
      onSelectionChange: (sel) => this.onSelectionChange(sel),
    });
    this.bindViewerEvents();
    this.bindToolbar();
    this.bindEditorBar();
    this.bindFindBar();
    this.bindSidebar();
    this.bindMenu();
    this.bindKeyboard();
    this.bindDragDrop();
    this.bindHandTool();
    this.applyPrefs();
    $("aboutVersion").textContent = `v${VERSION}`;
    window.addEventListener("beforeunload", (e) => { if (this.dirty) { e.preventDefault(); } });
    // The viewer component does not re-fit presets ("auto", "page-width", ...) when the window resizes.
    window.addEventListener("resize", debounce(() => this.refitPreset(), 120));
    const params = new URLSearchParams(location.search);
    const file = params.get("file");
    if (file) void this.openUrl(file);
  }

  // ---------- Preferences ----------
  private applyPrefs(): void {
    this.setTheme(prefs.get<"light" | "dark">("theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
    this.setSidebar(prefs.get("sidebar", false));
    this.setInvert(prefs.get("invert", false));
  }

  private setTheme(theme: "light" | "dark"): void {
    document.documentElement.dataset.theme = theme;
    $("btnTheme").innerHTML = icon(theme === "dark" ? "sun" : "moon");
    $("btnTheme").title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    prefs.set("theme", theme);
  }

  private setSidebar(open: boolean): void {
    $("sidebar").hidden = !open;
    $("btnSidebar").setAttribute("aria-pressed", String(open));
    prefs.set("sidebar", open);
    if (open && this.pdf) this.thumbs.setCurrent(this.viewer.currentPageNumber - 1);
    if (this.pdf) { this.viewer.update(); this.refitPreset(); }
  }

  private setInvert(on: boolean): void {
    this.container.classList.toggle("invert-pages", on);
    document.querySelector<HTMLElement>('[data-action="invert"]')!.setAttribute("aria-checked", String(on));
    prefs.set("invert", on);
  }

  // ---------- Viewer events ----------
  private bindViewerEvents(): void {
    const bus = this.eventBus;
    bus.on("pagesinit", () => {
      const v = this.pendingView;
      this.pendingView = null;
      this.viewer.currentScaleValue = v?.scaleValue ?? prefs.get("zoom", "auto");
      if (v?.page) this.viewer.currentPageNumber = Math.min(v.page, this.viewer.pagesCount);
      this.viewer.scrollMode = prefs.get("scrollMode", ScrollMode.VERTICAL);
      this.viewer.spreadMode = prefs.get("spreadMode", SpreadMode.NONE);
      this.fitWidestPage();
      this.syncMenuRadios();
      this.setTool(v?.page === undefined ? "select" : this.tool);
      this.container.focus();
    });
    // Real page sizes arrive after pagesinit (placeholders use the first page's size until then).
    bus.on("pagesloaded", () => this.fitWidestPage());
    // Rotated pages change their widths, so presets must be re-fitted.
    bus.on("rotationchanging", () => setTimeout(() => this.refitPreset(), 0));
    bus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
      $<HTMLInputElement>("pageInput").value = String(pageNumber);
      this.thumbs.setCurrent(pageNumber - 1);
    });
    bus.on("scalechanging", ({ scale, presetValue }: { scale: number; presetValue?: string }) => {
      const sel = $<HTMLSelectElement>("zoomSelect");
      const custom = sel.querySelector<HTMLOptionElement>('option[value="custom"]')!;
      if (presetValue) {
        sel.value = presetValue;
        if (!this.app.classList.contains("presentation")) prefs.set("zoom", presetValue);
      } else if (this.fitted && Math.abs(scale - this.fitted.scale) < 1e-6) {
        sel.value = this.fitted.preset;
      } else {
        custom.textContent = `${Math.round(scale * 100)}%`;
        custom.hidden = false;
        sel.value = "custom";
      }
    });
    bus.on("annotationeditoruimanager", ({ uiManager }: { uiManager: unknown }) => { this.uiManager = uiManager; });
    bus.on("annotationeditormodechanged", ({ mode }: { mode: number }) => {
      if (mode === EditorType.NONE && TOOL_MODE[this.tool] !== EditorType.NONE) this.setTool("select");
    });
    bus.on("editingstateschanged", ({ details }: { details: Record<string, boolean> }) => {
      $<HTMLButtonElement>("btnUndo").disabled = !details.hasSomethingToUndo;
      $<HTMLButtonElement>("btnRedo").disabled = !details.hasSomethingToRedo;
    });
    bus.on("annotationeditorparamschanged", ({ details }: { details: [number, unknown][] }) => {
      for (const [type, value] of details) {
        if (type === ParamType.HIGHLIGHT_COLOR) this.markSwatch(String(value));
      }
    });
    bus.on("updatefindmatchescount", ({ matchesCount }: { matchesCount: { current: number; total: number } }) => this.showFindStatus(FindState.FOUND, matchesCount));
    bus.on("updatefindcontrolstate", ({ state, matchesCount }: { state: number; matchesCount: { current: number; total: number } }) => this.showFindStatus(state, matchesCount));
    bus.on("pagerendered", ({ error }: { error?: Error }) => { if (error) toast(`A page failed to render: ${error.message}`, "error"); });
  }

  // ---------- Loading ----------
  async openFile(file: File, handle: FSFileHandle | null = null): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    const data = new Uint8Array(await file.arrayBuffer());
    this.fileHandle = handle;
    this.history = [];
    this.password = null;
    await this.load({ data }, file.name, {});
  }

  async openUrl(url: string): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    this.fileHandle = null;
    this.history = [];
    this.password = null;
    let name = "document.pdf";
    try { name = decodeURIComponent(new URL(url, location.href).pathname.split("/").pop() || name) || name; } catch { /* keep default */ }
    if (!/\.pdf$/i.test(name)) name += ".pdf";
    await this.load({ url: new URL(url, location.href).href }, name, {});
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.dirty) return true;
    return confirmDialog("You have unsaved changes. Discard them and open another document?");
  }

  private async load(src: { data?: Uint8Array; url?: string }, name: string, view: PendingView & { dirty?: boolean }): Promise<void> {
    this.setLoading(true, "Loading…");
    this.loadingTask?.destroy().catch(() => {});
    const task = pdfjs.getDocument({
      ...src,
      cMapUrl: `${ASSETS}cmaps/`,
      standardFontDataUrl: `${ASSETS}standard_fonts/`,
      wasmUrl: `${ASSETS}wasm/`,
      iccUrl: `${ASSETS}iccs/`,
      enableXfa: true,
      password: this.password ?? undefined,
    });
    this.loadingTask = task;
    task.onPassword = (update: (pw: string) => void, reason: number) => {
      void askPassword(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? "Incorrect password. Try again." : "This document is encrypted. Enter the password to open it.")
        .then((pw) => { if (pw === null) task.destroy(); else { this.password = pw; update(pw); } });
    };
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (total) this.setLoading(true, `Loading… ${Math.round((loaded / total) * 100)}%`);
    };
    try {
      const pdf = await task.promise;
      if (this.loadingTask !== task) { await task.destroy(); return; }
      await this.setDocument(pdf, task, name, view);
    } catch (err) {
      const e = err as Error;
      if (e?.name === "PasswordException" || /destroyed/i.test(String(e?.message))) { this.setLoading(false); return; }
      console.error(err);
      toast(`Could not open "${name}": ${e?.message ?? e}`, "error", 6000);
    } finally {
      this.setLoading(false);
    }
  }

  private async setDocument(pdf: PDFDocumentProxy, task: ReturnType<typeof pdfjs.getDocument>, name: string, view: PendingView & { dirty?: boolean }): Promise<void> {
    const old = this.docTask;
    this.pdf = pdf;
    this.docTask = task;
    this.fileName = name;
    this.pendingView = view;
    this.viewer.setDocument(pdf);
    this.linkService.setDocument(pdf, null);
    this.pdfHistory.initialize({ fingerprint: pdf.fingerprints[0] ?? "", resetHistory: true, updateUrl: false });
    this.thumbs.setDocument(pdf);
    if (old && old !== task) await old.destroy().catch(() => {});
    this.app.dataset.state = "loaded";
    $("pageCount").textContent = String(pdf.numPages);
    $<HTMLInputElement>("pageInput").max = String(pdf.numPages);
    $<HTMLInputElement>("pageInput").value = String(view.page ?? 1);
    document.title = `${name.replace(/\.pdf$/i, "")} — Leafline`;
    this.setDirty(view.dirty ?? false);
    (pdf.annotationStorage as unknown as { onSetModified: () => void }).onSetModified = () => this.setDirty(true);
    this.uiManager = null;
    void this.loadOutline(pdf);
    void pdf.getMetadata().then(({ info }) => {
      const title = (info as { Title?: string }).Title;
      if (title?.trim()) document.title = `${title.trim()} — Leafline`;
    }).catch(() => {});
  }

  private setLoading(on: boolean, text = ""): void {
    $("loading").hidden = !on;
    $("loadingText").textContent = text;
  }

  private setDirty(d: boolean): void {
    this.dirty = d;
    this.app.dataset.dirty = String(d);
    $("btnSave").title = d ? "Save changes (Ctrl+S)" : "Save (Ctrl+S)";
  }

  // ---------- Saving ----------
  private async currentBytes(): Promise<Uint8Array> {
    const pdf = this.pdf!;
    this.uiManager?.commitOrRemove?.();
    if (pdf.annotationStorage.size > 0) return pdf.saveDocument();
    return pdf.getData();
  }

  async save(forceDownload = false): Promise<void> {
    if (!this.pdf || this.busy) return;
    this.busy = true;
    try {
      const bytes = await this.currentBytes();
      const handle = this.fileHandle;
      if (handle && !forceDownload) {
        const perm = handle.requestPermission ? await handle.requestPermission({ mode: "readwrite" }) : "granted";
        if (perm === "granted") {
          const w = await handle.createWritable();
          await w.write(bytes as unknown as BufferSource);
          await w.close();
          toast(`Saved ${handle.name}`, "success");
          this.setDirty(false);
          return;
        }
      }
      const win = window as PickerWindow;
      if (win.showSaveFilePicker && !forceDownload) {
        try {
          const h = await win.showSaveFilePicker({ suggestedName: this.fileName, types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }] });
          const w = await h.createWritable();
          await w.write(bytes as unknown as BufferSource);
          await w.close();
          this.fileHandle = h;
          this.fileName = h.name;
          toast(`Saved ${h.name}`, "success");
          this.setDirty(false);
          return;
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          console.warn("save picker failed, falling back to download", err);
        }
      }
      downloadBytes(bytes, this.fileName);
      toast(`Downloaded ${this.fileName}`, "success");
      this.setDirty(false);
    } catch (err) {
      console.error(err);
      toast(`Could not save: ${(err as Error).message}`, "error", 6000);
    } finally {
      this.busy = false;
    }
  }

  // ---------- Page operations ----------
  private async applyPageOp(label: string, fn: (bytes: Uint8Array) => Promise<Uint8Array>, page?: number): Promise<void> {
    if (!this.pdf || this.busy) return;
    this.busy = true;
    this.setLoading(true, `${label}…`);
    try {
      const before = await this.currentBytes();
      const snapshot = { bytes: before.slice(), dirty: this.dirty };
      const out = await fn(before);
      this.history.push(snapshot);
      if (this.history.length > 10) this.history.shift();
      await this.load({ data: out }, this.fileName, { page: page ?? this.viewer.currentPageNumber, scaleValue: this.fitted?.preset ?? this.viewer.currentScaleValue, dirty: true });
      toast(`${label}. Click here or press Ctrl+Z to undo.`, "success", 10000).onclick = () => void this.undoPageOp();
    } catch (err) {
      console.error(err);
      toast(`Page change failed: ${(err as Error).message}`, "error", 6000);
    } finally {
      this.busy = false;
      this.setLoading(false);
    }
  }

  private async undoPageOp(): Promise<void> {
    const prev = this.history.pop();
    if (!prev || this.busy) return;
    await this.load({ data: prev.bytes }, this.fileName, { page: this.viewer.currentPageNumber, scaleValue: this.fitted?.preset ?? this.viewer.currentScaleValue, dirty: prev.dirty });
    toast("Page change undone", "info");
  }

  private async movePages(indexes: number[], before: number): Promise<void> {
    const shift = indexes.filter((i) => i < before).length;
    const target = before - shift;
    const first = Math.min(...indexes);
    await this.applyPageOp(indexes.length === 1 ? `Moved page ${first + 1}` : `Moved ${indexes.length} pages`, (b) => ops.movePages(b, indexes, target), target + 1);
  }

  private onSelectionChange(sel: number[]): void {
    $("pagesSelectionBar").hidden = sel.length === 0;
    $("pagesDefaultBar").hidden = sel.length > 0;
    $("selectionCount").textContent = `${sel.length} selected`;
  }

  // ---------- Tools ----------
  private setTool(tool: Tool): void {
    this.tool = tool;
    document.querySelectorAll<HTMLButtonElement>(".tool").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    this.container.classList.toggle("hand", tool === "hand");
    const mode = TOOL_MODE[tool];
    if (this.pdf && this.uiManager && this.viewer.annotationEditorMode.mode !== mode) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.viewer as any).annotationEditorMode = { mode };
      } catch (err) { console.warn("editor mode not available yet", err); }
    }
    const bar = $("editorBar");
    bar.hidden = mode === EditorType.NONE;
    bar.querySelectorAll<HTMLElement>(".editor-params").forEach((p) => p.classList.toggle("active", p.dataset.for === tool));
    if (mode !== EditorType.NONE) this.pushEditorParams(tool);
  }

  private pushEditorParams(tool: Tool): void {
    // Re-apply the visible controls so the editor uses what the user sees.
    document.querySelectorAll<HTMLInputElement>(`.editor-params[data-for="${tool}"] [data-param]`).forEach((el) => {
      if (el.matches(".swatches")) return;
      this.dispatchParam(el.dataset.param!, el.type === "checkbox" ? el.checked : el.type === "range" ? el.valueAsNumber : el.value);
    });
    if (tool === "highlight") {
      const active = document.querySelector<HTMLElement>(".swatch.active") ?? document.querySelector<HTMLElement>(".swatch")!;
      this.dispatchParam("HIGHLIGHT_COLOR", active.dataset.value);
      this.markSwatch(active.dataset.value!);
    }
  }

  private dispatchParam(name: string, value: unknown): void {
    const type = (ParamType as unknown as Record<string, number>)[name];
    if (type === undefined) return;
    this.eventBus.dispatch("switchannotationeditorparams", { source: this, type, value });
  }

  private markSwatch(color: string): void {
    document.querySelectorAll<HTMLElement>(".swatch").forEach((s) => s.classList.toggle("active", s.dataset.value?.toLowerCase() === color.toLowerCase()));
  }

  // ---------- Toolbar ----------
  private bindToolbar(): void {
    $("btnSidebar").onclick = () => this.setSidebar(!!$("sidebar").hidden);
    $("btnOpen").onclick = () => void this.pickFile();
    $("welcomeOpen").onclick = () => void this.pickFile();
    $("welcomeSample").onclick = () => void this.openUrl("samples/welcome.pdf");
    $<HTMLInputElement>("fileInput").onchange = (e) => {
      const input = e.target as HTMLInputElement;
      const f = input.files?.[0];
      input.value = "";
      if (f) void this.openFile(f);
    };
    $("btnPrev").onclick = () => this.viewer.previousPage();
    $("btnNext").onclick = () => this.viewer.nextPage();
    const pageInput = $<HTMLInputElement>("pageInput");
    pageInput.onchange = () => {
      const n = Math.max(1, Math.min(Number(pageInput.value) || 1, this.viewer.pagesCount));
      this.viewer.currentPageNumber = n;
      pageInput.value = String(n);
      this.container.focus();
    };
    pageInput.onfocus = () => pageInput.select();
    $("btnZoomIn").onclick = () => this.zoom(1);
    $("btnZoomOut").onclick = () => this.zoom(-1);
    $<HTMLSelectElement>("zoomSelect").onchange = (e) => {
      const v = (e.target as HTMLSelectElement).value;
      if (v !== "custom") { this.viewer.currentScaleValue = v; this.fitWidestPage(); }
      this.container.focus();
    };
    document.querySelectorAll<HTMLButtonElement>(".tool").forEach((b) => {
      b.onclick = () => {
        const t = b.dataset.tool as Tool;
        if (t === this.tool && TOOL_MODE[t] !== EditorType.NONE) { this.setTool("select"); return; }
        this.setTool(t);
        if (t === "stamp") this.dispatchParam("CREATE", null);
      };
    });
    $("btnFind").onclick = () => this.toggleFind();
    $("btnRotate").onclick = () => this.rotate(90);
    $("btnSave").onclick = () => void this.save();
    $("btnPrint").onclick = () => void this.print();
    $("btnTheme").onclick = () => this.setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    this.container.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey) || !this.pdf) return;
      e.preventDefault();
      const steps = e.deltaMode === 0 ? -e.deltaY / 100 : -Math.sign(e.deltaY);
      this.zoomAt(this.viewer.currentScale * Math.pow(1.1, steps), e.clientX, e.clientY);
    }, { passive: false });
    this.bindPinchZoom();
  }

  /** Sets an absolute scale while keeping the document point under (clientX, clientY) fixed. */
  private zoomAt(scale: number, clientX: number, clientY: number): void {
    const rect = this.container.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const oldScale = this.viewer.currentScale;
    const newScale = Math.max(0.1, Math.min(10, scale));
    if (Math.abs(newScale - oldScale) < 0.001) return;
    const sl = this.container.scrollLeft, st = this.container.scrollTop;
    this.viewer.currentScaleValue = String(newScale);
    const r = newScale / oldScale;
    this.container.scrollLeft = (sl + x) * r - x;
    this.container.scrollTop = (st + y) * r - y;
  }

  /** Two-finger pinch zoom on touch screens (pointer events; browser pinch is disabled via touch-action). */
  private bindPinchZoom(): void {
    const c = this.container;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { dist: number; scale: number } | null = null;
    let pending: number | null = null;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    c.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { start = { dist: dist(), scale: this.viewer.currentScale }; this.container.classList.add("pinching"); }
    });
    c.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch" || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size !== 2 || !start || !this.pdf) return;
      e.preventDefault();
      const [a, b] = [...pts.values()];
      const target = start.scale * dist() / start.dist;
      // Coalesce to one zoom per frame; re-scaling the viewer is expensive.
      if (pending === null) pending = requestAnimationFrame(() => { pending = null; this.zoomAt(target, (a.x + b.x) / 2, (a.y + b.y) / 2); });
    }, { passive: false });
    const end = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) { start = null; this.container.classList.remove("pinching"); }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  private async pickFile(): Promise<void> {
    const win = window as PickerWindow;
    if (win.showOpenFilePicker) {
      try {
        const [h] = await win.showOpenFilePicker({ types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }], multiple: false });
        await this.openFile(await h.getFile(), h);
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.warn("file picker failed, using input", err);
      }
    }
    $<HTMLInputElement>("fileInput").click();
  }

  private zoom(direction: 1 | -1): void {
    if (!this.pdf) return;
    let s = this.viewer.currentScale;
    s = direction > 0 ? Math.min(10, Math.ceil(s * 1.1 * 10) / 10) : Math.max(0.1, Math.floor((s / 1.1) * 10) / 10);
    this.viewer.currentScaleValue = String(s);
  }

  /** Re-applies the current zoom preset (if any) after the container width changed. */
  private refitPreset(): void {
    if (!this.pdf) return;
    const preset = this.fitted?.preset ?? this.viewer.currentScaleValue;
    if (!/^\d/.test(preset)) { this.fitted = null; this.viewer.currentScaleValue = preset; this.fitWidestPage(); }
  }

  /** For documents with mixed page sizes, "auto"/"page-width" fit the current page only (PDF.js
   *  behaviour). Shrink further so the widest page also fits, avoiding a horizontal scrollbar. */
  private fitWidestPage(): void {
    const v = this.viewer;
    if (!this.pdf || v.hasEqualPageSizes) return;
    if (!["auto", "page-width"].includes(v.currentScaleValue)) return;
    let maxW = 0;
    for (let i = 0; i < v.pagesCount; i++) maxW = Math.max(maxW, (v.getPageView(i) as { width: number }).width);
    // PDF.js pages carry a 9px transparent border per side; keep 2px slack for rounding.
    const available = this.container.clientWidth - 20;
    if (maxW > available) {
      const preset = v.currentScaleValue;
      const scale = Math.floor(v.currentScale * available / maxW * 1000) / 1000;
      this.fitted = { preset, scale };
      v.currentScaleValue = String(scale);
      $<HTMLSelectElement>("zoomSelect").value = preset;
      prefs.set("zoom", preset);
    }
  }

  private rotate(delta: number): void {
    if (!this.pdf) return;
    this.viewer.pagesRotation = (this.viewer.pagesRotation + delta + 360) % 360;
  }

  private async print(): Promise<void> {
    if (!this.pdf || this.busy) return;
    this.busy = true;
    const pc = $("printContainer");
    try {
      // Print the current in-memory document including form values and annotations.
      const bytes = await this.currentBytes();
      const task = pdfjs.getDocument({ data: bytes, cMapUrl: `${ASSETS}cmaps/`, standardFontDataUrl: `${ASSETS}standard_fonts/`, wasmUrl: `${ASSETS}wasm/`, iccUrl: `${ASSETS}iccs/` });
      const doc = await task.promise;
      this.setLoading(true, "Preparing to print…");
      await printDocument(doc, pc, (d, t) => this.setLoading(true, `Preparing to print… ${d}/${t}`));
      await task.destroy();
    } catch (err) {
      console.error(err);
      toast(`Could not print: ${(err as Error).message}`, "error");
    } finally {
      this.setLoading(false);
      this.busy = false;
      setTimeout(() => clearPrint(pc), 1000);
    }
  }

  // ---------- Editor bar ----------
  private bindEditorBar(): void {
    document.querySelectorAll<HTMLInputElement>(".editor-params [data-param]").forEach((el) => {
      if (el.matches(".swatches")) {
        el.querySelectorAll<HTMLButtonElement>(".swatch").forEach((s) => {
          s.onclick = () => { this.dispatchParam(el.dataset.param!, s.dataset.value); this.markSwatch(s.dataset.value!); };
        });
        return;
      }
      el.addEventListener("input", () => this.dispatchParam(el.dataset.param!, el.type === "checkbox" ? el.checked : el.type === "range" ? el.valueAsNumber : el.value));
    });
    $("btnAddImage").onclick = () => this.dispatchParam("CREATE", null);
    $("btnUndo").onclick = () => this.uiManager?.undo();
    $("btnRedo").onclick = () => this.uiManager?.redo();
    $("btnEditorDone").onclick = () => this.setTool("select");
  }

  // ---------- Find ----------
  private bindFindBar(): void {
    const input = $<HTMLInputElement>("findInput");
    const find = (type: string, findPrevious = false) => {
      this.eventBus.dispatch("find", {
        source: this, type, query: input.value, caseSensitive: $<HTMLInputElement>("findCase").checked,
        entireWord: $<HTMLInputElement>("findWord").checked, highlightAll: $<HTMLInputElement>("findHighlightAll").checked,
        findPrevious, matchDiacritics: false,
      });
    };
    input.addEventListener("input", debounce(() => find(""), 150));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); find("again", e.shiftKey); }
      if (e.key === "Escape") { e.preventDefault(); this.toggleFind(false); }
    });
    $("findNext").onclick = () => find("again");
    $("findPrev").onclick = () => find("again", true);
    $("findClose").onclick = () => this.toggleFind(false);
    for (const id of ["findCase", "findWord"]) $(id).onchange = () => find("");
    $("findHighlightAll").onchange = () => find("highlightallchange");
  }

  private toggleFind(open?: boolean): void {
    const bar = $("findbar");
    const show = open ?? bar.hidden;
    bar.hidden = !show;
    $("btnFind").setAttribute("aria-pressed", String(show));
    if (show) {
      const input = $<HTMLInputElement>("findInput");
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length < 100 && !sel.includes("\n")) input.value = sel;
      input.focus();
      input.select();
      if (input.value) this.eventBus.dispatch("find", { source: this, type: "", query: input.value, caseSensitive: false, entireWord: false, highlightAll: $<HTMLInputElement>("findHighlightAll").checked, findPrevious: false, matchDiacritics: false });
    } else {
      this.eventBus.dispatch("findbarclose", { source: this });
      this.container.focus();
    }
    if (this.pdf) this.viewer.update();
  }

  private showFindStatus(state: number, matches: { current: number; total: number }): void {
    const el = $("findStatus");
    el.classList.remove("notfound");
    const q = $<HTMLInputElement>("findInput").value;
    if (!q) { el.textContent = ""; return; }
    if (state === FindState.NOT_FOUND) { el.textContent = "Phrase not found"; el.classList.add("notfound"); return; }
    if (state === FindState.PENDING) { el.textContent = "Searching…"; return; }
    if (matches.total === 0) { el.textContent = ""; return; }
    el.textContent = `${matches.current} of ${matches.total} match${matches.total === 1 ? "" : "es"}${state === FindState.WRAPPED ? " (wrapped)" : ""}`;
  }

  // ---------- Sidebar ----------
  private bindSidebar(): void {
    document.querySelectorAll<HTMLButtonElement>(".sidebar-tab").forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll<HTMLButtonElement>(".sidebar-tab").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
        $("panelPages").hidden = tab.dataset.panel !== "pages";
        $("panelOutline").hidden = tab.dataset.panel !== "outline";
        if (tab.dataset.panel === "pages") this.thumbs.setCurrent(this.viewer.currentPageNumber - 1);
      };
    });
    const sel = () => this.thumbs.selection;
    $("pgSelectAll").onclick = () => this.thumbs.selectAll();
    $("pgClear").onclick = () => this.thumbs.clearSelection();
    $("pgRotateCw").onclick = () => void this.applyPageOp(`Rotated ${sel().length} page(s)`, (b) => ops.rotatePages(b, sel(), 90));
    $("pgRotateCcw").onclick = () => void this.applyPageOp(`Rotated ${sel().length} page(s)`, (b) => ops.rotatePages(b, sel(), -90));
    $("pgDelete").onclick = () => {
      const s = sel();
      if (s.length >= this.viewer.pagesCount) { toast("A document must keep at least one page.", "error"); return; }
      if (s.length > 1 && !confirmDialog(`Delete ${s.length} pages?`)) return;
      void this.applyPageOp(`Deleted ${s.length} page(s)`, (b) => ops.deletePages(b, s), Math.max(1, Math.min(s[0] + 1, this.viewer.pagesCount - s.length)));
    };
    $("pgExtract").onclick = async () => {
      if (!this.pdf) return;
      try {
        const out = await ops.extractPages(await this.currentBytes(), sel());
        downloadBytes(out, this.fileName.replace(/\.pdf$/i, "") + "-pages.pdf");
        toast(`Extracted ${sel().length} page(s) to a new PDF`, "success");
      } catch (err) { toast(`Extract failed: ${(err as Error).message}`, "error"); }
    };
    $("pgInsertBlank").onclick = () => {
      const at = this.viewer.currentPageNumber;
      void this.applyPageOp("Inserted a blank page", (b) => ops.insertBlankPage(b, at), at + 1);
    };
    $("pgMerge").onclick = () => $<HTMLInputElement>("mergeInput").click();
    $<HTMLInputElement>("mergeInput").onchange = async (e) => {
      const input = e.target as HTMLInputElement;
      const files = [...(input.files ?? [])];
      input.value = "";
      if (!files.length) return;
      const datas = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
      await this.applyPageOp(`Merged ${files.length} file(s)`, async (b) => {
        let out = b;
        for (const d of datas) out = await ops.insertPdf(out, d);
        return out;
      });
    };
  }

  private async loadOutline(pdf: PDFDocumentProxy): Promise<void> {
    const host = $("outline");
    host.innerHTML = "";
    type Item = { title: string; dest: unknown; url?: string | null; items: Item[]; bold?: boolean; italic?: boolean };
    let outline: Item[] | null = null;
    try { outline = (await pdf.getOutline()) as Item[] | null; } catch { /* ignore */ }
    if (this.pdf !== pdf) return;
    if (!outline?.length) { host.innerHTML = '<div class="outline-empty">This document has no outline.</div>'; return; }
    const build = (items: Item[]): HTMLUListElement => {
      const ul = document.createElement("ul");
      ul.className = "outline-list";
      for (const it of items) {
        const li = document.createElement("li");
        const row = document.createElement("div");
        row.className = "outline-item";
        const tg = document.createElement("button");
        tg.className = "outline-toggle" + (it.items?.length ? "" : " leaf");
        tg.textContent = "▾";
        tg.setAttribute("aria-label", "Toggle");
        tg.onclick = () => { li.classList.toggle("collapsed"); tg.textContent = li.classList.contains("collapsed") ? "▸" : "▾"; };
        const link = document.createElement("button");
        link.className = "outline-link" + (it.bold ? " bold" : "") + (it.italic ? " italic" : "");
        link.textContent = it.title || "(untitled)";
        link.onclick = () => {
          if (it.url) { window.open(it.url, "_blank", "noopener"); return; }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (it.dest) void this.linkService.goToDestination(it.dest as any);
        };
        row.append(tg, link);
        li.appendChild(row);
        if (it.items?.length) { li.appendChild(build(it.items)); if (items.length > 20) { li.classList.add("collapsed"); tg.textContent = "▸"; } }
        ul.appendChild(li);
      }
      return ul;
    };
    host.appendChild(build(outline));
  }

  // ---------- Menu ----------
  private bindMenu(): void {
    const menu = $("menu");
    const btn = $("btnMenu");
    const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); this.syncMenuRadios(); };
    document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target as Node)) close(); });
    menu.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.onclick = () => { close(); void this.menuAction(b.dataset.action!, b.dataset.value); };
    });
  }

  private syncMenuRadios(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-action="scroll"]').forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.value) === this.viewer.scrollMode)));
    document.querySelectorAll<HTMLButtonElement>('[data-action="spread"]').forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.value) === this.viewer.spreadMode)));
  }

  private async menuAction(action: string, value?: string): Promise<void> {
    switch (action) {
      case "open": return this.pickFile();
      case "open-url": { const u = await askUrl(); if (u) await this.openUrl(u); return; }
      case "sample": return this.openUrl("samples/welcome.pdf");
      case "save": return this.save();
      case "download": return this.save(true);
      case "print": return this.print();
      case "undo-pages": if (this.history.length) return this.undoPageOp(); toast("Nothing to undo", "info"); return;
      case "scroll": this.viewer.scrollMode = Number(value); prefs.set("scrollMode", Number(value)); return;
      case "spread": this.viewer.spreadMode = Number(value); prefs.set("spreadMode", Number(value)); return;
      case "rotate-cw": return this.rotate(90);
      case "rotate-ccw": return this.rotate(-90);
      case "invert": return this.setInvert(!this.container.classList.contains("invert-pages"));
      case "presentation": return this.presentation();
      case "properties": return this.showProperties();
      case "shortcuts": await showDialog("dlgShortcuts"); return;
      case "about": await showDialog("dlgAbout"); return;
    }
  }

  private async presentation(): Promise<void> {
    if (!this.pdf) return;
    const wrap = $("viewerWrap");
    const prev = { scroll: this.viewer.scrollMode, spread: this.viewer.spreadMode, scale: this.fitted?.preset ?? this.viewer.currentScaleValue };
    const onChange = () => {
      if (document.fullscreenElement === wrap) return;
      document.removeEventListener("fullscreenchange", onChange);
      this.app.classList.remove("presentation");
      this.viewer.scrollMode = prev.scroll;
      this.viewer.spreadMode = prev.spread;
      this.fitted = null;
      this.viewer.currentScaleValue = prev.scale;
      this.fitWidestPage();
    };
    try {
      await wrap.requestFullscreen();
      this.app.classList.add("presentation");
      document.addEventListener("fullscreenchange", onChange);
      this.viewer.scrollMode = ScrollMode.PAGE;
      this.viewer.spreadMode = SpreadMode.NONE;
      this.fitted = null;
      this.viewer.currentScaleValue = "page-fit";
      this.container.focus();
    } catch (err) {
      toast(`Presentation mode is not available: ${(err as Error).message}`, "error");
    }
  }

  private async showProperties(): Promise<void> {
    if (!this.pdf) return;
    const pdf = this.pdf;
    const [{ info, metadata }, dl, page] = await Promise.all([pdf.getMetadata(), pdf.getDownloadInfo(), pdf.getPage(1)]);
    const i = info as Record<string, unknown>;
    const text = (v: unknown) => { const t = v == null ? "" : String(v).trim(); return t || "—"; };
    const fmtDate = (s: unknown) => { const d = typeof s === "string" ? pdfjs.PDFDateString.toDateObject(s) : null; return d ? d.toLocaleString() : "—"; };
    const vp = page.getViewport({ scale: 1 });
    const mm = (pt: number) => (pt * 25.4) / 72;
    const rows: [string, string][] = [
      ["File name", this.fileName],
      ["File size", formatBytes(dl.length)],
      ["Title", text(metadata?.get("dc:title") || i.Title)],
      ["Author", text(i.Author)],
      ["Subject", text(i.Subject)],
      ["Keywords", text(i.Keywords)],
      ["Created", fmtDate(i.CreationDate)],
      ["Modified", fmtDate(i.ModDate)],
      ["Application", text(i.Creator)],
      ["PDF producer", text(i.Producer)],
      ["PDF version", text(i.PDFFormatVersion)],
      ["Pages", String(pdf.numPages)],
      ["Page size", `${mm(vp.width).toFixed(0)} × ${mm(vp.height).toFixed(0)} mm (${(vp.width / 72).toFixed(2)} × ${(vp.height / 72).toFixed(2)} in)`],
      ["Fast web view", i.IsLinearized ? "Yes" : "No"],
    ];
    $("propsList").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join("");
    await showDialog("dlgProps");
  }

  // ---------- Keyboard ----------
  private bindKeyboard(): void {
    document.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement;
      const typing = t.matches("input, textarea, select, [contenteditable=true]") || !!t.closest("[contenteditable=true]");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "o") { e.preventDefault(); void this.pickFile(); return; }
        if (!this.pdf) return;
        if (k === "s") { e.preventDefault(); void this.save(e.shiftKey); return; }
        if (k === "f") { e.preventDefault(); this.toggleFind(true); return; }
        if (k === "p") { e.preventDefault(); void this.print(); return; }
        if (k === "g") { e.preventDefault(); this.toggleFind(true); return; }
        if (e.key === "=" || e.key === "+") { e.preventDefault(); this.zoom(1); return; }
        if (e.key === "-") { e.preventDefault(); this.zoom(-1); return; }
        if (e.key === "0") { e.preventDefault(); this.viewer.currentScaleValue = "auto"; return; }
        if (k === "z" && !e.shiftKey && TOOL_MODE[this.tool] === EditorType.NONE && !typing && this.history.length) { e.preventDefault(); void this.undoPageOp(); return; }
        return;
      }
      if (e.key === "Escape") {
        if (!$("menu").hidden) { $("menu").hidden = true; return; }
        if (this.app.classList.contains("presentation") && document.fullscreenElement) { void document.exitFullscreen(); return; }
        if (!$("findbar").hidden && (typing || t === this.container)) { this.toggleFind(false); return; }
        if (TOOL_MODE[this.tool] !== EditorType.NONE && !this.uiManager?.hasSelection) { this.setTool("select"); return; }
        if (this.tool === "hand") { this.setTool("select"); }
        return;
      }
      if (typing) return;
      if (!this.pdf) return;
      switch (e.key) {
        case "F4": e.preventDefault(); this.setSidebar(!!$("sidebar").hidden); return;
        case "F5": e.preventDefault(); void this.presentation(); return;
        case "?": e.preventDefault(); void showDialog("dlgShortcuts"); return;
        case "r": if (!e.altKey) { e.preventDefault(); this.rotate(90); } return;
        case "R": if (!e.altKey) { e.preventDefault(); this.rotate(-90); } return;
        case "v": case "V": this.setTool("select"); return;
        case "h": case "H": this.setTool("hand"); return;
        case "Home": e.preventDefault(); this.viewer.currentPageNumber = 1; return;
        case "End": e.preventDefault(); this.viewer.currentPageNumber = this.viewer.pagesCount; return;
        case "ArrowLeft": case "ArrowRight":
          if (e.altKey) { e.preventDefault(); if (e.key === "ArrowLeft") this.pdfHistory.back(); else this.pdfHistory.forward(); return; }
          if (this.viewer.scrollMode !== ScrollMode.HORIZONTAL && !this.viewer.isHorizontalScrollbarEnabled) {
            e.preventDefault();
            if (e.key === "ArrowLeft") this.viewer.previousPage(); else this.viewer.nextPage();
          }
          return;
        case "PageDown": case "PageUp": case " ":
          if (this.viewer.scrollMode === ScrollMode.PAGE || this.app.classList.contains("presentation")) {
            e.preventDefault();
            if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) this.viewer.previousPage(); else this.viewer.nextPage();
          }
          return;
      }
    });
  }

  // ---------- Drag & drop ----------
  private bindDragDrop(): void {
    let depth = 0;
    const overlay = $("dropOverlay");
    window.addEventListener("dragenter", (e) => {
      if (![...(e.dataTransfer?.types ?? [])].includes("Files")) return;
      depth++;
      overlay.hidden = false;
    });
    window.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (depth === 0) overlay.hidden = true; });
    window.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types ?? [])].includes("Files")) e.preventDefault(); });
    window.addEventListener("drop", (e) => {
      depth = 0;
      overlay.hidden = true;
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      const pdfFile = files.find((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
      if (!pdfFile) { toast("Drop a PDF file to open it.", "error"); return; }
      void this.openFile(pdfFile);
    });
  }

  private bindHandTool(): void {
    const c = this.container;
    let start: { x: number; y: number; sl: number; st: number } | null = null;
    c.addEventListener("pointerdown", (e) => {
      if (this.tool !== "hand" || e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, sl: c.scrollLeft, st: c.scrollTop };
      c.setPointerCapture(e.pointerId);
      c.classList.add("panning");
      e.preventDefault();
    });
    c.addEventListener("pointermove", (e) => {
      if (!start) return;
      c.scrollLeft = start.sl - (e.clientX - start.x);
      c.scrollTop = start.st - (e.clientY - start.y);
    });
    const end = () => { start = null; c.classList.remove("panning"); };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
