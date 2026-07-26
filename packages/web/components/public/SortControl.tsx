import Link from "next/link";
import type { SortOption } from "@/lib/sorting";

/** Sort links held in the URL (`?sort=`). The default option links to the bare path. */
export function SortControl({
  basePath,
  current,
  defaultValue,
  options,
}: {
  basePath: string;
  current: string;
  defaultValue: string;
  options: SortOption[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs uppercase tracking-[0.08em] text-stone-500">
      <span className="text-stone-400 dark:text-stone-600">sort</span>
      {options.map((opt) => {
        const active = opt.value === current;
        const href =
          opt.value === defaultValue
            ? basePath
            : `${basePath}?sort=${opt.value}`;
        return (
          <Link
            key={opt.value}
            href={href}
            aria-current={active ? "true" : undefined}
            className={
              active
                ? "text-stone-900 dark:text-stone-100"
                : "transition-colors hover:text-stone-800 dark:hover:text-stone-300"
            }
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
