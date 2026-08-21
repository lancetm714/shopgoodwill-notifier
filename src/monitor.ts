import crypto from "node:crypto";
import { ConfigManager, maxPagesFor } from "./config.js";
import { searchListings, listingUrl } from "./shopgoodwill.js";
import { SeenStore } from "./seenStore.js";
import { HistoryStore } from "./historyStore.js";
import { buildNotifier, resolveSmtp } from "./notifier.js";
import { buildTelegramNotifier, resolveTelegram } from "./telegram.js";
import type {
  AppConfig,
  HistoryEntry,
  ItemListing,
  Notifier,
  QueryConfig,
  QueryStatus,
} from "./types.js";

export interface MonitorOverview {
  running: boolean;
  checking: boolean;
  lastCheckAt: string | null;
  nextCheckAt: string | null;
  pollIntervalSeconds: number;
  smtpConfigured: boolean;
  telegramConfigured: boolean;
  queries: QueryStatus[];
}

export class Monitor {
  private running = false;
  private checking = false;
  private inFlight: Promise<void> | null = null;
  private lastCheckAt: string | null = null;
  private readonly statuses = new Map<string, QueryStatus>();

  constructor(
    private readonly configManager: ConfigManager,
    private readonly seen: SeenStore,
    private readonly history: HistoryStore,
    private readonly env: NodeJS.ProcessEnv,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(
      `[monitor] Started (poll every ${this.configManager.get().pollIntervalSeconds}s).`,
    );
    void this.loop();
  }

  stop(): void {
    this.running = false;
    console.log("[monitor] Stopped.");
  }

  isRunning(): boolean {
    return this.running;
  }

  checkNow(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runCheck().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  getOverview(): MonitorOverview {
    const config = this.configManager.get();
    const intervalMs = Math.max(30, config.pollIntervalSeconds) * 1000;
    const nextCheckAt =
      this.running && this.lastCheckAt
        ? new Date(new Date(this.lastCheckAt).getTime() + intervalMs).toISOString()
        : null;

    return {
      running: this.running,
      checking: this.checking,
      lastCheckAt: this.lastCheckAt,
      nextCheckAt,
      pollIntervalSeconds: config.pollIntervalSeconds,
      smtpConfigured: resolveSmtp(config, this.env) !== null,
      telegramConfigured: resolveTelegram(config, this.env) !== null,
      queries: config.queries.map((q) => this.statusFor(q)),
    };
  }

  private async loop(): Promise<void> {
    while (this.running) {
      await this.checkNow();
      if (!this.running) break;
      const interval = Math.max(30, this.configManager.get().pollIntervalSeconds);
      await new Promise((r) => setTimeout(r, interval * 1000));
    }
  }

  private async runCheck(): Promise<void> {
    this.checking = true;
    const config = this.configManager.get();
    const notifiers: Notifier[] = [];
    const email = buildNotifier(config, this.env);
    if (email) notifiers.push(email);
    const telegram = buildTelegramNotifier(config, this.env);
    if (telegram) notifiers.push(telegram);
    try {
      for (const query of config.queries) {
        await this.checkQuery(query, config, notifiers);
      }
      this.lastCheckAt = new Date().toISOString();
    } finally {
      this.checking = false;
    }
  }

  private statusFor(query: QueryConfig): QueryStatus {
    let status = this.statuses.get(query.name);
    if (!status) {
      status = {
        name: query.name,
        searchText: query.searchText,
        lastCheckAt: null,
        lastError: null,
        lastNewCount: 0,
        lastTotalChecked: 0,
      };
      this.statuses.set(query.name, status);
    }
    status.searchText = query.searchText;
    return status;
  }

  private toHistoryEntry(
    query: QueryConfig,
    item: ItemListing,
    notified: boolean,
  ): HistoryEntry {
    return {
      id: crypto.randomUUID(),
      queryName: query.name,
      searchText: query.searchText,
      itemId: item.itemId,
      title: item.title,
      currentPrice: item.currentPrice,
      numBids: item.numBids,
      imageURL: item.imageURL,
      listingUrl: listingUrl(item.itemId),
      foundAt: new Date().toISOString(),
      notified,
    };
  }

  private async checkQuery(
    query: QueryConfig,
    config: AppConfig,
    notifiers: Notifier[],
  ): Promise<void> {
    const status = this.statusFor(query);
    try {
      const items = await searchListings(
        query,
        config.pageSize,
        maxPagesFor(query, config.maxPages),
      );

      if (!this.seen.hasQuery(query.name)) {
        this.seen.addSeenIds(
          query.name,
          items.map((i) => i.itemId),
        );
        this.seen.save();
        status.lastCheckAt = new Date().toISOString();
        status.lastError = null;
        status.lastNewCount = 0;
        status.lastTotalChecked = items.length;
        console.log(
          `[${query.name}] First run: recorded ${items.length} existing listings as baseline.`,
        );
        return;
      }

      const seen = this.seen.getSeenIds(query.name);
      const newItems = items.filter((item) => !seen.has(item.itemId));

      if (newItems.length > 0) {
        let notified = false;
        for (const notifier of notifiers) {
          try {
            await notifier.sendNewListings(query, newItems);
            notified = true;
          } catch (err) {
            console.error(
              `[${query.name}] ${notifier.kind} notification failed: ${(err as Error).message}`,
            );
          }
        }
        this.history.add(
          newItems.map((item) => this.toHistoryEntry(query, item, notified)),
        );
        console.log(
          `[${query.name}] Found ${newItems.length} new listing(s).`,
        );
      }

      this.seen.addSeenIds(
        query.name,
        items.map((i) => i.itemId),
      );
      this.seen.save();

      status.lastCheckAt = new Date().toISOString();
      status.lastError = null;
      status.lastNewCount = newItems.length;
      status.lastTotalChecked = items.length;
    } catch (err) {
      status.lastError = (err as Error).message;
      console.error(`[${query.name}] Error: ${(err as Error).message}`);
    }
  }
}
