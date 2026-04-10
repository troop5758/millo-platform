# Advanced AI Layer (Future Phase)

Platforms like TikTok use **ML models trained on billions of interactions** to detect bots and abuse. This document describes a future phase for Millo: an advanced AI layer that would sit on top of the current rule-based and scoring systems.

## Model inputs (signals)

- **Scroll speed** — Distribution and changes over session; too uniform can indicate automation.
- **Click timing** — Inter-click intervals, reaction times; humans are variable, bots often regular.
- **Engagement graph** — Who likes/follows whom; clusters and reciprocity patterns (rings, farms).
- **Device fingerprints** — Same device many accounts; fingerprint stability over time.
- **Session length** — Very short or very long sessions vs. normal user distribution.
- **Interaction diversity** — Variety of content and actions; bots tend to have narrow behavior.

## Models

- **Random Forest** — Binary/multi-class bot vs. human; interpretable, good baseline for tabular signals and feature importance.
- **Graph Neural Networks (GNN)** — Bot clusters, propagation, coordinated behavior; uses follow/like/comment graphs.
- **Isolation Forest** — Unsupervised anomaly detection; flags users/sessions that are “different” without labels.

## Purpose

- Improve bot and abuse detection beyond fixed rules and thresholds.
- Use behavioral and graph signals that are hard to express as simple rules.
- Scale to large volumes while keeping false positives low.

## Possible model inputs (signals)

| Signal | Description |
|--------|-------------|
| **Scroll speed** | Distribution and changes over session (e.g. too uniform → bot). |
| **Click timing** | Inter-click intervals, reaction times (humans are variable). |
| **Engagement graph** | Who likes/follows whom; clusters and reciprocity patterns. |
| **Device fingerprints** | Same device, many accounts; fingerprint stability over time. |
| **Session length** | Very short or very long sessions; distribution vs. normal users. |
| **Interaction diversity** | Variety of content and actions (bots often narrow). |

Additional inputs can include: watch time, completion rate, comment similarity, gift patterns, and existing risk scores.

## Candidate models

| Model type | Use case | Notes |
|------------|----------|--------|
| **Random Forest** | Binary/multi-class bot vs. human; feature importance. | Good baseline, interpretable, works well with tabular signals. |
| **Graph Neural Networks (GNN)** | Bot clusters, propagation, and coordinated behavior. | Uses follow/like/comment graphs; can detect rings and farms. |
| **Isolation Forest** (or other anomaly detection) | Unsupervised anomaly scoring. | Flags users/sessions that are “different” without labels. |

Other options: gradient boosting (XGBoost/LightGBM), simple neural nets on aggregated features, or two-phase: anomaly model → classifier for review.

## Integration with current system

- **Inputs:** Reuse and extend existing data: `BehaviorEvent`, `DeviceFingerprint`, `FraudEvent`, `StreamLike`, `Follow`, engagement metrics, and risk scores from `riskEngine`.
- **Outputs:** Per-user or per-session risk/score that can:
  - Feed into the **automated enforcement pipeline** (e.g. enqueue `risk_score_update`, `captcha_challenge`, `shadow_ban`, `permanent_ban` when score exceeds thresholds).
  - Surface in the **Security Dashboard** as an additional signal or “AI risk” column.
- **Training:** Offline on historical data (labels from admin decisions, chargebacks, and known abuse). Retrain periodically; A/B test against current rules before full rollout.

## Scope (future)

- Data pipeline: aggregate behavioral and graph features into training and inference datasets.
- Model training: Random Forest / GNN / Isolation Forest (or chosen stack) with proper train/validation/test and metrics.
- Inference: batch (e.g. nightly) or near-real-time for high-value actions (e.g. login, gift send).
- No change to current phase: this is **documentation only** for a future phase; no implementation in the current codebase.

## References

- Current bot and fraud logic: `riskEngine`, `botGraphDetection`, `fraudService`, `liveStreamBotDetection`.
- Enforcement: `docs/automated-enforcement-pipeline.md`, `docs/security-dashboard.md`.
- Behavioral and device data: `docs/behavioral-ai-detection.md`, `docs/device-fingerprinting.md`.
