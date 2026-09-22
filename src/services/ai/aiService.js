const MAX_MESSAGE_LENGTH = 4000;

async function generateCareerAdvice({ message, userContext = {} }) {
  const prompt = String(message || '').trim();

  if (!prompt) {
    const error = new Error('Message is required');
    error.statusCode = 400;
    throw error;
  }

  if (prompt.length > MAX_MESSAGE_LENGTH) {
    const error = new Error(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
    error.statusCode = 400;
    throw error;
  }

  if (!process.env.AI_API_KEY) {
    return {
      response: 'AI provider is not configured. You can still review your resume, prioritize skill gaps, and tailor applications to roles that match your experience.',
      provider: 'local-placeholder',
      userId: userContext.userId || null,
    };
  }

  return {
    response: 'AI provider configuration is present, but provider integration has not been implemented yet.',
    provider: 'configured-provider-not-integrated',
    userId: userContext.userId || null,
  };
}

module.exports = {
  generateCareerAdvice,
};
