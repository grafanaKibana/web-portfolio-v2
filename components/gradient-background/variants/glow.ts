import type {
  GradientRecipe,
  VariantDefinition,
} from "../gradient-background.models";
import {
  asRecord,
  enumOption,
  numberOption,
  pointsOption,
} from "../gradient-options.helpers";

const forms = [
  "circle", "ellipse", "blob", "squircle", "egg", "crescent",
  "flower", "spark", "scribble", "ring",
] as const;

/** Shape forms available in the reference Glow editor. */
export type GlowForm = (typeof forms)[number];

/** Editable Glow shape geometry, lighting, effects, and optional custom points. */
export interface GlowShape {
  form?: GlowForm;
  seed?: number;
  turns?: number;
  curl?: number;
  amp?: number;
  width?: number;
  taper?: number;
  sway?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
  reverse?: boolean;
  shift?: number;
  span?: number;
  edgeGlow?: boolean;
  edgeWidth?: number;
  edgeStrength?: number;
  edgeAngle?: number;
  body?: number;
  shadow?: number;
  blur?: number;
  pts?: readonly (readonly [number, number])[];
}

/** Glow-specific public options; palette, balance, noise, and soften are shared props. */
export interface GlowOptions {
  speed?: number;
  shapes?: readonly GlowShape[];
}

const formDefaults: Record<GlowForm, Partial<GlowShape>> = {
  circle: { turns: 1, curl: 50, amp: 50, width: 50, scale: 90, taper: 0, sway: 0 },
  ellipse: { turns: 1, curl: 50, amp: 50, width: 50, scale: 130, taper: 0, sway: 0 },
  blob: { turns: 1, curl: 55, amp: 50, width: 50, scale: 105, taper: 0, sway: 0 },
  squircle: { turns: 1, curl: 45, amp: 50, width: 50, scale: 95, taper: 0, sway: 0 },
  egg: { turns: 1, curl: 55, amp: 50, width: 50, scale: 115, taper: 0, sway: 0 },
  crescent: { turns: 1, curl: 55, amp: 50, width: 50, scale: 105, taper: 0, sway: 0 },
  flower: { turns: 5, curl: 60, amp: 50, width: 50, scale: 95, taper: 0, sway: 0 },
  spark: { turns: 4, curl: 65, amp: 50, width: 50, scale: 100, taper: 0, sway: 0 },
  scribble: { turns: 4, curl: 62, amp: 55, width: 22, scale: 190 },
  ring: { turns: 1, curl: 55, amp: 50, width: 55, scale: 110 },
};

const edgeBase = {
  form: "ellipse", seed: 731, turns: 3, curl: 65, amp: 50,
  width: 75, taper: 0, sway: 0, x: 50, y: 50, scale: 100,
  rotate: 0, reverse: false, shift: 0, span: 10,
  edgeGlow: true, edgeWidth: 36, edgeStrength: 100, edgeAngle: 90,
} as const;

const edgeShapes = [
  { ...edgeBase, x: 34, y: 1, scale: 170, rotate: -45, edgeAngle: 80, edgeWidth: 27 },
  { ...edgeBase, x: 53, y: 108, scale: 158, amp: 70, rotate: -9, edgeAngle: -95, edgeWidth: 26, shift: 90 },
] as const;

/** Clamps a shape field to its editor range, optionally rounding discrete values. */
function shapeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  const normalized = numberOption(value, fallback, min, max);
  return integer ? Math.round(normalized) : normalized;
}

/** Converts one untrusted editor shape to a renderer line without text or asset fields. */
function normalizeShape(value: unknown, index: number): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Glow shape ${String(index + 1)} must be an object.`);
  }

  const shape = asRecord(value);
  const form = enumOption(shape.form, forms, "blob");
  const defaults = formDefaults[form];
  const shift = shapeNumber(shape.shift, 0, 0, 100);
  const ringShift = Math.min(90, Math.max(52, Math.round(shift) || 70));
  let points: number[][] | undefined;
  if (
    Array.isArray(shape.pts) &&
    shape.pts.length >= 2 &&
    shape.pts.length <= 96
  ) {
    points = pointsOption(shape.pts, shape.pts.length, -1.5, 1.5);
  }
  if (shape.pts !== undefined && !points) {
    throw new Error(`Glow shape ${String(index + 1)} points must contain 2–96 finite pairs.`);
  }

  return {
    id: `glow-shape-${String(index + 1)}`,
    form,
    seed: shapeNumber(shape.seed, 731, 1, 9999, true),
    turns: shapeNumber(shape.turns, defaults.turns ?? 3, form === "flower" ? 3 : 1, 8, true),
    curl: shapeNumber(shape.curl, defaults.curl ?? 65, 0, 100),
    amp: shapeNumber(shape.amp, defaults.amp ?? 50, 0, 100),
    width: shapeNumber(shape.width, defaults.width ?? 75, 4, 100),
    taper: shapeNumber(shape.taper, defaults.taper ?? 0, 0, 100),
    sway: shapeNumber(shape.sway, defaults.sway ?? 0, 0, 100),
    x: shapeNumber(shape.x, 50, -20, 120),
    y: shapeNumber(shape.y, 50, -20, 120),
    scale: shapeNumber(shape.scale, defaults.scale ?? 100, 20, 220),
    rotate: shapeNumber(shape.rotate, 0, -180, 180),
    reverse: shape.reverse === true,
    shift: shapeNumber(shape.shift, form === "ring" ? ringShift : 0, 0, 100),
    span: shapeNumber(shape.span, form === "ring" ? 200 - 2 * ringShift : 100, 5, 100),
    edgeGlow: shape.edgeGlow !== false,
    edgeWidth: shapeNumber(shape.edgeWidth, 36, 0, 100),
    edgeStrength: shapeNumber(shape.edgeStrength, 100, 0, 150),
    edgeAngle: shapeNumber(shape.edgeAngle, 90, -180, 180),
    body: shapeNumber(shape.body, 0, 0, 100),
    shadow: shapeNumber(shape.shadow, 0, 0, 100),
    blur: shapeNumber(shape.blur, 0, 0, 100),
    ...(points ? { pts: points } : {}),
  };
}

/** Adapts public Glow options to the GLOW renderer's shape recipe. */
export const glowDefinition: VariantDefinition = {
  type: "GLOW",
  label: "Glow",
  animated: true,
  colors: ["#072B35", "#DEFF58", "#31E7BC"],
  noise: 0,
  soften: 0,
  defaults: { speed: 0, shapes: edgeShapes },
  controls: [
    { key: "speed", label: "Speed", kind: "number", min: 0, max: 100, step: 1 },
    { key: "shapes", label: "Shapes", kind: "shapes" },
  ],
  /**
   * Maps Glow controls to bounded renderer shape records.
   * @param options - Untrusted Glow options.
   * @param _colors - Palette normalized by the shared facade.
   * @returns Glow-specific recipe fields.
   */
  normalize(options: unknown, _colors: readonly string[]): Partial<GradientRecipe> {
    const input = asRecord(options);
    const shapes = input.shapes === undefined ? edgeShapes : input.shapes;
    if (!Array.isArray(shapes) || shapes.length < 1 || shapes.length > 12) {
      throw new Error("Glow shapes must contain between 1 and 12 shapes.");
    }

    return {
      speed: numberOption(input.speed, 0, 0, 100),
      lines: shapes.map(normalizeShape),
    };
  },
};
