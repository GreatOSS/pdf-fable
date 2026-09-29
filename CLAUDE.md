# Leafline maintainer notes

Product name is **Leafline** (repo: GreatOSS/pdf-fable, private). Use the name consistently in UI, docs, and metadata.

- Stack: Vite + TypeScript (no framework), PDF.js viewer components for rendering/editing, pdf-lib for page operations.
- `npm run check` must pass before committing (typecheck, vitest, build).
- PDF.js runtime assets are copied to `public/pdfjs/` by `scripts/copy-pdfjs-assets.mjs` (runs before dev/build). Samples come from `scripts/make-samples.mjs`. Both directories are gitignored.
- Hands-on testing is mandatory for UI changes: run `npm run dev`, open http://localhost:5173, exercise the change in the browser, and record results in `docs/TESTING.md`.
- `window.leafline` exposes the app instance for automated hands-on checks (e.g. `await leafline.currentBytes()`).
- Never publish builds or packages publicly; the repository must stay private.
