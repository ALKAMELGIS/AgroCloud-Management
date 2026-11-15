/**
 * Create (or promote) the system owner: role "ceo" with every permission,
 * in the first organisation (created as "Al Maha Farm" if none exists).
 *
 *   DATABASE_URL=... node scripts/create-owner.js <email> "<name>"
 *
 * The password is typed here (hidden) and stored only as a bcrypt hash.
 * For super-admin (all organisations) also add the email to SUPER_ADMIN_EMAILS.
 */
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const email = (process.argv[2] || '').trim().toLowerCase();
const name = (process.argv[3] || 'Owner').trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: node scripts/create-owner.js <email> "<name>"');
  process.exit(1);
}

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

(async () => {
  const pw = process.env.OWNER_PASSWORD || await askHidden('Password (min 10 characters): ');
  if (!pw || pw.length < 10) { console.error('Password must be at least 10 characters.'); process.exit(1); }
  if (!process.env.OWNER_PASSWORD && (await askHidden('Repeat password: ')) !== pw) { console.error('Passwords do not match.'); process.exit(1); }

  const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false } });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    let org = (await c.query('SELECT id, name FROM organizations ORDER BY created_at ASC LIMIT 1')).rows[0];
    if (!org) {
      org = (await c.query(
        `INSERT INTO organizations (name, slug, settings) VALUES ($1, $2, $3) RETURNING id, name`,
        ['Al Maha Farm', 'al-maha-farm', JSON.stringify({ allow_registration: false })])).rows[0];
    }
    const hash = await bcrypt.hash(pw, 12);
    const existing = (await c.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1', [email])).rows[0];
    if (existing) {
      await c.query(
        `UPDATE users SET role = 'ceo', password_hash = $2, is_active = true,
           organization_id = COALESCE(organization_id, $3) WHERE id = $1`, [existing.id, hash, org.id]);
    } else {
      await c.query(
        `INSERT INTO users (email, password_hash, name, role, organization_id) VALUES ($1, $2, $3, 'ceo', $4)`,
        [email, hash, name, org.id]);
    }
    const r = { rows: [{ created: !existing }] };
    await c.query('COMMIT');
    console.log(`${r.rows[0].created ? 'Created' : 'Updated'} owner ${email} (CEO, all permissions) in "${org.name}".`);
    console.log('Optional: add this email to SUPER_ADMIN_EMAILS to see every organisation.');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Failed:', e.message);
    process.exitCode = 1;
  } finally {
    c.release(); await pool.end();
  }
})();
