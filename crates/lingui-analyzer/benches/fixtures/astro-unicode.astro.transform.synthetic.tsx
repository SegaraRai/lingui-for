import { msg, t as translate } from "@lingui/core/macro";
import { Trans } from "lingui-for-astro/macro";
const __lf_0 = translate`ようこそ ${localeLabel}`;
const __lf_1 = translate(
  // Note that this method is actually not recommended for complex messages with multiple variables.
  // It's better to use `select` or `plural` for such cases.
  msg`参照中のパスは ${String(selectedPath ?? translate`未設定`)} で、候補は ${String(
    relatedPaths[1] ?? translate`ありません`,
  )} です。`,
);
const __lf_2 = <Trans>
      ロケール{" "}<strong>{localeLabel}</strong>{" "}で{" "}<span>{String(selectedPath ?? "")}</span>{" "}を確認しています。
    </Trans>;
const __lf_3 = translate(msg`候補パス: ${String(path ?? "")}`);
