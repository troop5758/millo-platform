/**
 * Video sound attribution — "🎵 Sound: Title" link to discover the sound.
 * Use on replay/VOD and stream player pages.
 * https://milloapp.com
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * @param {{ sound: { soundId?: string, title?: string, artist?: string, soundDisplay?: string } }} props
 */
export function SoundAttribution({ sound }) {
  const { t } = useTranslation();
  if (!sound || !sound.soundId) return null;
  const label = sound.soundDisplay || sound.title || t('sounds.sound', 'Sound');
  const to = `/music/${sound.soundId}`;
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline font-medium"
    >
      <span aria-hidden>🎵</span>
      <span>{label}</span>
      {sound.artist && (
        <span className="text-[var(--text-muted)] font-normal">— {sound.artist}</span>
      )}
    </Link>
  );
}
