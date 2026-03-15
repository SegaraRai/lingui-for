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
    <section className="card border-base-300 bg-base-100 border shadow-lg">
      <div className="card-body">
        <p className="badge badge-accent badge-outline flex-none">
          {t`React island`}
        </p>
        <h2 className="card-title">
          {t`React components can translate Lingui descriptors inside Astro.`}
        </h2>
        <p className="text-base-content/70">
          {t`The active locale reaches React through a dedicated Lingui instance.`}
        </p>
        <p className="text-base-content/70">{t(sharedImportedDescriptor)}</p>
        <p className="text-base-content/70">
          {t(sharedImportedDetailDescriptor)}
        </p>
        <p className="badge badge-secondary badge-lg flex-none">
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
