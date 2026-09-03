/**
 * Remediation-plan ordering control.
 *
 * `orderRemediationTasks` produces the single, prioritized ordering of
 * remediation tasks for the assessment's remediation plan. The ordering is a
 * priority topological sort over a DAG of tasks: dependency edges are hard
 * constraints (every prerequisite precedes its dependents), severity is the
 * selection priority among tasks that are ready to run (strict descending
 * Critical > High > Medium > Low), and the task id provides a deterministic
 * tie-break for equal-severity, equally-ready tasks.
 *
 * This is pure logic (no I/O), the one assessment-artifact concern that is a
 * property-based-testing target.
 *
 * Design references:
 * - Property 19 (remediation ordering is severity-descending, dependency-respecting,
 *   and deterministic) — Req 16.2, 16.4, 16.7
 */

import type { RemediationTask, Severity } from './types';

/**
 * Selection priority rank per severity. Lower rank is selected first, so the
 * resulting order is strict descending severity (Critical before High before
 * Medium before Low). (Req 16.2)
 */
const SEVERITY_RANK: Record<Severity, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

/**
 * Order a set of remediation tasks for the remediation plan.
 *
 * Uses Kahn's algorithm with a priority selection step: at each iteration the
 * next task is chosen from those whose prerequisites have already been placed,
 * preferring higher severity and breaking ties by ascending task id. This
 * guarantees:
 * - every prerequisite task appears before its dependents (Req 16.4),
 * - higher-severity tasks are ordered ahead of lower-severity tasks whenever
 *   dependencies do not force otherwise, yielding a severity-descending order
 *   (Req 16.2), and
 * - a deterministic result for equal-severity tasks via the id tie-break (Req 16.7).
 *
 * The input must form a DAG. A cyclic dependency or a reference to an unknown
 * task id is rejected with an error, since such input cannot be ordered.
 *
 * The input array is not mutated; a new ordered array is returned.
 */
export function orderRemediationTasks(tasks: RemediationTask[]): RemediationTask[] {
  const byId = new Map<string, RemediationTask>();
  for (const task of tasks) {
    if (byId.has(task.id)) {
      throw new Error(`Duplicate remediation task id: ${task.id}`);
    }
    byId.set(task.id, task);
  }

  // Build the set of unsatisfied prerequisites (in-degree) per task, validating
  // that every dependency references a known task.
  const remainingDeps = new Map<string, Set<string>>();
  for (const task of tasks) {
    const deps = new Set<string>();
    for (const dep of task.dependsOn) {
      if (!byId.has(dep)) {
        throw new Error(
          `Remediation task "${task.id}" depends on unknown task id "${dep}"`
        );
      }
      // A self-dependency would form a trivial cycle.
      if (dep === task.id) {
        throw new Error(`Remediation task "${task.id}" depends on itself`);
      }
      deps.add(dep);
    }
    remainingDeps.set(task.id, deps);
  }

  const placed = new Set<string>();
  const ordered: RemediationTask[] = [];

  while (ordered.length < tasks.length) {
    // Ready tasks are those not yet placed whose prerequisites are all placed.
    const ready = tasks.filter(
      (task) => !placed.has(task.id) && remainingDeps.get(task.id)!.size === 0
    );

    if (ready.length === 0) {
      // No ready task while tasks remain implies a dependency cycle.
      const unplaced = tasks.filter((task) => !placed.has(task.id)).map((task) => task.id);
      throw new Error(
        `Remediation tasks contain a dependency cycle among: ${unplaced.join(', ')}`
      );
    }

    // Select the highest-priority ready task: lowest severity rank first, then
    // ascending id as a deterministic tie-break.
    ready.sort((a, b) => {
      const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const next = ready[0];
    ordered.push(next);
    placed.add(next.id);

    // Discharge this task as a satisfied prerequisite for the remaining tasks.
    for (const deps of remainingDeps.values()) {
      deps.delete(next.id);
    }
  }

  return ordered;
}
