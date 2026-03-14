import { describe, expect, test } from "vitest";
import { commands } from "vitest/browser";

describe("dev hydration", () => {
  test("does not log Lingui locale initialization errors during hydration", async () => {
    const result = await commands.captureHydrationErrors("/playground?lang=en");

    expect(result.errors).toEqual([]);
  });

  test("renders japanese catalogs after switching the locale", async () => {
    const result = await commands.captureHydrationErrors("/playground?lang=ja");

    expect(result.bodyText).toContain("プレイグラウンド");
    expect(result.bodyText).toContain("SvelteKit さん、こんにちは！");
    expect(result.bodyText).toContain(
      "Lingui 経由で再レンダーされる様子を確認してください。",
    );
    expect(result.errors).toEqual([]);
  });
});
