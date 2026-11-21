import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
export const stores = sqliteTable("stores", {
  id: text().primaryKey(),
  ownerId: text("owner_id").notNull().unique(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  bio: text().notNull().default(""),
  photo: text().notNull().default(""),
  accent: text().notNull().default("#ec008c"),
  supportEmail: text("support_email").notNull().default(""),
  socials: text().notNull().default("{}"),
  audience: text().notNull().default(""),
  goals: text().notNull().default(""),
  currency: text().notNull().default("usd"),
  timezone: text().notNull().default("America/Chicago"),
  stripeAccount: text("stripe_account"),
  paymentsReady: integer("payments_ready").notNull().default(0),
  taxEnabled: integer("tax_enabled").notNull().default(0),
  demo: integer().notNull().default(0),
  trackingEnabled: integer("tracking_enabled").notNull().default(1),
  excludeOwnerVisits: integer("exclude_owner_visits").notNull().default(1),
  linkCopiedAt: integer("link_copied_at"),
  publicationState: text("publication_state").notNull().default("published"),
  stylePreset: text("style_preset").notNull().default("studio"),
  whatTheySell: text("what_they_sell").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});
export const creatorSessions = sqliteTable(
  "creator_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    ownerId: text("owner_id").notNull(),
    email: text().notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("creator_sessions_expiry").on(t.expiresAt)],
);
export const creatorLoginStates = sqliteTable("creator_login_states", {
  nonceHash: text("nonce_hash").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});
export const products = sqliteTable(
  "products",
  {
    id: text().primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    title: text().notNull(),
    description: text().notNull().default(""),
    image: text().notNull().default(""),
    buttonLabel: text("button_label").notNull().default("Get the resource"),
    price: integer().notNull().default(0),
    kind: text().notNull().default("resource"),
    deliveryType: text("delivery_type").notNull().default("url"),
    deliveryUrl: text("delivery_url"),
    assetId: text("asset_id"),
    state: text().notNull().default("draft"),
    position: integer().notNull().default(0),
    presentationJson: text("presentation_json").notNull().default("{}"),
    version: integer().notNull().default(1),
    lastChangeId: text("last_change_id"),
    revisionOf: text("revision_of"),
    baseVersion: integer("base_version"),
    suggestedPrice: integer("suggested_price"),
    priceConfirmed: integer("price_confirmed").notNull().default(1),
    draftSource: text("draft_source").notNull().default("dashboard"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("products_store").on(t.storeId)],
);
export const assets = sqliteTable("assets", {
  id: text().primaryKey(),
  storeId: text("store_id").notNull(),
  key: text().notNull().unique(),
  name: text().notNull(),
  type: text().notNull(),
  size: integer().notNull(),
  ready: integer().notNull().default(0),
  purpose: text().notNull().default("deliverable"),
  createdAt: integer("created_at").notNull(),
});
export const contacts = sqliteTable(
  "contacts",
  {
    id: text().primaryKey(),
    storeId: text("store_id").notNull(),
    name: text().notNull(),
    email: text().notNull(),
    marketing: integer().notNull().default(0),
    isTest: integer("is_test").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("contacts_store_email").on(t.storeId, t.email)],
);
export const activities = sqliteTable("activities", {
  id: text().primaryKey(),
  storeId: text("store_id").notNull(),
  contactId: text("contact_id").notNull(),
  productId: text("product_id").notNull(),
  kind: text().notNull(),
  createdAt: integer("created_at").notNull(),
});
export const discounts = sqliteTable(
  "discounts",
  {
    id: text().primaryKey(),
    storeId: text("store_id").notNull(),
    productId: text("product_id").notNull(),
    code: text().notNull(),
    percent: integer().notNull(),
    expiresAt: integer("expires_at").notNull(),
    maxUses: integer("max_uses").notNull(),
    used: integer().notNull().default(0),
    reserved: integer().notNull().default(0),
  },
  (t) => [uniqueIndex("discount_store_code").on(t.storeId, t.code)],
);
export const orders = sqliteTable(
  "orders",
  {
    id: text().primaryKey(),
    storeId: text("store_id").notNull(),
    productId: text("product_id").notNull(),
    contactId: text("contact_id").notNull(),
    title: text().notNull(),
    description: text().notNull(),
    assetId: text("asset_id"),
    deliveryUrl: text("delivery_url"),
    amount: integer().notNull(),
    currency: text().notNull(),
    tax: integer().notNull().default(0),
    status: text().notNull().default("pending"),
    refundAmount: integer("refund_amount").notNull().default(0),
    refunded: integer().notNull().default(0),
    sessionId: text("session_id").unique(),
    paymentIntent: text("payment_intent"),
    connectedAccount: text("connected_account"),
    discountId: text("discount_id"),
    discountPercent: integer("discount_percent").notNull().default(0),
    reservationReleased: integer("reservation_released").notNull().default(0),
    accessHash: text("access_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    paidAt: integer("paid_at"),
    refundedAt: integer("refunded_at"),
    isTest: integer("is_test").notNull().default(0),
  },
  (t) => [
    index("orders_store").on(t.storeId),
    index("analytics_checkout_starts")
      .on(t.storeId, t.createdAt)
      .where(
        sql`${t.isTest}=0 AND ${t.status}<>'free' AND ${t.sessionId} IS NOT NULL`,
      ),
    index("analytics_purchases")
      .on(t.storeId, t.paidAt)
      .where(sql`${t.isTest}=0 AND ${t.status}='paid'`),
  ],
);
export const views = sqliteTable(
  "views",
  {
    id: text().primaryKey(),
    storeId: text("store_id").notNull(),
    productId: text("product_id").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    day: text().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("view_daily").on(t.storeId, t.productId, t.visitorHash, t.day),
  ],
);
export const outbox = sqliteTable("outbox", {
  id: text().primaryKey(),
  storeId: text("store_id").notNull(),
  orderId: text("order_id").notNull(),
  payload: text().notNull(),
  status: text().notNull().default("pending"),
  attempts: integer().notNull().default(0),
  generation: integer().notNull().default(0),
  nextAt: integer("next_at").notNull(),
  lockedUntil: integer("locked_until").notNull().default(0),
  lastError: text("last_error"),
  createdAt: integer("created_at").notNull(),
});
export const emailAttempts = sqliteTable("email_attempts", {
  id: text().primaryKey(),
  outboxId: text("outbox_id").notNull(),
  status: text().notNull(),
  createdAt: integer("created_at").notNull(),
});
export const webhookEvents = sqliteTable("webhook_events", {
  id: text().primaryKey(),
  stream: text().notNull(),
  createdAt: integer("created_at").notNull(),
});
export const entitlements = sqliteTable("entitlements", {
  storeId: text("store_id").primaryKey(),
  kind: text().notNull().default("none"),
  status: text().notNull().default("inactive"),
  customerId: text("customer_id"),
  subscriptionId: text("subscription_id"),
  paymentIntent: text("payment_intent"),
  paidUntil: integer("paid_until"),
  graceUntil: integer("grace_until"),
  updatedAt: integer("updated_at").notNull(),
  lastEventAt: integer("last_event_at").notNull().default(0),
  grantJson: text("grant_json"),
});
export const connections = sqliteTable("connections", {
  id: text().primaryKey(),
  storeId: text("store_id").notNull(),
  ownerId: text("owner_id").notNull(),
  clientId: text("client_id").notNull(),
  name: text().notNull(),
  revokedAt: integer("revoked_at"),
  scopes: text().notNull().default("store:read"),
  createdAt: integer("created_at").notNull(),
});
export const rates = sqliteTable("rates", {
  key: text().primaryKey(),
  count: integer().notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const creatorEmailCodes = sqliteTable(
  "creator_email_codes",
  {
    challengeHash: text("challenge_hash").primaryKey(),
    email: text().notNull().unique(),
    codeHash: text("code_hash").notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("creator_email_codes_expiry").on(t.expiresAt)],
);
