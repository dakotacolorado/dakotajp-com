import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb, TABLE_NAME } from "./dynamo";

/**
 * Example data model: a simple guestbook, stored single-table style.
 *
 *   pk = "GUESTBOOK"                       (all entries share one partition)
 *   sk = "<ISO timestamp>#<uuid>"          (sortable, unique)
 *
 * Querying by pk with ScanIndexForward=false returns newest-first.
 */

export interface Message {
  id: string;
  name: string;
  body: string;
  createdAt: string; // ISO 8601
}

const PK = "GUESTBOOK";

export async function listMessages(limit = 25): Promise<Message[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": PK },
      ScanIndexForward: false, // newest first
      Limit: limit,
    }),
  );

  return (res.Items ?? []).map((item) => ({
    id: item.id as string,
    name: item.name as string,
    body: item.body as string,
    createdAt: item.createdAt as string,
  }));
}

export async function addMessage(input: {
  name: string;
  body: string;
}): Promise<Message> {
  const createdAt = new Date().toISOString();
  const id = randomUUID();

  const message: Message = {
    id,
    name: input.name,
    body: input.body,
    createdAt,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: PK,
        sk: `${createdAt}#${id}`,
        ...message,
      },
    }),
  );

  return message;
}
