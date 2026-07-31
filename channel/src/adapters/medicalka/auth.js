const ChannelKey = require('../../models/ChannelKey');
const { hashKey, describeKey } = require('../../models/ChannelKey');
const logger = require('../../logger');

/**
 * Key check for the Medicalka endpoints.
 *
 * Their contract passes credentials in the query string — `?token=` to read and
 * `?secret=` to submit orders — and distinguishes two failures:
 *   401 mk_unauthorized  the key is wrong or unknown
 *   403 mk_forbidden     the key is known but switched off on our side
 *
 * Lookup is by SHA-256 of the presented value, so no stored key is ever
 * compared piecewise and an unknown key costs exactly one indexed query.
 */

const CHANNEL = 'medicalka';

function unauthorized(res, message) {
  return res.status(401).json({ code: 'mk_unauthorized', detail: message });
}

function forbidden(res, message) {
  return res.status(403).json({ code: 'mk_forbidden', detail: message });
}

function requireKey(kind) {
  const field = kind === 'secret' ? 'secret' : 'token';

  return async function medicalkaAuth(req, res, next) {
    const presented = req.query[field];
    if (!presented || typeof presented !== 'string') {
      return unauthorized(res, `query parameter "${field}" is required`);
    }

    // The tag is a hint for a better error message, never an authorisation
    // decision — the hash lookup below is what actually authenticates.
    const shape = describeKey(presented);
    if (shape && shape.kind && shape.kind !== kind) {
      return unauthorized(
        res,
        `this endpoint expects the ${field}; a ${shape.kind} key was supplied`
      );
    }

    let record;
    try {
      record = await ChannelKey().findOne({ hash: hashKey(presented) }).lean();
    } catch (err) {
      logger.error('key lookup failed', { err });
      return res.status(500).json({ code: 'mk_error', detail: 'internal error' });
    }

    if (!record || record.channel !== CHANNEL || record.kind !== kind) {
      return unauthorized(res, 'unknown or revoked key');
    }
    if (!record.active) {
      return forbidden(res, 'this key has been disabled — contact Fairhaven');
    }

    req.channelKey = { id: record._id, kind: record.kind, label: record.label };

    // Best-effort usage stamp; never delay or fail the request for it.
    ChannelKey()
      .updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } })
      .catch(() => {});

    return next();
  };
}

module.exports = { requireKey, CHANNEL };
