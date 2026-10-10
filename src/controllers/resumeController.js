const fs = require('fs/promises');
const {
  getUserResumes,
  createResume,
  getResumeById,
  getResumeFile,
  updateResume,
  deleteResume,
  toPublicResume,
} = require('../services/resumeService');
const { analyzeResume } = require('../services/resumeAnalysisService');
const { pool } = require('../config/db');
const { removeResumeFile } = require('../utils/resumeFiles');
const { successResponse, errorResponse } = require('../utils/response');
const { positiveInteger } = require('../utils/validation');
const { extractPdfText, importResumePdf } = require('../services/resumeImportService');

async function getUploadedFileDetails(file) {
  if (!file) return null;

  const buffer = await fs.readFile(file.path);
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    const error = new Error('The uploaded file is not a valid PDF.');
    error.statusCode = 400;
    throw error;
  }

  const extractedText = await extractPdfText(buffer);

  const safeName = file.originalname.replace(/\\/g, '/').split('/').pop();
  return {
    filePath: file.path,
    originalFileName: safeName.slice(-255),
    fileSize: file.size,
    extractedText,
  };
}

async function removeUploadedFile(filePath) {
  try {
    await removeResumeFile(filePath);
  } catch (error) {
    console.error('Unable to clean up an uploaded resume file:', error);
  }
}

async function listResumes(req, res, next) {
  try {
    const resumes = await getUserResumes(req.user.id);
    return res.status(200).json(successResponse('Resumes retrieved successfully', { resumes }));
  } catch (error) {
    next(error);
  }
}

async function createResumeRecord(req, res, next) {
  let uploadedFile;
  try {
    uploadedFile = await getUploadedFileDetails(req.file);
    const resume = await createResume(req.user.id, req.body || {}, uploadedFile);
    return res.status(201).json(successResponse('Resume created successfully', { resume: toPublicResume(resume) }));
  } catch (error) {
    if (req.file) await removeUploadedFile(req.file.path);
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
    return res.status(200).json(successResponse('Resume retrieved successfully', { resume: toPublicResume(resume) }));
  } catch (error) {
    next(error);
  }
}

async function updateResumeRecord(req, res, next) {
  let uploadedFile;
  let previousFilePath;
  try {
    const resumeId = positiveInteger(req.params.id, 'resume id');
    if (req.file) {
      const existing = await getResumeById(req.user.id, resumeId);
      previousFilePath = existing.file_path;
      uploadedFile = await getUploadedFileDetails(req.file);
    }

    const resume = await updateResume(req.user.id, resumeId, req.body || {}, uploadedFile);
    if (previousFilePath && previousFilePath !== uploadedFile?.filePath) {
      await removeUploadedFile(previousFilePath);
    }
    return res.status(200).json(successResponse('Resume updated successfully', { resume: toPublicResume(resume) }));
  } catch (error) {
    if (req.file) await removeUploadedFile(req.file.path);
    next(error);
  }
}

async function deleteResumeRecord(req, res, next) {
  try {
    const result = await deleteResume(req.user.id, positiveInteger(req.params.id, 'resume id'));
    await removeUploadedFile(result.removedFilePath);
    const { removedFilePath, ...publicResult } = result;
    return res.status(200).json(successResponse('Resume deleted successfully', { result: publicResult }));
  } catch (error) {
    next(error);
  }
}

async function downloadResume(req, res, next) {
  try {
    const resumeId = positiveInteger(req.params.id, 'resume id');
    const file = await getResumeFile(req.user.id, resumeId);

    try {
      await fs.access(file.file_path);
    } catch {
      const error = new Error('The stored resume PDF could not be found.');
      error.statusCode = 404;
      throw error;
    }

    return res.download(file.file_path, file.original_file_name, (error) => {
      if (!error) return;
      if (!res.headersSent) {
        next(error);
        return;
      }
      console.error('PDF download response failed:', error);
    });
  } catch (error) {
    next(error);
  }
}

async function analyzeResumeForJob(req, res, next) {
  try {
    const { jobDescription: submittedDescription, targetRole: submittedRole } = req.body || {};
    if (typeof submittedDescription !== 'string') {
      const error = new Error('Job description must be text.');
      error.statusCode = 400;
      throw error;
    }
    if (submittedRole != null && typeof submittedRole !== 'string') {
      const error = new Error('Target role must be text.');
      error.statusCode = 400;
      throw error;
    }
    const jobDescription = submittedDescription.trim();
    const targetRole = String(submittedRole || '').trim().slice(0, 150) || null;
    if (jobDescription.length < 30) {
      const error = new Error('Add a job description with at least 30 characters to run the ATS check.');
      error.statusCode = 400;
      throw error;
    }
    if (jobDescription.length > 15000) {
      const error = new Error('Job description must be 15,000 characters or fewer.');
      error.statusCode = 400;
      throw error;
    }

    const resume = await getResumeById(
      req.user.id,
      positiveInteger(req.params.id, 'resume id'),
    );
    const analysis = analyzeResume(resume, jobDescription);
    await pool.query(
      'INSERT INTO resume_analyses (user_id, resume_id, target_role, job_description, score, result) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, resume.id, targetRole, jobDescription, analysis.score, JSON.stringify(analysis)],
    );
    return res.status(200).json(successResponse('Resume analysis completed', { analysis }));
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
  downloadResume,
  analyzeResumeForJob,
};
