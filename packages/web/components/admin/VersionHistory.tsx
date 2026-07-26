import type { EntityType } from "@dakotajp/core";
import { listVersions } from "@dakotajp/storage";
import { RestoreButton } from "@/components/admin/RestoreButton";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function VersionHistory({
  type,
  id,
}: {
  type: EntityType;
  id: string;
}) {
  const versions = await listVersions(type, id);
  if (versions.length === 0) return null;

  const currentVersion = versions[0].version;

  return (
    <section className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-800">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Version history
      </h2>
      <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
        {versions.map((v) => (
          <li
            key={v.version}
            className="flex items-start justify-between gap-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">v{v.version}</span>
                {v.version === currentVersion && (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                    current
                  </span>
                )}
                {v.restoredFrom !== undefined && (
                  <span className="text-xs text-gray-500">
                    restored from v{v.restoredFrom}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">{formatDateTime(v.savedAt)}</p>
              {v.preview && (
                <p className="mt-1 truncate text-xs text-gray-400">
                  {v.preview}
                </p>
              )}
            </div>
            {v.version !== currentVersion && (
              <RestoreButton type={type} id={id} version={v.version} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
