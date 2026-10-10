const developmentOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const productionOrigins = [
  'https://carrirepilot-frontend.vercel.app',
  ...(process.env.CLIENT_ORIGINS || '').split(','),
]
  .map((origin) => origin.trim())
  .filter(Boolean);

const vercelPreviewOriginPattern =
  /^https:\/\/carrirepilot-frontend-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-murali7781s-projects\.vercel\.app$/;

function isAllowedOrigin(origin) {
  const isDevelopmentOrigin = developmentOrigins.includes(origin);
  return Boolean(origin) && (
    (process.env.NODE_ENV === 'production'
      ? !isDevelopmentOrigin && productionOrigins.includes(origin)
      : isDevelopmentOrigin || productionOrigins.includes(origin)) ||
    vercelPreviewOriginPattern.test(origin)
  );
}

module.exports = { isAllowedOrigin };
