// مخطط قاعدة البيانات — نظام كاشير المطعم
// كل المبالغ مخزنة كأعداد صحيحة بأصغر وحدة نقدية (أجورات: 100 = 1 ₪)

import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("user_role", ["manager", "cashier", "staff"]);
export const orderStatusEnum = pgEnum("order_status", [
  "open",
  "sent",
  "closed",
  "cancelled",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "open",
  "partially_paid",
  "paid",
  "refunded",
  "void",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "card",
  "electronic",
]);

export type Role = (typeof roleEnum.enumValues)[number];

// ---------------------------------------------------------------- إعدادات المطعم (صف واحد)
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  restaurantName: text("restaurant_name").notNull().default("Lord Cafe"),
  currency: text("currency").notNull().default("ILS"),
  taxBps: integer("tax_bps").notNull().default(0), // نسبة الضريبة بنقاط أساس: 100 = 1%
  timezone: text("timezone").notNull().default("Asia/Hebron"),
});

// ---------------------------------------------------------------- المستخدمون والجلسات
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("staff"),
  pinHash: text("pin_hash").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ---------------------------------------------------------------- الطاولات والقائمة
export const diningTables = pgTable("dining_tables", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  name: text("name").notNull(),
  priceMinor: integer("price_minor").notNull(),
  costMinor: integer("cost_minor").notNull().default(0),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------------------------------------------------------------- الطلبات
// فهرس فريد جزئي: يمنع وجود طلبين نشطين (open/sent) لنفس الطاولة على مستوى قاعدة البيانات
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    tableId: integer("table_id")
      .notNull()
      .references(() => diningTables.id),
    status: orderStatusEnum("status").notNull().default("open"),
    openedBy: integer("opened_by").references(() => users.id),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    discountMinor: integer("discount_minor").notNull().default(0),
    note: text("note").notNull().default(""),
    clientKey: text("client_key").unique(), // مفتاح منع تكرار إنشاء الطلب
  },
  (t) => [
    uniqueIndex("orders_active_table_uq")
      .on(t.tableId)
      .where(sql`status IN ('open','sent')`),
    index("orders_opened_at_idx").on(t.openedAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id),
    menuItemId: integer("menu_item_id").references(() => menuItems.id),
    name: text("name").notNull(), // لقطة الاسم وقت الطلب
    priceMinor: integer("price_minor").notNull(), // لقطة السعر من القاعدة وليس من العميل
    quantity: integer("quantity").notNull().default(1),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

// ---------------------------------------------------------------- الفواتير والمدفوعات
export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    number: bigint("number", { mode: "number" }).notNull().unique(), // رقم متسلسل
    orderId: integer("order_id")
      .notNull()
      .unique() // يمنع تكرار الفاتورة لنفس الطلب
      .references(() => orders.id),
    tableName: text("table_name").notNull(),
    cashierId: integer("cashier_id").references(() => users.id),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    taxBps: integer("tax_bps").notNull().default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    status: invoiceStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("invoices_created_idx").on(t.createdAt)],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id),
    name: text("name").notNull(),
    priceMinor: integer("price_minor").notNull(),
    quantity: integer("quantity").notNull(),
    totalMinor: integer("total_minor").notNull(),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amountMinor: integer("amount_minor").notNull(),
    method: paymentMethodEnum("method").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(), // منع دفعة مكررة عند إعادة المحاولة
    receivedBy: integer("received_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId), index("payments_created_idx").on(t.createdAt)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amountMinor: integer("amount_minor").notNull(),
    reason: text("reason").notNull(), // سبب إلزامي
    idempotencyKey: text("idempotency_key").notNull().unique(),
    approvedBy: integer("approved_by").references(() => users.id), // مدير فقط — يُفرض في الخادم
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("refunds_invoice_idx").on(t.invoiceId), index("refunds_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------- المصروفات والتدقيق
export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull().default("عام"),
    amountMinor: integer("amount_minor").notNull(),
    spentOn: date("spent_on", { mode: "string" }).notNull(), // YYYY-MM-DD بتوقيت الخليل
    note: text("note").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("expenses_spent_on_idx").on(t.spentOn)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: integer("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

// عدّاد تسلسلي محمي بقفل صف داخل المعاملة — مصدر أرقام الفواتير
export const seqCounters = pgTable("seq_counters", {
  key: text("key").primaryKey(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
});
