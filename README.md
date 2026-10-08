# Leafline

[Open the web app](https://greatoss.github.io/pdf-fable/)

**Leafline** is a fast, private, open-source PDF viewer and editor that runs entirely in your browser. Documents are processed locally and never uploaded anywhere.

> Repository: `GreatOSS/pdf-fable` (public). Product name: Leafline. See [docs/NAMING.md](docs/NAMING.md) for how the name was chosen.

## Features

- **Reading**: continuous, wrapped, horizontal, or single-page scrolling; odd/even spreads; zoom presets, Ctrl+wheel zoom at the cursor, view rotation; dark theme and inverted page colors; presentation mode.
- **Navigation**: page thumbnails, document outline, page number input, keyboard shortcuts, find with match counts, highlight-all, match case, and whole-word options.
- **Annotate**: text highlights and free highlights, free text, freehand drawing, and images, using the PDF.js annotation editor. Annotations are written into the PDF itself.
- **Forms**: fill text fields, checkboxes, radio buttons, and dropdowns; values are saved into the file.
- **Organize pages**: drag thumbnails to reorder, rotate, delete, extract pages, insert blank pages, merge other PDFs, and split a document into single-page files (one ZIP download). Every page change can be undone.
- **Save**: save in place with the File System Access API (Chromium) or download a copy; unsaved changes are flagged and guarded against accidental navigation.
- **Print**: pages are rasterized at 150 DPI with form values and annotations included.
- **Compatibility**: encrypted PDFs (password prompt), XFA forms, CJK fonts through bundled CMaps, JBIG2/JPX images through PDF.js wasm decoders.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + unit tests + production build
npm run build      # output in dist/ (static, serve from any web server)
```

Open a PDF with the toolbar button, drag and drop, `Ctrl+O`, or `?file=<url>` in the address bar. The welcome screen also offers a sample document.

## Architecture

| Layer | Implementation |
| --- | --- |
| Rendering, text layer, find, forms, annotation editing | [PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) viewer components |
| Page operations (delete, rotate, move, insert, merge, extract, split) | [pdf-lib](https://pdf-lib.js.org/) in `src/pageops.ts`, pure functions with unit tests |
| App shell, toolbar, sidebar, dialogs | Vanilla TypeScript, no framework, `src/app.ts` |
| Build | Vite 8, TypeScript 7, Vitest |

Page operations take the current in-memory bytes (including any annotation edits, which are first serialized by PDF.js), transform them with pdf-lib, and reload the viewer while preserving zoom and position.

## Project layout

```
index.html            app shell
src/app.ts            application wiring
src/pageops.ts        pdf-lib page operations (tested)
src/thumbnails.ts     thumbnail sidebar, selection, drag reorder
src/print.ts          print pipeline
src/ui.ts             toasts, dialogs, download helpers
src/styles.css        theme and layout
scripts/              asset copy and sample generation
tests/                vitest unit tests
docs/                 naming record, testing log
```

## Contributing

Issues and pull requests are welcome. Please describe the document type and steps to reproduce for rendering problems; attaching a minimal PDF helps enormously.

## License

MIT. Leafline bundles PDF.js (Apache-2.0) and pdf-lib (MIT).

## GitHub Pages

Pushes to `main` run tests and build the app for `/pdf-fable/`, then deploy `dist/` with GitHub Actions. The workflow can also be started manually. PDF documents continue to be processed locally in the browser.
