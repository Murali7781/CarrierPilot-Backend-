const fs = require('fs/promises');
const path = require('path');

const resumeUploadDirectory = path.resolve(__dirname, '../../uploads/resumes');

async function removeResumeFile(filePath) {
  if (!filePath) return;

  if (path.dirname(path.resolve(filePath)) !== resumeUploadDirectory) {
    throw new Error('Refusing to remove a file outside the resume upload directory.');
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = {
  resumeUploadDirectory,
  removeResumeFile,
};
