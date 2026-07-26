# @dakotajp/cdk

AWS CDK app for **dakotajp.com**. 

Account `326571719118`, region `us-east-1`.

## Prerequisites

- Dependencies installed from the **workspace root**: `npm install` (one hoisted
  `node_modules` for all packages).
- AWS credentials for the account above (default profile). Verify:
  ```bash
  aws sts get-caller-identity   # must print 326571719118
  ```

## Build & test

```bash
npm test                          # from repo root (every package)
npx jest --selectProjects cdk     # just this package's stack tests
```

Jest is configured once at the repo root (`jest.config.mjs`); stack tests live
next to their stack as `*.test.ts`.

## Synth / deploy

Run from `packages/cdk`:

```bash
npx cdk synth DakotajpSiteStack    # build the CloudFormation template
npx cdk diff DakotajpSiteStack     # diff against what's deployed
npx cdk deploy DakotajpSiteStack   # deploy the site
npx cdk deploy GithubOidcStack     # deploy the OIDC stack (one-time / on change)
```

> `synth`/`deploy` build the Next.js app in `packages/web` via OpenNext
> (`nextjsPath`), so a run takes a minute or two.

## How it deploys in CI

The normal path is **not** a manual deploy: pushing to `main` runs
`.github/workflows/deploy.yml`, which assumes the deploy role via OIDC and runs
`cdk deploy DakotajpSiteStack`. Pull requests run `cdk synth` as a check. Manual
`cdk deploy` is for local or one-off work.
