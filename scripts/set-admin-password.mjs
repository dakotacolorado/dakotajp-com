#!/usr/bin/env node
/**
 * Sets the admin password hash in SSM, and the session-signing secret if it
 * does not exist yet. Re-runnable.
 *
 *   npm run set-admin-password
 *
 * Uses the local AWS profile. These parameters are not managed by CDK, so a
 * fresh environment has no admin until this runs.
 */
import { scryptSync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
} from "@aws-sdk/client-ssm";

const REGION = process.env.AWS_REGION || "us-east-1";
const PARAM_PASSWORD = "/dakotajp/admin-password-hash";
const PARAM_SECRET = "/dakotajp/session-secret";

const ssm = new SSMClient({ region: REGION });

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // Mask input: intercept writes to stdout while typing.
    const stdout = process.stdout;
    rl._writeToOutput = (str) => {
      if (str.includes(question)) stdout.write(str);
      else stdout.write("*");
    };
    rl.question(question, (answer) => {
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
  });
}

async function paramExists(name) {
  try {
    await ssm.send(new GetParameterCommand({ Name: name }));
    return true;
  } catch (err) {
    if (err?.name === "ParameterNotFound") return false;
    throw err;
  }
}

async function main() {
  console.log(`\nSetting admin auth in SSM (region ${REGION})\n`);

  const pw = await promptHidden("New admin password: ");
  if (!pw || pw.length < 8) {
    console.error("✗ Password must be at least 8 characters.");
    process.exit(1);
  }
  const confirm = await promptHidden("Confirm password:   ");
  if (pw !== confirm) {
    console.error("✗ Passwords do not match.");
    process.exit(1);
  }

  const hash = hashPassword(pw);
  await ssm.send(
    new PutParameterCommand({
      Name: PARAM_PASSWORD,
      Value: hash,
      Type: "SecureString",
      Overwrite: true,
    }),
  );
  console.log(`✓ Stored password hash at ${PARAM_PASSWORD}`);

  if (await paramExists(PARAM_SECRET)) {
    console.log(`✓ Session secret already exists at ${PARAM_SECRET} (kept)`);
  } else {
    const secret = randomBytes(48).toString("base64url");
    await ssm.send(
      new PutParameterCommand({
        Name: PARAM_SECRET,
        Value: secret,
        Type: "SecureString",
        Overwrite: false,
      }),
    );
    console.log(`✓ Generated session secret at ${PARAM_SECRET}`);
  }

  console.log("\nDone. You can now log in at /admin.\n");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
