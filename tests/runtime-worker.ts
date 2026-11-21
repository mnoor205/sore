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
import { getProduct, saveProduct } from "../src/lib/catalog";
import { salesSummary } from "../src/lib/reporting";
import {
  createMcpServer,
  authorizeConnection,
  type AuthProps,
} from "../src/lib/mcp";
import { completeUpload } from "../src/lib/uploads";
import { deliverEmail } from "../src/lib/email";
import { verifyWebhook } from "../src/lib/webhooks";
import { billingCheckout } from "../src/lib/billing";
import { database } from "../src/lib/db";
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
