import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import { ConfigManager, resolveDataPath } from "./config.js";
import { SeenStore } from "./seenStore.js";
import { HistoryStore } from "./historyStore.js";
import { Monitor } from "./monitor.js";
import { verifySmtp, sendTestEmail } from "./notifier.js";
import { sendTestTelegram } from "./telegram.js";
import { sendTestNtfy } from "./ntfy.js";
import type {
  AppConfig,
  NtfySettings,
  QueryConfig,
  SmtpSettings,
  TelegramSettings,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

dotenv.config({ path: path.join(projectRoot, ".env") });

function parseConfigPath(): string {
  const idx = process.argv.indexOf("--config");
  return idx !== -1 && process.argv[idx + 1]
    ? path.resolve(process.argv[idx + 1])
    : path.join(projectRoot, "config.json");
}

const configPath = parseConfigPath();
const manager = new ConfigManager(configPath);
const initialConfig = manager.get();
const seen = new SeenStore(resolveDataPath(configPath, initialConfig.seenFile));
const history = new HistoryStore(resolveDataPath(configPath, initialConfig.historyFile));
const monitor = new Monitor(manager, seen, history, process.env);

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

function parseQuery(body: unknown): QueryConfig {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid query: expected an object.");
  }
  const q = body as Record<string, unknown>;
  const name = typeof q.name === "string" ? q.name.trim() : "";
  const searchText = typeof q.searchText === "string" ? q.searchText.trim() : "";
  if (!name || !searchText) {
    throw new Error("A query needs both a name and searchText.");
  }

  const query: QueryConfig = {
    name,
    searchText,
    lowPrice: typeof q.lowPrice === "number" ? q.lowPrice : undefined,
    highPrice: typeof q.highPrice === "number" ? q.highPrice : undefined,
    selectedCategoryIds:
      typeof q.selectedCategoryIds === "string" ? q.selectedCategoryIds : undefined,
    selectedSellerIds:
      typeof q.selectedSellerIds === "string" ? q.selectedSellerIds : undefined,
    searchBuyNowOnly: q.searchBuyNowOnly as boolean | undefined,
    searchPickupOnly: q.searchPickupOnly as boolean | undefined,
    searchOneCentShippingOnly: q.searchOneCentShippingOnly as boolean | undefined,
    searchDescriptions: q.searchDescriptions as boolean | undefined,
    searchCanadaShipping: q.searchCanadaShipping as boolean | undefined,
    searchUSOnlyShipping: q.searchUSOnlyShipping as boolean | undefined,
    searchInternationalShippingOnly: q.searchInternationalShippingOnly as
      | boolean
      | undefined,
    maxPages: typeof q.maxPages === "number" ? q.maxPages : undefined,
  };

  return query;
}

function maskedSmtp(smtp: SmtpSettings): Record<string, unknown> {
  return {
    host: smtp.host ?? "",
    port: smtp.port ?? 587,
    secure: smtp.secure ?? false,
    user: smtp.user ?? "",
    from: smtp.from ?? "",
    to: smtp.to ?? "",
    pass: "",
    passSet: Boolean(smtp.pass),
    enabled: smtp.enabled !== false,
  };
}

function maskedTelegram(tg: TelegramSettings): Record<string, unknown> {
  return {
    botToken: "",
    botTokenSet: Boolean(tg.botToken),
    chatId: tg.chatId ?? "",
    enabled: tg.enabled !== false,
  };
}

function maskedNtfy(ntfy: NtfySettings): Record<string, unknown> {
  return {
    server: ntfy.server ?? "https://ntfy.sh",
    topic: ntfy.topic ?? "",
    token: "",
    tokenSet: Boolean(ntfy.token),
    enabled: ntfy.enabled !== false,
  };
}

function resolveTestConfig(body: unknown): AppConfig {
  const { smtp } = (body ?? {}) as { smtp?: SmtpSettings };
  const current = manager.get();
  if (!smtp) {
    return current;
  }
  const currentSmtp = current.smtp ?? {};
  const merged: SmtpSettings = {
    host: smtp.host ?? currentSmtp.host,
    port: smtp.port ?? currentSmtp.port,
    secure: smtp.secure ?? currentSmtp.secure,
    user: smtp.user ?? currentSmtp.user,
    pass:
      typeof smtp.pass === "string" && smtp.pass.trim() !== ""
        ? smtp.pass
        : currentSmtp.pass,
    from: smtp.from ?? currentSmtp.from,
    to: smtp.to ?? currentSmtp.to,
    enabled: true,
  };
  return { ...current, smtp: merged };
}

function resolveTelegramTestConfig(body: unknown): AppConfig {
  const { telegram } = (body ?? {}) as { telegram?: TelegramSettings };
  const current = manager.get();
  if (!telegram) {
    return current;
  }
  const currentTg = current.telegram ?? {};
  const merged: TelegramSettings = {
    botToken:
      typeof telegram.botToken === "string" && telegram.botToken.trim() !== ""
        ? telegram.botToken
        : currentTg.botToken,
    chatId: telegram.chatId ?? currentTg.chatId,
    enabled: true,
  };
  return { ...current, telegram: merged };
}

function resolveNtfyTestConfig(body: unknown): AppConfig {
  const { ntfy } = (body ?? {}) as { ntfy?: NtfySettings };
  const current = manager.get();
  if (!ntfy) {
    return current;
  }
  const currentNtfy = current.ntfy ?? {};
  const merged: NtfySettings = {
    server: ntfy.server ?? currentNtfy.server,
    topic: ntfy.topic ?? currentNtfy.topic,
    token:
      typeof ntfy.token === "string" && ntfy.token.trim() !== ""
        ? ntfy.token
        : currentNtfy.token,
    enabled: true,
  };
  return { ...current, ntfy: merged };
}

app.get(
  "/api/overview",
  asyncHandler(async (_req, res) => {
    res.json(monitor.getOverview());
  }),
);

app.get(
  "/api/queries",
  asyncHandler(async (_req, res) => {
    res.json({ queries: manager.get().queries });
  }),
);

app.post(
  "/api/queries",
  asyncHandler(async (req, res) => {
    const query = parseQuery(req.body);
    const queries = [...manager.get().queries, query];
    manager.setQueries(queries);
    res.status(201).json({ queries });
  }),
);

app.put(
  "/api/queries/:index",
  asyncHandler(async (req, res) => {
    const index = Number(req.params.index);
    const queries = manager.get().queries;
    if (!Number.isInteger(index) || index < 0 || index >= queries.length) {
      res.status(404).json({ error: "Query not found." });
      return;
    }
    const query = parseQuery(req.body);
    queries[index] = query;
    manager.setQueries(queries);
    res.json({ queries });
  }),
);

app.delete(
  "/api/queries/:index",
  asyncHandler(async (req, res) => {
    const index = Number(req.params.index);
    const queries = manager.get().queries;
    if (!Number.isInteger(index) || index < 0 || index >= queries.length) {
      res.status(404).json({ error: "Query not found." });
      return;
    }
    queries.splice(index, 1);
    manager.setQueries(queries);
    res.json({ queries });
  }),
);

app.get(
  "/api/settings",
  asyncHandler(async (_req, res) => {
    const config = manager.get();
    res.json({
      pollIntervalSeconds: config.pollIntervalSeconds,
      pageSize: config.pageSize,
      maxPages: config.maxPages,
      smtp: maskedSmtp(config.smtp ?? {}),
      telegram: maskedTelegram(config.telegram ?? {}),
      ntfy: maskedNtfy(config.ntfy ?? {}),
    });
  }),
);

app.put(
  "/api/settings",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const current = manager.get();
    const smtpIn = (body.smtp ?? {}) as SmtpSettings;
    const currentSmtp = current.smtp ?? {};

    const smtp: SmtpSettings = {
      host: smtpIn.host ?? currentSmtp.host,
      port: smtpIn.port ?? currentSmtp.port,
      secure: smtpIn.secure ?? currentSmtp.secure,
      user: smtpIn.user ?? currentSmtp.user,
      pass:
        typeof smtpIn.pass === "string" && smtpIn.pass.trim() !== ""
          ? smtpIn.pass
          : currentSmtp.pass,
      from: smtpIn.from ?? currentSmtp.from,
      to: smtpIn.to ?? currentSmtp.to,
      enabled: smtpIn.enabled ?? currentSmtp.enabled,
    };

    const telegramIn = (body.telegram ?? {}) as TelegramSettings;
    const currentTg = current.telegram ?? {};
    const telegram: TelegramSettings = {
      botToken:
        typeof telegramIn.botToken === "string" &&
        telegramIn.botToken.trim() !== ""
          ? telegramIn.botToken
          : currentTg.botToken,
      chatId: telegramIn.chatId ?? currentTg.chatId,
      enabled: telegramIn.enabled ?? currentTg.enabled,
    };

    const ntfyIn = (body.ntfy ?? {}) as NtfySettings;
    const currentNtfy = current.ntfy ?? {};
    const ntfy: NtfySettings = {
      server: ntfyIn.server ?? currentNtfy.server,
      topic: ntfyIn.topic ?? currentNtfy.topic,
      token:
        typeof ntfyIn.token === "string" && ntfyIn.token.trim() !== ""
          ? ntfyIn.token
          : currentNtfy.token,
      enabled: ntfyIn.enabled ?? currentNtfy.enabled,
    };

    manager.setSettings({
      pollIntervalSeconds:
        typeof body.pollIntervalSeconds === "number"
          ? body.pollIntervalSeconds
          : undefined,
      pageSize: typeof body.pageSize === "number" ? body.pageSize : undefined,
      maxPages: typeof body.maxPages === "number" ? body.maxPages : undefined,
      smtp,
      telegram,
      ntfy,
    });

    const saved = manager.get();
    res.json({
      pollIntervalSeconds: saved.pollIntervalSeconds,
      pageSize: saved.pageSize,
      maxPages: saved.maxPages,
      smtp: maskedSmtp(saved.smtp ?? {}),
      telegram: maskedTelegram(saved.telegram ?? {}),
      ntfy: maskedNtfy(saved.ntfy ?? {}),
    });
  }),
);

app.post(
  "/api/smtp/test",
  asyncHandler(async (req, res) => {
    const result = await verifySmtp(resolveTestConfig(req.body), process.env);
    res.json(result);
  }),
);

app.post(
  "/api/smtp/test-email",
  asyncHandler(async (req, res) => {
    const result = await sendTestEmail(resolveTestConfig(req.body), process.env);
    res.json(result);
  }),
);

app.post(
  "/api/telegram/test",
  asyncHandler(async (req, res) => {
    const result = await sendTestTelegram(
      resolveTelegramTestConfig(req.body),
      process.env,
    );
    res.json(result);
  }),
);

app.post(
  "/api/ntfy/test",
  asyncHandler(async (req, res) => {
    const result = await sendTestNtfy(
      resolveNtfyTestConfig(req.body),
      process.env,
    );
    res.json(result);
  }),
);

app.post(
  "/api/check",
  asyncHandler(async (_req, res) => {
    await monitor.checkNow();
    res.json(monitor.getOverview());
  }),
);

app.post(
  "/api/monitor/start",
  asyncHandler(async (_req, res) => {
    monitor.start();
    res.json(monitor.getOverview());
  }),
);

app.post(
  "/api/monitor/stop",
  asyncHandler(async (_req, res) => {
    monitor.stop();
    res.json(monitor.getOverview());
  }),
);

app.get(
  "/api/history",
  asyncHandler(async (req, res) => {
    const limitParam = req.query.limit;
    const limit =
      typeof limitParam === "string" && Number.isFinite(Number(limitParam))
        ? Number(limitParam)
        : 100;
    res.json({ history: history.list(limit) });
  }),
);

app.delete(
  "/api/history",
  asyncHandler(async (_req, res) => {
    history.clear();
    res.json({ history: [] });
  }),
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[server] ${err.message}`);
  res.status(400).json({ error: err.message });
});

const port = Number(process.env.PORT ?? 7823);

app.listen(port, () => {
  console.log(`ShopGoodwill Notifier console running at http://localhost:${port}`);
  monitor.start();
});
