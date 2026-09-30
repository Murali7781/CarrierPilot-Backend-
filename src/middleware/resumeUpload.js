const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { resumeUploadDirectory } = require('../utils/resumeFiles');

const storage = multer.diskStorage({
  destination(req, file, callback) {
    fs.mkdir(resumeUploadDirectory, { recursive: true }, (error) => {
      callback(error, resumeUploadDirectory);
    });
  },
  filename(req, file, callback) {
    callback(null, `${crypto.randomUUID()}.pdf`);
  },
});

const uploadResumePdf = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, callback) {
    const hasPdfExtension = path.extname(file.originalname).toLowerCase() === '.pdf';
    const supportedMimeTypes = ['application/pdf', 'application/x-pdf', 'application/octet-stream'];
    if (hasPdfExtension && supportedMimeTypes.includes(file.mimetype)) {
      callback(null, true);
      return;
    }

    const error = new Error('Only PDF resumes are supported.');
    error.statusCode = 400;
    callback(error);
  },
}).single('resume');

module.exports = uploadResumePdf;
