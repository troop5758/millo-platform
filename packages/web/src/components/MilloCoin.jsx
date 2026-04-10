/**
 * MilloCoin — displays the official Millo coin image at any size.
 * Use instead of the 🪙 emoji wherever coins are shown.
 */
import React from 'react';

export function MilloCoin({ size = 20, className = '' }) {
  return (
    <img
      src="/millocoin.png"
      alt="Millo coin"
      width={size}
      height={size}
      className={`inline-block object-contain ${className}`}
      draggable={false}
    />
  );
}
