/**
 * Honest UX when live sub-features are off — API GET /api/live/status (filters) + profile / Vite.
 * https://milloapp.com
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ComingSoon } from './ComingSoon';
import { features } from '../config/features';
import { useLiveFiltersControlsVisible } from '../hooks/useLiveModeStatus';

const FILTERS_OVERLAY_CLASS =
  'bg-black/55 border-white/15 text-white/90 text-xs py-2';

/**
 * Shown on watch UI when filters !== LIVE from API or build profile disables filters.
 * @param {{ className?: string }} props
 */
export function LiveFiltersComingSoonBanner({ className = FILTERS_OVERLAY_CLASS }) {
  const { t } = useTranslation();
  const filtersControlsVisible = useLiveFiltersControlsVisible();
  if (filtersControlsVisible) return null;
  return <ComingSoon label={t('live.filtersComingSoon')} className={className} />;
}

/**
 * Shown on Go Live when co-host is not enabled (`!features.liveCohost`).
 * @param {{ className?: string }} props
 */
export function LiveCohostComingSoonBanner({ className = '' }) {
  const { t } = useTranslation();
  if (features.liveCohost) return null;
  return <ComingSoon label={t('live.cohostComingSoon')} className={className} />;
}
