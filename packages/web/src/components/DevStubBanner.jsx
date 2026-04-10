import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Visible warning when a provider-backed flow is stubbed.
 * https://milloapp.com
 */
export default function DevStubBanner({ feature, enabled }) {
  const { t } = useTranslation();
  if (enabled) return null;

  return (
    <div
      className="mb-4 rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-amber-950 dark:text-amber-100 text-sm"
      role="status"
    >
      {t('devStub.banner', { feature, defaultValue: '{{feature}} is running in stub or development mode. Do not treat this flow as production-ready.' })}
    </div>
  );
}
