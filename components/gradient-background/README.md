# GradientBackground

`GradientBackground` renders one of 12 decorative Feral gradient exports behind a deterministic CSS fallback. The component has no Next.js, routing, theme, or portfolio-content dependency.

```tsx
import { GradientBackground } from "@/components/gradient-background";

export function Example() {
  return (
    <div style={{ position: "relative", minHeight: 320 }}>
      <GradientBackground
        variant="flow"
        colors={["#EAF4FC", "#1E50A2", "#F09199", "#895B8A"]}
        noise={6}
        soften={0}
        animated
        options={{ scale: 50, distortion: 60, swirl: 10, speed: 30 }}
      />
      <div style={{ position: "relative" }}>Foreground content</div>
    </div>
  );
}
```

The parent supplies dimensions and positioning context. The wrapper fills that parent, is `aria-hidden`, has no focus target, and never receives pointer events. Render foreground content as a sibling. Still exposes `data-gradient-ready` after its final initial frame commits (or a fallback error is handled). Consumers may use this marker to reveal the field; keep the CSS fallback visible when JavaScript is disabled.

## Shared props

- `colors`: 2–6 ordered `#RGB` or `#RRGGBB` colors. Omission uses the selected variant's captured palette.
- `balance`: one fewer normalized fraction than `colors`. Values clamp to 0.05–0.95 with a 0.06 minimum gap. Omission uses equal divisions.
- `noise`: 0–100 percent. Omission uses the variant default.
- `soften`: 0–80 CSS pixels. Omission uses the variant default.
- `animated`: defaults to the variant's animation capability. Starting with `false` produces a deterministic still frame; playback changes pause/resume the current phase. The renderer also follows runtime reduced-motion, visibility, and intersection state.
- `className` and `style`: apply to the single outer wrapper.
- `onError`: receives each distinct invalid configuration or renderer failure once. The callback runs client-side. Callback errors are contained.

`normalizeGradient` is the pure validation entry. It throws for an unknown variant, invalid palette, invalid balance cardinality, or malformed structured options. The React component catches those errors, retains its fallback, and reports them through `onError`. Palette or geometry changes remount the inner renderer and restart its phase. Equivalent canonical configurations retain the renderer; speed and pause changes update without a remount.

## Variant controls

All number ranges are inclusive. Points are ordered `[x, y]` pairs aligned to the palette.

| Variant | Engine | Animated | Options |
| --- | --- | --- | --- |
| `flow` | `FLOW` | Yes | `scale`, `distortion`, `swirl`, `speed`: 0–100; `points`: palette-length pairs, 3–97 |
| `sky` | `SKY` | Yes | `scale`, `warp`, `wind`, `speed`: 0–100; `direction`: `up`, `right`, `down`, `left` |
| `mesh` | `AIR` | No | `points`: palette-length pairs, 0–100; omission uses the source fallback cycle |
| `still` | `SMESH` | No | `positions`, `mixing`, `grainMix`, `waveX`, `waveXShift`, `waveY`, `waveYShift`: 0–100; `rotation`: 0–360 |
| `ios` | `IOS` | No | Shared palette, balance, noise, and soften only |
| `linear` | `LINEAR` | No | Shared palette, balance, noise, and soften only |
| `glow` | `GLOW` | Yes | `speed`: 0–100; `shapes`: 1–12 ordered shape records |
| `rings` | `RING` | No | `count`: 5–24; `melt`, `glow`, `sweep`: 0–100; `origin.x`, `origin.y`: 0–1 |
| `pixel` | `PIXEL` | Yes | `style`: `quilt`, `orbs`, `glass`; `size`, `speed`: 0–100; style fields below |
| `radial` | `CIRCLE` | No | Shared palette, balance, noise, and soften only |
| `conic` | `ANGULAR` | No | Shared palette, balance, noise, and soften only |
| `mist` | `MIST` | Yes | `rangeDensity`: 0–100; `skyShare`: 0.2–0.58; `peakHeight`, `peakProfile`, `fogDensity`, `sunPosition`, `drift`: 0–100; integer `seed` |

Pixel style fields are `quilt.steps` (2–16), `quilt.weave` (0–100), `orbs.gap` (0–30), `orbs.roundness` and `orbs.glow` (0–100), and `glass.fill` (0–100). Inactive style objects may remain in application state and are ignored.

Glow shapes support `circle`, `ellipse`, `blob`, `squircle`, `egg`, `crescent`, `flower`, `spark`, `scribble`, and `ring`. Geometry fields are `seed` (1–9999), `turns` (1–8; flower starts at 3), `curl`, `amp`, `taper`, `sway`, `body`, `shadow`, `blur`, `shift`, `span`, `edgeWidth` (0–100 unless the type states otherwise), `width` (4–100), `x` and `y` (-20–120), `scale` (20–220), `rotate` and `edgeAngle` (-180–180), `edgeStrength` (0–150), plus `reverse` and `edgeGlow`. Optional custom `pts` contains 2–96 pairs bounded to -1.5–1.5.

## Metadata and source updates

`gradientVariants` exports ordered control metadata for editor or preview UIs. `GradientBackgroundProps` is a discriminated union, so each `variant` accepts only its corresponding options type.

The generated renderer is isolated under [`upstream/`](upstream/README.md). That directory records its source URL, snapshot hash, adaptation, resource audit, and exact regeneration command. Regeneration rejects an unexpected upstream hash. The facade excludes text, labels, fonts, images, logos, and asset fields from normalized recipes; it performs no runtime CDN, font, telemetry, or API request.

## Home integration

The Home hero adopts the Still variant with palette-derived text contrast, a bottom transparency mask, and centered proportional image sizing.

The original generated engine is shared and lazy-loaded after hydration. It includes additional upstream algorithms, so this is not a small CSS-only component. Captured source and adapted-frame comparisons live in `.omx/evidence/gradient-parity/`. Colocated unit tests cover variant normalization and engine behavior; `tests/e2e/interactions.spec.ts` covers Home startup.

The Home hero uses generated static Still images for immediate first paint. `npm run generate:hero-backgrounds` derives them from the hero config using this same painter; `predev` and `prebuild` run it automatically. When changing the hero config during an already-running development session, rerun that command. Live parameterized backgrounds elsewhere continue to use `GradientBackground`.
