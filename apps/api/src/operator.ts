import "dotenv/config";
import { createDb, now } from "./db.js";

const [command, id] = process.argv.slice(2);
if (!id || !["hide-comment", "block-user"].includes(command ?? "")) throw new Error("Usage: tsx src/operator.ts hide-comment <vote-id> | block-user <user-id>");
const db = createDb();
try {
  if (command === "hide-comment") await db.query("UPDATE vote SET \"commentHiddenAt\"=$1 WHERE id=$2", [now(), id]);
  else {
    await db.query("UPDATE \"user\" SET \"blockedAt\"=$1, \"updatedAt\"=$1 WHERE id=$2", [now(), id]);
    await db.query("UPDATE \"session\" SET \"revokedAt\"=$1 WHERE \"userId\"=$2", [now(), id]);
  }
} finally { await db.end(); }
