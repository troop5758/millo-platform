/**
 * Countdown — displays time remaining until a start time.
 * Updates every second. Used for scheduled streams.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

function formatDiff(diffMs) {
  if (diffMs <= 0) return null;
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  if (days === 0 && hours === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

export function Countdown({ startTime, className = '', compact = false }) {
  const { t } = useTranslation();
  const [diff, setDiff] = useState(() => new Date(startTime) - new Date());

  useEffect(() => {
    const tick = () => {
      const d = new Date(startTime) - new Date();
      setDiff(d);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  if (diff <= 0) {
    return (
      <span className={className}>
        {t('countdown.startingSoon', { defaultValue: 'Starting soon' })}
      </span>
    );
  }

  const formatted = formatDiff(diff);
  const minutes = Math.floor(diff / 60000);

  return (
    <span className={className} title={formatted}>
      {compact && minutes >= 1
        ? t('countdown.minutes', { count: minutes, defaultValue: '{{count}} min' })
        : t('countdown.startsIn', { time: formatted, defaultValue: 'Starts in {{time}}' })}
    </span>
  );
}
