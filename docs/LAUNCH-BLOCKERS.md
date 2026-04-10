# LAUNCH BLOCKERS

Short and blunt.

**Configure / verify:** `docs/SETUP-PRODUCTION.md`, `docs/ENV-SETUP-GUIDE.md`, `docs/PRODUCTION-VERIFICATION-STEPS.md`

## 1. Money looks live when it is not

If payment or payout UX can still look production-ready while providers are stubbed/unconfigured, launch is unsafe.

## 2. Auth degrades into half-broken public flows

If provider-not-configured handling is still inconsistent, public auth will feel broken.

## 3. Safety surfaces imply enforcement that is not active

If KYC, moderation, or abuse signals are stubbed/off but presented as real, launch is misleading.

## 4. Customer communications are not production-backed

Console email is not a production customer comms system.

## 5. Order-linked support is still ambiguous

If support cannot cleanly resolve order/payment incidents because model ownership is split, launch risk is too high.
