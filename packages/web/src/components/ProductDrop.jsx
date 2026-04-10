/**
 * ProductDrop — overlay shown when creator drops a product during live stream.
 * Displays product name, price, and Buy Now button.
 * https://milloapp.com
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function ProductDrop({ product, creatorId, onDismiss, autoHideMs = 15000 }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!autoHideMs) return;
    const t = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, autoHideMs);
    return () => clearTimeout(t);
  }, [autoHideMs, onDismiss]);

  if (!product || !visible) return null;

  const price = product.price ?? product.priceCents / 100;
  const productId = product.productId || product.product_id;
  const productUrl = creatorId && productId
    ? `/creator/${creatorId}/shop/${productId}`
    : '#';

  return (
    <div
      className="absolute bottom-20 left-5 z-20 transition-all duration-300"
      role="region"
      aria-label={t('productDrop.ariaLabel', { name: product.name })}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/95 backdrop-blur-sm shadow-xl overflow-hidden max-w-[280px]">
        <div className="flex gap-3 p-4">
          {product.imageUrl && (
            <img
              src={product.imageUrl}
              alt=""
              className="w-14 h-14 rounded-lg object-cover shrink-0 bg-[var(--bg-elevated)]"
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[var(--text)] truncate text-sm">{product.name}</h3>
            <p className="text-sm font-bold text-[var(--accent)] mt-0.5">
              ${typeof price === 'number' ? price.toFixed(2) : price}
            </p>
            <Link
              to={productUrl}
              className="mt-2 inline-block px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent-hover)] transition-colors"
            >
              {t('productDrop.buyNow', { defaultValue: 'Buy Now' })}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
