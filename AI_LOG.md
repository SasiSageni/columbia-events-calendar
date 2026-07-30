# AI usage log

Brief notes documenting how GPT/Codex was used during the project.

## 2026-07-28 — Requirement review

**Asked:** Read the supplied project brief and identify the required
deliverables.

**Got:** React month calendar, three to five sources, original links, public
deployment, file cache, README, source notes, real Git history, and this log.

**Checked/fixed:** Read the complete two-page PDF rather than relying on the
filename or summary supplied in chat.

## 2026-07-28 — Source research

**Asked:** Find free event APIs or feeds that cover current and upcoming events
in Columbia, Missouri.

**Got:** Ticketmaster, SeatGeek, Mizzou, City of Columbia, Chamber, Eventbrite,
and PredictHQ as candidates.

**Checked/fixed:**

- Made live requests before choosing a source.
- The first remembered assumption that Mizzou used Localist was wrong. Its
  current site identifies itself as LiveWhale and the working route is
  `/live/json/events`.
- Confirmed the City iCalendar and RSS endpoints with real responses.
- Confirmed the Chamber calendar contains machine-readable start/end values.
- Rejected Eventbrite after current official documentation showed that public
  citywide discovery is not available. Also checked current terms and rejected
  scraping.
- Rejected PredictHQ because the free access is a trial.

## 2026-07-29 — Data pipeline

**Asked:** Implement a cached collector for three no-key sources with optional
Ticketmaster and SeatGeek adapters.

**Got:** A Node refresh script, source adapters, one normalized schema, evidence
files, time-range filtering, cancellation filtering, and deduplication.

**Checked/fixed:**

- Fixed null values returned by Mizzou before HTML cleanup.
- Added an iterative America/Chicago conversion instead of hard-coding UTC-5;
  winter events require UTC-6.
- Used US-formatted dates for the Chamber query.
- Kept third-party requests out of the browser; users receive one committed JSON
  cache.

## 2026-07-29 — Interface and accessibility

**Asked:** Create a polished responsive calendar rather than a generic
dashboard.

**Got:** Editorial Columbia-focused design, month navigation, search, source
filters, day agenda, responsive event dots, visible source attribution, and
original-listing links.

**Checked/fixed:** Added semantic controls, `aria-pressed`, descriptive date
labels, keyboard-operable buttons, reduced-motion handling, and mobile layouts.

## 2026-07-29 — Security and validation

**Asked:** Install dependencies, test, audit, and build.

**Got:** Initial dependency installation reported vulnerable transitive
packages.

**Checked/fixed:** Upgraded to the current supported Next.js release line and
overrode patched PostCSS and Sharp versions. Re-ran the audit, tests, type check,
and production build. No API keys were added to the repository.

## 2026-07-29 — Vite JSX migration

**Asked:** Replace Next.js and TypeScript/TSX with Vite and plain React JSX.

**Got:** A Vite 8 React application with `index.html`, `src/main.jsx`,
`src/App.jsx`, and a static production bundle in `dist/`.

**Checked/fixed:**

- Removed Next.js routing, server-rendering files, TypeScript configuration, and
  type-only code.
- Kept the event refresh pipeline and its Node tests framework-independent.
- Wrote the cache into `src/data/events.json` for build-time import and retained
  `public/data/events.json` as a directly inspectable artifact.
- Reinstalled dependencies and reran the audit, tests, and production build.

## 2026-07-29 — Nightlife source expansion

**Asked:** Keep all existing sources and add sources with concerts, parties,
nightlife, and social events.

**Got:** Official calendar adapters for The Blue Note and Rose Music Hall,
MyHouse through the public Posh JSON feed used by its website, and Visit
Columbia through official listing and detail pages.

**Checked/fixed:**

- Preserved the original Mizzou, City, Chamber, Ticketmaster, and SeatGeek
  adapters.
- Added distinct source colors and a Nightlife quick filter.
- Kept bounded concurrency for tourism detail pages.
- Preserved last-known records when an individual source refresh fails.
