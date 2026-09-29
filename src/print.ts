// Printing: rasterize each page at print resolution into a hidden container, then window.print().
import type { PDFDocumentProxy } from "pdfjs-dist";

const PRINT_DPI = 150;

export async function printDocument(
  pdf: PDFDocumentProxy,
  container: HTMLElement,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  container.innerHTML = "";
  const total = pdf.numPages;
  const scale = PRINT_DPI / 72;
  let style = container.querySelector("style");
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // The print copy is loaded from the saved bytes, so form values already have appearance
    // streams; annotationMode ENABLE (1) draws them. ENABLE_FORMS (2) would skip widgets.
    await page.render({ canvas, canvasContext: ctx, viewport, intent: "print", annotationMode: 1 }).promise;
    const wrap = document.createElement("div");
    wrap.className = "print-page";
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    const wIn = viewport.width / PRINT_DPI;
    const hIn = viewport.height / PRINT_DPI;
    wrap.style.width = `${wIn}in`;
    wrap.style.height = `${hIn}in`;
    if (i === 1) {
      style = document.createElement("style");
      style.textContent = `@page { size: ${wIn}in ${hIn}in; margin: 0; }`;
      container.appendChild(style);
    }
    wrap.appendChild(img);
    container.appendChild(wrap);
    onProgress?.(i, total);
    page.cleanup();
  }
  await new Promise((r) => setTimeout(r, 50));
  window.print();
}

export function clearPrint(container: HTMLElement): void {
  container.innerHTML = "";
}
