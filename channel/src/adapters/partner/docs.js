const fs = require('fs');
const path = require('path');
const express = require('express');

/**
 * The Partner API's machine-readable contract, public so an integrator can
 * import it straight into Postman or Swagger Editor. The human guide is sent
 * with the keys (docs/integrations/partner-api.ru.md / .pdf).
 */
const router = express.Router();
const SPEC = path.resolve(__dirname, '../../../../docs/integrations/partner-api.openapi.yaml');

router.get('/openapi.yaml', (_req, res) => {
  fs.readFile(SPEC, 'utf8', (err, body) => {
    if (err) return res.status(404).json({ error: { code: 'not_found', message: 'specification not found' } });
    res.type('application/yaml').send(body);
  });
});

module.exports = router;
