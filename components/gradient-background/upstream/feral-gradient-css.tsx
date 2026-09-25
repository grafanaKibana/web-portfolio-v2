"use client";

/* eslint-disable react/forbid-dom-props -- The upstream CSS export requires recipe-derived inline backgrounds and filters. */

import { useEffect, useState, type CSSProperties } from "react";

import type { GradientRecipe } from "../gradient-background.models";

const CSS_RECIPE_TYPES = new Set(["LINEAR", "IOS", "CIRCLE", "ANGULAR"]);
const GRAIN_TILE_SIZE = 256;

let grainTile: string | null = null;

/** Props shared by the upstream CSS and canvas renderers. */
export interface FeralGradientCssProps {
  recipe: GradientRecipe;
  className?: string;
  style?: CSSProperties;
  speed?: number;
  paused?: boolean;
  onError?: (error: Error) => void;
}

/** Reports whether the builder exports this recipe through its CSS `b6` path. */
export function isFeralCssRecipe(recipe: GradientRecipe): boolean {
  return CSS_RECIPE_TYPES.has(recipe.type);
}

/** Produces center positions for each palette color from optional dividers. */
function colorPositions(count: number, divs: number[]): number[] {
  const defaults = Array.from(
    { length: Math.max(0, count - 1) },
    (_, index) => (index + 1) / count,
  );
  const boundaries = [
    0,
    ...(divs.length === count - 1 ? divs : defaults),
    1,
  ];

  return Array.from(
    { length: count },
    (_, index) =>
      (((boundaries[index] ?? 0) + (boundaries[index + 1] ?? 1)) / 2) *
      100,
  );
}

/** Converts an opaque six-digit hex color into OKLab coordinates. */
function hexToOklab(color: string): [number, number, number] {
  const linear = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const [red = 0, green = 0, blue = 0] = linear;
  const l = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  );
  const m = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  );
  const s = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  );

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Converts OKLab coordinates into a clamped opaque six-digit hex color. */
function oklabToHex(l: number, a: number, b: number): string {
  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  ].map((channel) => {
    const encoded =
      channel <= 0.0031308
        ? channel * 12.92
        : 1.055 * Math.max(0, channel) ** (1 / 2.4) - 0.055;
    return Math.min(255, Math.max(0, Math.round(encoded * 255)));
  });

  return `#${(
    (1 << 24) |
    ((channels[0] ?? 0) << 16) |
    ((channels[1] ?? 0) << 8) |
    (channels[2] ?? 0)
  )
    .toString(16)
    .slice(1)}`;
}

/** Interpolates two colors through OKLab using the builder's curve. */
function interpolateColor(start: string, end: string, amount: number): string {
  const startLab = hexToOklab(start);
  const endLab = hexToOklab(end);
  return oklabToHex(
    startLab[0] + (endLab[0] - startLab[0]) * amount,
    startLab[1] + (endLab[1] - startLab[1]) * amount,
    startLab[2] + (endLab[2] - startLab[2]) * amount,
  );
}

/** Expands adjacent colors with the builder's six eased intermediate stops. */
function smoothStops(
  colors: string[],
  positions: number[],
  steps = 6,
): Array<[string, number]> {
  const result: Array<[string, number]> = [];

  for (let index = 0; index < colors.length - 1; index += 1) {
    const color = colors[index] ?? colors[0] ?? "#000000";
    const nextColor = colors[index + 1] ?? color;
    const position = positions[index] ?? 0;
    const nextPosition = positions[index + 1] ?? 1;
    result.push([color, position]);
    for (let step = 1; step <= steps; step += 1) {
      const linear = step / (steps + 1);
      const eased = linear * linear * (3 - 2 * linear);
      result.push([
        interpolateColor(color, nextColor, eased),
        position + (nextPosition - position) * linear,
      ]);
    }
  }

  result.push([
    colors.at(-1) ?? colors[0] ?? "#000000",
    positions.at(-1) ?? positions[0] ?? 1,
  ]);
  return result;
}

/** Recreates the exact CSS background selected by the upstream `b6` exporter. */
export function getFeralCssBackground(recipe: GradientRecipe): string {
  if (!isFeralCssRecipe(recipe)) {
    throw new Error(`Feral CSS export does not support ${recipe.type}.`);
  }

  const positions = colorPositions(recipe.stops.length, recipe.divs);
  const stops = recipe.stops
    .map(
      (color, index) =>
        `${color} ${(positions[index] ?? 0).toFixed(1)}%`,
    )
    .join(", ");

  switch (recipe.type) {
    case "LINEAR":
      return `linear-gradient(180deg in oklab, ${stops})`;
    case "IOS":
      return `radial-gradient(90% 70% at 12% 8%, rgba(255,255,255,0.22), rgba(255,255,255,0) 60%), linear-gradient(135deg, ${smoothStops(
        recipe.stops,
        positions.map((position) => position / 100),
      )
        .map(([color, position]) => `${color} ${(position * 100).toFixed(1)}%`)
        .join(", ")})`;
    case "CIRCLE": {
      const first = (positions[0] ?? 0) / 100;
      const last = (positions.at(-1) ?? 100) / 100;
      const span = Math.max(1e-6, last - first);
      const radialPositions = positions.map(
        (position) => ((position / 100 - first) / span) * 0.88,
      );
      return `radial-gradient(circle closest-side at 50% 50%, ${smoothStops(
        recipe.stops,
        radialPositions,
      )
        .map(
          ([color, position]) =>
            `${color} ${(position * (0.62 / 0.5) * 100).toFixed(1)}%`,
        )
        .join(", ")})`;
    }
    case "ANGULAR": {
      const angularStops: string[] = [];
      for (let index = 0; index < recipe.stops.length; index += 1) {
        angularStops.push(
          `${recipe.stops[index] ?? "#000000"} ${(
            (positions[index] ?? 0) * 1.8
          ).toFixed(1)}deg`,
        );
      }
      for (let index = recipe.stops.length - 2; index >= 0; index -= 1) {
        angularStops.push(
          `${recipe.stops[index] ?? "#000000"} ${(
            360 - (positions[index] ?? 0) * 1.8
          ).toFixed(1)}deg`,
        );
      }
      return `conic-gradient(from 210deg at 50% 50% in oklab, ${angularStops.join(", ")})`;
    }
    default:
      throw new Error(`Feral CSS export does not support ${recipe.type}.`);
  }
}

/** Creates the stable seeded grain tile used by CSS-only gradients. */
function makeGrainTile(): string {
  if (grainTile) {
    return grainTile;
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = GRAIN_TILE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Feral CSS grain canvas is unavailable.");
  }

  const image = context.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
  let seed = 1977;
  /** Returns the next deterministic unit value for the cached grain tile. */
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < image.data.length; index += 4) {
    const value = Math.round(((random() + random()) / 2) * 255);
    image.data[index] = image.data[index + 1] = image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  grainTile = canvas.toDataURL();
  return grainTile;
}

/** Renders the four variants exported by Feral through its CSS `b6` path. */
export function FeralGradientCss({
  recipe,
  className,
  style,
  onError,
}: FeralGradientCssProps) {
  const [noise, setNoise] = useState("");
  const background = getFeralCssBackground(recipe);
  const fallback = background.replace(" in oklab", "");
  const blur = Math.max(0, recipe.blur);
  const grain = Math.max(0, Math.min(100, recipe.grain));

  useEffect(() => {
    if (grain <= 0) {
      return;
    }

    let active = true;
    try {
      const tile = makeGrainTile();
      queueMicrotask(() => {
        if (active) {
          setNoise(tile);
        }
      });
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }

    return () => {
      active = false;
    };
  }, [grain, onError]);

  const fill: CSSProperties = {
    position: "absolute",
    inset: 0,
    filter: blur ? `blur(${String(blur)}px)` : undefined,
    transform: blur ? `scale(${String(1 + blur / 200)})` : undefined,
  };

  return (
    <div
      className={className}
      data-feral-renderer="css"
      role="img"
      aria-label={recipe.name}
      style={{
        position: "relative",
        display: "block",
        overflow: "hidden",
        width: "100%",
        aspectRatio: `${String(recipe.width)} / ${String(recipe.height)}`,
        ...style,
      }}
    >
      <div aria-hidden="true" style={{ ...fill, background: fallback }} />
      <div aria-hidden="true" style={{ ...fill, background }} />
      {grain > 0 && noise ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage: `url(${noise})`,
            backgroundSize: `${String(GRAIN_TILE_SIZE)}px ${String(GRAIN_TILE_SIZE)}px`,
            imageRendering: "pixelated",
            mixBlendMode: "overlay",
            opacity: grain / 200,
          }}
        />
      ) : null}
    </div>
  );
}
