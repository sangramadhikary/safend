/**
 * Shared types for the security-hardening assessment artifacts and code controls.
 *
 * These mirror the conceptual record schemas defined in the design document
 * (`.kiro/specs/security-hardening/design.md`, Data Models section). The
 * assessment record types back the authored markdown artifacts (attack-surface
 * registry, threat model, mechanisms, finding registry, remediation plan) and
 * the control types are consumed by the pure-function security utilities under
 * `src/lib/security/`.
 */

/** Exactly one exposure classification per attack surface (Req 1.3). */
export type ExposureClass = 'publicly-exposed' | 'authenticated-only';

/** The assumed attacker capability for a surface-to-category pair (Req 1.5). */
export type AttackerCapability =
  | 'unauthenticated-external'
  | 'authenticated-low-privilege'
  | 'cross-tenant-authenticated';

/** In-scope threat categories for the assessment (Req 1.2). */
export type ThreatCategory =
  | 'broken-access-control-idor'
  | 'injection'
  | 'crypto-failure-secret-exposure'
  | 'ssrf'
  | 'insecure-file-upload'
  | 'auth-session-weakness'
  | 'security-misconfiguration'
  | 'pii-exposure'
  | 'rate-limiting-abuse'
  | 'dependency-supply-chain'
  | 'audit-logging-gap';

/** Finding severity classification (Req 3.6). */
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

/** Exploitability verification result for a finding (Req 3.1). */
export type VerificationResult =
  | 'confirmed'
  | 'not-exploitable'
  | 'partially-mitigated'
  | 'unverified';

/** Status of a re-verified prior-audit finding (Req 3.3). */
export type PriorAuditStatus =
  | 'still-applies'
  | 'no-longer-applies'
  | 'partially-applies';

/** A single enumerated attack surface (Req 1.1, 1.3, 1.4, 1.5, 1.7). */
export interface AttackSurface {
  /** Unique surface identifier, e.g. `AS-001`. */
  id: string;
  /** Route path, file path, or interface identifier. */
  sourceLocation: string;
  exposure: ExposureClass;
  /** True when exposure was undeterminable and defaulted (Req 1.7). */
  flaggedForReview: boolean;
  /** At least one applicable threat category (Req 1.4). */
  threatCategories: ThreatCategory[];
  /** Assumed attacker capability keyed by threat category (Req 1.5). */
  capabilityByCategory: Record<string, AttackerCapability>;
}

/** The exploitation mechanism for a threat category (Req 2.1-2.5). */
export interface Mechanism {
  category: ThreatCategory;
  entrySurfaceId: string;
  attackerInput: string;
  weakness: string;
  impact: string;
  /** Preconditions the mechanism depends on (Req 2.4). */
  preconditions: string[];
  /** Repo-relative affected paths (Req 2.2). */
  affectedPaths: string[];
  /** Reason recorded when a category has no applicable surface (Req 2.5). */
  notApplicableReason?: string;
}

/** A documented security finding (Req 3.1-3.6). */
export interface Finding {
  /** Unique finding identifier (Req 3.1). */
  id: string;
  category: ThreatCategory;
  affectedComponent: string;
  mechanismRef: string;
  verification: VerificationResult;
  /** Prior-audit re-verification status (Req 3.3). */
  priorAuditStatus?: PriorAuditStatus;
  /** Request/payload/query and observed result (Req 3.4). */
  reproDetail?: string;
  /** Reason recorded when verification is `unverified` (Req 3.5). */
  unverifiedReason?: string;
  /** Required when verification is `confirmed` (Req 3.6). */
  severity?: Severity;
}

/** A single remediation task mapped to one confirmed finding (Req 16.1-16.5). */
export interface RemediationTask {
  /** Unique task identifier (Req 16.5). */
  id: string;
  /** Maps back to exactly one confirmed finding (Req 16.1, 16.5). */
  findingId: string;
  /** Inherited from the finding (Req 16.2). */
  severity: Severity;
  /** Re-run procedure yields not-exploitable (Req 16.3). */
  acceptanceCriterion: string;
  /** Prerequisite task identifiers (Req 16.4). */
  dependsOn: string[];
}

/**
 * The verification-field allowlist returned by the public employee-verification
 * route (Req 12.2, 9.2). Only these fields may be exposed.
 */
export interface VerificationResultRecord {
  employee_id: string;
  name: string;
  department: string;
  designation: string;
  join_date: string;
  status: string;
  photo_url: string;
  gender: string;
}
