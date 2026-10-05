const { getUserResumes, createResume, getResumeById, updateResume, deleteResume } = require('../services/resumeService');
const { successResponse, errorResponse } = require('../utils/response');
const { positiveInteger } = require('../utils/validation');
const { importResumePdf } = require('../services/resumeImportService');

async function listResumes(req, res, next) {
  try {
    const resumes = await getUserResumes(req.user.id);
    return res.status(200).json(successResponse('Resumes retrieved successfully', { resumes }));
  } catch (error) {
    next(error);
  }
}

async function createResumeRecord(req, res, next) {
  try {
    const resume = await createResume(req.user.id, req.body || {});
    return res.status(201).json(successResponse('Resume created successfully', { resume }));
  } catch (error) {
    next(error);
  }
}

async function importResumeRecord(req, res, next) {
  try {
    if (!req.file) return res.status(400).json(errorResponse('No PDF reached CareerPilot. Choose a PDF in the upload area, then select Import PDF.', 400));
    const result = await importResumePdf(req.user.id, req.file);
    return res.status(201).json(successResponse('Resume PDF imported. Review the extracted fields before using it.', result));
  } catch (error) { next(error); }
}

async function getResume(req, res, next) {
  try {
    const resume = await getResumeById(req.user.id, positiveInteger(req.params.id, 'resume id'));
    return res.status(200).json(successResponse('Resume retrieved successfully', { resume }));
  } catch (error) {
    next(error);
  }
}

async function updateResumeRecord(req, res, next) {
  try {
    const resume = await updateResume(req.user.id, positiveInteger(req.params.id, 'resume id'), req.body || {});
    return res.status(200).json(successResponse('Resume updated successfully', { resume }));
  } catch (error) {
    next(error);
  }
}

async function deleteResumeRecord(req, res, next) {
  try {
    const result = await deleteResume(req.user.id, positiveInteger(req.params.id, 'resume id'));
    return res.status(200).json(successResponse('Resume deleted successfully', { result }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listResumes,
  createResumeRecord,
  importResumeRecord,
  getResume,
  updateResumeRecord,
  deleteResumeRecord,
};
