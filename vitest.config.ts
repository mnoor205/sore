import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/runtime.test.ts", "tests/branded-email.test.ts"],
    testTimeout: 20000,
    hookTimeout: 60000,
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
  },
});
