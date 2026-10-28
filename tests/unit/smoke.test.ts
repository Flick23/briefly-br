import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("mescla classes do Tailwind resolvendo conflitos", () => {
    expect(cn("px-2", "px-4", false && "hidden")).toBe("px-4");
  });
});
