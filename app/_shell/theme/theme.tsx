"use client";

import { Moon, Sun, SunMoon } from "lucide-react";
import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";
import { useSyncExternalStore, type ReactNode } from "react";

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
    <NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeReadyMarker />
      {children}
    </NextThemeProvider>
  );
}

/**
 * Toggles the resolved color theme after hydration.
 *
 * @param labels - YAML-authored accessible labels for each theme state.
 * @returns The accessible theme toggle.
 */
export function ThemeToggle({ labels }: { labels: {
  change: string;
  switchToDark: string;
  switchToLight: string;
} }) {
  const mounted = useHydrated();
  const { resolvedTheme, setTheme } = useTheme();

  const dark = mounted && resolvedTheme === "dark";
  const label = mounted
    ? (dark ? labels.switchToLight : labels.switchToDark)
    : labels.change;
  const Icon = mounted ? (dark ? Sun : Moon) : SunMoon;

  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xl:size-8"
      data-slot="theme-toggle"
      disabled={!mounted}
      onClick={() => {
        setTheme(dark ? "light" : "dark");
      }}
    >
      <Icon aria-hidden className="size-ui-icon opacity-70" />
    </button>
  );
}
