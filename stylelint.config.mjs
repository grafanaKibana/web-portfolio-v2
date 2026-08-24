/** @type {import("stylelint").Config} */
const stylelintConfig = {
  extends: ["stylelint-config-standard-scss"],
  ignoreFiles: [".next/**", "design/**", "node_modules/**"],
  overrides: [
    {
      files: ["**/*.module.scss"],
      rules: {
        "selector-class-pattern": [
          "^[a-z][a-zA-Z0-9]*$",
          {
            message: "Use camelCase class names for CSS Modules.",
          },
        ],
      },
    },
  ],
  rules: {
    "hue-degree-notation": null,
    "lightness-notation": null,
    "media-feature-range-notation": null,
    "selector-class-pattern": null,
    "selector-pseudo-class-no-unknown": [
      true,
      {
        ignorePseudoClasses: ["global"],
      },
    ],
    "scss/at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["apply", "custom-variant", "theme"],
      },
    ],
  },
};

export default stylelintConfig;
