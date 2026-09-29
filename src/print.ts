// Printing: rasterize each page at print resolution into a hidden container, then window.print().
import type { PDFDocumentProxy } from "pdfjs-dist";

const PRINT_DPI = 150;

export async function printDocument(
  pdf: PDFDocumentProxy,
  container: HTMLElement,
  onProgress?: (done: number, total: number) => void,
  rotation = 0,
): Promise<void> {
  container.innerHTML = "";
  const total = pdf.numPages;
  const scale = PRINT_DPI / 72;
  // One CSS named page per distinct sheet size so mixed portrait/landscape documents print
  // without clipping (browsers that ignore the `page` property fall back to the first size).
  const style = document.createElement("style");
  const sizes = new Map<string, string>();
  container.appendChild(style);
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    // Honour the on-screen view rotation, like the PDF.js reference viewer does when printing.
    const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation + 360) % 360 });
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
    const key = `${wIn.toFixed(4)}x${hIn.toFixed(4)}`;
    if (!sizes.has(key)) {
      const name = `leafline-p${sizes.size}`;
      sizes.set(key, name);
      style.textContent += sizes.size === 1 ? `@page { size: ${wIn}in ${hIn}in; margin: 0; }\n` : "";
      style.textContent += `@page ${name} { size: ${wIn}in ${hIn}in; margin: 0; }\n`;
    }
    wrap.style.setProperty("page", sizes.get(key)!);
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
