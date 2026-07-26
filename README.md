# dakotajp.com

Personal site + small markdown CMS. Next.js (App Router) on AWS — Lambda +
CloudFront + S3 via OpenNext, DynamoDB for content, deployed with AWS CDK.

> Built on Next.js 16 — some APIs and conventions differ from earlier versions.

**The rules of this codebase live in [`adr/`](./adr).** Read those first — they
are the source of truth, and there are deliberately very few of them.

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

CI runs all four plus `cdk synth` on every PR, and lint / typecheck / tests run
again on the deploy itself.

## Tests

Unit tests run on [Jest](https://jestjs.io) and execute on every PR (CI).

```bash
npm test                              # everything
npm run test:coverage                 # everything, with the coverage report
npm test -- slug                      # filter by name
npx jest --selectProjects core        # one package
```

One config at the root (`jest.config.mjs`) defines a project per package, so
adding a package means adding one entry there and nothing else:

- **core**, **storage**, **lambda**, **cdk** — plain Node via `ts-jest`.
- **web** — app / client components via `next/jest` (jsdom + React Testing
  Library).
- **web-lib** — the web app's non-Next code under `lib/`.

**Tests are colocated with their source as `*.test.ts(x)`** — one convention
everywhere (`src/schema.ts` ↔ `src/schema.test.ts`).

Jest can't test async Server Components, so rendered pages are verified by
deploy + manual smoke, not unit tests.

### Coverage

CI runs `npm run test:coverage`, and **`storage` and `lambda` are held at 100%**
— both are pure logic over a mocked AWS SDK, so an uncovered branch means a
missing test, not an untestable runtime. Dropping below the bar fails the PR.
Coverage is reported for `core` too, but not enforced there (its view-layer
helpers are exercised from the web app, which this report can't see).

`storage` tests swap one module: `src/__mocks__/client.ts` replaces the DynamoDB
client, so the real repository logic — key shapes, mapping, batching — runs
against a scripted `ddb.send` and the tests assert on the commands it received.

## Commit & deploy

Standard git. **Pushing to `main` deploys automatically:**

```bash
git add <files>            # stage the files you changed
git commit -m "message"
git push origin main
```

GitHub Actions lints, typechecks, tests, then runs `cdk deploy` (auth via OIDC,
no stored keys). Pull requests into `main` run the same checks plus a build and
`cdk synth` — no deploy.

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
  core/       domain model — entities and pure rules
  storage/    DynamoDB repositories over core
  web/        the Next.js app — pages, server actions, UI components
  lambda/     async worker Lambdas (the Bedrock summarizer)
  cdk/        AWS CDK app — the site stack and the GitHub OIDC stack
adr/          architecture decision records
scripts/      one-off operator scripts (run from the repo root)
```

Which package may import which, and what each one is allowed to hold, is
[ADR 0001](./adr/ADR_0001_package-boundaries.md) — enforced by
`core/src/arch.test.ts` and `storage/src/index.test.ts`, not by convention.
