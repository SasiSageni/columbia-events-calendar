import assert from "node:assert/strict";
import test from "node:test";
import {
  allDayDateRange,
  buildIcsContent,
  googleCalendarUrl,
  weekendDateKeys,
} from "../src/lib/calendar.mjs";

const allDayEvent = {
  id: "all-day-1",
  title: "Community Festival",
  start: "2026-08-08T17:00:00.000Z",
  end: null,
  allDay: true,
  venue: "Peace Park",
  address: "Columbia, MO",
  description: "A full-day festival.",
  url: "https://example.com/festival",
};

test("all-day calendar ranges use Columbia dates and an exclusive end", () => {
  assert.deepEqual(allDayDateRange(allDayEvent), {
    start: "20260808",
    end: "20260809",
  });
});

test("Google Calendar uses date-only values for all-day events", () => {
  const url = new URL(googleCalendarUrl(allDayEvent));
  assert.equal(url.searchParams.get("dates"), "20260808/20260809");
});

test("iCalendar export marks all-day values as DATE", () => {
  const content = buildIcsContent(
    allDayEvent,
    "2026-07-30T04:00:00.000Z",
  );
  assert.match(content, /DTSTART;VALUE=DATE:20260808/);
  assert.match(content, /DTEND;VALUE=DATE:20260809/);
  assert.doesNotMatch(content, /DTSTART:20260808T/);
});

test("timed iCalendar exports retain UTC timestamps", () => {
  const content = buildIcsContent({
    ...allDayEvent,
    allDay: false,
    start: "2026-08-08T23:30:00.000Z",
    end: "2026-08-09T01:00:00.000Z",
  });
  assert.match(content, /DTSTART:20260808T233000Z/);
  assert.match(content, /DTEND:20260809T010000Z/);
});

test("Sunday remains part of the current Columbia weekend", () => {
  assert.deepEqual(
    weekendDateKeys(new Date("2026-08-02T18:00:00.000Z")),
    ["2026-08-01", "2026-08-02"],
  );
});

test("Monday points to the following Columbia weekend", () => {
  assert.deepEqual(
    weekendDateKeys(new Date("2026-08-03T18:00:00.000Z")),
    ["2026-08-08", "2026-08-09"],
  );
});
