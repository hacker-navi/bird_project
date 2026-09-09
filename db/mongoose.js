const mongoose = require('mongoose');

// Every document gets .toJSON() transformed so the API keeps returning
// a plain "id" string field (like the original SQLite build did) instead
// of Mongo's _id/__v — this keeps all existing frontend code working
// unchanged against the new database.
const idTransformPlugin = (schema) => {
  schema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
      if (ret && ret._id != null) {
        ret.id = ret._id.toString();
        delete ret._id;
      }
      if (ret) {
        delete ret.__v;
      }
      return ret;
    }
  });
  schema.set('toObject', { virtuals: true });
};

mongoose.plugin(idTransformPlugin);

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nerlirp';
  mongoose.set('strictQuery', true);
  // Fail fast (5s) with a clear error instead of hanging on the default 30s
  // server-selection timeout when MongoDB isn't reachable.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`[MongoDB] Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

module.exports = { connectDB, mongoose };
