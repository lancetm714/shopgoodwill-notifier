import type { AppConfig, ItemListing, Notifier, QueryConfig } from "./types.js";
import { listingUrl } from "./shopgoodwill.js";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export function resolveTelegram(
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): TelegramConfig | null {
  const t = config.telegram ?? {};
  if (t.enabled === false) {
    return null;
  }
  const botToken = t.botToken ?? env.TELEGRAM_BOT_TOKEN;
  const chatId = t.chatId ?? env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return null;
  }
  return { botToken, chatId };
}

export function buildTelegramNotifier(
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): TelegramNotifier | null {
  const tg = resolveTelegram(config, env);
  return tg ? new TelegramNotifier(tg.botToken, tg.chatId) : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export class TelegramNotifier implements Notifier {
  readonly kind = "telegram" as const;

  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {}

  async sendMessage(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: "HTML",
        }),
      });
    } catch (err) {
      throw new Error(`Telegram request failed: ${(err as Error).message}`);
    }

    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;

    if (!res.ok || !data || data.ok !== true) {
      const desc =
        data && typeof data.description === "string"
          ? data.description
          : `HTTP ${res.status}`;
      throw new Error(`Telegram API error: ${desc}`);
    }
  }

  private formatItem(item: ItemListing): string {
    const url = listingUrl(item.itemId);
    const buyNow = item.buyNowPrice > 0 ? ` | Buy Now: $${item.buyNowPrice.toFixed(2)}` : "";
    return (
      `<a href="${url}">${escapeHtml(item.title)}</a>\n` +
      `  Current: $${item.currentPrice.toFixed(2)} (${item.numBids} bids)${buyNow}`
    );
  }

  async sendNewListings(
    query: QueryConfig,
    newItems: ItemListing[],
  ): Promise<void> {
    if (newItems.length === 0) {
      return;
    }

    const header = `New listings for "${escapeHtml(query.searchText)}" (${newItems.length})`;
    const lines = [header, "", ...newItems.map((i) => this.formatItem(i))];
    await this.sendMessage(lines.join("\n"));
  }

  async sendTestMessage(): Promise<void> {
    await this.sendMessage(
      "This is a test message from your ShopGoodwill Notifier.\n" +
        "If you're reading this, Telegram notifications are working.",
    );
  }
}

export async function sendTestTelegram(
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; error?: string }> {
  const tg = resolveTelegram(config, env);
  if (!tg) {
    return {
      ok: false,
      error: "Telegram is not fully configured (botToken and chatId are required).",
    };
  }
  try {
    const notifier = new TelegramNotifier(tg.botToken, tg.chatId);
    await notifier.sendTestMessage();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
