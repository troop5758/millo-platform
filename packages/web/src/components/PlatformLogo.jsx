/**
 * PlatformLogo — configurable logo from admin dashboard.
 * Shows image if logoUrl is set, else fallback "m" in accent square.
 * https://milloapp.com
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useBranding } from '../context/BrandingContext';

export function PlatformLogo({ to = '/', className = '', size = 'md' }) {
  const { logoUrl, appName } = useBranding();

  const sizeClasses = {
    sm: { logo: 'w-6 h-6', text: 'text-sm' },
    md: { logo: 'w-8 h-8', text: 'text-base' },
    lg: { logo: 'w-10 h-10', text: 'text-lg' },
  };
  const { logo: logoCls, text: textCls } = sizeClasses[size] || sizeClasses.md;

  const content = logoUrl ? (
    <img src={logoUrl} alt={appName} className={`${logoCls} rounded-lg object-contain`} />
  ) : (
    <span className={`${logoCls} rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm`}>
      m
    </span>
  );

  return (
    <Link to={to} className={`flex items-center gap-2.5 shrink-0 group ${className}`}>
      {content}
      <span className={`${textCls} font-bold tracking-tight text-[var(--text)]`}>{appName}</span>
    </Link>
  );
}
