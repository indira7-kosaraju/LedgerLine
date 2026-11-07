import { execSync } from 'node:child_process'

// Before any browser test: migrations + seed on ledgerline_test (the script refuses any other DB).
export default function globalSetup() {
  execSync('node scripts/prepare-test-db.js', { cwd: new URL('../../backend', import.meta.url), stdio: 'inherit' })
}
