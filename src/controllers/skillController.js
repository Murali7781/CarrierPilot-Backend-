const { successResponse } = require('../utils/response');
const { getUserSkillGaps } = require('../services/skillGapService');

async function getSkillGaps(req, res, next) {
  try {
    const skills = await getUserSkillGaps(req.user.id, 50);
    return res.status(200).json(successResponse('Skills from your resume comparisons retrieved successfully', { skills }));
  } catch (error) { return next(error); }
}

module.exports = { getSkillGaps };
