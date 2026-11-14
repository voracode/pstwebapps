import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Single PrismaClient per process, created lazily on first use.
 *
 * Lazy creation matters for `next build` in Docker: route modules are
 * imported to collect their config, and no DATABASE_URL exists there.
 * In dev, the instance is cached on globalThis so hot reloads don't
 * exhaust Postgres connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const created = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10) }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  globalForPrisma.prisma = created;
  return created;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
