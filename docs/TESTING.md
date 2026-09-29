# Hands-on testing log

Maintainer practice: every change is exercised in a real browser (Chromium via Playwright MCP) as a user would, in addition to `npm run check`. This log records what was actually tested and what remains open.

## 2026-09-29 — v0.1.0 initial build

Tested in Chromium 1280×720 against the generated samples (`welcome.pdf`: mixed portrait/landscape, form fields, /Rotate 90 page; `long.pdf`: 60 pages).

Verified working:
- Welcome screen, "Try the sample", `?file=` loading, document title from metadata.
- Continuous rendering with lazy page and thumbnail rendering (60-page doc: 2 pages and 4 thumbnails rendered at load, ~24 MB heap).
- Find bar: Ctrl+F, incremental search, Enter/Shift+Enter, match counter ("2 of 2 matches"), highlight-all, jumps to page.
- Sidebar thumbnails: current page tracking, checkbox selection, delete selected page (page count 7→6, undo toast), drag to reorder (verified through text layer after move).
- Annotation editor: text highlight over a sentence (serialized as `/Highlight`), free text ("Hello from Leafline", serialized as `/FreeText`), unsaved indicator, Escape leaves the tool.
- Form filling: text field and checkbox values appear in saved bytes (`(Ada Lovelace)`, `/V /Yes`).
- Ctrl+wheel zoom anchored at cursor; zoom select shows custom percentage.
- beforeunload guard when there are unsaved changes.

Fixed during testing:
- `hidden` attribute was overridden by flex display rules (find bar and editor bar showed on the welcome screen).
- Editing tool was set before PDF.js created its editor manager ("AnnotationEditor is not enabled"); now applied on `pagesinit`.
- Deleting a page jumped to page 1 instead of staying near the deleted page.
- Thumbnail list had a stray horizontal scrollbar.
- Mixed page sizes: "Automatic"/"Fit width" now also fit the widest page (verified: container scrollWidth equals clientWidth on the sample with a landscape page).
- A custom zoom level (from Ctrl+wheel) was persisted and restored for the next document; only presets are persisted now.
- Undo for page changes: toast lasts 10 s and Ctrl+Z (outside annotation tools) or the menu undoes the last page change.

## 2026-09-29 — follow-up session

Verified working:
- Print pipeline: all 7 sample pages rasterized at 150 DPI with a matching `@page` size and `window.print` invoked (print dialog itself not observable headless).
- Encrypted PDF (AES-256, user password "leaf", fixture `tests/fixtures/encrypted.pdf` made with pypdf): password prompt, "Incorrect password" retry, successful open, page delete on the encrypted document (result decrypts and renders), merge refused with a clear message.
- Zoom label shows "Automatic" after the widest-page fit on load and on preset change.

Fixed during testing:
- PDF.js floating editor toolbar delete icon rendered detached: our global `button { font: inherit }` made it inherit the editor's scaled font size. Editor buttons now have a fixed font.
- Password is remembered for the open document, so page operations no longer re-prompt.
- pdf-lib merge/extract/split refuse encrypted documents instead of producing unreadable pages.

## 2026-09-29 — third session (real-world document)

Tested with a 15-page arXiv paper (LaTeX/hyperref, 2.2 MB, nested outline):
- Outline panel renders the nested hierarchy; clicking an entry jumps to the section.
- Internal citation links navigate to the reference; link borders from the document are shown.
- New: navigation history. Alt+Left/Right (and the browser back/forward buttons) return from outline and link jumps without changing the URL. Verified 10 → 5 → 1 after two jumps.
- No console errors or warnings on load.

## 2026-09-29 — fourth session (narrow screens)

Tested at 420×800 (phone-sized viewport) with the sample document:
- Before: toolbar overflowed to 798px (tools, save, find, and the menu button off-screen), sidebar took half the width, welcome button label wrapped out of its box, and the document kept a horizontal scrollbar after resizing.
- After: toolbar wraps into two rows (81px) with every control on-screen; below 480px the zoom select, print, and rotate buttons hide (still in the menu/keyboard); the sidebar overlays the document and closes after tapping a page; presets re-fit on window resize in both directions (verified container scrollWidth equals clientWidth at 420 and 1280).

User-research note: recurring wishes for browser PDF tools are consistent annotation without subscriptions, speed on large files, stability, touch/pen support, dark mode, and reflow/reader mode. Touch pinch-zoom is not yet implemented.

## 2026-09-29 — fifth session (touch pinch zoom)

- Implemented two-finger pinch zoom on the viewer via pointer events (browser pinch disabled with `touch-action: pan-x pan-y`), anchored at the finger midpoint, one re-scale per animation frame.
- Verified with synthetic touch pointer events on the arXiv paper: spreading fingers 3× took the scale from 1.25 to 3.6 and the scroll position followed the anchor; closing fingers returned to 1.3. No console errors. Not yet verified on a physical touch device.

## 2026-09-29 — sixth session (draw tool, fit regression)

- Draw tool: a freehand stroke serializes as an `/Ink` annotation; Escape returns to the select tool; no console errors.
- Regression found: with the sidebar closed, the widest-page fit did not apply on load because PDF.js sizes all pages like the first one until they are loaded. The fit now also runs on `pagesloaded`; verified no horizontal overflow at 1265px with the landscape page present.

## 2026-09-29 — seventh session (image tool)

- Image tool: clicking the toolbar button opens the file chooser directly; a JPEG is placed at the page centre with resize handles and serializes as a `/Stamp` annotation with an embedded `/Image` XObject (file grew from 10.7 KB to 78.9 KB). No console errors. All four editor tools are now verified hands-on.

## 2026-09-29 — eighth session (save flows)

- Ctrl+Shift+S downloads a copy: `welcome.pdf` arrived in the browser download folder and reopens with pypdf (7 pages, title intact).
- Ctrl+S in Chromium takes the native save-file picker; the automated browser cancels it, and the app correctly shows no error and is not left busy. The picker itself cannot be exercised headless.

## 2026-09-29 — ninth session (dark theme)

- Dark theme and "Invert page colors" checked visually on the arXiv paper: UI contrast good, inverted pages readable, red text stays red-ish thanks to the hue rotation. Menu widened so "Download a copy" no longer wraps.

## 2026-09-29 — tenth session (scroll modes, properties)

- Single-page scroll mode: ArrowRight and PageDown advance one page at a time, only the current page is visible, and the mode persists across reloads.
- Document properties dialog on the arXiv paper: file size, dates, producer, version, page count, and page size correct. Empty metadata fields showed blank; they now show "—".

## 2026-09-29 — eleventh session (page organizer actions)

- Insert blank page (7→8, sized like its neighbour), merge `second.pdf` through the file chooser (8→11), rotate selected page 1 (landscape in view and thumbnail); three undo entries; no console errors.
- Found and fixed: page operations restored the numeric fitted scale instead of the zoom preset, and toggling the sidebar did not re-fit, both leaving a horizontal scrollbar. Presets are now preserved across page operations and re-applied on sidebar toggle (verified scrollWidth equals clientWidth in both states).

## 2026-09-29 — twelfth session (extract, pan tool)

- Extract selected pages: downloads `<name>-pages.pdf`; the file reopens with pypdf (1 page, title "… (extract)", correct content).
- Pan tool: dragging 400px scrolls the document by 400px and selects no text.
- Automation caveat (not an app bug): the Playwright MCP connection drops when its own `locator.click()` triggers a browser download; trigger downloads from page script or the keyboard in automated tests.

## 2026-09-29 — thirteenth session (dialogs)

- Bug found: pressing Enter in the "Open from URL" and password dialogs activated Cancel, because Cancel was the first submit button in the form. The primary button now comes first in the DOM (visually still on the right). Verified: Enter with a bad URL shows "Could not open … Invalid PDF structure" and keeps the current document; Enter after typing the password opens the encrypted sample.

Open issues / follow-ups:
- Resizing the window resets the scroll position to the top of the current page.
- Switching documents very quickly logs a benign "Transport destroyed" console error from the previous viewer initialization.
- The delete icon of the PDF.js floating editor toolbar renders detached below its button in this build; the button itself works. Investigate CSS nesting/mask rules.
- Printing was not exercised in the headless browser.
- Not yet tested: XFA, very large scanned PDFs, touch devices, Firefox and Safari.
