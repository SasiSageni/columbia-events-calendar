# What's On, Columbia

A source-transparent month calendar for upcoming events in Columbia, Missouri.
The application combines civic, university, and business calendars into one
normalized JSON cache. Visitors can filter by source, search by title or venue,
select a day, and open every event on its original publisher's website.

## Live application

The production URL is added here after deployment.

## What it includes

- Responsive month view with desktop event previews and a compact mobile view
- Day agenda with title, local start time, venue, and original listing link
- Source toggles and text search
- America/Chicago timezone handling, including daylight-saving transitions
- Explicit refresh process that writes to `public/data/events.json`
- Source request/response samples under `docs/source-evidence/`
- No database and no client-side calls to third-party event websites

## Active data sources

| Source | Access | What it contributes |
| --- | --- | --- |
| [Mizzou Events](https://calendar.missouri.edu/) | Public LiveWhale JSON API | Campus talks, workshops, arts, and public university events |
| [City of Columbia](https://www.como.gov/CMS/webcal/) | Public iCalendar feed | Civic meetings, parks programs, and city community events |
| [Columbia Chamber](https://business.comochamber.com/events/searchscroll) | Public calendar HTML | Business, networking, ribbon-cutting, and community events |

Ticketmaster and SeatGeek adapters are also implemented. They activate when
their optional environment variables are supplied, but the application already
meets the three-source requirement without API keys.

## Architecture

```text
Mizzou JSON ───────────┐
City iCalendar ────────┼─> scripts/fetch-events.mjs
Chamber calendar ──────┤       │
Ticketmaster (optional)┤       ├─ normalize timestamps and fields
SeatGeek (optional) ───┘       ├─ remove expired/cancelled events
                               ├─ deduplicate
                               └─ public/data/events.json
                                             │
                                             └─> React month calendar
```

The cache is committed intentionally. A page load reads one local JSON file
instead of refetching every provider. Refresh failures are isolated by source,
and the last generated cache remains deployable.

## Run locally

Prerequisites:

- Node.js 20.9 or newer
- npm

```bash
npm install
npm run refresh
npm run dev
```

Open `http://localhost:3000`.

To add the optional ticket providers:

```bash
cp .env.example .env.local
```

Then set:

```text
TICKETMASTER_API_KEY=...
SEATGEEK_CLIENT_ID=...
```

Never commit `.env.local`; it is ignored by Git.

## Validation

```bash
npm test
npm run lint
npm run build
npm audit
```

Tests cover HTML cleanup, iCalendar parsing, deterministic identifiers,
deduplication, and Central Time conversion across daylight-saving changes.

## Refresh behavior

`npm run refresh` requests events from today through 180 days ahead. It:

1. Fetches each source independently.
2. Keeps Mizzou records with a physical location and removes virtual-only items.
3. Parses City of Columbia iCalendar data, including folded lines.
4. Reads structured timestamps from Chamber event cards and retrieves venue
   information from each original listing.
5. Converts source records into one schema.
6. Removes expired and cancelled entries.
7. Deduplicates matching title/date/venue combinations.
8. Writes the cache and redacted evidence files.

The normalized schema is:

```json
{
  "id": "stable internal ID",
  "source": "Mizzou",
  "sourceId": "publisher ID",
  "title": "Event title",
  "start": "2026-08-07T13:15:00.000Z",
  "end": "2026-08-07T14:30:00.000Z",
  "allDay": false,
  "venue": "Venue name",
  "address": "Optional address",
  "url": "Original listing",
  "category": "Source category",
  "description": "Plain-text summary",
  "status": "active"
}
```

## Evidence and source decisions

- [`docs/SOURCES.md`](docs/SOURCES.md) explains what worked and what did not.
- [`docs/source-evidence/`](docs/source-evidence/) contains the request URL and
  sample response captured during the latest refresh.
- [`AI_LOG.md`](AI_LOG.md) records how AI was used and what required correction.

## Privacy and attribution

Only public event metadata is cached. Attendee, order, and personal information
is never requested. Event details remain attributable to their publishers, and
every card links to its original listing.
