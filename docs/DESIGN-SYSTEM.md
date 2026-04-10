# Millo Design System

Single source of truth for colors, spacing, and components across **web** and **mobile**. Enterprise-grade, **no gradients** — solid colors only. https://milloapp.com

---

## Colors (CSS variables — web)

Use these variables in web (`var(--name)`) and the matching hex values in mobile (`theme/colors.js`).

| Token | Dark | Light | Usage |
|-------|------|-------|--------|
| `--bg` | `#0d0d0d` | `#f4f6fa` | Page background |
| `--bg-elevated` | `#161616` | `#ffffff` | Cards, inputs, elevated surfaces |
| `--bg-card` | `#1e1e1e` | `#ffffff` | Cards, modals |
| `--text` | `#f1f5f9` | `#0f172a` | Primary text |
| `--text-secondary` | `#cbd5e1` | `#334155` | Secondary text |
| `--text-muted` | `#64748b` | `#64748b` | Muted, hints |
| `--border` | `#272727` | `#e2e8f0` | Borders |
| `--border-strong` | `#363636` | `#cbd5e1` | Strong borders |
| `--accent` | `#3b6fff` | `#2563eb` | Primary actions, links |
| `--accent-hover` | `#2d5ae6` | `#1d4ed8` | Hover state |
| `--accent-live` | `#e53e3e` | `#dc2626` | Live badge, destructive |
| `--accent-premium` | `#d97706` | `#b45309` | Coins, premium |
| `--accent-success` | `#16a34a` | `#15803d` | Success, confirm |
| `--accent-warning` | `#ca8a04` | `#b45309` | Warnings |
| `--accent-error` | `#dc2626` | `#dc2626` | Errors |

**Aliases:** `--bg-primary` = `--bg`, `--bg-secondary` = `--bg-elevated`, `--bg-tertiary` = `--bg-card`, `--text-primary` = `--text`.

---

## Rules

1. **No gradients** — use solid backgrounds only (`bg-[var(--accent)]`, not `bg-gradient-to-r`).
2. **No arbitrary Tailwind colors** for UI — use design tokens (`text-[var(--text-muted)]`, not `text-slate-500`).
3. **Consistent spacing** — `--radius: 0.75rem` for cards/buttons; use Tailwind spacing scale.
4. **Mobile** — `packages/mobile/src/theme/colors.js` mirrors these values; use `dark` / `light` from `useColorScheme()`.

---

## Files

- **Web:** `packages/web/src/index.css` (`:root` and `.light`)
- **Web Tailwind:** `packages/web/tailwind.config.js` (extended colors)
- **Mobile:** `packages/mobile/src/theme/colors.js`
