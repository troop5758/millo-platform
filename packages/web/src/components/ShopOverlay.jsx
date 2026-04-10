/**
 * ShopOverlay — shop the look: product tags on short videos.
 * Renders linked products with position overlay for direct video-to-product conversion.
 * https://milloapp.com
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function fmtPrice(cents) {
  if (cents == null) return '';
  return '$' + (cents / 100).toFixed(2);
}

export function ShopOverlay({ products = [], creatorId }) {
  const { t } = useTranslation();
  if (!products || products.length === 0) return null;

  return (
    <div className="absolute left-4 bottom-20 z-10 flex flex-col gap-2 max-w-[60%]">
      {products.map((product) => {
        const to = creatorId ? `/creator/${creatorId}/shop/${product.id}` : '#';
        return (
          <Link
            key={product.id}
            to={to}
            className="flex items-center gap-2 rounded-lg bg-black/80 text-white p-2.5 hover:bg-black/90 transition-colors backdrop-blur-sm border border-white/10 shadow-lg"
          >
            {product.imageUrls?.[0] ? (
              <img
                src={product.imageUrls[0]}
                alt={product.name}
                className="w-10 h-10 rounded object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-white/10 shrink-0 flex items-center justify-center text-xs">
                ?
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white/90 truncate">{t('feed.shop') || 'Shop'}: {product.name}</p>
              <p className="text-sm font-bold text-white">{fmtPrice(product.priceCents)}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
