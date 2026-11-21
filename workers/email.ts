import { dispatchOutbox, deliverEmail } from "../src/lib/email";
import type { AppEnv } from "../src/lib/env";
export default {
  async fetch() {
    return new Response("Coachlane fulfillment worker", { status: 200 });
  },
  async scheduled(
    _event: ScheduledController,
    env: AppEnv,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(dispatchOutbox(env));
  },
  async queue(batch: MessageBatch<{ id: string }>, env: AppEnv) {
    for (const message of batch.messages) {
      try {
        await deliverEmail(env, message.body.id);
        message.ack();
      } catch {
        message.retry({ delaySeconds: 60 });
      }
    }
  },
};
