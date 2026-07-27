import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { Page } from "@dakotajp/core";
import { ddb, TABLE_NAME } from "./client";
import { PAGE, currentKey } from "./keys";
import { commitVersion } from "./versioning";

export async function getPage(key: string): Promise<Page | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: currentKey(PAGE, key) }),
  );
  if (!res.Item) return null;
  return Page.from({
    key,
    title: res.Item.title as string,
    body: res.Item.body as string,
    version: (res.Item.version as number) ?? 1,
    updatedAt: res.Item.updatedAt as string,
  });
}

export async function savePage(
  key: string,
  input: { title: string; body: string },
): Promise<Page> {
  await commitVersion(PAGE, key, {
    title: input.title,
    body: input.body,
  });
  return (await getPage(key))!;
}
