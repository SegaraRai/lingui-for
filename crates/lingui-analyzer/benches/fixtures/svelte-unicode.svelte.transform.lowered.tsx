import { i18n as _i18n } from "@lingui/core";
import { Trans } from "lingui-for-svelte/macro";
const __lf_0 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "grYdd0",
  message: "\u3088\u3046\u3053\u305D {readerName}",
  values: {
    readerName: readerName
  }
}), "translate");
const __lf_1 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
// Note that this method is actually not recommended for complex messages with multiple variables.
// It's better to use `select` or `plural` for such cases.
{
  id: "DSRd7/",
  message: "\u53C2\u7167\u4E2D\u306E\u30D1\u30B9\u306F {0} \u3067\u3001\u5019\u88DC\u306F {1} \u3067\u3059\u3002",
  values: {
    0: String(selectedPath ?? _i18n._(
    /*i18n*/
    {
      id: "ggPEgU",
      message: "\u672A\u8A2D\u5B9A"
    })),
    1: String(relatedPaths[1] ?? _i18n._(
    /*i18n*/
    {
      id: "gkv1jV",
      message: "\u3042\u308A\u307E\u305B\u3093"
    }))
  }
}), "translate");
const __lf_2 = <Trans>
      ロケール{" "}<strong>{localeLabel}</strong>{" "}で{" "}<span>{String(selectedPath ?? "")}</span>{" "}を確認しています。
    </Trans>;
const __lf_3 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "AUUW5v",
  message: "\u5019\u88DC\u30D1\u30B9: {0}",
  values: {
    0: String(path ?? "")
  }
}), "translate");