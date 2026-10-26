import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`API listening on http://${config.HOST}:${config.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
