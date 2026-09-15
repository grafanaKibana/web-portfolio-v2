"use client";

import { Moon, Sun, SunMoon } from "lucide-react";
import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";
import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Provides the stable no-op subscription required for hydration detection.
 *
 * @returns A no-op unsubscribe callback.
 */
const subscribe = () => () => {};

/**
 * Reports whether React hydration has completed.
 *
 * @returns `false` on the server and `true` after hydration.
 */
function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/**
 * Marks the theme boundary ready once hydration resolves a theme.
 *
 * @returns A hidden readiness marker, or `null` before theme resolution.
 */
function ThemeReadyMarker() {
  const hydrated = useHydrated();
  const { resolvedTheme } = useTheme();

  return hydrated && resolvedTheme ? <span hidden data-theme-root /> : null;
}

/**
 * Provides application-wide theme state around server-rendered content.
 *
 * @param children - Application content that consumes the theme boundary.
 * @returns The configured theme provider.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ThemeReadyMarker />
      {children}
    </NextThemeProvider>
  );
}

/**
 * Cycles between system, light, and dark themes after hydration.
 *
 * @param labels - Accessible labels for each theme state.
 * @returns The accessible theme toggle.
 */
export function ThemeToggle({ labels }: { labels: {
  change: string;
  switchToDark: string;
  switchToLight: string;
  switchToSystem: string;
} }) {
  const mounted = useHydrated();
  const { theme, setTheme } = useTheme();
  const transitionInFlight = useRef(false);

  const selectedTheme = mounted ? (theme ?? "system") : "system";
  const nextTheme = selectedTheme === "system" ? "light" : selectedTheme === "light" ? "dark" : "system";
  const label = mounted
    ? (nextTheme === "light" ? labels.switchToLight : nextTheme === "dark" ? labels.switchToDark : labels.switchToSystem)
    : labels.change;
  const Icon = selectedTheme === "light" ? Sun : selectedTheme === "dark" ? Moon : SunMoon;

  return (
    <Button
      type="button"
      aria-label={label}
      title={mounted ? `Theme: ${selectedTheme}. ${label}` : labels.change}
      className="size-11 xl:size-8"
      data-slot="theme-toggle"
      disabled={!mounted}
      size="icon-sm"
      variant="ghost"
      onClick={() => {
        if (transitionInFlight.current) return;

        if (typeof document.startViewTransition !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setTheme(nextTheme);
          return;
        }

        transitionInFlight.current = true;
        const transition = document.startViewTransition(() => {
          flushSync(() => {
            setTheme(nextTheme);
          });
        });
        void transition.finished.then(
          () => {
            transitionInFlight.current = false;
          },
          () => {
            transitionInFlight.current = false;
          },
        );
      }}
    >
      <Icon aria-hidden />
    </Button>
  );
}
