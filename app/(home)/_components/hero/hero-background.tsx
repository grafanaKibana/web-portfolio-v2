"use client";

import { useEffect, useRef } from "react";
import type { HeroBackgroundSources } from "./hero-background.models";
import { HeroBackgroundRenderer } from "./hero-background.renderer";
import styles from "./hero.module.scss";

/**
 * Composites the decorative hero once at screen density while CSS supplies its immediate fallback.
 * @param sources - Local theme fields and the approved grain texture.
 * @returns A decorative canvas with parse-time splash readiness metadata.
 */
export function HeroBackground({ sources }: { sources: HeroBackgroundSources }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { light, dark, noise } = sources;

  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new HeroBackgroundRenderer(canvasRef.current, { light, dark, noise });
    renderer.start();
    return () => { renderer.dispose(); };
  }, [light, dark, noise]);

  return <canvas aria-hidden="true" ref={canvasRef} className={styles.renderedBackground} data-opening-renderer="pending" />;
}
