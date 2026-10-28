import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Garantia de que o build da Vercel nunca baixa browsers do Playwright:
 * o download só acontece no CI, via `npx playwright install` no workflow.
 */

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const INSTALL_HOOKS = ["preinstall", "install", "postinstall", "prepare", "prebuild", "build", "postbuild"];

describe("build sem browsers do Playwright", () => {
  it("nenhum script de instalação ou de build do projeto chama o Playwright", () => {
    for (const hook of INSTALL_HOOKS) {
      expect(pkg.scripts?.[hook] ?? "", `script "${hook}"`).not.toMatch(/playwright/i);
    }
    expect(pkg.scripts.build).toBe("next build");
  });

  it("Playwright fica só em devDependencies", () => {
    expect(pkg.dependencies?.["@playwright/test"]).toBeUndefined();
    expect(pkg.dependencies?.playwright).toBeUndefined();
    expect(pkg.devDependencies?.["@playwright/test"]).toBeDefined();
  });

  it("pacotes do Playwright não têm script de instalação (não baixam browsers no npm install)", () => {
    const entries = Object.entries(lock.packages as Record<string, { hasInstallScript?: boolean }>).filter(([path]) =>
      /node_modules\/(@playwright\/test|playwright|playwright-core)$/.test(path),
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const [path, meta] of entries) expect(meta.hasInstallScript, path).not.toBe(true);
  });

  it("o workflow de CI é o único lugar que instala browsers", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toMatch(/npx playwright install --with-deps chromium/);
  });
});
