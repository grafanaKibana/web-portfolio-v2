/**
 * Formats a clock value for the configured locale and time zone.
 *
 * @param date - Clock value to format.
 * @param locale - Locale used for formatting.
 * @param timeZone - IANA time zone used for formatting.
 * @returns The clock time and short zone label.
 */
export function formatLocalTime(date: Date, locale: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(date);
  const time = `${parts.find(({ type }) => type === "hour")?.value}:${parts.find(({ type }) => type === "minute")?.value}`;
  const zone = parts.find(({ type }) => type === "timeZoneName")?.value;
  return zone ? `${time} (${zone})` : time;
}
