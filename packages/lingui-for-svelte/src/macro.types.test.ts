import type { MessageId } from "@lingui/core";
import { expectTypeOf, test } from "vite-plus/test";

import type { TransProps } from "./macro.ts";

test("Trans id follows Lingui's MessageId so typed message IDs apply", () => {
  expectTypeOf<NonNullable<TransProps["id"]>>().toEqualTypeOf<MessageId>();
});
