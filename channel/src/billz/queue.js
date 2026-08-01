const config = require('../config');
const { createLimiter } = require('./limiter');

/**
 * The one queue every Billz call goes through.
 *
 * It lives in its own module so both the HTTP client and the login path can
 * share it without importing each other. Login is a Billz request like any
 * other and counts against the same 2 requests/second ceiling; issuing it
 * outside the queue meant a burst of expired-token requests could put us over
 * the limit at exactly the moment we were least able to absorb a 429.
 */
const limiter = createLimiter({ requestsPerSecond: config.billz.requestsPerSecond });

module.exports = { limiter };
