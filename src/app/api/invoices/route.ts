import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { dayRangeHebron, isValidDateStr, todayHebron } from "@/lib/time";
import { fail, ok } from "@/lib/http";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export type InvoiceRow = {
  id: number;
  number: number;
  tableName: string;
  totalMinor: number;
  status: string;
  createdAt: string;
  paid: number;
  refunded: number;
  remaining: number;
  cashierId: number | null;
  cashierName: string | null;
};

/** سجل الفواتير — ?date=YYYY-MM-DD (افتراضي: اليوم بتوقيت الخليل) أو ?all=1 */
export async function GET(req: Request) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const all = sp.get("all") === "1";
    const date = sp.get("date") ?? todayHebron();
    if (!isValidDateStr(date)) throw new Error("bad date");

    let where = sql`WHERE i.status <> 'void'`;
    if (!all) {
      const { start, end } = dayRangeHebron(date);
      where = sql`${where} AND i.created_at >= ${start} AND i.created_at < ${end}`;
    }
    const res = await db.execute(sql`
      SELECT i.id, i.number, i.table_name AS "tableName", i.total_minor AS "totalMinor",
             i.status, i.created_at AS "createdAt",
             i.cashier_id AS "cashierId", u.name AS "cashierName",
             COALESCE(p.paid, 0)::bigint AS paid,
             COALESCE(r.refunded, 0)::bigint AS refunded,
             GREATEST(i.total_minor - (COALESCE(p.paid,0) - COALESCE(r.refunded,0)), 0)::bigint AS remaining
      FROM invoices i
      LEFT JOIN users u ON u.id = i.cashier_id
      LEFT JOIN (SELECT invoice_id, SUM(amount_minor) AS paid FROM payments GROUP BY invoice_id) p
        ON p.invoice_id = i.id
      LEFT JOIN (SELECT invoice_id, SUM(amount_minor) AS refunded FROM refunds GROUP BY invoice_id) r
        ON r.invoice_id = i.id
      ${where}
      ORDER BY i.number DESC
      LIMIT 300
    `);
    const invoices = res.rows.map((r) => ({
      ...r,
      number: Number(r.number),
      paid: Number(r.paid),
      refunded: Number(r.refunded),
      remaining: Number(r.remaining),
    })) as unknown as InvoiceRow[];
    return ok({ invoices, date });
  } catch (e) {
    return fail(e);
  }
}
