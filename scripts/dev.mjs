import { spawn } from "node:child_process";
const args = process.argv.slice(2);
let port = process.env.PORT || "3000",
  host = "0.0.0.0";
for (let i = 0; i < args.length; i++) {
  if (["--port", "-p"].includes(args[i])) port = args[++i];
  else if (["--host", "--hostname", "--ip"].includes(args[i])) host = args[++i];
}
const child = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    // SORE_REMOTE_AI=1 connects the storefront AI editor to the real AI binding
    // (requires `wrangler login`). Otherwise everything, including D1/R2, stays local.
    ...(process.env.SORE_REMOTE_AI === "1" ? [] : ["--local"]),
    "--ip",
    host,
    "--port",
    port,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(process.env.SORE_REMOTE_AI === "1"
        ? {}
        : { XDG_CONFIG_HOME: "/tmp/coachlane-config" }),
      WRANGLER_SEND_METRICS: "false",
    },
  },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
