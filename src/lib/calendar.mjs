const TIMEZONE = "America/Chicago";

export function chicagoDateKey(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function weekendDateKeys(now = new Date()) {
  const today = chicagoDateKey(now);
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  const daysToSaturday = weekday === 0 ? -1 : 6 - weekday;
  const saturday = addDays(today, daysToSaturday);
  return [saturday, addDays(saturday, 1)];
}

function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function compactDate(dateKey) {
  return dateKey.replaceAll("-", "");
}

function calendarDate(iso) {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function allDayDateRange(event) {
  const start = chicagoDateKey(event.start);
  const providedEnd = event.end ? chicagoDateKey(event.end) : null;
  const end = providedEnd && providedEnd > start
    ? providedEnd
    : addDays(start, 1);
  return { start: compactDate(start), end: compactDate(end) };
}

export function googleCalendarUrl(event) {
  const dates = event.allDay
    ? allDayDateRange(event)
    : {
        start: calendarDate(event.start),
        end: calendarDate(
          event.end ??
            new Date(
              new Date(event.start).getTime() + 2 * 60 * 60 * 1000,
            ).toISOString(),
        ),
      };
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${dates.start}/${dates.end}`,
    details: `${event.description || "Event in Columbia, Missouri"}\n\nOriginal listing: ${event.url}`,
    location: [event.venue, event.address].filter(Boolean).join(", "),
    ctz: TIMEZONE,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function escapeIcs(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildIcsContent(event, generatedAt = new Date().toISOString()) {
  const timedEnd =
    event.end ??
    new Date(
      new Date(event.start).getTime() + 2 * 60 * 60 * 1000,
    ).toISOString();
  const dateLines = event.allDay
    ? (() => {
        const range = allDayDateRange(event);
        return [
          `DTSTART;VALUE=DATE:${range.start}`,
          `DTEND;VALUE=DATE:${range.end}`,
        ];
      })()
    : [
        `DTSTART:${calendarDate(event.start)}`,
        `DTEND:${calendarDate(timedEnd)}`,
      ];

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//What's On Columbia//Events//EN",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(event.id)}@whatsoncolumbia`,
    `DTSTAMP:${calendarDate(generatedAt)}`,
    ...dateLines,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs([event.venue, event.address].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${escapeIcs(`${event.description || ""}\n${event.url}`)}`,
    `URL:${escapeIcs(event.url)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
