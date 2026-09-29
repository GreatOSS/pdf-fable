// Page thumbnails sidebar with navigation, multi-selection, and drag-to-reorder.
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export interface ThumbnailCallbacks {
  onGoTo(pageIndex: number): void;
  /** Move `indexes` so that they are inserted before original index `before` (0..n). */
  onMove(indexes: number[], before: number): void;
  onSelectionChange(selection: number[]): void;
}

const THUMB_WIDTH = 150;

export class Thumbnails {
  private pdf: PDFDocumentProxy | null = null;
  private generation = 0;
  private items: HTMLElement[] = [];
  private selected = new Set<number>();
  private observer: IntersectionObserver;
  private tasks = new Map<number, RenderTask>();
  private lastClicked = -1;
  private current = 0;
  private marker: HTMLElement;
  private dragFrom: number[] | null = null;

  constructor(private container: HTMLElement, private cb: ThumbnailCallbacks) {
    this.observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const idx = Number((e.target as HTMLElement).dataset.index);
        if (e.isIntersecting) void this.render(idx);
      }
    }, { root: container, rootMargin: "300px 0px" });
    this.marker = document.createElement("div");
    this.marker.className = "thumb-marker";
    container.addEventListener("dragover", (e) => this.onDragOver(e));
    container.addEventListener("drop", (e) => this.onDrop(e));
    container.addEventListener("dragleave", (e) => {
      if (e.target === container) this.marker.remove();
    });
  }

  get selection(): number[] {
    return [...this.selected].sort((a, b) => a - b);
  }

  setDocument(pdf: PDFDocumentProxy | null): void {
    this.generation++;
    for (const t of this.tasks.values()) t.cancel();
    this.tasks.clear();
    this.observer.disconnect();
    this.container.innerHTML = "";
    this.items = [];
    this.selected.clear();
    this.lastClicked = -1;
    this.pdf = pdf;
    this.cb.onSelectionChange([]);
    if (!pdf) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < pdf.numPages; i++) {
      const el = document.createElement("div");
      el.className = "thumb";
      el.dataset.index = String(i);
      el.setAttribute("role", "listitem");
      el.tabIndex = 0;
      el.draggable = true;
      el.title = `Page ${i + 1}`;
      el.innerHTML = `<div class="thumb-frame"><canvas></canvas></div><div class="thumb-foot"><input type="checkbox" class="thumb-check" aria-label="Select page ${i + 1}" /><span class="thumb-num">${i + 1}</span></div>`;
      el.addEventListener("click", (e) => this.onClick(i, e));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.cb.onGoTo(i);
        if (e.key === " ") { e.preventDefault(); this.toggle(i); }
      });
      el.querySelector<HTMLInputElement>(".thumb-check")!.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggle(i);
      });
      el.addEventListener("dragstart", (e) => {
        this.dragFrom = this.selected.has(i) ? this.selection : [i];
        el.classList.add("dragging");
        e.dataTransfer?.setData("text/plain", String(i));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        this.marker.remove();
        this.dragFrom = null;
      });
      frag.appendChild(el);
      this.items.push(el);
    }
    this.container.appendChild(frag);
    this.items.forEach((el) => this.observer.observe(el));
    this.setCurrent(this.current);
  }

  setCurrent(pageIndex: number): void {
    this.current = pageIndex;
    this.items.forEach((el, i) => el.classList.toggle("current", i === pageIndex));
    const el = this.items[pageIndex];
    if (el && this.container.offsetParent) {
      const r = el.getBoundingClientRect();
      const c = this.container.getBoundingClientRect();
      if (r.top < c.top || r.bottom > c.bottom) el.scrollIntoView({ block: "nearest" });
    }
  }

  clearSelection(): void {
    this.selected.clear();
    this.syncSelection();
  }

  selectAll(): void {
    this.items.forEach((_, i) => this.selected.add(i));
    this.syncSelection();
  }

  /** Re-render thumbnails (e.g. after rotation changes). */
  refresh(): void {
    this.generation++;
    for (const t of this.tasks.values()) t.cancel();
    this.tasks.clear();
    this.items.forEach((el) => { delete el.dataset.rendered; });
    this.observer.disconnect();
    this.items.forEach((el) => this.observer.observe(el));
  }

  private toggle(i: number): void {
    if (this.selected.has(i)) this.selected.delete(i); else this.selected.add(i);
    this.lastClicked = i;
    this.syncSelection();
  }

  private onClick(i: number, e: MouseEvent): void {
    if (e.shiftKey && this.lastClicked >= 0) {
      const [a, b] = [Math.min(i, this.lastClicked), Math.max(i, this.lastClicked)];
      for (let k = a; k <= b; k++) this.selected.add(k);
      this.syncSelection();
      return;
    }
    if (e.ctrlKey || e.metaKey) { this.toggle(i); return; }
    this.lastClicked = i;
    this.cb.onGoTo(i);
  }

  private syncSelection(): void {
    this.items.forEach((el, i) => {
      const on = this.selected.has(i);
      el.classList.toggle("selected", on);
      el.querySelector<HTMLInputElement>(".thumb-check")!.checked = on;
    });
    this.cb.onSelectionChange(this.selection);
  }

  private insertionIndex(e: DragEvent): number {
    // Decide the index before which the dragged pages should be inserted.
    for (let i = 0; i < this.items.length; i++) {
      const r = this.items[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) return i;
    }
    return this.items.length;
  }

  private onDragOver(e: DragEvent): void {
    if (!this.dragFrom) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const before = this.insertionIndex(e);
    if (before < this.items.length) this.container.insertBefore(this.marker, this.items[before]);
    else this.container.appendChild(this.marker);
  }

  private onDrop(e: DragEvent): void {
    if (!this.dragFrom) return;
    e.preventDefault();
    const before = this.insertionIndex(e);
    const from = this.dragFrom;
    this.marker.remove();
    this.dragFrom = null;
    // No-op if dropping onto its own position.
    if (from.length === 1 && (before === from[0] || before === from[0] + 1)) return;
    this.cb.onMove(from, before);
  }

  private async render(i: number): Promise<void> {
    const el = this.items[i];
    const pdf = this.pdf;
    if (!el || !pdf || el.dataset.rendered) return;
    el.dataset.rendered = "1";
    const gen = this.generation;
    try {
      const page = await pdf.getPage(i + 1);
      if (gen !== this.generation) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = THUMB_WIDTH / base.width;
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = el.querySelector("canvas")!;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${THUMB_WIDTH}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      const ctx = canvas.getContext("2d")!;
      const task = page.render({ canvas, canvasContext: ctx, viewport });
      this.tasks.set(i, task);
      await task.promise;
      this.tasks.delete(i);
    } catch (err) {
      if ((err as Error)?.name !== "RenderingCancelledException") console.warn("thumbnail render failed", err);
      delete el.dataset.rendered;
    }
  }
}
