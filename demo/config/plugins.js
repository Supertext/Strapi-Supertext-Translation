module.exports = ({ env }) => ({
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET'),
    },
  },
  upload: {
    config: {
      provider: 'local',
    },
  },
  supertext: {
    enabled: true,
    config: {
      apiKey: env('SUPERTEXT_API_KEY'),
      endpoint: env('SUPERTEXT_API_ENDPOINT', 'https://api.supertext.com/v1/'),
      locales: {
        'de-CH': { politeness: 'more' },
        'fr-CH': { politeness: 'more' },
        'it-CH': { politeness: 'more' },
      },
    },
  },
});
