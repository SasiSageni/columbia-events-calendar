"use client";

import { useMemo, useState } from "react";
import type { CalendarEvent, EventCache, EventSource } from "@/lib/types";

const SOURCE_COLORS: Record<EventSource, string> = {
  Mizzou: "#f3b61f",
  "City of Columbia": "#54a7a0",
  "Columbia Chamber": "#e46f51",
  Ticketmaster: "#5b75b9",
  SeatGeek: "#9b78b4",
};

const SOURCE_SHORT: Record<EventSource, string> = {
  Mizzou: "MU",
  "City of Columbia": "CITY",
  "Columbia Chamber": "COC",
  Ticketmaster: "TM",
  SeatGeek: "SG",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function chicagoDateKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatEventTime(event: CalendarEvent) {
  if (event.allDay) return "All day";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(event.start));
}

function formatLongDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function makeMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { date, key, inMonth: date.getMonth() === month };
  });
}

function sourceInitials(source: string) {
  return source
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2);
}

export function CalendarApp({ cache }: { cache: EventCache }) {
  const now = new Date();
  const firstEvent = cache.events[0] ? new Date(cache.events[0].start) : now;
  const initial =
    cache.events.some(
      (event) =>
        new Date(event.start).getFullYear() === now.getFullYear() &&
        new Date(event.start).getMonth() === now.getMonth(),
    )
      ? now
      : firstEvent;

  const [cursor, setCursor] = useState({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  });
  const [selectedDay, setSelectedDay] = useState(
    chicagoDateKey(initial.toISOString()),
  );
  const [query, setQuery] = useState("");
  const [enabledSources, setEnabledSources] = useState<Set<EventSource>>(
    () => new Set(cache.sources.filter((item) => item.status === "ok").map((item) => item.name)),
  );

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return cache.events.filter((event) => {
      if (!enabledSources.has(event.source) || event.status === "cancelled") {
        return false;
      }
      if (!normalized) return true;
      return [event.title, event.venue, event.category, event.description]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [cache.events, enabledSources, query]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of visibleEvents) {
      const key = chicagoDateKey(event.start);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    for (const events of grouped.values()) {
      events.sort((a, b) => a.start.localeCompare(b.start));
    }
    return grouped;
  }, [visibleEvents]);

  const monthDays = makeMonthDays(cursor.year, cursor.month);
  const selectedEvents = eventsByDay.get(selectedDay) ?? [];
  const activeSourceCount = cache.sources.filter((source) => source.status === "ok").length;

  function moveMonth(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
    setSelectedDay(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`,
    );
  }

  function goToday() {
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDay(chicagoDateKey(now.toISOString()));
  }

  function toggleSource(source: EventSource) {
    setEnabledSources((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#calendar" aria-label="What's On Columbia home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>WHAT&apos;S ON</strong>
            <small>COLUMBIA, MISSOURI</small>
          </span>
        </a>
        <div className="header-meta">
          <span className="live-dot" />
          Updated{" "}
          {new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Chicago",
          }).format(new Date(cache.generatedAt))}
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">
          <span>{visibleEvents.length} upcoming events</span>
          <span>{activeSourceCount} local sources</span>
        </div>
        <h1>Find your next<br />good day out.</h1>
        <p>
          One clear calendar for campus talks, city gatherings, business events,
          live shows, and everything Columbia has coming up.
        </p>
      </section>

      <section className="toolbar" aria-label="Calendar controls">
        <div className="month-controls">
          <button onClick={() => moveMonth(-1)} aria-label="Previous month">
            ←
          </button>
          <h2>
            {MONTHS[cursor.month]} <span>{cursor.year}</span>
          </h2>
          <button onClick={() => moveMonth(1)} aria-label="Next month">
            →
          </button>
          <button className="today-button" onClick={goToday}>
            Today
          </button>
        </div>
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events or venues"
          />
        </label>
      </section>

      <section className="source-filters" aria-label="Filter by event source">
        <span className="filter-label">Sources</span>
        {cache.sources.map((source) => (
          <button
            key={source.name}
            type="button"
            disabled={source.status !== "ok"}
            aria-pressed={enabledSources.has(source.name)}
            onClick={() => toggleSource(source.name)}
            className={enabledSources.has(source.name) ? "active" : ""}
          >
            <i style={{ background: SOURCE_COLORS[source.name] }} />
            {source.name}
            <span>{source.count}</span>
          </button>
        ))}
      </section>

      <section className="calendar-layout" id="calendar">
        <div className="calendar-card">
          <div className="weekday-row">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="month-grid">
            {monthDays.map(({ date, key, inMonth }) => {
              const dayEvents = eventsByDay.get(key) ?? [];
              const isSelected = key === selectedDay;
              const isToday = key === chicagoDateKey(now.toISOString());
              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    "day-cell",
                    inMonth ? "" : "outside",
                    isSelected ? "selected" : "",
                    isToday ? "is-today" : "",
                  ].join(" ")}
                  onClick={() => setSelectedDay(key)}
                  aria-label={`${formatLongDate(key)}, ${dayEvents.length} events`}
                >
                  <span className="date-number">{date.getDate()}</span>
                  <span className="cell-events">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        className="calendar-event"
                        key={event.id}
                        style={{
                          borderLeftColor: SOURCE_COLORS[event.source],
                        }}
                      >
                        <b>{formatEventTime(event)}</b>
                        {event.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="more-events">+{dayEvents.length - 3} more</span>
                    )}
                  </span>
                  <span className="mobile-dots" aria-hidden="true">
                    {dayEvents.slice(0, 4).map((event) => (
                      <i
                        key={event.id}
                        style={{ background: SOURCE_COLORS[event.source] }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="day-agenda" aria-live="polite">
          <div className="agenda-heading">
            <span>{selectedDay.slice(-2)}</span>
            <div>
              <p>{formatLongDate(selectedDay).split(",")[0]}</p>
              <h3>
                {formatLongDate(selectedDay).replace(/^[^,]+,\s*/, "")}
              </h3>
            </div>
          </div>
          <p className="agenda-count">
            {selectedEvents.length
              ? `${selectedEvents.length} event${selectedEvents.length === 1 ? "" : "s"}`
              : "No events scheduled"}
          </p>

          <div className="agenda-list">
            {selectedEvents.map((event) => (
              <article className="agenda-event" key={event.id}>
                <div
                  className="source-badge"
                  style={{ background: SOURCE_COLORS[event.source] }}
                  title={event.source}
                >
                  {SOURCE_SHORT[event.source] ?? sourceInitials(event.source)}
                </div>
                <div>
                  <p className="event-time">{formatEventTime(event)}</p>
                  <h4>{event.title}</h4>
                  <p className="event-location">
                    {event.venue || event.address || "Location not listed"}
                  </p>
                  <a href={event.url} target="_blank" rel="noreferrer">
                    View original listing <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
          {!selectedEvents.length && (
            <div className="empty-state">
              <span aria-hidden="true">◇</span>
              <p>Try another date or turn on more sources.</p>
            </div>
          )}
        </aside>
      </section>

      <footer>
        <p>
          Built for Columbia. Event details belong to their original publishers.
        </p>
        <div>
          {cache.sources
            .filter((source) => source.status === "ok")
            .map((source) => (
              <span key={source.name}>
                <i style={{ background: SOURCE_COLORS[source.name] }} />
                {source.name}
              </span>
            ))}
        </div>
      </footer>
    </main>
  );
}
