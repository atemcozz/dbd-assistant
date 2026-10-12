// Jest globalTeardown: remove the shared test database once, after all
// spec files finish. Per-file cleanup would delete it while other files
// still run (every file gets a fresh module registry but the same file).
const fs = require('node:fs')
const path = require('node:path')

module.exports = async function globalTeardown() {
  const dbPath = path.resolve(__dirname, '../prisma/test-game.db')
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
}
