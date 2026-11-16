"use client";

import Script from "next/script";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";

import { bookingBootstrap, bookingUi } from "./booking.config";

/** Commands exposed by the namespaced Cal.com embed runtime. */
type BookingApi = (command: string, config?: Record<string, unknown>) => void;

/**
 * Reads the booking namespace after the official bootstrap has initialized it.
 *
 * @returns The namespaced embed API, when available.
 */
function bookingApi(): BookingApi | undefined {
  return (window as Window & { Cal?: { ns?: { meeting?: BookingApi } } }).Cal?.ns?.meeting;
}

/**
 * Enhances a booking link with a themed Cal.com popup while retaining native navigation as a fallback.
 *
 * @param href - Validated booking destination.
 * @param className - Styling supplied by the owning action.
 * @param slot - Optional `data-slot` value letting grouping controls recognize the link.
 * @param children - Booking link content.
 * @returns A native link and, for Cal.com destinations, the deferred embed scripts.
 */
export function BookingLink({ href, className, slot, children }: {
  href: string;
  className: string;
  slot?: string;
  children: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [ready, setReady] = useState(false);
  const url = new URL(href);
  const calLink = url.hostname === "cal.com" ? `${url.pathname.slice(1)}${url.search}` : undefined;

  useEffect(() => {
    if (!ready) return;

    /**
     * Dismisses Cal's popup even in loading and error states ignored by its default Escape handler.
     *
     * @param event - Host document keyboard event.
     */
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") bookingApi()?.("closeModal");
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("keydown", closeOnEscape); };
  }, [ready]);

  return (
    <>
      <a
        aria-haspopup={calLink && ready ? "dialog" : undefined}
        className={className}
        data-slot={slot}
        href={href}
        onClick={(event) => {
          const api = bookingApi();
          if (!calLink || !ready || !api || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

          event.preventDefault();
          event.currentTarget.focus();
          const theme = resolvedTheme === "dark" ? "dark" : "light";
          api("ui", { ...bookingUi, theme });
          api("modal", {
            calLink,
            config: { theme, layout: bookingUi.layout, useSlotsViewOnSmallScreen: "true" },
          });
        }}
        rel="noreferrer"
        target="_blank"
      >
        {children}
      </a>
      {calLink && (
        <>
          <Script id="cal-booking-bootstrap" onReady={() => { setBootstrapped(true); }} strategy="afterInteractive">
            {bookingBootstrap}
          </Script>
          {bootstrapped && (
            <Script
              // A second link reusing the cached request is notified through onLoad only.
              onLoad={() => { setReady(true); }}
              onReady={() => { setReady(true); }}
              src="https://app.cal.com/embed/embed.js"
              strategy="afterInteractive"
            />
          )}
        </>
      )}
    </>
  );
}
