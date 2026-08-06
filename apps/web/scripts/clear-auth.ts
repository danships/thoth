import type { Connection } from 'mysql2/promise';
import { getDatabase } from '../src/lib/database/index.js';

// Run this script to clear the auth database

const database = await getDatabase();
const connection = await database.getConnection<Connection>();

await connection.execute('DELETE  FROM verification;');
await connection.execute('DELETE  from session;');
await connection.execute('DELETE  from account;');
await connection.execute('DELETE  FROM user;');

console.log('Auth database cleared.');
