'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { pool } = require('../src/config/db');
const { provisionAdmin } = require('../src/services/adminProvisioning');

async function main() {
  try {
    const result = await provisionAdmin({ pool });
    console.info(result.created ? 'Administrator account provisioned.' : 'Administrator account already exists; no changes made.');
  } catch (error) {
    console.error('Administrator provisioning failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
