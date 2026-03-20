import { I18nProvider } from "@lingui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

import type { SupportedLocale } from "../../lib/i18n/locale";
import { createAppI18n, getLocaleLabel } from "../../lib/i18n/runtime";

type TransitionMode = "volatile" | "persisted" | "persisted-props";

function ReactTransitionPanel({
  locale,
  mode,
  pageLabel,
}: {
  readonly locale: SupportedLocale;
  readonly mode: TransitionMode;
  readonly pageLabel: string;
}) {
  const { t } = useLingui();
  const localeLabel = getLocaleLabel(locale);
  const [count, setCount] = useState(0);

  return (
    <section
      className="card border-base-300 bg-base-100 border shadow-lg"
      data-testid={`react-${mode}-panel`}
    >
      <div className="card-body gap-4">
        <p className="badge badge-accent badge-outline flex-none">
          {
            {
              volatile: t`Volatile React island`,
              persisted: t`Persisted React island`,
              "persisted-props": t`Persisted-props React island`,
            }[mode]
          }
        </p>
        <p className="text-base-content/70">
          {
            {
              volatile: t`This React island remounts whenever the route or locale changes.`,
              persisted: t`This React island uses transition:persist, so its counter survives while locale and page props still update.`,
              "persisted-props": t`This React island uses transition:persist and transition:persist-props, so its counter survives but locale and page props stay frozen.`,
            }[mode]
          }
        </p>
        <p className="text-base-content/70" data-testid={`react-${mode}`}>
          {t`React props say ${pageLabel} in ${localeLabel}.`}
        </p>
        <div className="flex items-center gap-3">
          <button
            className="btn btn-secondary btn-sm"
            data-testid={`react-${mode}-increment`}
            onClick={() => setCount((current) => current + 1)}
          >
            {t`Increment`}
          </button>
          <p
            className="badge badge-secondary badge-lg flex-none"
            data-testid={`react-${mode}-count`}
          >
            {t`${count} React clicks`}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function TransitionCounterIsland({
  locale,
  mode,
  pageLabel,
}: {
  readonly locale: SupportedLocale;
  readonly mode: TransitionMode;
  readonly pageLabel: string;
}) {
  const i18n = createAppI18n(locale);

  return (
    <I18nProvider i18n={i18n}>
      <ReactTransitionPanel locale={locale} mode={mode} pageLabel={pageLabel} />
    </I18nProvider>
  );
}
