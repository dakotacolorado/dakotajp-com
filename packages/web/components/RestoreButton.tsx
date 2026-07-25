"use client";

import { rollbackAction } from "@/app/actions";
import type { EntityType } from "@/lib/content";

export function RestoreButton({
  type,
  id,
  version,
}: {
  type: EntityType;
  id: string;
  version: number;
}) {
  return (
    <form
      action={rollbackAction}
      onSubmit={(e) => {
        if (!confirm(`Restore version ${version}? This creates a new version.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <button
        type="submit"
        className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
      >
        Restore
      </button>
    </form>
  );
}
