import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Admin-authored markdown. Raw HTML is not rendered (react-markdown default). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
