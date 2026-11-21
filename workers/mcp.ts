import OAuthProvider, {
  type OAuthHelpers,
  type AuthRequest,
  type ConsentDescription,
  AuthorizationError,
} from "@cloudflare/workers-oauth-provider";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { and, eq } from "drizzle-orm";
import { database } from "../src/lib/db";
import { stores, connections } from "../src/lib/schema";
import { type AppEnv } from "../src/lib/env";
import {
  createMcpServer,
  authorizeConnection,
  type AuthProps,
} from "../src/lib/mcp";
import {
  AppError,
  id,
  now,
  sign,
  token,
  verify,
  rateLimit,
} from "../src/lib/security";
type Env = AppEnv & { OAUTH_KV: KVNamespace; OAUTH_PROVIDER: OAuthHelpers };
const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function consentHtml(details: ConsentDescription, handle: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect to Sore</title><style>body{font:16px system-ui;color:#20202b;background:#f6f5fa;padding:8vh 20px}main{max-width:480px;margin:auto;background:white;padding:36px;border:1px solid #e6e3ef;border-radius:20px}h1{font-size:28px}p{line-height:1.6}button{font:inherit;padding:12px 20px;border:0;border-radius:8px;background:#6d4aff;color:white;margin:16px 12px 0 0}button[value=deny]{background:#eeebf7;color:#292038}</style></head><body><main><p>SORE / AI CONNECTION</p><h1>Allow ${escape(details.clientName)} to connect to your store?</h1><p>${details.clientDomain ? `Published by <strong>${escape(details.clientDomain)}</strong>.` : "This client registered itself. Its name is not verified."}</p><p>Access will be sent to <strong>${escape(details.redirectHost)}</strong>.</p>${details.redirectIsLoopback ? "<p>This sends access to an app on your computer. Continue only if you started this connection.</p>" : ""}<p>Permission: <strong>store:read</strong>. Catalog and aggregate reporting only. No customer emails, names, payment details, files or private delivery URLs. You can revoke this connection in your dashboard.</p><form method="post" action="/authorize"><input type="hidden" name="handle" value="${escape(handle)}">${details.scope.includes("products:draft:write") ? '<p><label><input type="checkbox" name="scope" value="products:draft:write"> Also allow creating and updating private product drafts. This cannot publish, delete, message customers, or change live prices.</label></p>' : ""}<button name="decision" value="approve">Approve selected permissions</button><button name="decision" value="deny">Deny</button></form></main></body></html>`;
}
function cookie(req: Request, name: string) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
const defaultHandler = {
  async fetch(req: Request, env: Env) {
    try {
      const url = new URL(req.url),
        oauth = env.OAUTH_PROVIDER;
      if (url.pathname === "/health")
        return Response.json({
          service: "coachlane-mcp",
          transport: "Streamable HTTP",
          authenticated: true,
        });
      if (url.pathname === "/authorize" && req.method === "GET") {
        await rateLimit(
          env,
          "oauth:" + (req.headers.get("cf-connecting-ip") || "local"),
          20,
        );
        const request = await oauth.parseAuthRequest(req);
        if (!request.codeChallenge || request.codeChallengeMethod !== "S256")
          throw new AppError("PKCE S256 is required");
        if (
          !request.scope.includes("store:read") ||
          request.scope.some(
            (s) => !["store:read", "products:draft:write"].includes(s),
          )
        )
          throw new AppError("Unsupported permission");
        await oauth.describeConsent(request);
        const nonce = token();
        await env.OAUTH_KV.put(`login:${nonce}`, JSON.stringify(request), {
          expirationTtl: 300,
        });
        const bridge = await sign(
          { nonce, aud: env.APP_URL },
          env.OAUTH_BRIDGE_SECRET,
          300,
        );
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${env.APP_URL}/api/oauth/bridge?request=${encodeURIComponent(bridge)}`,
            "Set-Cookie": `__Host-cl-login=${nonce}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`,
            "Cache-Control": "no-store",
          },
        });
      }
      if (url.pathname === "/callback" && req.method === "GET") {
        const ticket = await verify<{
          nonce: string;
          subject: string;
          storeId: string;
          aud: string;
        }>(url.searchParams.get("ticket") || "", env.OAUTH_BRIDGE_SECRET);
        if (
          ticket.aud !== env.MCP_URL ||
          cookie(req, "__Host-cl-login") !== ticket.nonce
        )
          throw new AppError("OAuth sign-in state mismatch", 401);
        const request = await env.OAUTH_KV.get<AuthRequest>(
          `login:${ticket.nonce}`,
          "json",
        );
        if (!request) throw new AppError("Connection request expired");
        await env.OAUTH_KV.delete(`login:${ticket.nonce}`);
        const store = await database(env)
          .select()
          .from(stores)
          .where(
            and(
              eq(stores.id, ticket.storeId),
              eq(stores.ownerId, ticket.subject),
            ),
          )
          .get();
        if (!store) throw new AppError("Store is not authorized", 403);
        const details = await oauth.describeConsent(request),
          consent = await oauth.beginConsent(request);
        const session = await sign(
          {
            storeId: store.id,
            ownerId: ticket.subject,
            handle: consent.handle,
            requestedScopes: request.scope,
          },
          env.OAUTH_BRIDGE_SECRET,
          300,
        );
        consent.headers.append(
          "Set-Cookie",
          `__Host-cl-consent=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`,
        );
        consent.headers.set("Content-Type", "text/html;charset=utf-8");
        return new Response(consentHtml(details, consent.handle), {
          headers: consent.headers,
        });
      }
      if (url.pathname === "/authorize" && req.method === "POST") {
        const origin = req.headers.get("origin");
        if (origin !== new URL(env.MCP_URL).origin)
          throw new AppError("Invalid consent origin", 403);
        const form = await req.formData(),
          handle = String(form.get("handle"));
        const owner = await verify<{
          storeId: string;
          ownerId: string;
          handle: string;
          requestedScopes: string[];
        }>(cookie(req, "__Host-cl-consent"), env.OAUTH_BRIDGE_SECRET);
        if (owner.handle !== handle)
          throw new AppError("Consent state mismatch", 403);
        if (form.get("decision") !== "approve") {
          const denied = await oauth.denyConsent(req, handle);
          return new Response(null, { status: 302, headers: denied.headers });
        }
        const requestedWrite = form
          .getAll("scope")
          .map(String)
          .includes("products:draft:write");
        if (
          requestedWrite &&
          !owner.requestedScopes.includes("products:draft:write")
        )
          throw new AppError("Draft permission was not requested", 403);
        const granted = [
          "store:read",
          ...(requestedWrite ? ["products:draft:write"] : []),
        ];
        const approved = await oauth.approveConsent(req, handle, {
            scope: granted,
          }),
          connectionId = id();
        const details = await oauth.describeConsent(approved.request);
        await database(env)
          .insert(connections)
          .values({
            id: connectionId,
            storeId: owner.storeId,
            ownerId: owner.ownerId,
            clientId: approved.request.clientId,
            name: details.clientName,
            scopes: granted.join(" "),
            createdAt: now(),
          });
        const completed = await oauth.completeAuthorization({
          request: approved.request,
          userId: owner.ownerId,
          metadata: { connectionId },
          scope: granted,
          props: {
            storeId: owner.storeId,
            ownerId: owner.ownerId,
            connectionId,
          },
        });
        approved.headers.set("Location", completed.redirectTo);
        return new Response(null, { status: 302, headers: approved.headers });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo)
        return Response.redirect(error.redirectTo, 302);
      return new Response(
        error instanceof AppError || error instanceof AuthorizationError
          ? escape(error.message)
          : "Unable to authorize this connection",
        {
          status: error instanceof AppError ? error.status : 400,
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": "no-store",
          },
        },
      );
    }
  },
};
const apiHandler = {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    try {
      const auth = ctx as ExecutionContext & {
        props: AuthProps;
        auth: { scope: string[] };
      };
      if (!auth.auth.scope.includes("store:read"))
        return new Response("Missing store:read scope", { status: 403 });
      await authorizeConnection(env, auth.props);
      await rateLimit(env, `mcp:${auth.props.connectionId}`, 60);
      const origin = req.headers.get("origin");
      if (origin && origin !== new URL(env.MCP_URL).origin)
        throw new AppError("Origin denied", 403);
      if (Number(req.headers.get("content-length") || 0) > 65536)
        throw new AppError("Request too large", 413);
      const server = createMcpServer(env, auth.props, auth.auth.scope),
        transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
      await server.connect(transport);
      return await transport.handleRequest(req);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof AppError ? error.message : "MCP request failed",
        },
        { status: error instanceof AppError ? error.status : 500 },
      );
    }
  },
};
export function oauthProvider(env: Env) {
  return new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler,
    defaultHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/register",
    scopesSupported: ["store:read", "products:draft:write"],
    requiredScopes: ["store:read"],
    accessTokenTTL: 3600,
    refreshTokenTTL: 2592000,
    resourceMetadata: {
      resource: `${env.MCP_URL}/mcp`,
      authorization_servers: [env.MCP_URL],
    },
    clientIdMetadataDocumentEnabled: true,
  });
}
export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    return oauthProvider(env).fetch(req, env, ctx);
  },
};
