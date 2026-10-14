import type { AppConfig, ItemListing, Notifier, QueryConfig } from "./types.js";
import { listingUrl } from "./shopgoodwill.js";

const DEFAULT_NTFY_SERVER = "https://ntfy.sh";

export interface NtfyConfig {
  server: string;
  topic: string;
  token?: string;
}

export function resolveNtfy(
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): NtfyConfig | null {
  const n = config.ntfy ?? {};
  if (n.enabled === false) {
    return null;
  }
  const server = (n.server ?? env.NTFY_SERVER ?? DEFAULT_NTFY_SERVER).replace(
    /\/+$/,
    "",
  );
  const topic = n.topic ?? env.NTFY_TOPIC;
  const token = n.token ?? env.NTFY_TOKEN;

  if (!topic) {
    return null;
  }
  return { server, topic, token: token || undefined };
}

export function buildNtfyNotifier(
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): NtfyNotifier | null {
  const ntfy = resolveNtfy(config, env);
  return ntfy ? new NtfyNotifier(ntfy) : null;
}

export class NtfyNotifier implements Notifier {
  readonly kind = "ntfy" as const;

  constructor(private readonly config: NtfyConfig) {}

  private async publish(
    title: string,
    message: string,
  ): Promise<void> {
    const headers: Record<string, string> = { Title: title };
    if (this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${this.config.server}/${this.config.topic}`, {
        method: "POST",
        headers,
        body: message,
      });
    } catch (err) {
      throw new Error(`ntfy request failed: ${(err as Error).message}`);
    }

    if (!res.ok) {
      throw new Error(`ntfy API error: HTTP ${res.status}`);
    }
  }

  private formatItem(item: ItemListing): string {
    const url = listingUrl(item.itemId);
    const buyNow =
      item.buyNowPrice > 0 ? ` | Buy Now: $${item.buyNowPrice.toFixed(2)}` : "";
    return (
      `- ${item.title}\n` +
      `  Current: $${item.currentPrice.toFixed(2)} (${item.numBids} bids)${buyNow}\n` +
      `  ${url}`
    );
  }

  async sendNewListings(
    query: QueryConfig,
    newItems: ItemListing[],
  ): Promise<void> {
    if (newItems.length === 0) {
      return;
    }

    const plural = newItems.length === 1 ? "" : "s";
    const title = `[ShopGoodwill] ${newItems.length} new listing${plural} for "${query.searchText}"`;
    const lines = [
      `Found ${newItems.length} new listing${plural} matching your search "${query.searchText}":`,
      "",
      ...newItems.map((item) => this.formatItem(item)),
    ];
    await this.publish(title, lines.join("\n"));
  }

  async sendTestMessage(): Promise<void> {
    await this.publish(
      "ShopGoodwill Notifier",
      "This is a test message from your ShopGoodwill Notifier.\n" +
        "If you're reading this, ntfy notifications are working.",
    );
  }
}

export async function sendTestNtfy(
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; error?: string }> {
  const ntfy = resolveNtfy(config, env);
  if (!ntfy) {
    return {
      ok: false,
      error: "ntfy is not fully configured (topic is required).",
    };
  }
  try {
    const notifier = new NtfyNotifier(ntfy);
    await notifier.sendTestMessage();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
