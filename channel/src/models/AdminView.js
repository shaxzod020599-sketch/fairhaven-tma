const mongoose = require('mongoose');
const { defineReadModel } = require('../db');

const adminViewSchema = new mongoose.Schema({
  telegramId: { type: Number },
  role: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  username: { type: String },
  botBlocked: { type: Boolean },
}, { strict: true });

module.exports = function AdminView() {
  return defineReadModel('AdminView', adminViewSchema, 'users');
};
