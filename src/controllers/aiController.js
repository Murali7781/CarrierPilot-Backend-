const { generateCareerAdvice } = require('../services/ai/aiService');
const { successResponse, errorResponse } = require('../utils/response');

async function chatWithAi(req, res, next) {
  try {
    const { message } = req.body || {};

    const normalizedMessage = String(message || '').trim();

    if (!normalizedMessage) {
      return res.status(400).json(errorResponse('Message is required', 400));
    }

    const result = await generateCareerAdvice({
      message: normalizedMessage,
      userContext: {
        userId: req.user ? req.user.id : null,
      },
    });

    return res.status(200).json(successResponse('AI response generated', { response: result.response }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  chatWithAi,
};
