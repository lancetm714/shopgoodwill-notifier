import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ConfigManager, resolveDataPath } from "./config.js";
import { SeenStore } from "./seenStore.js";
import { HistoryStore } from "./historyStore.js";
import { Monitor } from "./monitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function parseConfigPath(): string {
  const idx = process.argv.indexOf("--config");
  return idx !== -1 && process.argv[idx + 1]
    ? path.resolve(process.argv[idx + 1])
    : path.join(projectRoot, "config.json");
}

async function main(): Promise<void> {
  dotenv.config({ path: path.join(projectRoot, ".env") });

  const configPath = parseConfigPath();
  const manager = new ConfigManager(configPath);
  const config = manager.get();
  const seen = new SeenStore(resolveDataPath(configPath, config.seenFile));
  const history = new HistoryStore(resolveDataPath(configPath, config.historyFile));
  const monitor = new Monitor(manager, seen, history, process.env);

  if (process.argv.includes("--once")) {
    await monitor.checkNow();
    return;
  }

  const shutdown = () => {
    monitor.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  monitor.start();
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
