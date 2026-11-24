import {
  beginCheckout,
  confirmOrder,
  refundOrder,
  entitled,
} from "../src/lib/payments";
import {
  orderAccess,
  mayAccess,
  downloadLink,
  download,
} from "../src/lib/access";
import { getStore, getProduct, saveProduct } from "../src/lib/catalog";
import {
  recordTraffic,
  setAnalyticsSettings,
  storefrontAnalytics,
} from "../src/lib/storefront-analytics";
import { productVisitReport, salesSummary } from "../src/lib/reporting";
import {
  createMcpServer,
  authorizeConnection,
  type AuthProps,
} from "../src/lib/mcp";
import { completeUpload } from "../src/lib/uploads";
import { deliverEmail } from "../src/lib/email";
import { verifyWebhook } from "../src/lib/webhooks";
import {
  billingCheckout,
  connectPayments,
  stripeAccountSession,
} from "../src/lib/billing";
import { database } from "../src/lib/db";
import { claimLifetime } from "../src/lib/lifetime-links";
import { stores } from "../src/lib/schema";
import { eq } from "drizzle-orm";
import { sign, verify, AppError } from "../src/lib/security";
import mcpWorker from "../workers/mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  loadSetup,
  saveSetup,
  completeSetupStep,
  rehearseDelivery,
} from "../src/lib/onboarding";
import { storeLimits, type AppEnv } from "../src/lib/env";
import {
  beginEmailLogin,
  completeEmailLogin,
  sessionIdentity,
  revokeSession,
  verifyAccessIdentity,
} from "../src/lib/email-auth";
import { importStanStore, previewStanStore } from "../src/lib/stan-import";
import { storefrontChat } from "../src/lib/storefront-ai";
import { publicImageResponse } from "../src/lib/media";
import { prepareUpload } from "../src/lib/uploads";
import {
  discardDraft,
  draftView,
  messages as storefrontMessages,
  publishDraft,
  saveDraft,
} from "../src/lib/storefront-draft";
async function storeRow(env: AppEnv, storeId: string) {
  const s = await database(env)
    .select()
    .from(stores)
    .where(eq(stores.id, storeId))
    .get();
  if (!s) throw new AppError("Store unavailable", 404);
  return s;
}
export default {
  async fetch(req: Request, env: AppEnv, ctx: ExecutionContext) {
    const path = new URL(req.url).pathname;
    if (!path.startsWith("/test/"))
      return mcpWorker.fetch(
        req,
        env as Parameters<typeof mcpWorker.fetch>[1],
        ctx,
      );
    try {
      const b = (await req.json()) as Record<string, any>;
      let value: unknown;
      switch (path) {
        case "/test/analytics": {
          const store = await getStore(env, b.slug);
          const points: AnalyticsEngineDataPoint[] = [];
          const analyticsEnv = {
            ...env,
            ANALYTICS_DATASET: "test_storefront",
            ANALYTICS_ACCOUNT_ID: "0".repeat(32),
            ANALYTICS_READ_TOKEN: "test",
            STOREFRONT_ANALYTICS: {
              writeDataPoint(event?: AnalyticsEngineDataPoint) {
                if (event) points.push(event);
              },
            },
          };
          if (b.action === "report")
            value = await storefrontAnalytics(analyticsEnv, store, b.days);
          else if (b.action === "settings")
            value = await setAnalyticsSettings(env, store, b.input);
          else
            value = {
              recorded: await recordTraffic(
                analyticsEnv,
                store,
                b.kind,
                new Headers(b.headers),
                async () => b.ownerId,
                async () => b.input,
              ),
              points,
            };
          break;
        }
        case "/test/email-auth-start":
          value = await beginEmailLogin(env, b.returnTo);
          break;
        case "/test/email-auth-verify":
          value = await verifyAccessIdentity(env, b.assertion);
          break;
        case "/test/email-auth-complete":
          value = await completeEmailLogin(env, {
            stateCookie: b.stateCookie,
            nonce: b.nonce,
            assertion: b.assertion,
          });
          break;
        case "/test/email-auth-session":
          value = await sessionIdentity(env, b.session);
          break;
        case "/test/email-auth-revoke":
          await revokeSession(env, b.session);
          value = { ok: true };
          break;
        case "/test/stan-preview":
          value = await previewStanStore(env, b.storeId, b.url);
          break;
        case "/test/stan-import":
          value = await importStanStore(env, b.storeId, b.input);
          break;
        case "/test/storefront-chat": {
          // A stand-in for the Workers AI binding that records what the app sends.
          const calls: unknown[] = [];
          const aiEnv: AppEnv = {
            ...env,
            AI: b.noAi
              ? undefined
              : {
                  aiGatewayLogId: "log_fixture",
                  async run(model, input, options) {
                    calls.push({ model, input, options });
                    if (b.aiFail) throw new Error("gateway unavailable");
                    return b.aiResponse;
                  },
                },
          };
          const result = await storefrontChat(
            aiEnv,
            await storeRow(env, b.storeId),
            b.input,
          );
          value = { result, calls };
          break;
        }
        case "/test/storefront-view": {
          const view = await draftView(env, await storeRow(env, b.storeId));
          value = {
            ...view,
            messages: await storefrontMessages(env, b.storeId),
          };
          break;
        }
        case "/test/storefront-save": {
          const view = await draftView(env, await storeRow(env, b.storeId));
          value = {
            version: await saveDraft(
              env,
              b.storeId,
              view.live,
              { ...view.live, customSite: b.site },
              b.expectedVersion,
            ),
          };
          break;
        }
        case "/test/storefront-publish":
          value = await publishDraft(
            env,
            await storeRow(env, b.storeId),
            b.expectedVersion,
          );
          break;
        case "/test/storefront-discard":
          value = await discardDraft(env, b.storeId, b.expectedVersion);
          break;
        case "/test/init":
          await env.DB.exec(b.sql);
          value = { ok: true };
          break;
        case "/test/query":
          value = await env.DB.prepare(b.sql)
            .bind(...(b.args || []))
            .all();
          break;
        case "/test/billing": {
          const s = await database(env)
            .select()
            .from(stores)
            .where(eq(stores.id, b.storeId))
            .get();
          value = await billingCheckout(env, s!, b.kind);
          break;
        }
        case "/test/claim-lifetime":
          value = { claimed: await claimLifetime(env, b.storeId) };
          break;
        case "/test/connect": {
          const s = await database(env)
            .select()
            .from(stores)
            .where(eq(stores.id, b.storeId))
            .get();
          value = await connectPayments(env, s!, b.country);
          break;
        }
        case "/test/account-session": {
          const s = await database(env)
            .select()
            .from(stores)
            .where(eq(stores.id, b.storeId))
            .get();
          value = await stripeAccountSession(env, s!);
          break;
        }
        case "/test/checkout":
          value = await beginCheckout(env, b.storeId, b.input);
          break;
        case "/test/confirm":
          await confirmOrder(env, b.orderId, b.storeId, b.values);
          value = { ok: true };
          break;
        case "/test/access": {
          const order = await orderAccess(env, b.orderId, b.token);
          value = { allowed: mayAccess(order), status: order.status };
          break;
        }
        case "/test/link":
          value = { url: await downloadLink(env, b.orderId, b.token) };
          break;
        case "/test/download":
          return await download(env, b.ticket);
        case "/test/refund":
          await refundOrder(
            env,
            b.paymentIntent,
            b.account,
            b.refunded,
            b.total,
            b.records,
          );
          value = { ok: true };
          break;
        case "/test/setup-load":
          value = await loadSetup(env, b.ownerId);
          break;
        case "/test/setup-save":
          value = await saveSetup(env, b.ownerId, b.input);
          break;
        case "/test/setup-step":
          value = await completeSetupStep(env, b.ownerId, b.step);
          break;
        case "/test/rehearse":
          value = await rehearseDelivery(env, b.storeId, b.productId);
          break;
        case "/test/save-production":
          value = {
            id: await saveProduct(
              { ...env, APP_MODE: "production" },
              b.storeId,
              b.input,
              b.productId,
            ),
          };
          break;
        case "/test/save":
          value = {
            id: await saveProduct(env, b.storeId, b.input, b.productId),
          };
          break;
        case "/test/product":
          value = await getProduct(env, b.storeId, b.productId);
          break;
        case "/test/upload":
          value = await completeUpload(env, b.storeId, b.assetId);
          break;
        case "/test/prepare-upload":
          value = await prepareUpload(env, b.storeId, b.input);
          break;
        case "/test/public-image":
          return await publicImageResponse(env, b.assetId);
        case "/test/put-file":
          await env.FILES.put(b.key, new Uint8Array(b.bytes));
          value = { ok: true };
          break;
        case "/test/visits":
          value = await productVisitReport(env, b.storeId, b.range);
          break;
        case "/test/report":
          value = await salesSummary(env, b.storeId, b.range);
          break;
        case "/test/limits":
          value = await storeLimits(
            { ...env, MAX_PRODUCTS: "2", MAX_STORAGE_MB: "5" },
            b.storeId,
          );
          break;
        case "/test/entitled":
          value = { allowed: entitled(b.entitlement, b.at) };
          break;
        case "/test/email":
          await deliverEmail(
            { ...env, APP_MODE: b.production ? "production" : "development" },
            b.id,
          );
          value = { ok: true };
          break;
        case "/test/webhook":
          value = await verifyWebhook(
            env,
            new Request("https://app.example.test/api/webhooks/connect", {
              method: "POST",
              headers: { "stripe-signature": b.signature },
              body: b.payload,
            }),
            b.stream || "connect",
          );
          break;
        case "/test/connection":
          value = { storeId: await authorizeConnection(env, b.props) };
          break;
        case "/test/sign":
          value = {
            ticket: await sign(b.data, env.OAUTH_BRIDGE_SECRET, b.seconds),
          };
          break;
        case "/test/verify":
          value = await verify(b.ticket, env.OAUTH_BRIDGE_SECRET);
          break;
        case "/test/mcp": {
          const server = createMcpServer(
              env,
              b.props,
              b.scopes || ["store:read"],
            ),
            transport = new WebStandardStreamableHTTPServerTransport({
              sessionIdGenerator: undefined,
              enableJsonResponse: true,
            });
          await server.connect(transport);
          return transport.handleRequest(
            new Request("https://mcp.example.test/mcp", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
                "MCP-Protocol-Version": "2025-11-25",
              },
              body: JSON.stringify(b.message),
            }),
          );
        }
        default:
          throw new AppError("Not found", 404);
      }
      return Response.json(value);
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Error" },
        { status: e instanceof AppError ? e.status : 400 },
      );
    }
  },
};
