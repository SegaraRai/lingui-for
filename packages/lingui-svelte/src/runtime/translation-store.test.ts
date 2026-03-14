import { setupI18n } from "@lingui/core";
import { readable } from "svelte/store";
import { describe, expect, it } from "vitest";

import { createTranslationStore } from "./translation-store.ts";

describe("createTranslationStore", () => {
  it("translates descriptors eagerly through direct calls", () => {
    const instance = setupI18n({
      locale: "en",
      messages: {
        en: {
          hello: "Hello",
        },
      },
    });

    const store = createTranslationStore(
      () => readable(instance),
      () => instance,
    );

    expect(store({ id: "hello", message: "Hello" })).toBe("Hello");
  });

  it("publishes a translator function and updates subscribers on locale changes", () => {
    const instance = setupI18n({
      locale: "en",
      messages: {
        en: {
          greeting: "Hello",
        },
      },
    });
    const store = createTranslationStore(
      () =>
        readable(instance, (set) => {
          const update = () => {
            set(instance);
          };

          instance.on("change", update);
          return () => {
            instance.removeListener("change", update);
          };
        }),
      () => instance,
    );
    const values: string[] = [];
    const unsubscribe = store.subscribe((translate) => {
      values.push(translate({ id: "greeting", message: "Hello" }));
    });

    instance.loadAndActivate({
      locale: "ja",
      messages: {
        greeting: "こんにちは",
      },
    });

    unsubscribe();

    expect(values).toContain("Hello");
    expect(values).toContain("こんにちは");
  });
});
