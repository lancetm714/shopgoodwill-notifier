import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { AppConfig, ItemListing, QueryConfig } from "./types.js";
import { listingUrl } from "./shopgoodwill.js";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (typeof value === "number") return value !== 0;
  return false;
}

export function resolveSmtp(
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): SmtpConfig | null {
  const s = config.smtp ?? {};
  const host = s.host ?? env.SMTP_HOST;
  const to = s.to ?? env.MAIL_TO;
  const from = s.from ?? env.MAIL_FROM ?? s.user ?? env.SMTP_USER;

  if (!host || !to || !from) {
    return null;
  }

  return {
    host,
    port: Number(s.port ?? env.SMTP_PORT ?? 587),
    secure: toBool(s.secure ?? env.SMTP_SECURE ?? false),
    user: s.user ?? env.SMTP_USER,
    pass: s.pass ?? env.SMTP_PASS,
    from,
    to,
  };
}

export function buildNotifier(
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): EmailNotifier | null {
  const smtp = resolveSmtp(config, env);
  return smtp ? new EmailNotifier(smtp) : null;
}

export async function verifySmtp(
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; error?: string }> {
  const smtp = resolveSmtp(config, env);
  if (!smtp) {
    return {
      ok: false,
      error: "SMTP is not fully configured (host, to, and from are required).",
    };
  }
  try {
    const notifier = new EmailNotifier(smtp);
    await notifier.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendTestEmail(
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; error?: string }> {
  const smtp = resolveSmtp(config, env);
  if (!smtp) {
    return {
      ok: false,
      error: "SMTP is not fully configured (host, to, and from are required).",
    };
  }
  try {
    const notifier = new EmailNotifier(smtp);
    await notifier.sendTestEmail();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export class EmailNotifier {
  private readonly transporter: Transporter;
  private readonly config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }

  async sendTestEmail(): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: "ShopGoodwill Notifier — test email",
      text: [
        "This is a test email from your ShopGoodwill Notifier.",
        "",
        "If you're reading this, your SMTP settings are working and new-listing",
        "alerts will be delivered to this address.",
        "",
        "— ShopGoodwill Notifier",
      ].join("\n"),
    });
  }

  private formatItem(item: ItemListing): string {
    const url = listingUrl(item.itemId);
    const buyNow = item.buyNowPrice > 0 ? ` | Buy Now: $${item.buyNowPrice.toFixed(2)}` : "";
    const ends = item.endTime ? ` | Ends: ${item.endTime} PT` : "";
    return (
      `- ${item.title}\n` +
      `    Current: $${item.currentPrice.toFixed(2)} (${item.numBids} bids)${buyNow}${ends}\n` +
      `    ${url}`
    );
  }

  async sendNewListings(
    query: QueryConfig,
    newItems: ItemListing[],
  ): Promise<void> {
    if (newItems.length === 0) {
      return;
    }

    const subject =
      `[ShopGoodwill] ${newItems.length} new listing${newItems.length === 1 ? "" : "s"} for "${query.searchText}"`;

    const lines = [
      `Found ${newItems.length} new listing${newItems.length === 1 ? "" : "s"} matching your search "${query.searchText}":`,
      "",
      ...newItems.map((item) => this.formatItem(item)),
      "",
      "— ShopGoodwill Notifier",
    ];

    await this.transporter.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject,
      text: lines.join("\n"),
    });
  }
}
