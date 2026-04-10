/**
 * CartDrawer — slide-in cart panel accessible from the header cart icon.
 * Shows items, qty controls, subtotal, checkout button.
 * https://milloapp.com
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';

function fmt(cents) {
  return '$' + (cents / 100).toFixed(2);
}

export function CartDrawer({ open, onClose }) {
  const { items, removeItem, updateQty, totalCents, totalItems, clearCart } = useCart();

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-[var(--bg-elevated)] border-l border-[var(--border)] shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--text)]">
            Cart
            {totalItems > 0 && (
              <span className="ml-2 text-xs font-semibold bg-[var(--accent)] text-white rounded-full px-2 py-0.5">
                {totalItems}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button type="button" onClick={clearCart}
                className="text-xs text-[var(--text-muted)] hover:text-red-500 transition-colors px-2 py-1 rounded">
                Clear
              </button>
            )}
            <button type="button" onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {items.length === 0
            ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <svg className="w-12 h-12 text-[var(--text-muted)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-[var(--text-muted)] text-sm">Your cart is empty</p>
                <button type="button" onClick={onClose}
                  className="mt-4 text-[var(--accent)] text-sm font-medium hover:underline">
                  Continue shopping
                </button>
              </div>
            )
            : items.map((item) => (
              <div key={item.id} className="flex gap-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg bg-[var(--bg-elevated)] overflow-hidden shrink-0 flex items-center justify-center">
                  {item.imageUrl
                    ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    : <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">{item.name}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{fmt(item.priceCents)}</p>

                  {/* Qty controls */}
                  <div className="flex items-center gap-2 mt-2">
                    <button type="button" onClick={() => updateQty(item.id, item.qty - 1)}
                      className="w-6 h-6 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] flex items-center justify-center text-xs font-bold hover:bg-[var(--bg-card)]">
                      −
                    </button>
                    <span className="text-sm font-semibold text-[var(--text)] w-5 text-center">{item.qty}</span>
                    <button type="button" onClick={() => updateQty(item.id, item.qty + 1)}
                      className="w-6 h-6 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] flex items-center justify-center text-xs font-bold hover:bg-[var(--bg-card)]">
                      +
                    </button>
                    <button type="button" onClick={() => removeItem(item.id)}
                      className="ml-auto text-[var(--text-muted)] hover:text-red-500 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Line total */}
                <p className="text-sm font-bold text-[var(--text)] shrink-0">
                  {fmt(item.priceCents * item.qty)}
                </p>
              </div>
            ))
          }
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-[var(--border)] px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Subtotal</span>
              <span className="text-base font-bold text-[var(--text)]">{fmt(totalCents)}</span>
            </div>
            <Link to="/checkout" onClick={onClose}
              className="block w-full py-3 rounded-xl bg-[var(--accent)] text-white text-sm font-bold text-center hover:bg-[var(--accent-hover)] transition-colors">
              Checkout →
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
