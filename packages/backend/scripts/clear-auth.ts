import type { Connection } from "mysql2/promise";
import { db } from "../src/modules/database/index.js";

// Run this script to clear the auth database

const connection = await db.getConnection<Connection>();

await connection.execute("DELETE  FROM verification;");
await connection.execute("DELETE  from session;");
await connection.execute("DELETE  from account;");
await connection.execute("DELETE  FROM user;");

console.log("Auth database cleared.");
process.exit(0);
