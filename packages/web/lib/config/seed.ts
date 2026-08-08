/**
 * Shown until a PAGE item exists in DynamoDB, which then overrides it.
 *
 * Placeholder text only. Real content belongs in the database, written through
 * /admin — once a page has been edited there this file is never read for it
 * again, so anything added here is invisible on a site that has been used.
 */
export const SEED_PAGES: Record<string, { title: string; body: string }> = {
  about: {
    title: "About Me",
    body: `# Hi, I'm Dakota 👋

I'm a software engineer. This site is my little corner of the internet — an
about page and a blog.

> This content is editable. Log in at **/admin** and click **Edit** to change it.

## What I do
- Build things on the web
- Work with cloud infrastructure
- Write the occasional blog post
`,
  },
};
