import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI testa o build de produção; localmente o dev server basta.
    command: isCI ? `npm run build && npm run start -- -p ${PORT}` : `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: { BRIEFLY_MOCK_LLM: "1", BRIEFLY_RATE_LIMIT_PER_HOUR: "1000" },
  },
});
