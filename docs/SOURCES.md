# Source research notes

Research and live request verification were performed on July 28–29, 2026.
The generated evidence files record the exact latest refresh time.

## Sources in production

### 1. Mizzou Events

**Result:** Works without a key.

Mizzou currently runs LiveWhale Calendar, not Localist. The public JSON endpoint
supports date paths, response-field selection, and pagination.

Request shape:

```http
GET https://calendar.missouri.edu/live/json/events/
    start_date/{YYYY-MM-DD}/
    end_date/{YYYY-MM-DD}/
    response_fields/location,summary,event_types,group_title/
    paginate/100
```

The collector follows pagination and uses Unix timestamps returned as `date_ts`
and `date2_ts`. It excludes records without a physical location and those whose
location says Virtual, Online, or Zoom.

Evidence: [`source-evidence/mizzou-response-sample.json`](source-evidence/mizzou-response-sample.json)

### 2. City of Columbia

**Result:** Works without a key.

Request:

```http
GET https://www.como.gov/CMS/webcal/ical.php
```

The response is `text/calendar`. The collector unfolds continued iCalendar
lines; reads UID, DTSTART, DTEND, SUMMARY, LOCATION, DESCRIPTION, URL, and
STATUS; then converts Central Time to UTC for storage.

Evidence: [`source-evidence/city-response-sample.ics`](source-evidence/city-response-sample.ics)

### 3. Columbia Chamber of Commerce

**Result:** Works as a public structured calendar page.

Request shape:

```http
GET https://business.comochamber.com/events/searchscroll
    ?from={M/D/YYYY}
    &to={M/D/YYYY}
```

Each result card provides the original URL and machine-readable start/end
timestamps in `content` attributes. The collector then reads the corresponding
public detail page for its venue. Concurrency is capped at eight requests.

Evidence: [`source-evidence/chamber-response-sample.html`](source-evidence/chamber-response-sample.html)

## Optional adapters

### Ticketmaster Discovery API

**Result:** Technically suitable; requires a free developer key.

The adapter uses city, state, country, start/end, and sort parameters. It is
skipped when `TICKETMASTER_API_KEY` is absent. The key is always redacted from
the evidence file.

### SeatGeek Platform API

**Result:** Technically suitable; requires a client ID.

The adapter searches around central Columbia within 15 miles and then strictly
post-filters the returned venue to `Columbia`, `MO`. It is skipped when
`SEATGEEK_CLIENT_ID` is absent.

## Rejected sources

### Eventbrite

**Result:** Rejected.

The current documented API can list events belonging to an authenticated
organization but does not offer general citywide public-event discovery. The
older public search behavior often suggested by stale examples is not a viable
current endpoint.

Scraping was also rejected. Eventbrite's current Terms of Service explicitly
prohibit scraping, crawling, and automated extraction of site content.

### PredictHQ

**Result:** Rejected for the free-source requirement.

It offers relevant event search capabilities, but its unrestricted free access
is a trial rather than a permanent free API source.

### Visit Columbia tourism calendar

**Result:** Investigated but not needed.

Its public WordPress REST route exposes event posts, but the standard `date`
field is the post publication date rather than the event occurrence date. The
occurrence date is rendered separately on detail pages. The three selected
sources provide cleaner coverage, so this was not added to production.

## Deduplication

Events are compared using:

```text
normalized title + Columbia-local calendar date + normalized venue prefix
```

The first publisher record is retained. This avoids showing the same event
multiple times when feeds syndicate one another while keeping similarly named
events at different venues.
