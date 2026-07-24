import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getPage } from "@/lib/content";
import { SEED_PAGES } from "@/lib/seed";
import { PageEditor } from "@/components/PageEditor";
import { VersionHistory } from "@/components/VersionHistory";

export const dynamic = "force-dynamic";

const EDITABLE = new Set(["about", "resume"]);

export default async function EditPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { key } = await params;
  if (!EDITABLE.has(key)) notFound();

  const existing = await getPage(key);
  const content = existing ?? SEED_PAGES[key];
  const cancelHref = key === "about" ? "/" : `/${key}`;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Edit {content.title}
      </h1>
      <PageEditor
        pageKey={key}
        title={content.title}
        body={content.body}
        cancelHref={cancelHref}
      />
      <VersionHistory type="PAGE" id={key} />
    </div>
  );
}
