import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeHtml,
  deduplicate,
  parseIcs,
  stableId,
  toChicagoIso,
} from "../scripts/lib/normalize.mjs";

test("decodes HTML entities and removes markup", () => {
  assert.equal(
    decodeHtml("<p>Arts &amp; Culture&nbsp;Night</p>"),
    "Arts & Culture Night",
  );
});

test("converts Columbia local time to UTC across daylight saving", () => {
  assert.equal(toChicagoIso("2026-08-07T08:15"), "2026-08-07T13:15:00.000Z");
  assert.equal(toChicagoIso("2026-12-07T08:15"), "2026-12-07T14:15:00.000Z");
});

test("parses folded iCalendar events", () => {
  const events = parseIcs(
    [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:abc-123",
      "DTSTART;TZID=America/Chicago:20260807T081500",
      "DTEND;TZID=America/Chicago:20260807T093000",
      "SUMMARY:Small Business Roundtable",
      "LOCATION:300 S Providence\\, Columbia\\, MO",
      "DESCRIPTION:Meet local",
      " leaders",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].location, "300 S Providence, Columbia, MO");
  assert.equal(events[0].description, "Meet localleaders");
  assert.equal(events[0].start, "2026-08-07T13:15:00.000Z");
});

test("stable IDs are deterministic and compact", () => {
  assert.equal(stableId("Mizzou", "123"), stableId("Mizzou", "123"));
  assert.equal(stableId("Mizzou", "123").length, 18);
});

test("deduplicates same-title, day, and venue events", () => {
  const base = {
    title: "Summer Concert!",
    start: "2026-08-01T00:00:00.000Z",
    venue: "Rose Park",
  };
  assert.equal(
    deduplicate([
      { ...base, id: "1", source: "A" },
      { ...base, id: "2", source: "B", title: "Summer Concert" },
    ]).length,
    1,
  );
});

test("deduplicates cross-source matches with slightly different venue labels", () => {
  const base = {
    title: "First Friday",
    start: "2026-08-07T23:00:00.000Z",
    allDay: false,
  };
  assert.equal(
    deduplicate([
      { ...base, id: "1", source: "Visit Columbia", venue: "North Village Arts District" },
      { ...base, id: "2", source: "City of Columbia", venue: "North Village" },
    ]).length,
    1,
  );
});

test("keeps separate same-title sessions at one venue", () => {
  const base = {
    title: "Museum Tour",
    allDay: false,
    source: "Mizzou",
    venue: "Museum of Art and Archaeology",
  };
  assert.equal(
    deduplicate([
      { ...base, id: "1", start: "2026-08-07T15:00:00.000Z" },
      { ...base, id: "2", start: "2026-08-07T19:00:00.000Z" },
    ]).length,
    2,
  );
});

test("deduplicates address variants from the same source", () => {
  const base = {
    title: "One Stop Shop",
    start: "2026-08-15T14:00:00.000Z",
    allDay: false,
    source: "Mizzou",
  };
  assert.equal(
    deduplicate([
      { ...base, id: "1", venue: "MU Student Center Main Floor Columbia MO" },
      {
        ...base,
        id: "2",
        venue: "MU Student Center Main Floor 901 E Rollins St Columbia MO",
      },
    ]).length,
    1,
  );
});

test("deduplicates identical titles and starts when venue metadata conflicts", () => {
  const base = {
    title: "Welcome Week Info Booking",
    start: "2026-08-21T03:00:00.000Z",
    allDay: false,
    source: "Mizzou",
  };
  assert.equal(
    deduplicate([
      { ...base, id: "1", venue: "Francis Quad" },
      { ...base, id: "2", venue: "Peace Park" },
    ]).length,
    1,
  );
});
