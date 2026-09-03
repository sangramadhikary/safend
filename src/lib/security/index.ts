/**
 * Barrel for the security-hardening control module.
 *
 * Pure-function security controls (sanitizers, validators, magic-byte checks,
 * the PII projector, the access-decision and remediation-ordering logic) are
 * re-exported here as they are implemented in subsequent tasks. The shared
 * assessment and control types are available now.
 */

export * from './types';
export * from './access-decision';
export * from './pii';
export * from './search-sanitizer';
export * from './lookups';
export * from './path-sanitizer';
export * from './header-sanitizer';
export * from './env-bootstrap';
export * from './dep-version';
export * from './remediation-order';
export * from './audit-entry';
export * from './cors';
export * from './content-type';
export * from './request-validation';
