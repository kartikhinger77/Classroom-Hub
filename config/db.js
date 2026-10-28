const mongoose = require('mongoose');
const logger = require('../utils/logger');

async function connectDatabase(uri) {
  mongoose.set('sanitizeFilter', true);
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, autoIndex: process.env.NODE_ENV !== 'production' });
  logger.info({ event: 'database_connected' }, 'Database connected');
  return mongoose.connection;
}

module.exports = { connectDatabase, mongoose };
