import cache from "@/public/data/events.json";
import { CalendarApp } from "@/components/calendar-app";
import type { EventCache } from "@/lib/types";

export default function Home() {
  return <CalendarApp cache={cache as EventCache} />;
}
