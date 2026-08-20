import fs from "node:fs";
import path from "node:path";

const MAX_SEEN_PER_QUERY = 5000;

interface SeenData {
  [queryName: string]: number[];
}

export class SeenStore {
  private data: SeenData;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.data = this.load();
  }

  private load(): SeenData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw) as SeenData;
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    } catch (err) {
      console.error(
        `[seen] Failed to load seen file, starting fresh: ${(err as Error).message}`,
      );
    }
    return {};
  }

  hasQuery(queryName: string): boolean {
    return Array.isArray(this.data[queryName]);
  }

  getSeenIds(queryName: string): Set<number> {
    const ids = this.data[queryName];
    return new Set(Array.isArray(ids) ? ids : []);
  }

  addSeenIds(queryName: string, ids: Iterable<number>): void {
    const set = this.getSeenIds(queryName);
    for (const id of ids) {
      set.add(id);
    }
    const arr = Array.from(set);
    if (arr.length > MAX_SEEN_PER_QUERY) {
      arr.splice(0, arr.length - MAX_SEEN_PER_QUERY);
    }
    this.data[queryName] = arr;
  }

  save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (err) {
      console.error(
        `[seen] Failed to save seen file: ${(err as Error).message}`,
      );
    }
  }
}
