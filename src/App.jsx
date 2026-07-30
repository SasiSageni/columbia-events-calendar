import { useCallback, useEffect, useMemo, useState } from "react";
import initialCache from "./data/events.json";

const REFRESH_INTERVAL = 5 * 60 * 1000;

const SOURCE_COLORS = {
  Mizzou: "#f1b82d",
  "City of Columbia": "#2f8f83",
  "Columbia Chamber": "#e46f51",
  "The Blue Note": "#4067a8",
  "Rose Music Hall": "#86bb28",
  MyHouse: "#d9468c",
  "Visit Columbia": "#ef8b2c",
  Ticketmaster: "#5b75b9",
  SeatGeek: "#9b78b4",
};

const SOURCE_SHORT = {
  Mizzou: "MU",
  "City of Columbia": "CITY",
  "Columbia Chamber": "COC",
  "The Blue Note": "BN",
  "Rose Music Hall": "RMH",
  MyHouse: "MH",
  "Visit Columbia": "CVB",
  Ticketmaster: "TM",
  SeatGeek: "SG",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function chicagoDateKey(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatEventTime(event) {
  if (event.allDay) return "All day";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(event.start));
}

function formatLongDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatUpdatedAt(iso) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  }).format(new Date(iso));
}

function makeMonthDays(year, month) {
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

function sourceInitials(source) {
  return source.split(" ").map((word) => word[0]).join("").slice(0, 2);
}

function sourceColor(source) {
  return SOURCE_COLORS[source] ?? "#64748b";
}

function calendarDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function googleCalendarUrl(event) {
  const start = calendarDate(event.start);
  const end = calendarDate(event.end ?? new Date(new Date(event.start).getTime() + 2 * 60 * 60 * 1000));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    details: `${event.description || "Event in Columbia, Missouri"}\n\nOriginal listing: ${event.url}`,
    location: [event.venue, event.address].filter(Boolean).join(", "),
    ctz: "America/Chicago",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function escapeIcs(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function downloadIcs(event) {
  const end = event.end ?? new Date(new Date(event.start).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//What's On Columbia//Events//EN",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(event.id)}@whatsoncolumbia`,
    `DTSTAMP:${calendarDate(new Date().toISOString())}`,
    `DTSTART:${calendarDate(event.start)}`,
    `DTEND:${calendarDate(end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs([event.venue, event.address].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${escapeIcs(`${event.description || ""}\n${event.url}`)}`,
    `URL:${escapeIcs(event.url)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blobUrl = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "event"}.ics`;
  link.click();
  URL.revokeObjectURL(blobUrl);
}

function EventModal({ event, saved, onClose, onToggleSaved }) {
  useEffect(() => {
    function handleKey(eventKey) {
      if (eventKey.key === "Escape") onClose();
    }
    document.body.classList.add("modal-open");
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  if (!event) return null;
  const eventDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(event.start));

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="event-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
        onMouseDown={(click) => click.stopPropagation()}
      >
        <div className="modal-accent" style={{ background: sourceColor(event.source) }} />
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close event details">×</button>
        <div className="modal-source">
          <i style={{ background: sourceColor(event.source) }} />
          {event.source}
        </div>
        <h2 id="event-modal-title">{event.title}</h2>
        <div className="modal-facts">
          <div><span aria-hidden="true">◷</span><p><b>{eventDate}</b>{formatEventTime(event)}</p></div>
          <div><span aria-hidden="true">⌖</span><p><b>{event.venue || "Columbia, Missouri"}</b>{event.address || "Columbia, MO"}</p></div>
        </div>
        {event.description && <p className="modal-description">{event.description}</p>}
        <div className="modal-actions">
          <button type="button" className={saved ? "saved" : ""} onClick={() => onToggleSaved(event.id)}>
            <span aria-hidden="true">{saved ? "♥" : "♡"}</span>
            {saved ? "Saved" : "Save event"}
          </button>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">Google Calendar</a>
          <button type="button" onClick={() => downloadIcs(event)}>Download .ics</button>
        </div>
        <a className="modal-original" href={event.url} target="_blank" rel="noreferrer">
          View original event listing <span aria-hidden="true">↗</span>
        </a>
      </section>
    </div>
  );
}

export default function App() {
  const now = new Date();
  const firstEvent = initialCache.events[0]
    ? new Date(initialCache.events[0].start)
    : now;
  const initial = initialCache.events.some(
    (event) =>
      new Date(event.start).getFullYear() === now.getFullYear() &&
      new Date(event.start).getMonth() === now.getMonth(),
  ) ? now : firstEvent;

  const [data, setData] = useState(initialCache);
  const [cursor, setCursor] = useState({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  });
  const [selectedDay, setSelectedDay] = useState(chicagoDateKey(initial.toISOString()));
  const [query, setQuery] = useState("");
  const [view, setView] = useState("month");
  const [quickFilter, setQuickFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [savedEvents, setSavedEvents] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("como-saved-events") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [enabledSources, setEnabledSources] = useState(
    () => new Set(initialCache.sources.filter((item) => ["ok", "stale"].includes(item.status)).map((item) => item.name)),
  );
  const [refreshState, setRefreshState] = useState("idle");
  const [nextRefreshAt, setNextRefreshAt] = useState(Date.now() + REFRESH_INTERVAL);
  const [countdown, setCountdown] = useState("5:00");

  useEffect(() => {
    localStorage.setItem("como-saved-events", JSON.stringify([...savedEvents]));
  }, [savedEvents]);

  const refreshEvents = useCallback(async () => {
    setRefreshState("refreshing");
    try {
      // In local development/preview this endpoint refreshes every upstream API.
      // Static hosts may omit it; the public cache is still rechecked below.
      await fetch(`/api/refresh-events?t=${Date.now()}`, {
        cache: "no-store",
      }).catch(() => null);

      const response = await fetch(`/data/events.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Event feed returned ${response.status}`);
      const freshData = await response.json();
      if (!Array.isArray(freshData.events)) throw new Error("Invalid event feed");

      setData(freshData);
      setEnabledSources((current) => {
        const available = freshData.sources
          .filter((source) => ["ok", "stale"].includes(source.status))
          .map((source) => source.name);
        const next = new Set(available.filter((source) => current.has(source)));
        return next.size ? next : new Set(available);
      });
      setRefreshState("success");
    } catch (error) {
      console.error("Could not refresh events:", error);
      setRefreshState("error");
    } finally {
      setNextRefreshAt(Date.now() + REFRESH_INTERVAL);
    }
  }, []);

  useEffect(() => {
    const refreshTimer = window.setInterval(refreshEvents, REFRESH_INTERVAL);
    const countdownTimer = window.setInterval(() => {
      const remaining = Math.max(0, nextRefreshAt - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${minutes}:${String(seconds).padStart(2, "0")}`);
    }, 1000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(countdownTimer);
    };
  }, [nextRefreshAt, refreshEvents]);

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const today = chicagoDateKey(new Date().toISOString());
    const current = new Date();
    const daysToSaturday = (6 - current.getDay() + 7) % 7;
    const saturday = new Date(current.getFullYear(), current.getMonth(), current.getDate() + daysToSaturday);
    const sunday = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() + 1);
    const weekendKeys = new Set([
      chicagoDateKey(saturday.toISOString()),
      chicagoDateKey(sunday.toISOString()),
    ]);
    return data.events.filter((event) => {
      if (!enabledSources.has(event.source) || event.status === "cancelled") return false;
      const searchable = [event.title, event.venue, event.category, event.description]
        .join(" ")
        .toLowerCase();
      const eventDay = chicagoDateKey(event.start);
      if (quickFilter === "today" && eventDay !== today) return false;
      if (quickFilter === "weekend" && !weekendKeys.has(eventDay)) return false;
      if (quickFilter === "free" && !/\b(free|no cost|complimentary)\b/.test(searchable)) return false;
      if (quickFilter === "family" && !/\b(family|families|kids|children|youth|all ages)\b/.test(searchable)) return false;
      if (
        quickFilter === "nightlife" &&
        !["The Blue Note", "Rose Music Hall", "MyHouse"].includes(event.source) &&
        !/\b(party|nightlife|concert|live music|dj|dance|bar crawl|comedy|21\+|festival)\b/.test(searchable)
      ) return false;
      if (quickFilter === "saved" && !savedEvents.has(event.id)) return false;
      if (!normalized) return true;
      return searchable.includes(normalized);
    });
  }, [data.events, enabledSources, query, quickFilter, savedEvents]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map();
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
  const listGroups = useMemo(() => {
    const groups = [];
    for (const event of visibleEvents.slice(0, 150)) {
      const key = chicagoDateKey(event.start);
      const last = groups.at(-1);
      if (last?.key === key) last.events.push(event);
      else groups.push({ key, events: [event] });
    }
    return groups;
  }, [visibleEvents]);
  const activeSourceCount = data.sources.filter(
    (source) => ["ok", "stale"].includes(source.status),
  ).length;
  const todayKey = chicagoDateKey(now.toISOString());

  function moveMonth(delta) {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
    setSelectedDay(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`,
    );
  }

  function goToday() {
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDay(todayKey);
  }

  function toggleSource(source) {
    setEnabledSources((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  function toggleSaved(eventId) {
    setSavedEvents((current) => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  function applyQuickFilter(value) {
    setQuickFilter(value);
    if (value === "today") {
      goToday();
      setView("list");
    } else if (value === "weekend") {
      setView("list");
    }
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#calendar" aria-label="What's On Columbia home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>
            <strong>WHAT&apos;S ON</strong>
            <small>COLUMBIA, MISSOURI</small>
          </span>
        </a>
        <button
          className={`refresh-status ${refreshState}`}
          type="button"
          onClick={refreshEvents}
          disabled={refreshState === "refreshing"}
          title="Refresh event sources now"
        >
          <span className="live-dot" />
          <span className="refresh-copy">
            <strong>
              {refreshState === "refreshing" ? "Refreshing sources…" : `Next refresh in ${countdown}`}
            </strong>
            <small>Updated {formatUpdatedAt(data.generatedAt)}</small>
          </span>
          <span className="refresh-icon" aria-hidden="true">↻</span>
        </button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span>{visibleEvents.length} upcoming events</span>
            <span>{activeSourceCount} trusted local sources</span>
          </div>
          <h1>Make plans.<br /><em>Love Columbia.</em></h1>
          <p>
            The best of campus, culture, community, and live entertainment—
            gathered into one beautifully simple local calendar.
          </p>
          <a className="explore-link" href="#calendar">
            Explore the calendar <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="art-card art-card-one"><b>29</b><small>JUL</small></span>
          <span className="art-card art-card-two"><b>COMO</b><small>WHAT&apos;S NEXT?</small></span>
          <span className="art-sun" />
          <span className="art-star">✦</span>
        </div>
      </section>

      <section className="calendar-section" id="calendar">
        <div className="section-intro">
          <div>
            <span className="section-kicker">Your local guide</span>
            <h2>What&apos;s happening</h2>
          </div>
          <div className="view-switcher" aria-label="Calendar view">
            <button
              type="button"
              className={view === "month" ? "active" : ""}
              onClick={() => setView("month")}
              aria-pressed={view === "month"}
            >
              <span aria-hidden="true">▦</span> Month
            </button>
            <button
              type="button"
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
            >
              <span aria-hidden="true">☷</span> List
            </button>
          </div>
        </div>

        <div className="toolbar" aria-label="Calendar controls">
          <div className="month-controls">
            <button onClick={() => moveMonth(-1)} aria-label="Previous month">←</button>
            <h3>{MONTHS[cursor.month]} <span>{cursor.year}</span></h3>
            <button onClick={() => moveMonth(1)} aria-label="Next month">→</button>
            <button className="today-button" onClick={goToday}>Today</button>
          </div>
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search events or venues"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>
            )}
          </label>
        </div>

        <div className="source-filters" aria-label="Filter by event source">
          <span className="filter-label">Showing</span>
          {data.sources.map((source) => (
            <button
              key={source.name}
              type="button"
              disabled={!["ok", "stale"].includes(source.status)}
              aria-pressed={enabledSources.has(source.name)}
              onClick={() => toggleSource(source.name)}
              className={enabledSources.has(source.name) ? "active" : ""}
            >
              <i style={{ background: sourceColor(source.name) }} />
              {source.name}
              <span>{source.count}</span>
            </button>
          ))}
        </div>

        <div className="quick-filters" aria-label="Quick event filters">
          {[
            ["all", "All events"],
            ["today", "Today"],
            ["weekend", "This weekend"],
            ["nightlife", "Nightlife"],
            ["free", "Free"],
            ["family", "Family"],
            ["saved", `Saved${savedEvents.size ? ` (${savedEvents.size})` : ""}`],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={quickFilter === value ? "active" : ""}
              onClick={() => applyQuickFilter(value)}
              aria-pressed={quickFilter === value}
            >
              {value === "saved" && <span aria-hidden="true">♡</span>}
              {label}
            </button>
          ))}
          <span className="results-count">{visibleEvents.length} results</span>
        </div>

        {view === "month" ? (
        <div className="calendar-layout">
          <div className="calendar-card">
            <div className="weekday-row">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="month-grid">
              {monthDays.map(({ date, key, inMonth }) => {
                const dayEvents = eventsByDay.get(key) ?? [];
                const isSelected = key === selectedDay;
                const isToday = key === todayKey;
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
                          style={{ "--event-color": sourceColor(event.source) }}
                          role="button"
                          tabIndex="0"
                          onClick={(click) => {
                            click.stopPropagation();
                            setSelectedEvent(event);
                          }}
                          onKeyDown={(keyEvent) => {
                            if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                              keyEvent.preventDefault();
                              keyEvent.stopPropagation();
                              setSelectedEvent(event);
                            }
                          }}
                        >
                          <b>{formatEventTime(event)}</b>{event.title}
                        </span>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="more-events">+{dayEvents.length - 3} more</span>
                      )}
                    </span>
                    <span className="mobile-dots" aria-hidden="true">
                      {dayEvents.slice(0, 4).map((event) => (
                        <i key={event.id} style={{ background: sourceColor(event.source) }} />
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
                <h3>{formatLongDate(selectedDay).replace(/^[^,]+,\s*/, "")}</h3>
              </div>
            </div>
            <p className="agenda-count">
              {selectedEvents.length
                ? `${selectedEvents.length} event${selectedEvents.length === 1 ? "" : "s"}`
                : "No events scheduled"}
            </p>

            <div className="agenda-list">
              {selectedEvents.map((event) => (
                <article
                  className="agenda-event"
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                >
                  <div
                    className="source-badge"
                    style={{ background: sourceColor(event.source) }}
                    title={event.source}
                  >
                    {SOURCE_SHORT[event.source] ?? sourceInitials(event.source)}
                  </div>
                  <div>
                    <p className="event-time">{formatEventTime(event)}</p>
                    <h4>{event.title}</h4>
                    <p className="event-location">
                      <span aria-hidden="true">⌖</span>
                      {event.venue || event.address || "Location not listed"}
                    </p>
                    <div className="agenda-actions">
                      <button
                        type="button"
                        className={savedEvents.has(event.id) ? "saved" : ""}
                        onClick={(click) => {
                          click.stopPropagation();
                          toggleSaved(event.id);
                        }}
                        aria-label={savedEvents.has(event.id) ? "Remove from saved events" : "Save event"}
                      >
                        {savedEvents.has(event.id) ? "♥ Saved" : "♡ Save"}
                      </button>
                      <button type="button" onClick={() => setSelectedEvent(event)}>
                        Details <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!selectedEvents.length && (
              <div className="empty-state">
                <span aria-hidden="true">◇</span>
                <h4>A quiet day—for now.</h4>
                <p>Try another date or turn on more sources.</p>
              </div>
            )}
          </aside>
        </div>
        ) : (
          <section className="list-view" aria-label="Upcoming event list">
            {listGroups.length ? listGroups.map((group) => (
              <div className="list-day" key={group.key}>
                <div className="list-date">
                  <span>{group.key.slice(-2)}</span>
                  <div>
                    <b>{formatLongDate(group.key).split(",")[0]}</b>
                    <small>{formatLongDate(group.key).replace(/^[^,]+,\s*/, "")}</small>
                  </div>
                </div>
                <div className="list-events">
                  {group.events.map((event) => (
                    <article
                      className="list-event"
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                    >
                      <i className="list-source-line" style={{ background: sourceColor(event.source) }} />
                      <div className="list-time">{formatEventTime(event)}</div>
                      <div className="list-event-copy">
                        <span>{event.source}</span>
                        <h3>{event.title}</h3>
                        <p>⌖ {event.venue || event.address || "Columbia, Missouri"}</p>
                      </div>
                      <button
                        type="button"
                        className={`list-save ${savedEvents.has(event.id) ? "saved" : ""}`}
                        onClick={(click) => {
                          click.stopPropagation();
                          toggleSaved(event.id);
                        }}
                        aria-label={savedEvents.has(event.id) ? "Remove from saved events" : "Save event"}
                      >
                        {savedEvents.has(event.id) ? "♥" : "♡"}
                      </button>
                      <span className="list-arrow" aria-hidden="true">→</span>
                    </article>
                  ))}
                </div>
              </div>
            )) : (
              <div className="list-empty">
                <span aria-hidden="true">◇</span>
                <h3>
                  {quickFilter === "today"
                    ? "No events left today"
                    : quickFilter === "saved"
                      ? "No saved events yet"
                      : "No matching events"}
                </h3>
                <p>
                  {quickFilter === "today"
                    ? "Today’s completed events are hidden. Check what’s coming up next."
                    : quickFilter === "saved"
                      ? "Tap the heart on an event to keep it here."
                      : "Try another filter or search phrase."}
                </p>
                <button type="button" onClick={() => { setQuickFilter("all"); setQuery(""); }}>
                  {quickFilter === "today" ? "See upcoming events" : "Show all events"}
                </button>
              </div>
            )}
          </section>
        )}
      </section>

      <footer>
        <div className="footer-brand">
          <strong>WHAT&apos;S ON, COLUMBIA</strong>
          <p>Built locally from trusted public event listings.</p>
        </div>
        <div className="footer-sources">
          {data.sources.filter((source) => ["ok", "stale"].includes(source.status)).map((source) => (
            <span key={source.name}>
              <i style={{ background: sourceColor(source.name) }} />
              {source.name}
            </span>
          ))}
        </div>
      </footer>
      <div className={`refresh-toast ${refreshState}`}>
        {refreshState === "success" && "Events are up to date"}
        {refreshState === "error" && "Using the latest saved events"}
      </div>
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          saved={savedEvents.has(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          onToggleSaved={toggleSaved}
        />
      )}
    </main>
  );
}
