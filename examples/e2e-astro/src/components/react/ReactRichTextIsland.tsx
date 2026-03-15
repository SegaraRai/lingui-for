import { I18nProvider } from "@lingui/react";
import { Trans } from "@lingui/react/macro";

import type { SupportedLocale } from "../../lib/i18n/locale";
import { createAppI18n } from "../../lib/i18n/runtime";

function ReactRichTextPanel() {
  return (
    <section className="card border-base-300 bg-base-100 border shadow-lg">
      <div className="card-body">
        <p className="badge badge-accent badge-outline flex-none">
          <Trans>React rich text</Trans>
        </p>
        <h2 className="card-title">
          <Trans>React rich text keeps component placeholders intact.</Trans>
        </h2>
        <p className="text-base-content/70">
          <Trans>
            React keeps the{" "}
            <a className="link link-primary" href="/settings">
              settings link
            </a>{" "}
            inside a translated sentence.
          </Trans>
        </p>
        <p className="text-base-content/70">
          <Trans>
            React can preserve <strong>strong emphasis</strong> in translated
            output.
          </Trans>
        </p>
      </div>
    </section>
  );
}

export default function ReactRichTextIsland({
  locale,
}: {
  readonly locale: SupportedLocale;
}) {
  const i18n = createAppI18n(locale);

  return (
    <I18nProvider i18n={i18n}>
      <ReactRichTextPanel />
    </I18nProvider>
  );
}
