/** One entry in an entity's version history. */
export interface VersionSummary {
  version: number;
  savedAt: string;
  restoredFrom?: number;
  title: string;
  preview: string;
}
