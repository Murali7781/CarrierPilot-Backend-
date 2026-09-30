const cache = new Map();
const CACHE_TTL_MS = 90_000;
const ALLOWED_COUNTRY = /^[a-z]{2}$/;
const CURRENCY_BY_COUNTRY = {
  au: 'AUD', ca: 'CAD', de: 'EUR', fr: 'EUR', gb: 'GBP', in: 'INR', us: 'USD',
};

function normalizeProviderUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    url.protocol = 'https:';
    return url.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

function getAdzunaConfig() {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) return null;

  const country = String(process.env.ADZUNA_COUNTRY || '').trim().toLowerCase();
  if (!ALLOWED_COUNTRY.test(country)) {
    const error = new Error('ADZUNA_COUNTRY must be a two-letter country code.');
    error.statusCode = 500;
    throw error;
  }

  return { appId, appKey, country };
}

function createProviderError() {
  const error = new Error('Live job search is temporarily unavailable. Please try again in a moment.');
  error.statusCode = 503;
  return error;
}

async function searchAdzunaJobs({ search = '', location = '', page = 1, country: requestedCountry }) {
  const config = getAdzunaConfig();
  if (!config) return null;

  const country = requestedCountry
    ? String(requestedCountry).trim().toLowerCase()
    : config.country;
  if (!ALLOWED_COUNTRY.test(country)) {
    const error = new Error('Country must be a two-letter country code.');
    error.statusCode = 400;
    throw error;
  }

  const query = String(search || '').trim().slice(0, 100);
  const where = String(location || '').trim().slice(0, 100);
  const pageNumber = Math.min(10, Math.max(1, Number(page) || 1));
  const cacheKey = `${country}|${pageNumber}|${query.toLowerCase()}|${where.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.value;

  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${pageNumber}`);
  url.searchParams.set('app_id', config.appId);
  url.searchParams.set('app_key', config.appKey);
  url.searchParams.set('results_per_page', '20');
  url.searchParams.set('content-type', 'application/json');
  url.searchParams.set('sort_by', 'date');
  if (query) url.searchParams.set('what', query);
  if (where) url.searchParams.set('where', where);

  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw createProviderError();

    const payload = await response.json();
    if (!Array.isArray(payload.results)) throw createProviderError();

    const value = {
      total: Number(payload.count) || payload.results.length,
      country,
      jobs: payload.results
        .filter((job) => job && job.id != null && job.title && job.redirect_url)
        .map((job) => ({
          sourceJobId: String(job.id).slice(0, 120),
          title: String(job.title).slice(0, 150),
          company: String(job.company?.display_name || '').slice(0, 150) || null,
          description: String(job.description || '').slice(0, 20_000),
          location: String(job.location?.display_name || '').slice(0, 255) || null,
          salaryMin: Number.isFinite(Number(job.salary_min)) ? Number(job.salary_min) : null,
          salaryMax: Number.isFinite(Number(job.salary_max)) ? Number(job.salary_max) : null,
          salaryCurrency: CURRENCY_BY_COUNTRY[country] || null,
          employmentType: [job.contract_time, job.contract_type].filter(Boolean).join(' · ').slice(0, 60) || null,
          applyUrl: normalizeProviderUrl(job.redirect_url),
          publishedAt: job.created && !Number.isNaN(Date.parse(job.created))
            ? new Date(job.created)
            : null,
        })),
    };

    cache.set(cacheKey, { savedAt: Date.now(), value });
    for (const [key, entry] of cache.entries()) {
      if (Date.now() - entry.savedAt >= CACHE_TTL_MS) cache.delete(key);
    }
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return value;
  } catch (error) {
    if (error.statusCode) throw error;
    throw createProviderError();
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

module.exports = {
  getAdzunaConfig,
  searchAdzunaJobs,
};
