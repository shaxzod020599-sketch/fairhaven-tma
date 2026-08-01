const fs = require('fs');
const path = require('path');

/**
 * Loads the environment the way the server does, from wherever it actually is.
 *
 * `server.js` sits one level above these scripts, so its `../.env` lands on the
 * repository root. Copying that line into `scripts/` pointed it at
 * `backend/.env` instead — a file that does not exist on the deployment. Every
 * script then failed with "the `uri` parameter to `openUri()` must be a
 * string", which says nothing about the actual problem.
 *
 * Both locations are tried because either is a reasonable place to have put it,
 * and a script that works only on the maintainer's machine is a script nobody
 * runs when it matters.
 */
function loadEnv() {
  const candidates = [
    path.resolve(__dirname, '../../.env'),  // repository root — what the server uses
    path.resolve(__dirname, '../.env'),     // backend/.env
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      require('dotenv').config({ path: file });
      return file;
    }
  }

  // Named explicitly rather than left to fail later on a missing MONGO_URI.
  throw new Error(
    `no .env found. Looked in:\n  ${candidates.join('\n  ')}`
  );
}

module.exports = { loadEnv };
