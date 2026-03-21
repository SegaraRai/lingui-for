import { describe, expect, it } from "vite-plus/test";

import {
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_CONTEXT,
  RUNTIME_BINDING_GET_LINGUI_CONTEXT,
  RUNTIME_BINDING_I18N,
  RUNTIME_BINDING_RUNTIME_TRANS,
  SYNTHETIC_PREFIX_COMPONENT,
  SYNTHETIC_PREFIX_EXPRESSION,
} from "./constants.ts";

describe("shared/constants", () => {
  it("exports stable package and binding constants", () => {
    expect(PACKAGE_MACRO).toBe("lingui-for-astro/macro");
    expect(PACKAGE_RUNTIME).toBe("lingui-for-astro/runtime");
    expect(SYNTHETIC_PREFIX_EXPRESSION).toContain("expr");
    expect(SYNTHETIC_PREFIX_COMPONENT).toContain("component");
    expect(RUNTIME_BINDING_GET_LINGUI_CONTEXT).toContain("getLinguiContext");
    expect(RUNTIME_BINDING_CONTEXT).toContain("ctx");
    expect(RUNTIME_BINDING_I18N).toContain("i18n");
    expect(RUNTIME_BINDING_RUNTIME_TRANS).toContain("RuntimeTrans");
  });
});
