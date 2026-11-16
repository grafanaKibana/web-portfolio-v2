# Product captures

Scene and artwork settings live in `product-captures.json`. Review configured build and server commands as source code.

## Local capture

Install the .NET 10 SDK and clone [product-captures](https://github.com/grafanaKibana/product-captures). From that checkout, validate this repository's plan:

```sh
dotnet run -- --config /absolute/path/to/web-portfolio-v2/product-captures.json --dry-run
```

Dry-run validates configuration without starting the portfolio or writing artwork. The first .NET invocation can restore dependencies and build the tool. Remove `--dry-run` for fresh capture; the tool builds and starts this Next.js checkout, waits for its splash completion signal, and captures light and dark states.

Use `--reuse-screenshots` to explicitly compose from saved raw screenshots, or `--url https://preview.example` to capture a running preview without the configured build and server. Fresh capture never silently falls back to existing images. Review generated PNGs before publishing.

## GitHub Actions

The local capture and validation workflows call the shared workflows at `v2`. Manual capture defaults to dry-run; validation runs on relevant pull requests and default-branch pushes with read-only permissions. Use an immutable version or full commit SHA when a frozen tool revision is required.

The capture workflow can open a review-only image PR. This requires `pull-requests: write` and the [repository setting permitting Actions to create pull requests](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests). Set `update_pr` to false when no PR is wanted. Never execute untrusted PR configuration with a write token.

This repository currently runs captures manually. If adding release capture later, remember that releases created with `GITHUB_TOKEN` do not trigger a separate release workflow; invoke the shared capture action within the existing release job and keep one capture invocation per release.

## Artwork configuration

The v2 configuration uses `name`, `output`, `appearance`, `capture`, `build`, and `server`. The current centered layout contains the 1440×900 source viewport in 1600×1200 artwork with tint `#e0e9e2`.

Both themes run together. The tool writes `hero.png`, `hero-dark.png`, the raw screenshot pair, and a manifest under `public/projects/web-portfolio-v2`. Legacy v1 per-output selections (`themes`, `social`, and `centered` variants), `--only`, and individual theme overrides are not supported by v2. Existing artwork already checked into the portfolio remains available.

See the shared tool's [configuration reference](https://github.com/grafanaKibana/product-captures#configuration) for supported settings. Unknown configuration keys fail validation; do not restore the old v1 schema into the v2 workflow.
