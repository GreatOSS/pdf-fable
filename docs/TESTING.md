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

Open issues / follow-ups:
- Switching documents very quickly logs a benign "Transport destroyed" console error from the previous viewer initialization.
- The delete icon of the PDF.js floating editor toolbar renders detached below its button in this build; the button itself works. Investigate CSS nesting/mask rules.
- Printing was not exercised in the headless browser.
- Not yet tested: XFA, very large scanned PDFs, touch devices, Firefox and Safari.
