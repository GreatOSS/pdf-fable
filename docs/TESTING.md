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

## 2026-09-29 — fourteenth session (help, presentation mode)

- "?" opens the shortcuts dialog; layout readable.
- F5 presentation mode: fullscreen, single page, page-fit, black background; ArrowRight pages forward. Fixed: page margins/scrollbar showed in presentation; Escape now also exits in-app; presentation's page-fit no longer overwrites the persisted zoom preset, and the previous preset (with widest-page fit) is restored on exit.

## 2026-09-29 — fifteenth session (spreads)

- Odd spreads on the arXiv paper: pages paired 1–2, 3–4, 5–6; Automatic zoom fits both pages side by side without horizontal overflow; preference persists.

## 2026-09-29 — sixteenth session (resize position)

- Resizing the window keeps the reading position: with page 2 scrolled 17% into view, shrinking to 1000px and restoring to 1280px kept the same fraction (0.170 → 0.177 → 0.170). The earlier "resize resets scroll position" note was wrong and is retired.

## 2026-09-29 — seventeenth session (image-only document)

- Generated a 40-page image-only PDF (`public/samples/scanned.pdf`, JPEG pages from screenshots, letterboxed on Letter pages). Load to first render ~3 s including page load; 2 pages rendered initially, 19 MB heap. Jumping to the end and scrolling back 20 frames took 314 ms (~16 ms/frame); 10 page canvases and 13 thumbnails cached, 18 MB heap; no console warnings. Visible pages showed white because the visible region was letterbox padding; pixel sampling confirmed the canvases contain the images.

## 2026-09-29 — eighteenth session (find options)

- Find "Attention" in the arXiv paper: 97 matches plain, 19 with Match case, 18 with Whole words added; Escape closes the bar, clears highlights, and returns focus to the document.

## 2026-09-29 — nineteenth session (annotation undo/redo)

- Text note → Delete key removes the selected editor → toolbar Undo restores it with its text → Redo removes it again; the toolbar buttons enable/disable correctly and the saved bytes reflect the final state (no FreeText left).

## 2026-09-29 — twentieth session (drag and drop)

- Dropping `second.pdf` onto the empty app (synthesized DragEvent with a File): the "Drop to open" overlay shows on drag-enter and hides after the drop; the 3-page document opens with its title.

## 2026-09-29 — twenty-first session (unsaved-changes guard)

- With an unsaved text note, opening another document prompts "You have unsaved changes. Discard them and open another document?". Declining keeps the note and the dirty state; accepting reloads the sample fresh (no editors, not dirty).

## 2026-09-29 — twenty-second session (page input)

- Page number input: "5" jumps to page 5 and returns focus to the document; "99" clamps to the last page (7); "0" clamps to page 1.

## 2026-09-29 — twenty-third session (view rotation)

- R / Shift+R rotate the view 90° each way without marking the document dirty. Fixed: the zoom preset was not re-fitted after rotation, leaving a 1px overflow and a horizontal scrollbar; presets now re-fit on rotation (verified no overflow at 90° and back at 0°).

## 2026-09-29 — twenty-fourth session (production build)

- `npm run build` + `vite preview` on port 4173: sample renders, worker and PDF.js assets (cmaps, fonts, wasm, images) load from the relative base with no failed requests, editor toolbar icons correct, free highlight created, console clean.

## 2026-09-29 — twenty-fifth session (outline empty state, About dialog)

Chromium via Playwright, dev server, `welcome.pdf` (no bookmarks).

- Outline tab on a document without bookmarks shows "This document has no outline." centred in the panel; panel visible, no console errors.
- Menu → About opens the dialog with name, version v0.1.0 (from package metadata), PDF.js/pdf-lib links and MIT notice; Close is the primary button; Escape closes it.
- No defects found; no code changes.

## 2026-09-29 — twenty-sixth session (text selection, copy, hand tool)

Chromium via Playwright, dev server, `arxiv.pdf` page 1.

- Mouse drag from the title to the first abstract line selects text in reading order: 501 characters, 26 lines, authors and e-mails included, no stray spans from the rotated arXiv stamp.
- Ctrl+C runs without error (clipboard contents cannot be read back in the automated browser; selection string verified instead).
- Clicking the page margin clears the selection. Hand tool (`h`) drag pans the viewer and selects nothing; `v` returns to select.
- No defects found; no code changes.

## 2026-09-29 — twenty-seventh session (find: no match, wrap-around)

Chromium via Playwright, dev server, `welcome.pdf`.

- Searching a nonsense string shows "Phrase not found" in red beside the options; the input keeps focus and the clear button appears.
- "Reading" gives "1 of 2 matches" and jumps to page 2; Enter → "2 of 2 matches"; Enter again wraps to "1 of 2 matches (wrapped)"; Shift+Enter wraps backwards to "2 of 2 matches (wrapped)".
- No defects found; no code changes.

## 2026-09-29 — twenty-eighth session (open from URL, success path)

Chromium via Playwright, dev server, welcome screen.

- Menu → Open from URL, paste `http://localhost:5173/samples/second.pdf`, Enter: dialog closes, document loads (title "Second document", 3 pages, page 1), no error toast, file name derived from the URL as `second.pdf` for later downloads.
- No defects found; no code changes.

## 2026-09-29 — twenty-ninth session (Home/End, Space in page mode)

Chromium via Playwright, dev server, `long.pdf` (60 pages).

- Vertical scroll mode: End jumps to page 60, Home returns to page 1.
- Single-page scroll mode: Space advances one page per press (1 → 3 after two presses), Shift+Space goes back one page (→ 2).
- No defects found; no code changes.

## 2026-09-29 — thirtieth session (opening a non-PDF file)

Chromium via Playwright, dev server, `welcome.pdf` open; a text file injected into the hidden file input (the native picker cannot be driven headlessly).

- Toast "Could not open "notes.txt": Invalid PDF structure." appears; the current document stays loaded (7 pages, title unchanged), loading overlay hidden, app not busy.
- Console shows only PDF.js's own InvalidPDFException and an "Indexing all PDF objects" warning, both expected.
- No defects found; no code changes.

## 2026-09-29 — thirty-first session (spreads, wrapped scrolling)

Chromium via Playwright, dev server, `arxiv.pdf` (15 pages), 1280×720.

- Odd spreads: 8 spreads, pages 1+2 side by side, Automatic zoom re-fits to 0.60 so both pages fit with no horizontal overflow.
- Even spreads: page 1 sits alone in the first spread, no overflow.
- Menu → No spreads, then Menu → Wrapped: at Automatic zoom the layout is one page per row (Automatic fits page width, as in PDF.js); at 50% it forms a two-column grid with no overflow. Menu radios show "Wrapped" and "No spreads" checked. Preferences persist under `leafline.scrollMode` / `leafline.spreadMode`.
- No defects found; no code changes.

## 2026-09-29 — thirty-second session (ink on a /Rotate 90 page; 1px overflow fix)

Chromium via Playwright, dev server, `welcome.pdf` page 7 (stored with /Rotate 90), sidebar open.

- Ink stroke drawn on the rotated page, Escape to commit: the saved bytes contain an /Ink annotation with /Rotate 90, Rect [42 116 133 290] inside the 595×842 MediaBox, i.e. at the unrotated bottom-left where the displayed top-left maps. Renders in place after save.
- Bug found and fixed: with the sidebar open the landscape pages left a 1 px horizontal scrollbar. The widest-page fit allowed 16 px but PDF.js pages carry a 9 px transparent border per side. Allowance is now 20 px and the computed scale is floored to 3 decimals. Verified overflow 0 with the sidebar open and closed.
- Note (PDF.js behaviour, not changed): the Automatic preset is computed from the current page, so re-fitting while a landscape page is current yields a smaller scale than when a portrait page is current.

## 2026-09-29 — thirty-third session (fit regression check at 420px)

Chromium via Playwright, dev server, `welcome.pdf` at 420×800 after the 20 px fit allowance change.

- CI green on the fit fix. At 420 px the widest-page fit gives scale 0.342, landscape pages 383 px wide in a 405 px container, overflow 0; portrait pages 271 px. Landscape table and form pages render correctly.
- Two-row toolbar: rightmost buttons (save on row 2, menu on row 1) end at 414 px, aligned and unclipped; no document-level horizontal scroll.
- No defects found; no code changes.

## 2026-09-29 — thirty-fourth session (radio buttons and dropdown)

Chromium via Playwright, dev server, `welcome.pdf` page 6.

- Clicking the "Dark" radio checks it and unchecks "Light"; choosing "Deutsch" in the language dropdown marks the document dirty.
- Saved bytes: incremental update sets the `theme` field /V /1 with the widget /AS /1, and the `language` choice field /V (Deutsch) with a regenerated appearance stream drawing "Deutsch". Text field and checkbox were verified in the first session.
- No defects found; no code changes.

## 2026-09-29 — thirty-fifth session (undo toast click; dirty flag after undo)

Chromium via Playwright, dev server, `welcome.pdf`, sidebar open.

- Select page 1 via its checkbox → "1 selected", selection bar shown; Delete → 6 pages, page "Reading" first, toast "Deleted 1 page(s). Click here or press Ctrl+Z to undo." Clicking the toast restores 7 pages, "Page change undone" toast, selection cleared.
- Found and fixed: after undoing the only change the document stayed marked dirty (unsaved-changes prompt, though bytes were back to the original). Each undo snapshot now remembers the pre-operation dirty flag and restores it. Verified: clean doc → delete → undo → not dirty; dirty doc → delete → Ctrl+Z → still dirty.

## 2026-09-29 — thirty-sixth session (two page changes, double undo, toast stacking)

Chromium via Playwright, dev server, `welcome.pdf`, sidebar open.

- CI green on the dirty-flag fix. Rotate page 1 right, then insert a blank page: 8 pages, page 1 /Rotate 90, blank page 2, no overflow, two history entries. Ctrl+Z twice restores 7 pages, rotation 0, history empty, document not dirty.
- Found and fixed: both undo toasts stayed on screen, but clicking the older "Rotated…" toast would have undone the blank-page insert (undo always reverts the latest change). Toasts now expose `dismiss()`; a new page change or an undo dismisses the previous undo toast. Verified only "Inserted a blank page…" remains after the second change and it disappears on undo.

## 2026-09-29 — thirty-seventh session (zoom shortcuts and buttons)

Chromium via Playwright, dev server, `arxiv.pdf`, Automatic zoom (1.21).

- CI green on the undo-toast fix. Ctrl+= steps to 140% (next 10% step up), Ctrl+- twice to 120% then 100%, select shows the custom percentage; Ctrl+0 returns to Automatic (1.21) and the select and stored preference read "auto".
- Toolbar + / − buttons step 140% and back to 120%; custom levels are not persisted (preference stays "auto").
- No defects found; no code changes.

## 2026-09-29 — thirty-eighth session (annotation followed by a page operation)

Chromium via Playwright, dev server, `welcome.pdf`.

- Text note placed on page 1, then page 2 deleted from the sidebar: 6 pages, the note is baked into the reloaded document as a regular `/FreeText` annotation (rendered in the annotation layer and thumbnail), exactly one FreeText object in the bytes, no duplication although the text tool was still active.
- Ctrl+Z restores 7 pages with the note intact; the document stays dirty because the note predates the page change (correct after the dirty-flag fix).
- Console: one benign PDF.js warning, font "Helv" not available, fallback used for the note's appearance stream.
- No defects found; no code changes.

## 2026-09-29 — thirty-ninth session (annotation save on an encrypted document)

Chromium via Playwright, dev server, `encrypted.pdf` (AES-256, user password "leaf").

- Password dialog focused on load; "leaf" + Enter opens the 7-page document. Ink stroke on page 1, Escape, then the saved bytes were posted to a local receiver and checked with pypdf: file still encrypted, `decrypt("leaf")` succeeds, page 1 carries one `/Ink` annotation with Rect [75 383 333 474] and a decryptable appearance stream (`78.39 470.42 m 329.92 386.57 l S`); title intact; the file is unreadable without the password. PDF.js's incremental save keeps the original `/Encrypt` dictionary and encrypts new streams.
- Tooling: triggering a real browser download (even via keyboard) drops the automated browser page and no file lands on disk, so saved bytes are now verified by posting them to a local receiver instead.
- No defects found; no code changes.

## 2026-09-29 — fortieth session (multi-page drag reorder)

Chromium via Playwright, dev server, `welcome.pdf`, sidebar open, viewport enlarged so all thumbnails are visible.

- Pages 1 and 3 selected via checkboxes, thumbnail 1 dragged onto the upper half of thumbnail 6: new order Reading, Organize, Landscape, Welcome, Annotate, Form fields, Rotated (i.e. the two pages inserted before the old page 6), toast "Moved 2 pages…", view jumps to the first moved page (4), selection cleared; Ctrl+Z restores the original order.
- Tooling note: Playwright's `dragTo` scrolled the thumbnail list mid-drag and moved the wrong page; explicit mouse down/move/up with all thumbnails visible drives the HTML5 drag correctly.
- No defects found; no code changes.

## 2026-09-29 — forty-first session (delete-all guard)

Chromium via Playwright, dev server, `second.pdf` (3 pages).

- Select all → Delete: error toast "A document must keep at least one page."; document unchanged (3 pages), not dirty, no undo entry, selection still "3 selected", loading overlay hidden, app not busy.
- No defects found; no code changes.

## 2026-09-29 — forty-second session (merging a password-protected file)

Chromium via Playwright, dev server, `welcome.pdf` open; `encrypted.pdf` injected into the merge file input.

- Toast "Page change failed: The file to merge is password-protected; remove its password first."; document unchanged (7 pages), not dirty, no undo entry, no password prompt, loading overlay hidden. Console shows only the app's own logged error for the failed operation.
- No defects found; no code changes.

## 2026-09-29 — forty-third session (dark theme persistence; flash of light theme)

Chromium via Playwright, dev server, `welcome.pdf`.

- Theme button switches to dark (background rgb(27,29,28), title "Switch to light theme"), preference stored as `leafline.theme`, and the dark theme is restored on reload.
- Found and fixed: the theme was applied only by the deferred app module, so dark-theme users saw a light flash on every load. A tiny inline script in the head now sets `data-theme` from the stored preference (or the system preference) before first paint. Verified with an init-script observer that the attribute is already "dark" when the body element appears, before the app module runs.

## 2026-09-29 — forty-fourth session (theme script in the production build)

Chromium via Playwright, `vite preview` on port 4173.

- CI green on the theme fix. The built `index.html` keeps the inline theme script in the head ahead of the hoisted module script and the body. With the dark preference stored, `data-theme` is already "dark" at DOMContentLoaded and the sample loads normally (7 pages, title set).
- No defects found; no code changes.

## 2026-09-29 — forty-fifth session (typing guard for single-key shortcuts)

Chromium via Playwright, dev server, `welcome.pdf`.

- With a text note being edited, pressing r, v, h, ? and End inserts "rvh?" into the note and moves the caret; the view is not rotated, the tool stays "freetext", the shortcuts dialog does not open and the page does not change. Earlier sessions showed the same for the find field ("Reading" typed without side effects).
- A PDF.js "Cannot read properties of null (reading 'addButton')" error appeared only when the note was deleted programmatically mid-edit from the console; the real user path (type, switch to the select tool, reselect the note) logs no errors.
- No defects found; no code changes.

## 2026-09-29 — forty-sixth session (ink colour, thickness and opacity parameters)

Chromium via Playwright, dev server, `welcome.pdf`.

- Editor bar: colour #ff0000, thickness 8, opacity 50, then an ink stroke. Saved annotation carries `/C [1 0 0]` and `/BS << /W 8 >>`.
- Found and fixed: opacity was written as `/CA 50` (and `/CA 100` by default), outside the PDF range 0–1, and the stroke rendered fully opaque. The slider value is now divided by 100 before dispatch, matching PDF.js's own toolbar; the saved annotation now has `/CA 0.5` and the stroke renders translucent.
- The thin frame that extends slightly past the page edge right after Escape is the ink editor's transient selection box; it disappears on the next click.

## 2026-09-29 — forty-seventh session (text note colour and size parameters)

Chromium via Playwright, dev server, `welcome.pdf`.

- CI green on the ink-opacity fix. Text tool with colour #0000ff and size 24: the editor renders blue at 28.6 px (24 pt × 1.19 zoom) and the saved `/FreeText` has `/DA (/Helv 24 Tf 0 0 1 rg)` with the typed text present. Size slider range 6–48 needs no scaling, unlike ink opacity.
- No defects found; no code changes.

## 2026-09-29 — forty-eighth session (highlight colour swatches and free-highlight thickness)

Chromium via Playwright, dev server, `welcome.pdf`.

- Highlight tool, blue swatch (#80EBFF), thickness 20: dragging across a text line saves a `/Highlight` with `/C [0.502 0.922 1]`; dragging over empty space saves a free highlight as `/Ink` with the same colour and `/BS << /W 20 >>`. Two entries in annotation storage, no console errors.
- All editor parameters (highlight colour/thickness, text colour/size, ink colour/thickness/opacity) are now verified against saved bytes.
- No defects found; no code changes.

## 2026-09-29 — forty-ninth session (deleting a pre-existing annotation)

Chromium via Playwright, dev server, `welcome.pdf`.

- A text highlight was saved, the saved bytes reloaded as a new document (highlight rendered by the annotation layer), the highlight tool selected, the existing highlight clicked and removed with Delete. The next save writes page 1 with an empty `/Annots` array; pypdf confirms no highlight remains on any page (7 pages intact).
- No defects found; no code changes.

## 2026-09-29 — fiftieth session (dragging an annotation)

Chromium via Playwright, dev server, `welcome.pdf` at zoom 1.19.

- A text note dragged 149 px right and 80 px up: the saved `/Rect` moves from [162 441 219 464] to [288 508 345 531], i.e. +126 pt x and +67 pt y, matching the screen delta ÷ 1.19 with the PDF y-axis inverted. No console errors (one benign "Helv" font warning).
- No defects found; no code changes.

## 2026-09-29 — fifty-first session (text highlight on a /Rotate 90 page)

Chromium via Playwright, dev server, `welcome.pdf` page 7.

- The page's text renders vertically at the right edge of the landscape view; dragging along it with the highlight tool creates a highlight editor on page 7. Saved `/Highlight` has `/Rotate 90`, Rect [55 775 303 795] and quad points x 56–302, y 776–794: a horizontal line near the top of the unrotated 595×842 page, exactly where the rotated view's right-hand vertical line lives.
- No defects found; no code changes.

## 2026-09-29 — fifty-second session (ink drawn while the view is rotated)

Chromium via Playwright, dev server, `welcome.pdf`, view rotated 90° with `r` (no overflow, landscape layout 943×666).

- Stroke drawn at 20–41 % across / 30–39 % down the rotated view: saved `/Ink` Rect [167 157 224 331] is inside the unrotated 595×842 page, at 28–38 % across and 61–81 % down, which is the correct 90° mapping; the annotation records `/Rotate 90`. After `R` rotates the view back the editor stays on page 1 at 29 % / 62 %.
- No defects found; no code changes.

## 2026-09-29 — fifty-third session (annotations in print output)

Chromium via Playwright, dev server, `second.pdf` (A5); `window.print` stubbed to sample the rasterised pages.

- Red 20 px ink stroke across the middle of page 1, then Ctrl+P: the print container holds 3 page images at 150 DPI (874×1240) with `@page { size: 5.83in 8.27in }`; the row through the stroke contains 362 red pixels (≈40 % of the width, matching the drawn span) and a control row none. Unsaved annotations therefore print.
- Console: PDF.js "AnnotationBorderStyle.setWidth - ignoring width: 20" while loading the print copy, because the border width exceeds half the annotation's own rectangle; the stroke is drawn from its appearance stream, so this is benign.
- No defects found; no code changes.

## 2026-09-29 — fifty-fourth session (form values in print output)

Chromium via Playwright, dev server, `welcome.pdf` page 6; `window.print` stubbed to sample the rasterised page.

- Found and fixed: printed pages omitted form fields entirely (0 dark pixels in the Name field box before and after typing). The print renderer used annotation mode ENABLE_FORMS, which skips widgets on the assumption that an HTML form layer draws them. The print copy is loaded from the saved bytes, which already carry values and appearance streams, so it now renders with annotation mode ENABLE. After the fix the field border prints (1413 dark pixels) and typing "Ada Lovelace" adds the text (2783).

## 2026-09-29 — fifty-fifth session (print regression: checkbox and ink together)

Chromium via Playwright, dev server, `welcome.pdf` page 6, after the print render-mode change.

- CI green on the print fix. Checked checkbox prints its check mark (105 dark pixels inside the box); a red ink stroke on the same page prints along the row derived from its saved Rect (506 red pixels of 1240). Form widgets and annotations both render under annotation mode ENABLE.
- No defects found; no code changes.

## 2026-09-29 — fifty-sixth session (printing mixed page sizes)

Chromium via Playwright, dev server, `welcome.pdf` (A4 portrait with a landscape page 5 and a /Rotate 90 page 7).

- Found and fixed: the print container declared a single portrait `@page` size taken from page 1, so the two landscape pages (11.7 in wide) would have been clipped on 8.3 in sheets. The print pipeline now emits one CSS named page per distinct sheet size and assigns each page wrapper its `page` name (the unnamed rule keeps the first size as a fallback for browsers without named-page support).
- Verified with Chromium's own print-to-PDF of the populated print container: 7 sheets, sheets 5 and 7 are 11.69×8.26 in landscape, the others 8.26×11.69 in portrait.

## 2026-09-29 — fifty-seventh session (print regression on a uniform Letter document)

Chromium via Playwright, dev server, `arxiv.pdf` (15 pages, US Letter), real print-to-PDF of the populated print container.

- CI green on the mixed-size print fix. Print preparation took 1.7 s at 150 DPI; one `@page` size (8.5×11 in) plus one named page; print-to-PDF yields 15 Letter sheets with one page image each (4.6 MB).
- No defects found; no code changes.

## 2026-09-29 — fifty-eighth session (printing a rotated view)

Chromium via Playwright, dev server, `second.pdf` (A5 portrait), view rotated 90° with `r`, real print-to-PDF of the print container.

- Found and changed: printing ignored the on-screen view rotation, unlike the PDF.js reference viewer. The print pipeline now adds the view rotation to each page's viewport. With the view rotated, the three pages rasterise at 1240×874 and print on 8.27×5.83 in landscape sheets; unrotated printing is unchanged (previous sessions).

## 2026-09-29 — fifty-ninth session (print regression: /Rotate 90 page with view rotation 0)

Chromium via Playwright, dev server, `welcome.pdf`, real print-to-PDF.

- CI green on the print-rotation change. With the view unrotated, page 7 (stored /Rotate 90) still rasterises landscape (1753×1240) and its text sits in the right-hand strip of the sheet, matching the on-screen orientation; page 5 landscape, others portrait. The page's own rotation and the view rotation combine correctly.
- No defects found; no code changes.

## 2026-09-29 — sixtieth session (print progress and busy guard)

Chromium via Playwright, dev server, `long.pdf` (60 pages).

- Ctrl+P shows the loading overlay with live progress ("Preparing to print… 8/60", later 21/60) and marks the app busy; a second Ctrl+P during preparation is ignored (`window.print` called exactly once). Afterwards the overlay hides, the print container is cleared and the app is no longer busy.
- No defects found; no code changes.

## 2026-09-29 — sixty-first session (page-op speed on a 60-page document)

Chromium via Playwright, dev server, `long.pdf`.

- Delete page 30 via the sidebar: 326 ms from click to reloaded 59-page view; Ctrl+Z restores 60 pages in 243 ms, staying on page 30, history empty and document clean. JS heap 17 → 19 → 18 MB, so snapshots are released.
- No defects found; no code changes.

## 2026-09-29 — sixty-second session (undo history cap, rapid undo)

Chromium via Playwright, dev server, `second.pdf`.

- Eleven consecutive page rotations (avg 252 ms each) keep exactly 10 undo entries; page 1 ends at 270°, ten undos bring it to 90° (the eleventh-oldest change is beyond the cap, as designed) and the document stays dirty.
- Found and fixed: a held Ctrl+Z started a second reload while the previous one was in flight (undo did not hold the busy flag), and the superseded load surfaced spurious "Could not open … Loading aborted" error toasts. Undo now holds the busy flag, superseded loads no longer report an error, repeated "Page change undone" toasts replace each other instead of stacking, and thumbnails no longer warn about a destroyed transport when the document is swapped mid-render. Re-run: five rotations, eight rapid Ctrl+Z presses → original state, one toast, no console errors or warnings.

## 2026-09-29 — sixty-third session (load-error regression after the rapid-undo fix)

Chromium via Playwright, dev server, `welcome.pdf` open.

- CI green on the rapid-undo fixes. Opening a non-PDF file still shows "Could not open "bogus.txt": Invalid PDF structure." and keeps the current document. Opening the encrypted sample then pressing Escape at the password prompt closes the dialog silently: no error toast, previous document intact, loading overlay hidden, app not busy. Console shows only PDF.js's own InvalidPDFException for the bogus file.
- No defects found; no code changes.

## 2026-09-29 — sixty-fourth session (rapid document switching)

Chromium via Playwright, dev server, welcome screen.

- Three loads fired back to back (long, arXiv, welcome) without waiting: the last one wins (title "Welcome to Leafline", 7 pages, 7 thumbnails), the loading overlay hides, no toasts, and no console errors or warnings; the superseded loads are silent since the rapid-undo fix.
- No defects found; no code changes.

## 2026-09-29 — sixty-fifth session (menu keyboard navigation)

Chromium via Playwright, dev server, `welcome.pdf`.

- Found and fixed: opening the menu with the keyboard left focus on the button and arrow keys did nothing, forcing keyboard users to Tab through every item. The menu now follows the standard pattern: keyboard opening focuses the first item ("Open PDF…"), ArrowDown/ArrowUp cycle with wrap-around, Home/End jump to the ends, Enter activates (reached "Keyboard shortcuts" and opened the dialog), Escape closes and returns focus to the menu button, Tab closes. Mouse opening does not move focus.

## 2026-09-29 — sixty-sixth session (sidebar tabs and tool group keyboard patterns)

Chromium via Playwright, dev server, `welcome.pdf`.

- CI green on the menu fix. Found and fixed: the sidebar tabs (role tab) ignored arrow keys, and the tool group was labelled a radio group while its buttons are `aria-pressed` toggles. Left/Right now move between and activate the sidebar tabs (with wrap-around, without leaking to page navigation) and step through the tools (select → hand → highlight…, wrapping to the image tool without opening its file chooser); the group role is now "group".
- Verified: ArrowRight from Pages shows the Outline panel and focuses its tab; from the select tool ArrowRight twice selects the highlight tool with the right `aria-pressed` state; the current page stays 1 throughout.

## 2026-09-29 — sixty-seventh session (dialog focus return)

Chromium via Playwright, dev server, `arxiv.pdf`.

- CI green on the tabs/tools keyboard fix. Dialogs are modal and open with focus inside (Properties focuses Close). Found and fixed: closing a dialog left focus on the document body. Dialogs now return focus to the element that opened them, and activating a menu item from the keyboard first returns focus to the menu button so the dialog has a live opener. Verified: Properties via keyboard menu → Escape → focus on the menu button; "?" from the viewer → Escape → focus back on the viewer; About via mouse → Escape → focus on the menu button.

## 2026-09-29 — sixty-eighth session (thumbnail keyboard access and semantics)

Chromium via Playwright, dev server, `welcome.pdf`.

- CI green on the focus-return fix. Thumbnails are focusable list items: Space toggles selection ("1 selected", checkbox checked, focus retained), Enter jumps to the page (page 3) and moves focus to the viewer for immediate scrolling. Checkboxes are separately tabbable with "Select page N" labels.
- Added: each thumbnail now has an accessible name ("Page N") and the current page carries `aria-current="page"` (verified: only thumbnail 3 after jumping there).

## 2026-09-29 — sixty-ninth session (accessible-name audit, outline toggles)

Chromium via Playwright, dev server, `arxiv.pdf`.

- CI green on the thumbnail semantics change. Audit: every visible button, input and select (plus the menu items) has an accessible name.
- Found and fixed: outline expand/collapse toggles were labelled just "Toggle" with no state, and the 18 hidden leaf toggles were still in the tab order. Toggles now read "Collapse Model Architecture" / "Expand Model Architecture" with `aria-expanded`, and leaf toggles are `tabindex=-1` and aria-hidden (outline tab stops 44 → 26). Enter on a toggle collapses/expands; Tab then Enter on the entry jumps to page 3.

## 2026-09-29 — seventieth session (live regions and focus rings)

Chromium via Playwright, dev server, `welcome.pdf`.

- CI green on the outline toggle fix. Toasts and the find status are polite live regions; the page number input is labelled; keyboard focus shows a visible ring (`:focus-visible`) on toolbar controls and the text layer.
- Added: the loading overlay is now `role="status" aria-live="polite"`, so "Loading…", load percentages and "Preparing to print… n/t" are announced.

## 2026-09-29 — seventy-first session (colour contrast)

Chromium via Playwright, dev server, `welcome.pdf`, computed WCAG contrast ratios from live styles.

- Light theme: toolbar icons/brand/select 16.8:1, muted hint text, inactive tab and thumbnail numbers 4.9:1, active tab 4.8:1, find "Phrase not found" red 5.0:1. Dark theme: icons 12.7:1, muted text 5.7:1, active tab 6.8:1, not-found red 6.0:1. All pairs meet WCAG AA (≥ 4.5:1) for normal text.
- No defects found; no code changes.

### Seventy-second session (forced colours / Windows High Contrast)

Emulated `forced-colors: active` on welcome.pdf with the sidebar open and page 2 selected.

- **Bug:** the active tool button, the selected sidebar tab, the selected thumbnail and the current-page thumbnail all lost their tinted backgrounds, so none of these states were distinguishable. Fixed with a `@media (forced-colors: active)` block in `src/styles.css`: active tools and swatches get a `Highlight` outline, the selected tab and checked menu items are underlined, selected thumbnails get a 3px `Highlight` outline, the current thumbnail a 4px border, and toasts a `CanvasText` border.
- Verified after the fix: computed styles differ for active vs inactive tool (2px outline vs none), selected vs current thumbnail (outline vs 4px border), and the active tab is underlined. Screenshot confirms the toolbar shows the select tool as active. Normal mode unaffected.

### Seventy-third session (reduced motion and 320px reflow)

Emulated `prefers-reduced-motion: reduce`, then a 640px viewport at 200% zoom (320 CSS px, the WCAG reflow width).

- **Reflow:** the toolbar wraps onto four rows, nothing overflows horizontally (document width equals window width) and every control stays reachable. No change needed.
- **Bug (minor):** the loading spinner kept its fast 0.8s continuous spin and toasts/thumbnail checkboxes kept their transitions under reduced motion. Added a `prefers-reduced-motion` block: spinner slows to a stepped 2.4s cycle, toast and checkbox transitions are disabled. Verified computed styles under both media states; normal mode unchanged.

### Seventy-fourth session (real-world workflow on the arXiv paper)

Opened the 15-page two-column "Attention Is All You Need" paper and worked through it as a reader.

- **Find:** "multi-head attention" reports 8 matches, Enter walks them across pages 1 → 3, and a match that wraps across a line break is found. Escape closes the bar cleanly.
- **Text note:** added "Reviewed 2026-09-29" on page 3 with the Add text tool, saved via `currentBytes()`; pypdf shows a FreeText annotation with the right contents and a valid /DA. No console errors.
- **Outline:** all 22 entries navigate to the right page; collapse/expand works. Clicking "Attention" (which starts near the foot of page 3) leaves the page field on 4 because page 4 dominates the viewport, the same as Firefox's viewer; not changed.
- **Gap found and fixed:** the outline never indicated where the reader currently is. Added current-section tracking: each entry's page is resolved after the outline is built, the last entry starting on or before the current page gets `.current` / `aria-current`, and an entry chosen by click stays current while the page still matches (several entries can share a page). Verified while scrolling, jumping between pages 2–15, clicking "Optimizer", and on a document with no outline (nothing marked, no errors). Forced-colours outline style included.

### Seventy-fifth session (scanned document workflow)

Opened the 40-page image-only scan and worked it like a reader tidying a scan.

- **Performance:** first page painted in about half a second, 30 wheel scrolls through the document stayed smooth, ~10 page canvases kept alive, all 40 thumbnails rendered, JS heap around 18 MB. No console errors.
- **Free highlight** drawn over an image page works (PDF.js free highlight), as expected on a page without text.
- **Bug fixed:** after rotating selected pages the selection was lost, because the document reload rebuilt the thumbnails. A reader could not rotate again or delete the same pages without reselecting. Rotation now restores the selection; verified by selecting pages 2–3, rotating twice, then deleting them straight away (38 pages saved), and by rotating pages 5–6 counter-clockwise (pypdf shows /Rotate 270 on both, selection still "2 selected" afterwards). Ctrl+Z after the delete restored the pages with their rotation intact.
- **UX fixed:** searching a scan said "Phrase not found", implying the word was simply absent. The find bar now checks the first few pages for text and says "No searchable text in this document (scanned pages?)" when there is none. Text documents still say "Phrase not found" and normal matches are unaffected.

### Seventy-sixth session (merge, reorder across page sizes, undo chain)

Merged the A5 `second.pdf` into the A4 welcome document through the Merge PDF picker, then reordered and undid.

- **Merge:** 10 pages, toast "Merged 1 file(s)", zoom stayed on Automatic, pages 8–10 render at their own A5 width beside the A4 pages, thumbnails match. No console errors.
- **Drag reorder:** dragged thumbnail 8 (first merged page) to the front; page 1 became the A5 page, toast "Moved page 8". Saved bytes confirmed with pypdf: 10 pages, first page 420×595, remaining order intact. Note for future sessions: the drag only registers when the source thumbnail is inside the visible thumbnail list, so use a tall viewport (3200px for 10 pages).
- **Undo chain:** Ctrl+Z restored the original order (page 1 A4, page 8 A5); a second Ctrl+Z in an earlier run reverted the merge to 7 pages and cleared the dirty flag. Both steps showed a single "Page change undone" toast.
- No product problems found.

### Seventy-seventh session (form fill, page operation, save)

Filled every field type on the welcome form page (text "Ada Lovelace", checkbox, "Dark" radio, "Deutsch" dropdown) as a user, then rotated page 1 from the sidebar, which reloads the document through the page-op pipeline.

- All four values survived the reload and the dirty dot stayed on; the rotate toast offered undo as usual.
- Saved bytes checked with pypdf: page 1 /Rotate 90, field values name/agree=/Yes/theme=/1/language=Deutsch, checkbox and radio /AS states correct, and the text and dropdown widgets carry fresh appearance streams containing the typed text, so viewers that do not regenerate appearances will show the values.
- No console errors. No product problems found.

### Seventy-eighth session (welcome screen and drag-and-drop opening)

Started from a fresh tab as a first-time user and opened files by drag and drop.

- **Welcome screen:** title, tagline, "Open a PDF", "Try the sample" and the drop hint all present.
- **Drop overlay:** appears on dragenter with "Drop to open", survives nested enter/leave pairs, hides after the last leave, and does not appear for plain text drags.
- **Drop:** a dropped PDF opens (title and page count update); dropping the same file again reloads cleanly; a `.txt` drop shows "Drop a PDF file to open it." and keeps the current document.
- **Unsaved changes guard:** with a fresh text note, dropping another PDF asks "You have unsaved changes. Discard them and open another document?". Accepting opens the new file; cancelling (confirm stubbed to false, since the browser harness auto-accepts native dialogs) keeps the document, the note and the dirty flag.
- **Rough edge fixed:** with no document open the sidebar still showed "Select all / Blank page / Merge PDF…" and the "Click a page to jump to it" hint, none of which could do anything. The page tools now hide in the empty state and both panels show a short "Open a document to see its pages/outline here." hint; verified on the welcome screen and after opening the sample (tools back, hints gone, "no outline" message intact).

### Seventy-ninth session (image stamp tool)

Used the Add image tool end to end. The native picker cannot be driven, so `HTMLInputElement.prototype.click` was hooked to capture PDF.js's file input and a canvas-generated PNG was fed through it.

- **Insert:** clicking the tool opens the picker (accept list covers PNG/JPEG/SVG/WebP…); the image lands centred on the page, selected, with the alt-text and delete affordances, and the dirty dot appears.
- **Move and resize:** dragging the stamp moves it; the bottom-right handle scales it with the aspect ratio kept (200×120 → 319×191 px). Escape and Done return to the select tool.
- **Save:** pypdf shows a /Stamp annotation whose appearance carries a 200×120 Flate image XObject at the resized rectangle.
- **Editor undo/redo:** Ctrl+Z removes the second stamp, Redo restores it; undo/redo buttons enable correctly.
- **Bug fixed:** after cancelling the picker (or toggling the tool off and on), clicking the Add image tool again never reopened the picker, because the CREATE request fired before PDF.js finished a deferred editor-mode switch. The picker request now waits for the `annotationeditormodechanged` event when the layer is not yet in stamp mode. Verified five consecutive tool clicks each open the picker, across cancel, toggle, switch-from-text and with an existing stamp. The "Add image…" bar button was unaffected.
- Known: thumbnails do not show unsaved editor content (matches Firefox's viewer); they update after save/reload.

### Eightieth session (encrypted document: password prompt, page op, ink, save)

Opened the AES-256 sample (user password "leaf") and worked it as a reader.

- **Prompt:** "Password required" dialog with the password field focused; a wrong password re-prompts with "Incorrect password. Try again." and an emptied field; the right password opens the 7 pages. Cancelling from the welcome screen closes the dialog, clears the loading overlay and leaves the welcome screen with no toast.
- **Page operation:** rotating page 1 from the sidebar succeeded without a second password prompt (the password is reused for the reload) and the selection stayed live.
- **Ink + save:** drew a stroke on page 2, saved via `currentBytes()`. pypdf: the file is still encrypted (V5/R6), refuses the empty password, opens with "leaf", page 1 has /Rotate 90, page 2 carries an /Ink annotation with 42 points and /CA 1.
- No console errors. No product problems found.
- Harness note: awaiting `leafline.openUrl()` inside `page.evaluate` deadlocks when a password dialog follows; fire it with `setTimeout` instead.

### Eighty-first session (single-page mode, page box, navigation history)

Read the 60-page sample in "Single page" scrolling mode and navigated with keys, the page box and history.

- **Keys:** PageDown/ArrowRight/ArrowLeft/End move one page at a time and stop at the last page; the page box tracks every move.
- **Bug fixed:** the mouse wheel did nothing in single-page mode, so a mouse user had to use keys or buttons. The wheel now turns the page once the current page cannot scroll further (with a 24 px allowance for PDF.js's page margins), accumulates small notches to a 50 px threshold, and ignores trackpad inertia for 400 ms after a turn. Verified: fitted page 30 → 31 → 32 → 33 → 32 → 31 → 30 one page per notch; a page-width page scrolls inside itself first and turns at the edge; vertical mode is unchanged; Ctrl+wheel still zooms.
- **Bug fixed:** typing a non-number in the page box jumped to page 1; it now stays on the current page. Out-of-range numbers still clamp (999 → 60).
- **Bug fixed:** jumps typed into the page box were not recorded in the navigation history, so Alt+Left did nothing after them. The box now goes through the link service; verified 22 → 48, Alt+Left → 22, Alt+Right → 48.
- Note: turning back onto a taller page lands at its top, not its bottom, the same as Firefox's viewer.

### Eighty-second session (horizontal, wrapped and spread layouts)

Switched the welcome document through Horizontal, Wrapped, Odd/Even spreads and Single page + spreads from the menu.

- **Bug fixed (spreads cut off):** with Odd spreads at Automatic zoom the second page was clipped behind a horizontal scrollbar. The widest-page fit only considered single pages and, because it leaves a numeric scale in the viewer, spread and scroll mode changes never re-fitted. The fit now measures the widest *row* (page pairs in spread layouts, page 1 alone for Even spreads) and re-runs on `spreadmodechanged`/`scrollmodechanged`. Verified: odd 0.895 → 0.514 with page 2 fully inside the container, even spreads and the landscape page fine, rotated view re-fits, the equal-size 60-page document fits at 0.604, and No spreads restores the single-page fit. No horizontal overflow in any spread case.
- **Bug fixed (horizontal mode navigation):** Left/Right arrows fell through to a 40 px native scroll and the wheel only moved vertically, so nothing turned the page. Arrows now turn pages in horizontal mode, and the wheel reads down the page then moves to the next one (same logic as single-page mode). Verified arrows 1 → 2 → 3 → 2, wheel 2 → 3 → 4 with in-page scrolling first, page-fit one page per notch.
- **Checked, fine:** wrapped mode at this width shows one page per row (the same as Firefox at this zoom); single page + odd spreads shows pages 1–2 together and the wheel scrolls the tall spread before turning; preferences persist for scroll and spread modes.

### Eighty-third session (presentation mode)

Pressed F5 on page 3 of the welcome document and drove the slide show.

- **Entering:** fullscreen on the viewer, toolbar/sidebar hidden, black background, single-page layout at page-fit with only the current page visible; the previous zoom, scroll and spread modes come back on Escape.
- **Keys and wheel:** ArrowRight, Space, PageDown advance; ArrowLeft goes back; wheel down/up turns pages; Home/End jump; ArrowRight on the last page stays put.
- **Gap fixed:** clicking a slide did nothing, unlike Firefox's viewer. Left click now advances, right click goes back (context menu suppressed), the cursor hides after 2.5 s idle and returns on movement, and text selection is off during the show. Verified 2 → 3 → 4 by click, → 3 by right click, cursor none while idle then auto again; after Escape clicks and right clicks no longer turn pages and the cursor state is cleared.
- No console errors.

### Eighty-fourth session (document properties, dark theme, inverted pages)

On the arXiv paper: opened Document properties, switched to the dark theme, inverted page colours and highlighted text under inversion.

- **Properties:** every row matches pypdf (2.11 MB, empty title/author shown as "—", created/modified 4/10/2024, LaTeX with hyperref, pdfTeX-1.40.25, PDF 1.5, 15 pages, 216 × 279 mm / 8.50 × 11.00 in, fast web view No). Focus lands on Close; Escape closes and returns focus to the menu button.
- **Dark theme + invert:** the invert filter applies only to page canvases/images (not the UI or text layer), the menu item reflects `aria-checked`, and the preference persists; turning both off restores the light theme and removes the filter.
- **Highlight under inversion:** a highlight on the title renders as yellow text on the dark page (multiply blend over inverted pixels), fully legible; the same as Firefox's viewer. Left as-is.
- No console errors. No product problems found.

### Eighty-fifth session (insert blank page, extract pages, undo)

On the welcome document from the sidebar, as a reader assembling a hand-out.

- **Blank page:** with page 5 (landscape) current, "Blank page" inserted page 6 with the same landscape size, jumped to it, showed the undo toast and set the dirty dot. Saved bytes: 8 pages, page 6 has no content stream and no text.
- **Extract:** selected pages 2, 5 and 8 and clicked Extract. The download (captured by hooking the anchor click) is `welcome-pages.pdf`, 3 pages in the selected order with the right sizes (A4, landscape A4, A4) and text, unencrypted. The open document is untouched (still 8 pages, selection kept) and the toast reads "Extracted 3 page(s) to a new PDF".
- **Undo:** Ctrl+Z removed the blank page (7 pages) and cleared the dirty flag, since that was the only change.
- No console errors. No product problems found.

### Eighty-sixth session (links, history after link jumps, text selection, select all)

On the arXiv paper as a reader following citations and copying text.

- **Links:** page 2 exposes 30 link annotations; a citation link jumps to the bibliography (page 11) and Alt+Left returns to page 2. External links carry `target="_blank"` and `rel="noopener noreferrer nofollow"`; no popups opened during the run.
- **Selection:** drag-selecting and triple-clicking the title both yield exactly "Attention Is All You Need"; Ctrl+C leaves the selection intact.
- **Rough edge fixed:** Ctrl+A selected the entire interface (sidebar labels, buttons) along with the document, so a paste carried UI text. Ctrl+A now selects only the rendered pages' text layers (7,113 characters here, starting with the first line of page 1 and ending on page 2, with no sidebar text). Inside the find box and a text annotation editor Ctrl+A still selects that field's own content.
- No console errors.

### Eighty-seventh session (find bar options and the rotated page)

Searched the welcome document with every find option, cross-checked against pypdf counts.

- **Counts:** "the" 26 matches; Match case 25; "The" with case 1 (page 4); Whole words 19; "rotate" 4. All identical to pypdf's regex counts.
- **Behaviour:** Ctrl+F focuses the box; Enter/Shift+Enter walk forward and back with "(wrapped)" shown at the ends; Highlight all off leaves only the current match highlighted; Close clears all highlights and returns focus to the viewer; reopening restores the query, selected, with its status.
- **Rotated page:** the "Rotate" match on the /Rotate 90 page is highlighted as a vertical 23 × 58 px box inside the page and scrolled into view.
- No console errors. No product problems found.

### Eighty-eighth session (text-layer alignment, found via the rotated-page highlight)

The find highlight on the /Rotate 90 page looked one line to the right of its glyphs. Rendering the text layer in red showed the layer offset on every page, growing toward the bottom-right.

- **Root cause:** the global `* { box-sizing: border-box }` reset applied to PDF.js's `.page`, which PDF.js designs as content-box with a 9 px transparent border. The canvas shrank to the 692 px content box while PDF.js sized the text and annotation layers to the page's 710 px width, so all overlay layers were 18 px too large in each direction (selection, find highlights, link hit areas and form widgets all drifted; up to a full line on the rotated page).
- **Fix:** `.pdfViewer .page { box-sizing: content-box }`. Verified: canvas, text layer and annotation layer now share identical boxes on the portrait page (710 × 1004) and the rotated page (1004 × 710); the rotated highlight covers "Rota" exactly and "Form fields" shows a single crisp outline. Automatic fit still has no horizontal overflow at 1280 px, at 420 px, with odd spreads, and at page-width on the 60-page document.

### Eighty-ninth session (regression pass after the page box-sizing fix)

Re-checked everything that depends on page geometry after restoring content-box pages.

- **Annotation placement:** a text note clicked at the page centre sits at 49.4 % / 48.1 % of the page in the editor and saves at 50 % / 48.5 % of the media box (pypdf), so editor and file agree.
- **Ctrl+wheel zoom anchoring:** at 1.6× with horizontal overflow, zooming in to 1.94× and back keeps the document point under the cursor within 0.3 % of the page in both axes. (At zooms where the page still fits the container width the page is centred, so horizontal anchoring cannot apply; that is by design.)
- **Thumbnails:** 7 thumbnails at the A4 ratio (0.708). **Print:** 7 page images, 1240 × 1753 for A4 and 1753 × 1240 for the landscape page, with matching named `@page` sizes.
- **Fit:** no horizontal overflow at Automatic on 1280 px or 420 px, with odd spreads, or at page-width on the 60-page document (checked in the previous session).
- No console errors. No regressions found.

### Ninetieth session (production build via `vite preview`)

Built `dist/` and drove the static bundle on port 4173, since all recent sessions ran against the dev server.

- **Bundle:** one hashed JS, CSS and worker asset, the inline theme script kept in the head, no failed requests, first page painted in about 0.4 s. The content-box page rule is in the built CSS and canvas/text layer share the same box (880 × 1244).
- **Workflows:** find ("annotate" 1 of 2), a text note saved into the bytes (pypdf-verified in the dev sessions; here 12,141 bytes vs the 10,705-byte original), rotate from the sidebar with undo toast, print produces 7 page images, dark theme toggles. No console errors or warnings.
- **False alarm resolved:** the first run appeared to lose the note (bytes identical to the original). Cause: after a find jump the top of page 1 was 112 px above the viewport, so a click at "page top + 200 px" hit the editor bar rather than the page. Clicking inside the visible page region creates and saves the note. Not a product problem; caveat recorded for future sessions.
- Note: `dist/` ships a 3.6 MB source map alongside the bundle; acceptable for a self-hosted private deployment.

### Ninety-first session (touch: pinch zoom, single-finger events)

Synthetic touch pointer events on the 60-page document at an 800 × 900 viewport.

- **Pinch out** (finger distance 200 → 400 px) takes the scale from 0.668 to 1.302 and scrolls toward the pinch midpoint; **pinch in** (400 → 200 px) returns to 0.651. The zoom box shows "custom" afterwards and pointer moves during the pinch are default-prevented.
- **Single finger:** a one-finger drag dispatches without errors; real scrolling is native (`touch-action: pan-x pan-y`), which synthetic events cannot exercise.
- No console errors. Real-device behaviour (two-finger pan jitter during a pinch, momentum) remains on the untested list.

### Ninety-second session (edit and delete a pre-existing text annotation)

Created a note, saved and reopened the bytes as a new file, then edited and deleted the now pre-existing annotation.

- **Reopen:** the note comes back as a FreeText annotation with its popup; entering the text tool turns it into an editor showing "first draft".
- **Edit:** double-click, Ctrl+A, retype "second draft", click away. Saved bytes: exactly one FreeText, contents "second draft", appearance stream regenerated (no trace of "first draft").
- **Delete:** selecting the editor and pressing Delete removes it, enables editor Undo and sets the dirty flag. Saved bytes: no annotations on page 1. The original section stays in the DOM only as PDF.js's hidden placeholder.
- Only the benign "Helv" font-fallback warnings; no errors. Thumbnails keep the pre-edit rendering until the next reload (known).

### Ninety-third session (malformed input: truncated, empty, non-PDF, missing)

Opened a 6 KB truncated PDF, a zero-byte file, an HTML file, a fake JPEG, a PDF renamed to `.txt`, and a missing URL, both from the welcome screen and while a document was open.

- **Robustness:** every failure leaves the app usable: the welcome screen stays (or the open document stays with its 7 pages), the loading overlay clears, no dialog is left open, and a good file opens afterwards. A PDF renamed to `.txt` opens by content.
- **Messages improved:** failures used PDF.js's internal wording ("Invalid PDF structure", "The PDF file is empty, i.e. its size is zero bytes.") and a missing URL read as a damaged file. Messages are now: `"x" is damaged or not a valid PDF (invalid pdf structure).`, `"x" is empty (0 bytes).`, `"x" is not a PDF file.` (no %PDF header in the first 1 KB), `Could not find "x".` for a missing download, and a server-error variant. Failures are logged as warnings rather than console errors.
- **Bug caught while fixing:** PDF.js transfers the byte buffer to its worker, so the array is detached (length 0) by the time the error arrives; the first version reported every file-based failure as "empty". Size and header are now captured before the buffer is handed over.
- Note: on the dev server a missing `?file=` URL still reports "damaged", because Vite answers unknown paths with the app's HTML; a static host returns 404 and gets "Could not find".

### Ninety-fourth session (Open from URL: validation and failure messages)

Used the Open from URL dialog with bad, blocked, missing, non-PDF and good addresses.

- **Dialog:** focus lands in the URL field; Escape cancels; the browser's own validation stops "not a url" with "Please enter a URL."; a good same-origin URL opens (3 pages, title and file name set).
- **Messages improved:** a cross-origin or unreachable address used to say "Failed to fetch", and a non-PDF URL was reported as a damaged file named "favicon.svg.pdf". Now: `Could not download "x". The server may not allow cross-origin access, or the address is unreachable.`; `"favicon.svg" is not a PDF file.` (the original name is used in messages; ".pdf" is still appended for saving); and on a real static server a missing file gives `Could not find "nope.pdf".` (verified with a plain HTTP server on the built `dist/`; the dev server answers unknown paths with HTML, so there it reads "not a PDF file"). On failure the app fetches the first kilobyte of the URL to tell these cases apart.
- After each failure the welcome screen stays usable and the next open works.

### Ninety-fifth session (keyboard shortcuts dialog vs. actual behaviour)

Opened the shortcuts dialog with `?` on the 60-page document and pressed every documented key.

- **Verified:** ← / → page 1 → 2 → 1, End 60, Home 1, Ctrl+= 1.207 → 1.4, Ctrl+- back to 1.2, Ctrl+0 Automatic, R rotates 90 and Shift+R back, H/V switch pan/select, Ctrl+F and Ctrl+G open find, ? opens the dialog (focus on Close, Escape closes), F4 hides and shows the sidebar, Delete removes a selected annotation and Ctrl+Z restores it. All match the dialog.
- **Dialog completed:** it did not list PgDn / PgUp / Space (single-page paging), Ctrl+A (select document text) or Ctrl+Z as page-change undo outside editing, and the annotation undo row did not say it applies while editing. Added those; the dialog still fits a 720 px viewport (546 px tall).
- No console errors.

### Ninety-sixth session (About dialog, unload guard, theme button semantics)

- **About:** shows "Leafline v0.1.0" (from package.json), the local-processing statement, PDF.js and pdf-lib links with `target="_blank" rel="noopener"`, and a Close button; Escape closes it.
- **Unload guard:** a synthetic `beforeunload` is not cancelled on a clean document and is cancelled once an ink stroke makes it dirty, so the browser's leave-page prompt appears only with unsaved changes.
- **Accessibility fix:** the theme button's spoken name stayed "Toggle dark theme" in both states (only the tooltip changed) and its icon attribute went stale. It now carries the same text as its tooltip ("Switch to dark theme" / "Switch to light theme"), `aria-pressed` reflecting dark mode, and the matching icon name; verified across toggle, reload (dark persisted) and toggle back. In dark mode the button shows the pressed tint with the sun icon.
- No console errors.

## Open issues / follow-ups

- Encrypted documents cannot have their password removed; merge/extract/split are refused on them (pdf-lib cannot re-encrypt).
- Not yet tested on real hardware: touch gestures, the native save-file picker, clipboard paste of copied text.
- Not yet tested: XFA forms, multi-megabyte scans with unique images per page, Firefox and Safari.
