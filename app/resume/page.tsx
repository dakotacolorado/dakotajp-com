import { getPage } from "@/lib/content";
import { SEED_PAGES } from "@/lib/seed";
import { Markdown } from "@/components/Markdown";
import { EditLink } from "@/components/EditLink";

export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const page = (await getPage("resume")) ?? SEED_PAGES.resume;

  return (
    <article>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">{page.title}</h1>
        <EditLink href="/admin/pages/resume" />
      </div>
      <Markdown>{page.body}</Markdown>
    </article>
  );
}
