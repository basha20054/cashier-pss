import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

// قواعد سحابية (Neon / Supabase / RDS) تتطلب SSL — نقبل اتصالها بشكل صريح
const needsSsl = /sslmode=require|ssl=true/i.test(databaseUrl);

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    max: 5, // محدود عمداً — يحمي من نفاد اتصالات الاستضافة السحابية
  });

// نخزّن الـ Pool على globalThis في كل البيئات (وليس التطوير فقط):
// في الاستضافة السحابية يبقى الكائن حياً بين الطلبات الدافئة ولا يُنشأ Pool جديد لكل طلب
globalForDb.__arenaNextJsPostgresqlPool = pool;

export const db = drizzle(pool);
