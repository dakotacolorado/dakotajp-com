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

Before committing, make sure the app builds, lints, typechecks, and tests pass:

```bash
npm run build
npm run lint
npm run typecheck    # every package — nothing else typechecks storage/lambda
npm test
```

CI runs all four on every PR.

## Tests

Unit tests run on [Jest](https://jestjs.io) and execute on every PR (CI).

```bash
npm test                              # everything
npm test -- slug                      # filter by name
npx jest --selectProjects core        # one package
```

One config at the root (`jest.config.mjs`) defines a project per package, so
adding a package means adding one entry there and nothing else:

- **core**, **storage**, **cdk** — plain Node via `ts-jest`.
- **web** — app / client components via `next/jest` (jsdom + React Testing
  Library).
- **web-lib** — the web app's non-Next code under `lib/`.

**Tests are colocated with their source as `*.test.ts(x)`** — one convention
everywhere (`src/schema.ts` ↔ `src/schema.test.ts`).

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
cd packages/cdk && npx cdk deploy DakotajpSiteStack
```

## Admin

The site has a single admin. Set the password (stored hashed in SSM):

```bash
npm run set-admin-password
```

Then sign in at `/admin`.

## Layout

npm workspaces.

```
packages/
  core/       domain model — entities, pure rules, DynamoDB key shapes.
              Runtime-agnostic: no server-only, no next/*, no AWS SDK.
  storage/    DynamoDB repositories over core. Shared by web and the Lambdas.
  web/        the Next.js app — pages, server actions, UI components
  lambda/     async worker Lambdas (the Bedrock summarizer)
  cdk/        AWS CDK app — the site stack and the GitHub OIDC stack
adr/          architecture decision records
scripts/      one-off operator scripts (run from the repo root)
```

Dependencies point one way: `core` ← `storage` ← (`web`, `lambda`), with `cdk`
depending on `core` for the table name.
