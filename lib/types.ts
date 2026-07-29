export type EventSource =
  | "Mizzou"
  | "City of Columbia"
  | "Columbia Chamber"
  | "Ticketmaster"
  | "SeatGeek";

export type CalendarEvent = {
  id: string;
  source: EventSource;
  sourceId: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  venue: string;
  address: string;
  url: string;
  category: string;
  description: string;
  status: "active" | "cancelled";
};

export type EventCache = {
  generatedAt: string;
  timezone: "America/Chicago";
  range: { start: string; end: string };
  events: CalendarEvent[];
  sources: Array<{
    name: EventSource;
    status: "ok" | "skipped" | "error";
    count: number;
    request: string;
    note: string;
  }>;
};
