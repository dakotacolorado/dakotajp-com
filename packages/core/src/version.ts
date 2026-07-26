/**
 * A summary of one version in an entity's history (for the admin timeline).
 * Versioning is cross-cutting — both pages and posts are versioned.
 */
export interface VersionSummary {
  version: number;
  savedAt: string;
  restoredFrom?: number;
  title: string;
  preview: string;
}
