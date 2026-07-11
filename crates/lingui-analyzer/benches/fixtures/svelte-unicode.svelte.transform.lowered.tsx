import { i18n as _i18n } from "@lingui/core";
import { Trans as _Trans } from "@lingui/react";
const __lf_0 = __lingui_for_svelte_reactive_translation__(_i18n._(
/** i18n */
{
  id: "grYdd0",
  message: "ようこそ {readerName}",
  values: {
    readerName: readerName
  }
}), "translate");
const __lf_1 = __lingui_for_svelte_reactive_translation__(_i18n._(
/** i18n */
// Note that this method is actually not recommended for complex messages with multiple variables.
// It's better to use `select` or `plural` for such cases.
{
  id: "DSRd7_",
  message: "参照中のパスは {0} で、候補は {1} です。",
  values: {
    0: String(selectedPath ?? _i18n._(
    /** i18n */
    {
      id: "ggPEgU",
      message: "未設定"
    })),
    1: String(relatedPaths[1] ?? _i18n._(
    /** i18n */
    {
      id: "gkv1jV",
      message: "ありません"
    }))
  }
}), "translate");
const __lf_2 = <_Trans {...
/** i18n */
{
  id: "fgdhx6",
  message: "ロケール <0>{localeLabel}</0> で <1>{0}</1> を確認しています。",
  values: {
    0: String(selectedPath ?? ""),
    localeLabel: localeLabel
  },
  components: {
    0: <strong />,
    1: <span />
  }
}} />;
const __lf_3 = __lingui_for_svelte_reactive_translation__(_i18n._(
/** i18n */
{
  id: "AUUW5v",
  message: "候補パス: {0}",
  values: {
    0: String(path ?? "")
  }
}), "translate");