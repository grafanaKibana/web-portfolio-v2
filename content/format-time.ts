/**
 * Formats a clock value for the configured locale and time zone.
 *
 * @param date - Clock value to format.
 * @param locale - Locale used for formatting.
 * @param timeZone - IANA time zone used for formatting.
 * @returns The clock time and short zone label.
 * @throws When the formatter omits the requested hour or minute.
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
  const hour = parts.find(({ type }) => type === "hour")?.value;
  const minute = parts.find(({ type }) => type === "minute")?.value;
  if (!hour || !minute) throw new Error("Local-time formatter omitted the hour or minute");

  const time = `${hour}:${minute}`;
  const zone = parts.find(({ type }) => type === "timeZoneName")?.value;
  return zone ? `${time} (${zone})` : time;
}
