import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "tests/built-app.test.ts",
      "tests/email-auth-app.test.ts",
      "tests/branded-email-app.test.ts",
    ],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
