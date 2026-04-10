# WEB ROUTE AUDIT

## Purpose

This document defines route ownership and route hygiene rules for `packages/web`.

Use it to avoid:

- overcounting redirect aliases as products
- mistaking shared UI for distinct implementations
- treating wrapper pages as complete standalone features
- documenting composed modules as top-level routes

---

## Core rules

### Route ownership

Every file under `packages/web/src/pages` should be one of:

- a primary routed page
- a documented redirect helper
- a documented thin wrapper
- a composed non-route module
- or explicitly marked legacy

### Redirect-only routes

Redirect aliases should:

- use `Navigate` only
- avoid business logic
- remain documented as aliases, not products

### Shared-UI routes

If two routes intentionally share one screen:

- document both routes
- document the shared component
- do not describe them as separate feature implementations

### Thin wrapper routes

Thin wrappers should:

- remain logic-light
- explain what they wrap
- keep compatibility concerns local
- avoid becoming shadow business-logic containers

### Composed modules

Composed modules should:

- be labeled clearly
- not be listed as top-level routes
- identify the routed parent that uses them

---

## Misread surface note

Wrappers, redirects, and shared UI are easy to overcount in:

- docs
- support notes
- analytics conversations
- contributor route maps

A route existing in `App.jsx` does not automatically mean:

- a distinct product surface exists
- a dedicated page implementation exists
- the underlying capability is complete

---

## Admin hardening note

Router-level admin protection should remain the default for admin surfaces.
Page-level checks are defense-in-depth, not the primary boundary.

DEV staff toggles are not production RBAC.

---

## Audit checklist

- no duplicate route shapes pretending to be distinct features
- no redirect routes containing business logic
- no wrapper pages carrying primary business logic
- no composed modules documented as route roots
- no route names used as proof of product completeness
