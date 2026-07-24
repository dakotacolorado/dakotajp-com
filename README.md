# dakotajp.com

Personal site + small markdown CMS. Next.js (App Router) on AWS — Lambda +
CloudFront + S3 via OpenNext, DynamoDB for content, deployed with AWS CDK.

> Built on Next.js 16 — some APIs and conventions differ from earlier versions.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

Uses AWS credentials for the `us-east-1` account (default profile) to read the
`dakotajp-site` table.

## Build & check

Before committing, make sure the app builds, lints, and tests pass:

```bash
npm run build
npm run lint
npm test
```

## Tests

Unit tests run on [Jest](https://jestjs.io) and execute on every PR (CI).

```bash
npm test              # run everything
npm test -- slug      # filter by name
```

Two Jest projects run together (`jest.config.mjs`):

- **pure** — non-Next code via `ts-jest`. Tests live next to their source as
  `*.test.ts` (e.g. `lib/excerpt.test.ts`).
- **web** — app / client components via `next/jest` (jsdom + React Testing
  Library), as `*.test.tsx` under `app/` or `components/`.

Jest can't test async Server Components, so rendered pages are verified by
deploy + manual smoke, not unit tests.

## Commit & deploy

Standard git. **Pushing to `main` deploys automatically:**

```bash
git add <files>            # stage the files you changed
git commit -m "message"
git push origin main
```

GitHub Actions then builds and runs `cdk deploy` (auth via OIDC, no stored
keys). Pull requests into `main` run build + `cdk synth` only — no deploy.

Deploy manually instead:

```bash
cd infra && npx cdk deploy DakotajpSiteStack
```

## Admin

The site has a single admin. Set the password (stored hashed in SSM):

```bash
npm run set-admin-password
```

Then sign in at `/admin`.

## Layout

```
app/         pages, admin, and server actions
components/   UI components
lib/          server-only data + auth modules
infra/        AWS CDK app
docs/         runbooks
```
