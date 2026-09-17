import "server-only";

/** Plugin metadata cache and transport policy. */
export const pluginLinksConfig = {
  cacheSeconds: 86_400,
  requestTimeoutMilliseconds: 5_000,
  statsUrl: "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json",
  sourceLabels: new Set(["Obsidian source", "Quartz source", "Source"]),
} as const;
