import {
  requestEmailCode,
  completeEmailCode,
} from "../src/lib/branded-email-auth";
import { sessionIdentity, revokeSession } from "../src/lib/email-auth";
import { AppError } from "../src/lib/security";
import type { AppEnv } from "../src/lib/env";
let messages: EmailMessageBuilder[] = [];
export default {
  async fetch(req: Request, env: AppEnv) {
    try {
      const b = (await req.json()) as Record<string, any>;
      const path = new URL(req.url).pathname;
      const ready: AppEnv = {
        ...env,
        LOGIN_EMAIL: {
          send: async (message: EmailMessage | EmailMessageBuilder) => {
            if (b.fail) throw new Error("Provider rejected");
            messages.push(message as EmailMessageBuilder);
            return { messageId: "fixture" };
          },
        },
      };
      if (path === "/init") {
        await env.DB.exec(b.sql);
        return Response.json({ ok: true });
      }
      if (path === "/query")
        return Response.json(
          await env.DB.prepare(b.sql)
            .bind(...(b.args || []))
            .all(),
        );
      if (path === "/request")
        return Response.json(
          await requestEmailCode(ready, {
            email: b.email,
            returnTo: b.returnTo,
            ip: b.ip || "1",
          }),
        );
      if (path === "/verify")
        return Response.json(
          await completeEmailCode(ready, b.state, b.code, b.ip || "1"),
        );
      if (path === "/session")
        return Response.json(await sessionIdentity(env, b.session));
      if (path === "/revoke") {
        await revokeSession(env, b.session);
        return Response.json({ ok: true });
      }
      if (path === "/messages") return Response.json(messages);
      if (path === "/reset") {
        messages = [];
        await env.DB.exec(
          "DELETE FROM creator_sessions; DELETE FROM creator_email_codes; DELETE FROM rates;",
        );
        return Response.json({ ok: true });
      }
      throw new Error("Missing fixture route");
    } catch (e) {
      return Response.json(
        { error: (e as Error).message },
        { status: e instanceof AppError ? e.status : 400 },
      );
    }
  },
};
