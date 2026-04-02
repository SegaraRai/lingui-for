import { t as translate } from "lingui-for-svelte/runtime";
import { i18n as _i18n } from "@lingui/core";
import { Trans as _Trans } from "@lingui/react";
const __lf_0 = translate(
  /*i18n*/
  {
    id: "grYdd0",
    message: "\u3088\u3046\u3053\u305D {readerName}",
    values: {
      readerName: readerName,
    },
  },
);
const __lf_1 = translate(
  /*i18n*/
  // Note that this method is actually not recommended for complex messages with multiple variables.
  // It's better to use `select` or `plural` for such cases.
  {
    id: "DSRd7/",
    message:
      "\u53C2\u7167\u4E2D\u306E\u30D1\u30B9\u306F {0} \u3067\u3001\u5019\u88DC\u306F {1} \u3067\u3059\u3002",
    values: {
      0: String(selectedPath ?? $translate`未設定`),
      1: String(relatedPaths[1] ?? $translate`ありません`),
    },
  },
);
const __lf_2 = (
  <_Trans
    {
      /*i18n*/
      ...{
        id: "fgdhx6",
        message:
          "\u30ED\u30B1\u30FC\u30EB <0>{localeLabel}</0> \u3067 <1>{0}</1> \u3092\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059\u3002",
        values: {
          0: String(selectedPath ?? ""),
          localeLabel: localeLabel,
        },
        components: {
          0: <strong />,
          1: <span />,
        },
      }
    }
  />
);
const __lf_3 = translate(
  /*i18n*/
  {
    id: "AUUW5v",
    message: "\u5019\u88DC\u30D1\u30B9: {0}",
    values: {
      0: String(path ?? ""),
    },
  },
);
