/**
 * MongoDB connection — Millo Database
 * https://milloapp.com
 */
const mongoose = require('mongoose');

async function connect(uri) {
  const u = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/millo';
  await mongoose.connect(u);
  return mongoose.connection;
}

async function disconnect() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

module.exports = { connect, disconnect, mongoose };
