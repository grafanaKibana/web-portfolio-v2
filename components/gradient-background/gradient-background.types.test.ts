import test from "node:test";
import type {
  GradientBackgroundOptions,
  GradientBackgroundProps,
} from "./gradient-background.types";

const validFlow: GradientBackgroundProps = {
  variant: "flow",
  options: { scale: 50, speed: 30 },
};
const validMist: GradientBackgroundOptions["mist"] = {
  fogDensity: 45,
  skyShare: 0.4,
};

const invalidFlow: GradientBackgroundProps = {
  variant: "flow",
  // @ts-expect-error Flow does not accept Mist controls.
  options: { fogDensity: 45 },
};

const invalidMist: GradientBackgroundProps = {
  variant: "mist",
  // @ts-expect-error Mist does not accept Flow controls.
  options: { swirl: 10 },
};

test("public types preserve variant-option correlation", () => {
  void validFlow;
  void validMist;
  void invalidFlow;
  void invalidMist;
});
