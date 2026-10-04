const path = require('path');

// Postgres when DATABASE_URL is set (Railway), otherwise a local SQLite file
// (better-sqlite3 is an optional dependency, so images without build tools can skip it).
module.exports = ({ env }) =>
  env('DATABASE_URL')
    ? {
        connection: {
          client: 'postgres',
          connection: { connectionString: env('DATABASE_URL') },
          pool: { min: 0, max: 7 },
        },
      }
    : {
        connection: {
          client: 'sqlite',
          connection: { filename: path.join(__dirname, '..', '.tmp', 'data.db') },
          useNullAsDefault: true,
        },
      };
