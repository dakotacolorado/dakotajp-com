import { getPage } from "@dakotajp/storage";
import { SEED_PAGES } from "@/lib/config/seed";
import { Markdown } from "@/components/ui/Markdown";
import { EditLink } from "@/components/admin/EditLink";

export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const page = (await getPage("resume")) ?? SEED_PAGES.resume;

  return (
    <article>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-3xl tracking-tight">{page.title}</h1>
        <EditLink href="/admin/pages/resume" />
      </div>
      <Markdown>{page.body}</Markdown>
    </article>
  );
}
