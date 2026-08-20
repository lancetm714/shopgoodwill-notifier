import fs from "node:fs";
import path from "node:path";
import type { AppConfig, QueryConfig, SmtpSettings } from "./types.js";

const DEFAULT_POLL_INTERVAL_SECONDS = 300;
const DEFAULT_PAGE_SIZE = 40;
const DEFAULT_MAX_PAGES = 3;

function applyDefaults(raw: Record<string, unknown>): AppConfig {
  const rawQueries = Array.isArray(raw.queries)
    ? (raw.queries as Partial<QueryConfig>[])
    : [];

  const queries: QueryConfig[] = rawQueries.map((q, i) => {
    if (!q.name || !q.searchText) {
      throw new Error(
        `Query at index ${i} must define both "name" and "searchText".`,
      );
    }
    return q as QueryConfig;
  });

  return {
    pollIntervalSeconds:
      (raw.pollIntervalSeconds as number | undefined) ??
      DEFAULT_POLL_INTERVAL_SECONDS,
    pageSize: (raw.pageSize as number | undefined) ?? DEFAULT_PAGE_SIZE,
    maxPages: (raw.maxPages as number | undefined) ?? DEFAULT_MAX_PAGES,
    seenFile:
      (raw.seenFile as string | undefined) ?? "data/seen_listings.json",
    historyFile:
      (raw.historyFile as string | undefined) ?? "data/history.json",
    smtp: (raw.smtp as SmtpSettings | undefined) ?? {},
    queries,
  };
}

export function loadConfig(configPath: string): AppConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found at ${configPath}. Copy config.example.json to config.json and edit it.`,
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse config.json: ${(err as Error).message}`);
  }

  return applyDefaults(raw);
}

export function saveConfig(configPath: string, config: AppConfig): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export class ConfigManager {
  private config: AppConfig;

  constructor(private readonly configPath: string) {
    this.config = loadConfig(configPath);
  }

  get(): AppConfig {
    return this.config;
  }

  save(): void {
    saveConfig(this.configPath, this.config);
  }

  setQueries(queries: QueryConfig[]): void {
    this.config.queries = queries;
    this.save();
  }

  setSettings(settings: {
    pollIntervalSeconds?: number;
    pageSize?: number;
    maxPages?: number;
    smtp?: SmtpSettings;
  }): void {
    if (settings.pollIntervalSeconds !== undefined) {
      this.config.pollIntervalSeconds = settings.pollIntervalSeconds;
    }
    if (settings.pageSize !== undefined) {
      this.config.pageSize = settings.pageSize;
    }
    if (settings.maxPages !== undefined) {
      this.config.maxPages = settings.maxPages;
    }
    if (settings.smtp !== undefined) {
      this.config.smtp = settings.smtp;
    }
    this.save();
  }
}

export function maxPagesFor(query: QueryConfig, defaultMax: number): number {
  return Math.max(1, query.maxPages ?? defaultMax);
}

export function resolveDataPath(configPath: string, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(path.dirname(configPath), p);
}
