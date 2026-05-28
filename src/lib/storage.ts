/**
 * Local persistence for assessment packages.
 *
 * Pure, no React. All localStorage access is wrapped in try/catch so a disabled
 * or full storage degrades to an empty library rather than throwing. The whole
 * AssessmentPackage is stored verbatim (including `gaps` and `validations`), so
 * user verdicts persist for free and a load needs no recompute.
 */

import { CLOSED_SET_VERSION } from '../schemas/guardrails';
import type { AssessmentPackage } from '../schemas/package';

const KEY = 'guardrails.assessments.v1';

/** Lightweight row for the saved-assessments list (no heavy payload). */
export interface SavedMeta {
  id: string;
  productName: string;
  version?: string;
  vendor: string;
  deployment: string;
  aiShape: string;
  createdAt: string;
  closedSetVersion: string;
  schemaVersion: number;
}

/** Stable id so re-saving the same assessment overwrites rather than duplicates. */
export function assessmentId(pkg: AssessmentPackage): string {
  const p = pkg.product;
  return `${p.name}|${p.deployment}|${p.aiShape}|${pkg.createdAt}`;
}

function readAll(): Record<string, AssessmentPackage> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(blob: Record<string, AssessmentPackage>): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(blob));
    return true;
  } catch {
    return false;
  }
}

/** Save (or overwrite) an assessment. Returns its id, or null if storage failed. */
export function saveAssessment(pkg: AssessmentPackage): string | null {
  const id = assessmentId(pkg);
  const blob = readAll();
  blob[id] = pkg;
  return writeAll(blob) ? id : null;
}

/** List saved assessments as metadata rows, newest first. */
export function listSaved(): SavedMeta[] {
  const blob = readAll();
  return Object.entries(blob)
    .map(([id, pkg]) => ({
      id,
      productName: pkg.product.name,
      version: pkg.product.version,
      vendor: pkg.product.vendor,
      deployment: pkg.product.deployment,
      aiShape: pkg.product.aiShape,
      createdAt: pkg.createdAt,
      closedSetVersion: pkg.closedSetVersion,
      schemaVersion: pkg.schemaVersion,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function loadAssessment(id: string): AssessmentPackage | null {
  const blob = readAll();
  return blob[id] ?? null;
}

export function deleteAssessment(id: string): void {
  const blob = readAll();
  if (id in blob) {
    delete blob[id];
    writeAll(blob);
  }
}

/** Serialize a single assessment to a JSON string for download. */
export function exportAssessment(pkg: AssessmentPackage): string {
  return JSON.stringify(pkg, null, 2);
}

/**
 * Parse and lightly validate imported JSON. Throws on structural problems so
 * the caller can surface a clear error. `mismatch` is true when the package was
 * produced against a different closed-set version (still loadable — the caller
 * may recompute gaps and should warn the user).
 */
export function importAssessment(json: string): {
  pkg: AssessmentPackage;
  mismatch: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('File does not contain an assessment.');
  }
  const pkg = parsed as AssessmentPackage;
  if (pkg.schemaVersion !== 1 || !pkg.product || !Array.isArray(pkg.gaps)) {
    throw new Error('File is not a recognised assessment package.');
  }
  return { pkg, mismatch: pkg.closedSetVersion !== CLOSED_SET_VERSION };
}

/** True when a loaded/imported package predates the current catalogue version. */
export function isStale(pkg: AssessmentPackage): boolean {
  return pkg.closedSetVersion !== CLOSED_SET_VERSION;
}
