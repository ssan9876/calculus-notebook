# Calculus

**Live app:** https://ssan9876.github.io/calculus-notebook/

Calculus is a local-first computational notebook for symbolic mathematics and
Python. It combines a fast in-browser Math.js kernel with Python 3 powered by
Pyodide, stores notebooks in IndexedDB, and can run as a PWA or native desktop
application. An optional self-hosted service adds accounts, sync, sharing,
version history, and live notebook updates.

## Start the app

```powershell
npm install
npm run dev
```

Open the URL printed by Vite. The application is also installable from a
supporting browser as a PWA.

## GitHub Pages

Pushing `main` deploys the static local-first application through
`.github/workflows/pages.yml`. The workflow derives the correct Vite base path
for either a project site or an account-level `github.io` repository. Enable
**Settings → Pages → Source: GitHub Actions** after creating the repository.

GitHub Pages hosts the notebook and PWA only. Run the optional sync service on
a separate HTTPS/WSS host and enter that address in the app's Cloud panel.

## Desktop app

Rust is required for native builds. Tauri produces Windows MSI and NSIS
installers in `src-tauri/target/release/bundle`.

```powershell
npm run desktop:dev
npm run desktop:build
```

## Optional sync service

The service is deliberately separate: local notebooks never require an
account. Set a strong secret and a durable data path in production.

```powershell
$env:CALCULUS_SECRET = 'replace-with-a-long-random-secret'
$env:CALCULUS_DATA = 'D:\calculus-data\database.json'
$env:CALCULUS_PORT = '8787'
npm run server
```

Open **Cloud** in the app, enter the service URL, then register or sign in.
Sync creates immutable versions, Share creates a read-only link, and live sync
uses an authenticated WebSocket room for the notebook owner. Deploy behind
HTTPS/WSS for use outside a trusted local network; the bundled file store is
appropriate for personal or small-team hosting, not a public multi-tenant
service.

## Notebook workflow

- `Shift + Enter`: run the current code cell and advance
- `Ctrl + Enter`: run the current cell in place
- `Alt + Enter`: insert a code cell below
- Drag the grip to reorder a cell
- Double-click rendered Markdown to edit it
- Use the language selector on a cell to choose Math or Python

Math cells start instantly and support stateful Math.js expressions, symbolic
operations, functions, matrices, `plot(expression, variable, min, max)`, and
`slider(name, min, max, step, value)` reactive controls.
Python starts on first use. It loads Pyodide and imported packages from the
Pyodide distribution, then caches those resources in the browser. Packages
such as NumPy, pandas, SymPy, and Matplotlib load automatically when imported.

Press `Ctrl + K` for the command palette. **Ask Calculus** can locally translate
common conversions, derivatives, integrals, equation solving, plots, and named
scientific constants into visible notebook cells. It is deterministic and does
not send prompts to an external model.

## Included in v2

- Stateful Math.js and Python kernels
- Queued execution, a 30-second timeout, interrupt, and kernel restart
- CodeMirror editing with Python and Markdown syntax support
- Text, LaTeX, streams, sandboxed HTML, PNG/SVG images, plots, and tracebacks
- Dependency-aware completion and transitive stale-state tracking
- Sortable, filterable, downloadable table output and reactive sliders
- Multiple searchable notebooks in IndexedDB
- Autosave, recovery copy, validation, and v1 document migration
- Native `.calc.json` and Jupyter `.ipynb` import/export
- Cell reorder, duplicate, delete, collapse, and per-cell language selection
- Variable inspection with value and runtime type
- Responsive, keyboard-accessible interface with reduced-motion support
- Command palette, in-notebook search, dark theme, and print-to-PDF layout
- Installable PWA, Tauri desktop shell, and cached Python runtime resources
- Optional self-hosted accounts, sync, share links, history, and live updates

## Architecture

```text
React workspace
├── CodeMirror cell editors
├── IndexedDB notebook repository
├── Math.js kernel (lazy-loaded)
└── Python Web Worker
    └── Pyodide + packages loaded from imports
```

Python runs in a dedicated worker so long calculations do not freeze the
editor. Rich HTML output is displayed in a sandboxed iframe. Notebook files are
validated with Zod before import.

## Verification

```powershell
npm test        # unit and integration tests
npm run test:e2e # Playwright desktop and mobile browser tests
npm run build   # type-check, bundle, and generate the PWA
npm run preview # serve the production build
cargo check --manifest-path src-tauri/Cargo.toml
```

The Python runtime requires a network connection the first time its core or a
new scientific package is requested. Cached runtime files are reused afterward.
