// Generates sample PDFs used by the welcome screen and by hands-on testing.
import { PDFDocument, StandardFonts, rgb, degrees, PageSizes } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "public", "samples");
mkdirSync(out, { recursive: true });

async function welcome() {
  const doc = await PDFDocument.create();
  doc.setTitle("Welcome to Leafline");
  doc.setAuthor("Leafline");
  doc.setSubject("A quick tour of the viewer and editor");
  doc.setKeywords(["leafline", "pdf", "sample"]);
  doc.setCreator("Leafline sample generator");
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.16, 0.5, 0.36);
  const ink = rgb(0.13, 0.13, 0.15);

  const pages = [
    ["Welcome to Leafline", [
      "Leafline is a fast, private PDF viewer and editor. Everything runs in your browser;",
      "your documents never leave your computer.",
      "",
      "Try these things on this document:",
      "  1. Press Ctrl+F (or Cmd+F) and search for the word \"annotate\".",
      "  2. Click Highlight in the toolbar, then drag across a sentence.",
      "  3. Click Text and type a note anywhere on the page.",
      "  4. Open the Pages sidebar, select a page, and rotate or delete it.",
      "  5. Press Ctrl+S to download your edited copy.",
    ]],
    ["Reading", [
      "Scroll continuously, or switch to page-by-page scrolling from the menu.",
      "Zoom with Ctrl and the mouse wheel, pinch on a trackpad, or use the zoom controls.",
      "Fit the page width or the whole page with the zoom presets.",
      "Use the outline panel to jump between chapters in long documents.",
      "Toggle the dark theme from the menu, and invert page colors for night reading.",
    ]],
    ["Annotate", [
      "Leafline uses the PDF.js annotation editor to add highlights, free text, drawings,",
      "images, and comments. Annotations are saved into the PDF itself, so they open",
      "in any other viewer.",
      "",
      "Undo and redo with Ctrl+Z and Ctrl+Shift+Z while editing.",
      "Press Escape to leave the current editing tool.",
    ]],
    ["Organize pages", [
      "The Pages sidebar is also a page organizer. Drag thumbnails to reorder pages,",
      "select pages to rotate, delete, or extract them, insert blank pages, and merge",
      "another PDF into this one.",
      "",
      "Page operations rewrite the document in memory. Nothing is written to disk until",
      "you save.",
    ]],
  ];

  pages.forEach(([title, lines], i) => {
    const page = doc.addPage(PageSizes.A4);
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: green });
    page.drawText(title, { x: 56, y: height - 58, size: 26, font: bold, color: rgb(1, 1, 1) });
    let y = height - 140;
    for (const line of lines) {
      page.drawText(line, { x: 56, y, size: 12.5, font: line.startsWith("  ") ? sans : serif, color: ink });
      y -= 20;
    }
    page.drawText(`Leafline sample · page ${i + 1} of ${pages.length}`, { x: 56, y: 40, size: 9, font: sans, color: rgb(0.5, 0.5, 0.5) });
  });

  // A landscape page with a simple table, to test mixed orientations.
  const land = doc.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
  land.drawText("Landscape page with a table", { x: 56, y: 540, size: 20, font: bold, color: green });
  const rows = [["Feature", "Shortcut"], ["Find", "Ctrl+F"], ["Zoom in / out", "Ctrl+= / Ctrl+-"], ["Fit width", "Ctrl+0"], ["Save", "Ctrl+S"], ["Open", "Ctrl+O"], ["Rotate view", "R"]];
  rows.forEach((r, i) => {
    const y = 490 - i * 28;
    if (i === 0) land.drawRectangle({ x: 56, y: y - 8, width: 500, height: 26, color: rgb(0.92, 0.95, 0.93) });
    land.drawText(r[0], { x: 66, y, size: 12, font: i === 0 ? bold : sans, color: ink });
    land.drawText(r[1], { x: 320, y, size: 12, font: i === 0 ? bold : sans, color: ink });
  });

  // A form page, to test form filling.
  const formPage = doc.addPage(PageSizes.A4);
  formPage.drawText("Form fields", { x: 56, y: 780, size: 20, font: bold, color: green });
  const form = doc.getForm();
  const name = form.createTextField("name");
  name.setText("");
  name.addToPage(formPage, { x: 56, y: 700, width: 300, height: 26 });
  formPage.drawText("Name", { x: 56, y: 732, size: 11, font: sans, color: ink });
  const agree = form.createCheckBox("agree");
  agree.addToPage(formPage, { x: 56, y: 650, width: 18, height: 18 });
  formPage.drawText("I have read the Leafline tour", { x: 82, y: 654, size: 11, font: sans, color: ink });
  const choice = form.createRadioGroup("theme");
  choice.addOptionToPage("light", formPage, { x: 56, y: 600, width: 18, height: 18 });
  choice.addOptionToPage("dark", formPage, { x: 156, y: 600, width: 18, height: 18 });
  formPage.drawText("Light", { x: 82, y: 604, size: 11, font: sans, color: ink });
  formPage.drawText("Dark", { x: 182, y: 604, size: 11, font: sans, color: ink });
  const dd = form.createDropdown("language");
  dd.addOptions(["English", "Deutsch", "Français", "Español"]);
  dd.select("English");
  dd.addToPage(formPage, { x: 56, y: 540, width: 200, height: 24 });
  formPage.drawText("Language", { x: 56, y: 572, size: 11, font: sans, color: ink });
  form.updateFieldAppearances(sans);

  // Rotated page (stored /Rotate 90) to test rotation handling.
  const rot = doc.addPage(PageSizes.A4);
  rot.setRotation(degrees(90));
  rot.drawText("This page is stored with /Rotate 90.", { x: 56, y: 780, size: 16, font: sans, color: ink });

  writeFileSync(join(out, "welcome.pdf"), await doc.save());
}

async function longDoc() {
  const doc = await PDFDocument.create();
  doc.setTitle("Long document");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 60; i++) {
    const page = doc.addPage(PageSizes.Letter);
    page.drawText(`Chapter ${Math.ceil(i / 10)} — page ${i}`, { x: 60, y: 720, size: 18, font });
    for (let l = 0; l < 30; l++) {
      page.drawText(`Line ${l + 1} of page ${i}. The quick brown fox jumps over the lazy dog.`, { x: 60, y: 680 - l * 18, size: 11, font });
    }
  }
  writeFileSync(join(out, "long.pdf"), await doc.save());
}

async function mergeMe() {
  const doc = await PDFDocument.create();
  doc.setTitle("Second document");
  const font = await doc.embedFont(StandardFonts.Courier);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage(PageSizes.A5);
    page.drawText(`Merge source, page ${i}`, { x: 40, y: 500, size: 16, font, color: rgb(0.6, 0.1, 0.1) });
  }
  writeFileSync(join(out, "second.pdf"), await doc.save());
}

// Encrypted sample (user password "leaf"), generated once with pypdf and kept as a test fixture.
import { copyFileSync } from "node:fs";
copyFileSync(join(root, "tests", "fixtures", "encrypted.pdf"), join(out, "encrypted.pdf"));

await welcome();
await longDoc();
await mergeMe();
console.log("samples written to public/samples");
