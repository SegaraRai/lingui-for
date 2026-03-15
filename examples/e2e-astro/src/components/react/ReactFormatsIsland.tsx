import { I18nProvider } from "@lingui/react";
import { Plural, Select, SelectOrdinal, useLingui } from "@lingui/react/macro";

import type { SupportedLocale } from "../../lib/i18n/locale";
import { createAppI18n } from "../../lib/i18n/runtime";

function ReactFormatsPanel() {
  const { t } = useLingui();

  return (
    <section className="card border-base-300 bg-base-100 border shadow-lg">
      <div className="card-body">
        <p className="badge badge-accent badge-outline flex-none">
          {t`React formats`}
        </p>
        <h2 className="card-title">
          {t`React runs plural, select, and selectOrdinal macros in component code.`}
        </h2>
        <p className="text-base-content/70">
          <Plural
            value={3}
            one="# React format sample"
            other="# React format samples"
          />
        </p>
        <p className="text-base-content/70">
          <Select
            value="excited"
            _calm="React select says calm."
            _excited="React select says excited."
            other="React select says unknown."
          />
        </p>
        <p className="text-base-content/70">
          <SelectOrdinal
            value={2}
            one="React finished #st."
            two="React finished #nd."
            few="React finished #rd."
            other="React finished #th."
          />
        </p>
        <hr className="divider" />
        <p className="text-base-content/70">
          {t`Lingui React does not seem to support functional macros for plural, select, and selectOrdinal.`}
        </p>
      </div>
    </section>
  );
}

export default function ReactFormatsIsland({
  locale,
}: {
  readonly locale: SupportedLocale;
}) {
  const i18n = createAppI18n(locale);

  return (
    <I18nProvider i18n={i18n}>
      <ReactFormatsPanel />
    </I18nProvider>
  );
}
