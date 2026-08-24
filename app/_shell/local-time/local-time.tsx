"use client";

import { useEffect, useState } from "react";
import { formatLocalTime } from "@/content/format-time";

interface LocalTimeProps {
  initialTime: string;
  locale: string;
  timeZone: string;
}

/**
 * Keeps the server-rendered portfolio local time current after hydration.
 *
 * @param initialTime - Server-rendered time used through hydration.
 * @param locale - Locale used for clock formatting.
 * @param timeZone - IANA time zone displayed by the clock.
 * @returns The updating local-time element.
 */
export function LocalTime({ initialTime, locale, timeZone }: LocalTimeProps) {
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    /** Refreshes the displayed minute from the configured time zone. */
    const update = () => {
      setTime(formatLocalTime(new Date(), locale, timeZone));
    };
    update();
    const timer = window.setInterval(update, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [locale, timeZone]);

  return <time>{time}</time>;
}
