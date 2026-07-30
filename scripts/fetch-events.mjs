import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chicagoDateKey,
  decodeHtml,
  deduplicate,
  parseIcs,
  stableId,
  toChicagoIso,
} from "./lib/normalize.mjs";

// Serverless refreshes write into an isolated temporary directory. Local runs
// keep the existing behavior and update the checked-in cache and evidence.
const ROOT = process.env.EVENT_CACHE_ROOT || process.cwd();
const OUT_DIR = path.join(ROOT, "src", "data");
const PUBLIC_OUT_DIR = path.join(ROOT, "public", "data");
const EVIDENCE_DIR = path.join(ROOT, "docs", "source-evidence");
const TIMEZONE = "America/Chicago";
const now = new Date();
const rangeStart = chicagoDateKey(now);
const endDate = new Date(now);
endDate.setUTCDate(endDate.getUTCDate() + 180);
const rangeEnd = chicagoDateKey(endDate);

const USER_AGENT =
  "ColumbiaEventsCalendar/1.0 (+source-transparent student project; contact via repository)";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "*/*",
      "User-Agent": USER_AGENT,
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response;
}

async function writeEvidence(name, payload) {
  await writeFile(
    path.join(EVIDENCE_DIR, name),
    typeof payload === "string" ? payload : `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

function activeInRange(event) {
  if (!event.start || Number.isNaN(new Date(event.start).valueOf())) return false;
  const eventDay = chicagoDateKey(new Date(event.start));
  const effectiveEnd = event.end ? new Date(event.end) : new Date(event.start);
  return (
    effectiveEnd >= now &&
    eventDay <= rangeEnd &&
    event.status !== "cancelled"
  );
}

async function fetchMizzou() {
  const base =
    `https://calendar.missouri.edu/live/json/events/start_date/${rangeStart}` +
    `/end_date/${rangeEnd}/response_fields/location,summary,event_types,group_title/paginate/100`;
  const firstResponse = await request(base);
  const first = await firstResponse.json();
  await writeEvidence("mizzou-response-sample.json", {
    request: base,
    response: { ...first, data: first.data?.slice(0, 2) },
  });

  const pages = [first];
  for (let page = 2; page <= Math.min(first.meta?.total_pages ?? 1, 8); page += 1) {
    pages.push(await (await request(`${base}?page=${page}`)).json());
  }

  const events = pages
    .flatMap((page) => page.data ?? [])
    .filter((item) => item.date_ts)
    .filter((item) => !/\b(?:eo setup|info booking)\b/i.test(decodeHtml(item.title)))
    .filter((item) => {
      const location = String(item.location ?? "").trim();
      return location && !/virtual|online|zoom/i.test(location);
    })
    .map((item) => {
      const start = new Date(Number(item.date_ts) * 1000).toISOString();
      const end = item.date2_ts
        ? new Date(Number(item.date2_ts) * 1000).toISOString()
        : null;
      const title = decodeHtml(item.title);
      return {
        id: stableId("Mizzou", item.id),
        source: "Mizzou",
        sourceId: String(item.id),
        title,
        start,
        end,
        allDay: Boolean(item.is_all_day),
        venue: decodeHtml(item.location),
        address: "",
        url: item.url || `https://calendar.missouri.edu/event/${item.id}`,
        category: (item.event_types ?? []).join(", ") || "University",
        description: decodeHtml(item.summary),
        status: /cancel/i.test(title) ? "cancelled" : "active",
      };
    })
    .filter(activeInRange);

  return { events, request: base };
}

async function fetchCity() {
  const url = "https://www.como.gov/CMS/webcal/ical.php";
  const text = await (await request(url)).text();
  await writeEvidence(
    "city-response-sample.ics",
    [
      `# Request: GET ${url}`,
      "# Response sample:",
      ...text.split(/\r?\n/).slice(0, 90),
    ].join("\n"),
  );

  const events = parseIcs(text)
    .filter((item) => item.start)
    .map((item) => {
      const title = decodeHtml(item.title);
      return {
        id: stableId("City of Columbia", item.uid),
        source: "City of Columbia",
        sourceId: item.uid,
        title,
        start: item.start,
        end: item.end,
        allDay: item.allDay,
        venue: item.location || "City of Columbia",
        address: item.location,
        url: item.url || "https://www.como.gov/CMS/webcal/",
        category: "City & community",
        description: decodeHtml(item.description),
        status:
          item.status === "cancelled" || /cancel/i.test(title)
            ? "cancelled"
            : "active",
      };
    })
    .filter(activeInRange);

  return { events, request: url };
}

function chamberCardBlocks(html) {
  return (
    html.match(
      /<div class="card gz-events-card[\s\S]*?<!-- end of card-->/g,
    ) ?? []
  );
}

function parseChamberCard(block) {
  const titleMatch = block.match(
    /<h5 class="card-title gz-card-title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/,
  );
  const startMatch = block.match(/<span content="([^"]+)">/);
  const endMatch = block.match(/<meta content="([^"]+)"\s*\/>/);
  const categories = [...block.matchAll(/<span class="gz-cat">([\s\S]*?)<\/span>/g)].map(
    (match) => decodeHtml(match[1]),
  );
  if (!titleMatch || !startMatch) return null;
  return {
    url: decodeHtml(titleMatch[1]),
    title: decodeHtml(titleMatch[2]),
    start: toChicagoIso(startMatch[1]),
    end: endMatch ? toChicagoIso(endMatch[1]) : null,
    category: categories.join(", ") || "Business & community",
  };
}

async function fetchChamberDetail(url) {
  try {
    const html = await (await request(url)).text();
    const locationBlock = html.match(
      /<h5[^>]*>\s*Location\s*<\/h5>([\s\S]*?)(?:<h5|<\/section>|<div class="col)/i,
    );
    const fallback = html.match(
      /(?:Location|gz-event-location)[^>]*>([\s\S]{0,900}?)(?:<\/div>|<h5)/i,
    );
    return decodeHtml(locationBlock?.[1] ?? fallback?.[1] ?? "");
  } catch {
    return "";
  }
}

async function mapLimited(items, limit, mapper) {
  const result = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

async function fetchChamber() {
  const toUsDate = (value) => {
    const [year, month, day] = value.split("-");
    return `${month}/${day}/${year}`;
  };
  const url =
    `https://business.comochamber.com/events/searchscroll?from=${toUsDate(rangeStart)}` +
    `&to=${toUsDate(rangeEnd)}`;
  const html = await (await request(url)).text();
  const parsed = chamberCardBlocks(html)
    .map(parseChamberCard)
    .filter(Boolean)
    .filter((item) => item.start)
    .slice(0, 100);

  await writeEvidence("chamber-response-sample.html", [
    `<!-- Request: GET ${url} -->`,
    "<!-- Response card sample: -->",
    chamberCardBlocks(html)[0] ?? "<!-- no cards returned -->",
  ].join("\n"));

  const withLocations = await mapLimited(parsed, 8, async (item) => ({
    ...item,
    venue: await fetchChamberDetail(item.url),
  }));

  const events = withLocations
    .map((item) => {
      const sourceId = item.url.split("-").at(-1) ?? item.url;
      return {
        id: stableId("Columbia Chamber", sourceId),
        source: "Columbia Chamber",
        sourceId,
        title: item.title,
        start: item.start,
        end: item.end,
        allDay: false,
        venue: item.venue || "Columbia, Missouri",
        address: item.venue,
        url: item.url,
        category: item.category,
        description: "",
        status: /cancel/i.test(item.title) ? "cancelled" : "active",
      };
    })
    .filter(activeInRange);

  return { events, request: url };
}

const MONTH_NUMBER = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function localDateTime(dateText, timeText = "") {
  const dateMatch = decodeHtml(dateText).match(
    /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/,
  );
  if (!dateMatch) return null;
  const month = MONTH_NUMBER[dateMatch[1].toLowerCase()];
  if (!month) return null;
  const timeMatch = decodeHtml(timeText).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  let hour = timeMatch ? Number(timeMatch[1]) % 12 : 12;
  if (timeMatch?.[3].toLowerCase() === "pm") hour += 12;
  const minute = timeMatch?.[2] ?? "00";
  return toChicagoIso(
    `${dateMatch[3]}-${month}-${String(dateMatch[2]).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00`,
  );
}

function venueEventCards(html) {
  return html.match(/<article class="event-card[\s\S]*?<\/article>/g) ?? [];
}

function parseVenueEventCard(block, source, fallbackVenue) {
  const sourceId = block.match(/\bpost-(\d+)\b/)?.[1];
  const titleMatch = block.match(
    /<div class="event-title">[\s\S]*?<a href="([^"]+)">([\s\S]*?)<\/a>/i,
  );
  const dateText = block.match(/<div class="event-date">([\s\S]*?)<\/div>/i)?.[1];
  const timesText = block.match(/<div class="event-times">([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const showTime =
    decodeHtml(timesText).match(/Show:\s*([^|]+)/i)?.[1] ??
    decodeHtml(timesText).match(/Doors:\s*([^|]+)/i)?.[1] ??
    timesText;
  if (!sourceId || !titleMatch || !dateText) return null;
  const title = decodeHtml(titleMatch[2]);
  const venue =
    decodeHtml(block.match(/<div class="event-venue">([\s\S]*?)<\/div>/i)?.[1]) ||
    fallbackVenue;
  const supportingActs = decodeHtml(
    block.match(/<div class="event-supporting-acts">([\s\S]*?)<\/div>/i)?.[1],
  );
  return {
    id: stableId(source, sourceId),
    source,
    sourceId,
    title,
    start: localDateTime(dateText, showTime),
    end: null,
    allDay: !/\d/.test(decodeHtml(timesText)),
    venue,
    address:
      source === "The Blue Note"
        ? "17 N 9th St, Columbia, MO 65201"
        : "1013 Park Ave, Columbia, MO 65201",
    url: decodeHtml(titleMatch[1]),
    category: "Nightlife & live music",
    description: supportingActs,
    status: /cancel|moved to/i.test(title) ? "cancelled" : "active",
  };
}

async function fetchVenueCalendar({
  source,
  url,
  fallbackVenue,
  evidenceName,
}) {
  const html = await (await request(url)).text();
  const cards = venueEventCards(html);
  await writeEvidence(evidenceName, [
    `<!-- Request: GET ${url} -->`,
    "<!-- Official event-card sample: -->",
    cards[0] ?? "<!-- no cards returned -->",
  ].join("\n"));
  const events = cards
    .map((block) => parseVenueEventCard(block, source, fallbackVenue))
    .filter(Boolean)
    .filter(activeInRange);
  return { events, request: url };
}

async function fetchBlueNote() {
  return fetchVenueCalendar({
    source: "The Blue Note",
    url: "https://thebluenote.com/",
    fallbackVenue: "The Blue Note",
    evidenceName: "blue-note-response-sample.html",
  });
}

async function fetchRoseMusicHall() {
  return fetchVenueCalendar({
    source: "Rose Music Hall",
    url: "https://rosemusichall.com/",
    fallbackVenue: "Rose Music Hall",
    evidenceName: "rose-music-hall-response-sample.html",
  });
}

async function fetchMyHouse() {
  const url = "https://posh.vip/api/web/v2/util/group_url/myhouse-1";
  const data = await (await request(url)).json();
  await writeEvidence("myhouse-response-sample.json", {
    request: url,
    response: { events: data.events?.slice(-2) ?? [] },
  });
  const events = (data.events ?? [])
    .map((item) => ({
      id: stableId("MyHouse", item.id),
      source: "MyHouse",
      sourceId: String(item.id),
      title: decodeHtml(item.name),
      start: item.startUtc || item.start,
      end: item.endUtc || item.end || null,
      allDay: false,
      venue: item.venue?.name || "MyHouse",
      address: item.venue?.address || "119 S 7th St, Columbia, MO 65201",
      url: `https://posh.vip/e/${item.url}?t=myhouse-website`,
      category: "Party & nightlife",
      description: decodeHtml(item.description),
      status: /cancel/i.test(item.status) ? "cancelled" : "active",
    }))
    .filter(activeInRange);
  return { events, request: url };
}

function visitColumbiaCards(html) {
  return html
    .split('<div class="search_things">')
    .slice(1)
    .map((block) => block.split('<div class="search_things">')[0]);
}

async function fetchVisitColumbiaDetail(card) {
  const url = decodeHtml(
    card.match(/<a href="([^"]+)" class="more-link"/i)?.[1],
  );
  if (!url) return null;
  const html = await (await request(url)).text();
  const title = decodeHtml(card.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1]);
  const dateText = html.match(/<div class="event_date">\s*([^<]+)/i)?.[1];
  const eventTimes = decodeHtml(
    html.match(/<p class="event_times">([\s\S]*?)<\/p>/i)?.[1] ?? "",
  );
  if (!title || !dateText) return null;
  const startText = eventTimes.split(/\s+to\s+/i)[0];
  const endText = eventTimes.split(/\s+to\s+/i)[1] ?? "";
  const start = localDateTime(dateText, startText);
  const end = endText ? localDateTime(dateText, endText) : null;
  const venue = decodeHtml(
    html.match(
      /class="location_address"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
    )?.[1],
  );
  const postId = card.match(/data-postid="(\d+)"/i)?.[1] ?? url;
  return {
    id: stableId("Visit Columbia", postId),
    source: "Visit Columbia",
    sourceId: String(postId),
    title,
    start,
    end,
    allDay: !eventTimes,
    venue: venue || "Columbia, Missouri",
    address: venue,
    url,
    category: "Things to do",
    description: "",
    status: /cancel/i.test(title) ? "cancelled" : "active",
  };
}

async function fetchVisitColumbia() {
  const url = "https://www.visitcolumbiamo.com/events/";
  const html = await (await request(url)).text();
  const cards = visitColumbiaCards(html).slice(0, 50);
  await writeEvidence("visit-columbia-response-sample.html", [
    `<!-- Request: GET ${url} -->`,
    "<!-- Event listing card sample: -->",
    cards[0] ?? "<!-- no cards returned -->",
  ].join("\n"));
  const parsed = await mapLimited(cards, 6, fetchVisitColumbiaDetail);
  const events = parsed.filter(Boolean).filter(activeInRange);
  return { events, request: url };
}

async function fetchTicketmaster() {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return { skipped: true, events: [], request: "API key not configured" };
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.search = new URLSearchParams({
    apikey: apiKey,
    city: "Columbia",
    stateCode: "MO",
    countryCode: "US",
    startDateTime: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    endDateTime: endDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
    sort: "date,asc",
    size: "200",
  });
  const data = await (await request(url)).json();
  await writeEvidence("ticketmaster-response-sample.json", {
    request: url.toString().replace(apiKey, "REDACTED"),
    response: {
      page: data.page,
      events: data._embedded?.events?.slice(0, 2) ?? [],
    },
  });
  const events = (data._embedded?.events ?? []).map((item) => {
    const venue = item._embedded?.venues?.[0] ?? {};
    const start = item.dates?.start?.dateTime;
    return {
      id: stableId("Ticketmaster", item.id),
      source: "Ticketmaster",
      sourceId: item.id,
      title: item.name,
      start,
      end: null,
      allDay: !item.dates?.start?.dateTime,
      venue: venue.name ?? "",
      address: [venue.address?.line1, venue.city?.name, venue.state?.stateCode]
        .filter(Boolean)
        .join(", "),
      url: item.url,
      category: item.classifications?.[0]?.segment?.name ?? "Live event",
      description: item.info ?? item.pleaseNote ?? "",
      status: item.dates?.status?.code === "cancelled" ? "cancelled" : "active",
    };
  }).filter(activeInRange);
  return { events, request: url.toString().replace(apiKey, "REDACTED") };
}

async function fetchSeatGeek() {
  const clientId = process.env.SEATGEEK_CLIENT_ID;
  if (!clientId) return { skipped: true, events: [], request: "Client ID not configured" };
  const url = new URL("https://api.seatgeek.com/2/events");
  url.search = new URLSearchParams({
    client_id: clientId,
    lat: "38.9517",
    lon: "-92.3341",
    range: "15mi",
    "datetime_utc.gte": now.toISOString().slice(0, 19),
    "datetime_utc.lte": endDate.toISOString().slice(0, 19),
    sort: "datetime_utc.asc",
    per_page: "100",
  });
  const data = await (await request(url)).json();
  await writeEvidence("seatgeek-response-sample.json", {
    request: url.toString().replace(clientId, "REDACTED"),
    response: { meta: data.meta, events: data.events?.slice(0, 2) ?? [] },
  });
  const events = (data.events ?? [])
    .filter(
      (item) =>
        item.venue?.city?.toLowerCase() === "columbia" &&
        item.venue?.state?.toUpperCase() === "MO",
    )
    .map((item) => ({
      id: stableId("SeatGeek", item.id),
      source: "SeatGeek",
      sourceId: String(item.id),
      title: item.title,
      start: new Date(item.datetime_utc).toISOString(),
      end: null,
      allDay: false,
      venue: item.venue?.name ?? "",
      address: [item.venue?.address, item.venue?.extended_address]
        .filter(Boolean)
        .join(", "),
      url: item.url,
      category: item.type ?? "Live event",
      description: item.description ?? "",
      status: item.status === "canceled" ? "cancelled" : "active",
    }))
    .filter(activeInRange);
  return { events, request: url.toString().replace(clientId, "REDACTED") };
}

const sourceDefinitions = [
  ["Mizzou", fetchMizzou, "Public LiveWhale JSON API; physical locations only."],
  ["City of Columbia", fetchCity, "Official public iCalendar feed."],
  ["Columbia Chamber", fetchChamber, "Public Chamber calendar cards and detail pages."],
  ["The Blue Note", fetchBlueNote, "Official venue event calendar."],
  ["Rose Music Hall", fetchRoseMusicHall, "Official venue event calendar."],
  ["MyHouse", fetchMyHouse, "Public Posh venue event JSON feed."],
  ["Visit Columbia", fetchVisitColumbia, "Official tourism calendar and event details."],
  ["Ticketmaster", fetchTicketmaster, "Optional; enabled with TICKETMASTER_API_KEY."],
  ["SeatGeek", fetchSeatGeek, "Optional; enabled with SEATGEEK_CLIENT_ID."],
];

await mkdir(OUT_DIR, { recursive: true });
await mkdir(PUBLIC_OUT_DIR, { recursive: true });
await mkdir(EVIDENCE_DIR, { recursive: true });

let previousCache = { events: [], sources: [] };
try {
  previousCache = JSON.parse(
    await readFile(path.join(PUBLIC_OUT_DIR, "events.json"), "utf8"),
  );
} catch {
  // A missing or invalid cache is expected on the first run.
}

const allEvents = [];
const sources = [];

for (const [name, fetcher, note] of sourceDefinitions) {
  process.stdout.write(`Fetching ${name}... `);
  try {
    const result = await fetcher();
    allEvents.push(...result.events);
    sources.push({
      name,
      status: result.skipped ? "skipped" : "ok",
      count: result.events.length,
      request: result.request,
      note,
    });
    console.log(result.skipped ? "skipped" : `${result.events.length} events`);
  } catch (error) {
    const savedEvents = (previousCache.events ?? []).filter(
      (event) => event.source === name && activeInRange(event),
    );
    allEvents.push(...savedEvents);
    sources.push({
      name,
      status: savedEvents.length ? "stale" : "error",
      count: savedEvents.length,
      request: "",
      note: `${note} Refresh failed; ${savedEvents.length ? "showing last saved events" : "no saved events available"}. Error: ${error.message}`,
    });
    console.log(
      `failed: ${error.message}${savedEvents.length ? `; kept ${savedEvents.length} saved events` : ""}`,
    );
  }
}

const events = deduplicate(allEvents).sort((a, b) => a.start.localeCompare(b.start));
for (const source of sources) {
  if (["ok", "stale"].includes(source.status)) {
    source.count = events.filter((event) => event.source === source.name).length;
  }
}
const cache = {
  generatedAt: new Date().toISOString(),
  timezone: TIMEZONE,
  range: { start: rangeStart, end: rangeEnd },
  events,
  sources,
};

await writeFile(
  path.join(OUT_DIR, "events.json"),
  `${JSON.stringify(cache, null, 2)}\n`,
  "utf8",
);
await writeFile(
  path.join(PUBLIC_OUT_DIR, "events.json"),
  `${JSON.stringify(cache, null, 2)}\n`,
  "utf8",
);

await writeFile(
  path.join(EVIDENCE_DIR, "summary.json"),
  `${JSON.stringify({ generatedAt: cache.generatedAt, sources }, null, 2)}\n`,
  "utf8",
);

console.log(
  `Wrote ${events.length} deduplicated events to src/data/events.json and public/data/events.json`,
);
