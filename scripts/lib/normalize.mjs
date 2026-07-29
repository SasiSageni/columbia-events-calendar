import { createHash } from "node:crypto";

export function decodeHtml(value = "") {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function stableId(source, sourceId) {
  return createHash("sha1")
    .update(`${source}:${sourceId}`)
    .digest("hex")
    .slice(0, 18);
}

export function chicagoDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function toChicagoIso(localValue) {
  if (!localValue) return null;
  if (/Z$|[+-]\d\d:\d\d$/.test(localValue)) {
    return new Date(localValue).toISOString();
  }

  const match = localValue.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const desired = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  let guess = desired;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += desired - represented;
  }
  return new Date(guess).toISOString();
}

function unescapeIcs(value = "") {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDate(value) {
  if (/^\d{8}$/.test(value)) {
    return {
      iso: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00.000Z`,
      allDay: true,
    };
  }
  const normalized = value.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/,
    "$1-$2-$3T$4:$5:$6$7",
  );
  return {
    iso: toChicagoIso(normalized),
    allDay: false,
  };
}

export function parseIcs(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];

  return blocks.map((block) => {
    const fields = {};
    for (const line of block.split(/\r?\n/)) {
      const splitAt = line.indexOf(":");
      if (splitAt === -1) continue;
      const rawKey = line.slice(0, splitAt);
      const key = rawKey.split(";")[0];
      const value = line.slice(splitAt + 1);
      fields[key] ??= value;
    }
    const start = parseIcsDate(fields.DTSTART ?? "");
    const end = fields.DTEND ? parseIcsDate(fields.DTEND) : null;
    return {
      uid: unescapeIcs(fields.UID ?? `${fields.SUMMARY}-${fields.DTSTART}`),
      title: unescapeIcs(fields.SUMMARY),
      start: start.iso,
      end: end?.iso ?? null,
      allDay: start.allDay,
      location: unescapeIcs(fields.LOCATION),
      description: unescapeIcs(fields.DESCRIPTION),
      url: unescapeIcs(fields.URL),
      status: /CANCELLED/i.test(fields.STATUS ?? "") ? "cancelled" : "active",
    };
  });
}

export function normalizeTitle(value) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/\b(cancelled|canceled)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function deduplicate(events) {
  const seen = new Map();
  for (const event of events.sort((a, b) => a.start.localeCompare(b.start))) {
    const day = chicagoDateKey(new Date(event.start));
    const venue = normalizeTitle(event.venue).slice(0, 25);
    const key = `${normalizeTitle(event.title)}|${day}|${venue}`;
    if (!seen.has(key)) seen.set(key, event);
  }
  return [...seen.values()];
}
