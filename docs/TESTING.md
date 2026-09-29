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

## Open issues / follow-ups

- Switching documents very quickly logs a benign "Transport destroyed" console error from the previous viewer initialization.
- Encrypted documents cannot have their password removed; merge/extract/split are refused on them (pdf-lib cannot re-encrypt).
- Not yet tested on real hardware: touch gestures, the native save-file picker, clipboard paste of copied text.
- Not yet tested: XFA forms, multi-megabyte scans with unique images per page, Firefox and Safari.
