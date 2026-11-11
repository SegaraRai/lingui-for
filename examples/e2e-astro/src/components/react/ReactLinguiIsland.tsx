import { style } from "stillwind/react";
import { I18nProvider } from "@lingui/react";
import { useLingui } from "@lingui/react/macro";

import type { SupportedLocale } from "../../lib/i18n/locale";
import { createAppI18n, getLocaleLabel } from "../../lib/i18n/runtime";
import {
  sharedImportedDescriptor,
  sharedImportedDetailDescriptor,
} from "../../lib/i18n/shared-descriptors";

function ReactLinguiPanel({ locale }: { readonly locale: SupportedLocale }) {
  const { t } = useLingui();
  const localeLabel = getLocaleLabel(locale);

  return (
    <section {...style("card bg-base-100 border border-base-300 shadow-lg")}>
      <div {...style("card-body")}>
        <p {...style("badge badge-outline badge-accent flex-none")}>
          {t`React island`}
        </p>
        <h2 {...style("card-title")}>
          {t`React components can translate Lingui descriptors inside Astro.`}
        </h2>
        <p {...style("text-base-content/70")}>
          {t`The active locale reaches React through a dedicated Lingui instance.`}
        </p>
        <p {...style("text-base-content/70")}>{t(sharedImportedDescriptor)}</p>
        <p {...style("text-base-content/70")}>
          {t(sharedImportedDetailDescriptor)}
        </p>
        <p {...style("badge badge-secondary badge-lg flex-none")}>
          {t`Locale badge: ${localeLabel}`}
        </p>
      </div>
    </section>
  );
}

export default function ReactLinguiIsland({
  locale,
}: {
  readonly locale: SupportedLocale;
}) {
  const i18n = createAppI18n(locale);

  return (
    <I18nProvider i18n={i18n}>
      <ReactLinguiPanel locale={locale} />
    </I18nProvider>
  );
}
