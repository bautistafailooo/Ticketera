import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { DATABASE_URL: "file:./test.db", RATE_LIMITS: "off", SIMULATED_PAYMENTS: "true", UPLOAD_DIR: "test-uploads", MAIL_TRANSPORT: "memory", PUBLIC_URL: "https://ecko.test" },
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
  },
});
