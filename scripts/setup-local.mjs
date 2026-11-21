import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const env = {
  ...process.env,
  XDG_CONFIG_HOME: "/tmp/coachlane-config",
  WRANGLER_SEND_METRICS: "false",
};
mkdirSync("/tmp/coachlane-config", { recursive: true });
if (!existsSync(".dev.vars")) {
  const secret = () => randomBytes(40).toString("hex");
  writeFileSync(
    ".dev.vars",
    `SESSION_SECRET=${secret()}\nDOWNLOAD_SECRET=${secret()}\nOAUTH_BRIDGE_SECRET=${secret()}\n`,
    { mode: 0o600 },
  );
}
function run(args) {
  const result = spawnSync(
    "node",
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    { env, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
run(["d1", "migrations", "apply", "DB", "--local"]);
if (process.argv.includes("--demo")) {
  run(["d1", "execute", "DB", "--local", "--file", "fixtures/demo.sql"]);
  const content = {
    reset: [
      "The Business Reset",
      "1. What do you want your business to make possible?",
      "2. List the offers you enjoy delivering most.",
      "3. Identify one task you can simplify this month.",
      "4. Choose one small experiment and write its success measure.",
      "5. Revisit the results in two weeks.",
    ],
    pricing: [
      "The Pricing Playbook",
      "1. Write down the customer outcome your resource supports.",
      "2. List your delivery costs and time investment.",
      "3. Separate observed customer feedback from assumptions.",
      "4. Compare one pricing experiment with a clear baseline.",
      "5. Track confirmed purchases, views and refund requests.",
    ],
    clarity: [
      "Find Your Clarity",
      "1. Who is this resource for?",
      "2. What specific problem does it help them work through?",
      "3. What is the smallest useful next action?",
      "4. What evidence would show that the resource helped?",
      "5. What assumption would you like to test next?",
    ],
  };
  for (const [key, lines] of Object.entries(content)) {
    const commands = [
      "BT /F1 20 Tf 50 750 Td (" + lines[0] + ") Tj /F1 12 Tf",
      ...lines
        .slice(1)
        .map((line) => "0 -45 Td (" + line.replace(/[()\\]/g, "\\$&") + ") Tj"),
      "0 -65 Td (FICTIONAL DEMO RESOURCE - Coachlane development fixture) Tj ET",
    ].join("\n");
    let pdf = "%PDF-1.4\n";
    const objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`,
      ],
      offsets = [0];
    for (let i = 0; i < objs.length; i++) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf);
    pdf +=
      "xref\n0 6\n0000000000 65535 f \n" +
      offsets
        .slice(1)
        .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
        .join("") +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    mkdirSync("artifacts", { recursive: true });
    const name = {
      reset: "business-reset",
      pricing: "pricing-playbook",
      clarity: "clarity-guide",
    }[key];
    writeFileSync(`artifacts/${name}.pdf`, pdf);
    run([
      "r2",
      "object",
      "put",
      `coachlane-private-dev/demo-store/demo-${key}/${name}.pdf`,
      "--file",
      `artifacts/${name}.pdf`,
      "--content-type",
      "application/pdf",
      "--local",
    ]);
    run([
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      `UPDATE assets SET size=${Buffer.byteLength(pdf)} WHERE id='demo-${key}'`,
    ]);
  }
}
console.log(
  "Local setup complete. Demo fixtures are opt-in and never applied to production.",
);
