/**
 * Trust + safety engine. Runtime: `./engine.js`.
 * https://milloapp.com
 */

export interface TrustRiskSignals {
  deviceRisk?: number;
  behaviorRisk?: number;
  geoMismatch?: boolean;
}

export type RiskEnforcementAction = 'BAN' | 'RESTRICT' | 'CAPTCHA' | 'ALLOW';

export function evaluateRisk(signals?: TrustRiskSignals): number;

export function riskEnforcement(risk: number): RiskEnforcementAction;

export function evaluateRiskWithEnforcement(signals?: TrustRiskSignals): {
  score: number;
  action: RiskEnforcementAction;
};
