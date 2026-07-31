const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./logger');

/**
 * This service shares a database with the bot backend, so the safety property
 * that matters most is: it must never write to the collections the bot owns
 * (products, orders, users, settings, ...).
 *
 * Two mechanisms enforce that:
 *
 *  1. A dedicated connection. Models are registered on this connection only,
 *     and no bot model is ever imported here, so mongoose has no handle
 *     through which those collections could be written.
 *  2. An explicit allow-list. `defineModel` refuses any collection outside the
 *     set below, which turns a future mistake into a startup crash rather than
 *     silent data loss.
 *
 * Reading bot-owned collections will be allowed later (the admin panel writes
 * channel prices onto Product), and will be added here as an explicit
 * read-only registration, not by relaxing this list.
 */
const OWNED_COLLECTIONS = new Set([
  'billzproducts',
  'billztokens',
  'synclogs',
]);

let connection = null;

function getConnection() {
  if (!connection) throw new Error('database not connected yet — call connect() first');
  return connection;
}

function defineModel(name, schema, collectionName) {
  const collection = collectionName || `${name.toLowerCase()}s`;
  if (!OWNED_COLLECTIONS.has(collection)) {
    throw new Error(
      `channel-hub may not define a model on "${collection}" — ` +
      `it is owned by the bot backend. Add it to OWNED_COLLECTIONS only if this ` +
      `service is genuinely meant to write there.`
    );
  }
  return getConnection().model(name, schema, collection);
}

async function connect() {
  if (connection) return connection;
  connection = await mongoose
    .createConnection(config.mongoUri, {
      dbName: config.dbName,
      serverSelectionTimeoutMS: 5000,
    })
    .asPromise();

  connection.on('disconnected', () => logger.warn('mongo disconnected'));
  connection.on('reconnected', () => logger.info('mongo reconnected'));

  logger.info('mongo connected', { dbName: config.dbName });
  return connection;
}

async function disconnect() {
  if (!connection) return;
  await connection.close();
  connection = null;
}

module.exports = { connect, disconnect, defineModel, getConnection, OWNED_COLLECTIONS };
