/**
 * These migrations are generated using the better-auth CLI.
 * ```
 * export DB=sqlite://:memory:
 * export NODE_ENV=development
 * export BETTER_AUTH_SECRET=4d675dd169730483103eb302793617397357b4b86a63e19eb77c9cda3d0d64ac
 * npx @better-auth/cli generate --config ./src/lib/auth/better-auth.ts
 * ```
 *
 * to generate for mysql, replace DB= env var with a mysql alternative.
 */
// SQLite schema for better-auth tables
export const BETTER_AUTH_SQLITE_SQL = `
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");
`;

// MySQL schema for better-auth tables
export const BETTER_AUTH_MYSQL_SQL = `
create table \`user\` (\`id\` varchar(36) not null primary key, \`name\` varchar(255) not null, \`email\` varchar(255) not null unique, \`emailVerified\` boolean not null, \`image\` text, \`createdAt\` timestamp(3) default CURRENT_TIMESTAMP(3) not null, \`updatedAt\` timestamp(3) default CURRENT_TIMESTAMP(3) not null);
create table \`session\` (\`id\` varchar(36) not null primary key, \`expiresAt\` timestamp(3) not null, \`token\` varchar(255) not null unique, \`createdAt\` timestamp(3) default CURRENT_TIMESTAMP(3) not null, \`updatedAt\` timestamp(3) not null, \`ipAddress\` text, \`userAgent\` text, \`userId\` varchar(36) not null references \`user\` (\`id\`) on delete cascade);
create table \`account\` (\`id\` varchar(36) not null primary key, \`accountId\` text not null, \`providerId\` text not null, \`userId\` varchar(36) not null references \`user\` (\`id\`) on delete cascade, \`accessToken\` text, \`refreshToken\` text, \`idToken\` text, \`accessTokenExpiresAt\` timestamp(3), \`refreshTokenExpiresAt\` timestamp(3), \`scope\` text, \`password\` text, \`createdAt\` timestamp(3) default CURRENT_TIMESTAMP(3) not null, \`updatedAt\` timestamp(3) not null);
create table \`verification\` (\`id\` varchar(36) not null primary key, \`identifier\` varchar(255) not null, \`value\` text not null, \`expiresAt\` timestamp(3) not null, \`createdAt\` timestamp(3) default CURRENT_TIMESTAMP(3) not null, \`updatedAt\` timestamp(3) default CURRENT_TIMESTAMP(3) not null);
create index \`session_userId_idx\` on \`session\` (\`userId\`);
create index \`account_userId_idx\` on \`account\` (\`userId\`);
create index \`verification_identifier_idx\` on \`verification\` (\`identifier\`);
`;
