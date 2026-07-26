/** Shown until a PAGE item exists in DynamoDB, which then overrides it. */
export const SEED_PAGES: Record<string, { title: string; body: string }> = {
  about: {
    title: "About Me",
    body: `# Hi, I'm Dakota 👋

I'm a software engineer. This site is my little corner of the internet — an
about page, my resume, and a blog.

> This content is editable. Log in at **/admin** and click **Edit** to change it.

## What I do
- Build things on the web
- Work with cloud infrastructure
- Write the occasional blog post

## Elsewhere
- [GitHub](https://github.com/dakotacolorado)
`,
  },
  resume: {
    title: "Resume",
    body: `# Resume

## Experience

### Software Engineer
*Company · 20XX – Present*

- Did impactful things.
- Shipped features used by many.

## Education

### B.S. in Something
*University · 20XX*

## Skills
TypeScript · React · Next.js · AWS · Node.js

_Log in at **/admin** to edit this page._
`,
  },
};
