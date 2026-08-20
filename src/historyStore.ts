import fs from "node:fs";
import path from "node:path";
import type { HistoryEntry } from "./types.js";

const MAX_ENTRIES = 1000;

export class HistoryStore {
  private entries: HistoryEntry[];
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.entries = this.load();
  }

  private load(): HistoryEntry[] {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed as HistoryEntry[];
        }
      }
    } catch (err) {
      console.error(
        `[history] Failed to load history file, starting fresh: ${(err as Error).message}`,
      );
    }
    return [];
  }

  add(entries: HistoryEntry[]): void {
    this.entries.unshift(...entries);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }
    this.save();
  }

  list(limit = 100): HistoryEntry[] {
    return this.entries.slice(0, limit);
  }

  clear(): void {
    this.entries = [];
    this.save();
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.entries, null, 2),
        "utf-8",
      );
    } catch (err) {
      console.error(
        `[history] Failed to save history file: ${(err as Error).message}`,
      );
    }
  }
}
