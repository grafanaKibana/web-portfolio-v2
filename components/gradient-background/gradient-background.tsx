"use client";

import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import { normalizeGradient } from "./gradient-background.helpers";
import type {
  GradientRecipe,
  NormalizedGradient,
} from "./gradient-background.models";
import type { GradientBackgroundProps } from "./gradient-background.types";
import styles from "./gradient-background.module.scss";

const GradientEngine = lazy(
  () => import("./upstream/feral-gradient-engine"),
);

/** State retained by the engine render error boundary. */
interface EngineBoundaryState {
  failed: boolean;
  resetKey: string;
}

/** Properties used to isolate engine render failures from sibling content. */
interface EngineBoundaryProps {
  resetKey: string;
  onError: (error: Error) => void;
  children: ReactNode;
}

/** Renderer failure associated with one canonical configuration. */
interface RendererFailure {
  key: string;
  error: Error;
}

/** Keeps renderer failures inside the decorative background boundary. */
class EngineBoundary extends Component<
  EngineBoundaryProps,
  EngineBoundaryState
> {
  /** Creates the initial healthy boundary state. */
  public constructor(props: EngineBoundaryProps) {
    super(props);
    this.state = { failed: false, resetKey: props.resetKey };
  }

  /** Converts a renderer exception into a fallback-only state. */
  public static getDerivedStateFromError(): Partial<EngineBoundaryState> {
    return { failed: true };
  }

  /** Resets the boundary when the canonical visual configuration changes. */
  public static getDerivedStateFromProps(
    props: EngineBoundaryProps,
    state: EngineBoundaryState,
  ): Partial<EngineBoundaryState> | null {
    return props.resetKey === state.resetKey
      ? null
      : { failed: false, resetKey: props.resetKey };
  }

  /** Reports a captured renderer exception to the facade. */
  public componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError(error);
  }

  /** Renders the engine while healthy and leaves the CSS fallback otherwise. */
  public render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Subscribes to the immutable client-hydration external store. */
function subscribeToClient(): () => void {
  return () => undefined;
}

/** Reports the hydrated browser snapshot. */
function getClientSnapshot(): boolean {
  return true;
}

/** Reports the server and pre-hydration snapshot. */
function getServerSnapshot(): boolean {
  return false;
}

/** Creates a bounded diagnostic identity for malformed runtime input. */
function failedConfigurationIdentity(
  props: GradientBackgroundProps,
): string {
  const seen = new WeakSet<object>();
  let remaining = 100;

  /** Converts one value without invoking object getters. */
  const visit = (value: unknown, depth: number): unknown => {
    if (remaining <= 0) return "[truncated]";
    remaining -= 1;
    if (typeof value === "bigint") return `${String(value)}n`;
    if (typeof value === "number" && !Number.isFinite(value)) {
      return String(value);
    }
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return "[circular]";
    if (depth >= 4) return "[depth]";
    seen.add(value);

    const entries: [string, unknown][] = Object.entries(
      Object.getOwnPropertyDescriptors(value),
    ).map(([key, descriptor]) => [
      key,
      "value" in descriptor ? visit(descriptor.value, depth + 1) : "[accessor]",
    ]);
    return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
  };

  return JSON.stringify(visit(props, 0));
}

/** Renders a decorative gradient with a stable server-safe CSS fallback. */
export function GradientBackground(props: GradientBackgroundProps) {
  const { onError } = props;
  const reportedErrors = useRef(new Set<string>());
  const [readyIdentity, setReadyIdentity] = useState<string | null>(null);
  const [rendererFailure, setRendererFailure] = useState<RendererFailure | null>(
    null,
  );
  const normalization = useMemo<
    | { normalized: NormalizedGradient; error: null }
    | { normalized: null; error: Error }
  >(() => {
    try {
      return { normalized: normalizeGradient(props), error: null };
    } catch (cause: unknown) {
      return {
        normalized: null,
        error:
          cause instanceof Error
            ? cause
            : new Error("Gradient configuration is invalid."),
      };
    }
  }, [props]);
  const failureKey =
    normalization.normalized?.identity ??
    failedConfigurationIdentity(props);

  /** Reveals only the completed Still frame for the current configuration. */
  const markStillReady = useCallback(() => {
    setReadyIdentity(failureKey);
  }, [failureKey]);

  /** Records one renderer failure for the current canonical configuration. */
  const captureRendererError = useCallback(
    (error: Error) => {
      setRendererFailure({ key: failureKey, error });
    },
    [failureKey],
  );
  const hydrated = useSyncExternalStore(
    subscribeToClient,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [stableRecipe, setStableRecipe] = useState<{
    identity: string;
    recipe: GradientRecipe;
  } | null>(() =>
    normalization.normalized
      ? {
          identity: normalization.normalized.identity,
          recipe: normalization.normalized.recipe,
        }
      : null,
  );
  if (
    normalization.normalized &&
    stableRecipe?.identity !== normalization.normalized.identity
  ) {
    setStableRecipe({
      identity: normalization.normalized.identity,
      recipe: normalization.normalized.recipe,
    });
  }
  const rendererError =
    rendererFailure?.key === failureKey ? rendererFailure.error : null;

  useEffect(() => {
    const error = normalization.error ?? rendererError;
    if (!error || !onError) return;
    const reportKey = `${failureKey}:${error.message}`;
    if (reportedErrors.current.has(reportKey)) return;
    reportedErrors.current.add(reportKey);
    try {
      onError(error);
    } catch {
      // Consumer diagnostics must not compromise the decorative fallback.
    }
  }, [failureKey, normalization.error, onError, rendererError]);

  const normalized = normalization.normalized;
  const fallback =
    normalized?.fallback ?? "linear-gradient(135deg, #111827, #374151)";

  return (
    <div
      aria-hidden="true"
      className={[styles.root, props.className].filter(Boolean).join(" ")}
      // Public wrapper styling is part of the component contract.
      // eslint-disable-next-line react/forbid-dom-props
      style={props.style}
      data-gradient-background=""
      data-gradient-variant={props.variant}
      data-gradient-ready={props.variant === "still" ? Boolean(normalization.error || rendererError || readyIdentity === failureKey) : undefined}
    >
      <div
        className={styles.fallback}
        // Dynamic palettes cannot be represented by a static module class.
        // eslint-disable-next-line react/forbid-dom-props
        style={{ backgroundImage: fallback }}
      />
      {normalized && hydrated && !rendererError ? (
        <EngineBoundary
          resetKey={normalized.identity}
          onError={captureRendererError}
        >
          <Suspense fallback={null}>
            <GradientEngine
              key={normalized.identity}
              recipe={
                stableRecipe?.identity === normalized.identity
                  ? stableRecipe.recipe
                  : normalized.recipe
              }
              className={styles.engine ?? ""}
              speed={normalized.speed}
              paused={normalized.paused}
              onError={captureRendererError}
              onStillReady={markStillReady}
            />
          </Suspense>
        </EngineBoundary>
      ) : null}
    </div>
  );
}
