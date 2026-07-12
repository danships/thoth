import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env['DB'] ?? path.join(process.cwd(), 'db.sqlite3');
const db = new Database(DB_PATH);

db.exec(`CREATE TABLE IF NOT EXISTS _seed_marker (id INTEGER PRIMARY KEY)`);

const alreadySeeded = db.prepare('SELECT id FROM _seed_marker LIMIT 1').get();
if (alreadySeeded) {
  console.log('Database already seeded, skipping.');
  db.close();
  process.exit(0);
}

db.prepare(
  `
  INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
  VALUES ('preview-user-1', 'Preview User', 'preview@example.com', 1, datetime('now'), datetime('now'))
`
).run();

const samplePages = [
  { id: 'seed-page-1', title: 'Welcome', emoji: '👋', parentId: null },
  { id: 'seed-page-2', title: 'Getting Started', emoji: '🚀', parentId: 'seed-page-1' },
  { id: 'seed-page-3', title: 'Architecture', emoji: '🏗️', parentId: null },
];

const insertPage = db.prepare(`
  INSERT OR IGNORE INTO container (id, name, emoji, parentId, userId, lastUpdated)
  VALUES (@id, @title, @emoji, @parentId, 'preview-user-1', datetime('now'))
`);

for (const page of samplePages) {
  insertPage.run(page);
}

db.prepare('INSERT INTO _seed_marker (id) VALUES (1)').run();

console.log(`Seeded ${samplePages.length} sample pages.`);
db.close();
