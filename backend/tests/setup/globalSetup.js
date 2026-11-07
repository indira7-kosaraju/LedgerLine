// Runs once before all Jest tests: bring the TEST database up to date and seed it.
const path = require('path');
const { execSync } = require('child_process');

module.exports = async () => {
  execSync('node scripts/prepare-test-db.js', { cwd: path.join(__dirname, '../..'), stdio: 'pipe' });
};
