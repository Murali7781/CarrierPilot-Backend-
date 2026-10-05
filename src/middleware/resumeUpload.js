const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0, parts: 1, fieldNameSize: 40 },
  fileFilter(req, file, callback) {
    const acceptedMimeTypes = new Set(['application/pdf', 'application/x-pdf', 'application/octet-stream']);
    if (!acceptedMimeTypes.has(file.mimetype) || !file.originalname.toLowerCase().endsWith('.pdf')) {
      const error = new Error('Only PDF resumes are accepted.');
      error.statusCode = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

function resumeUpload(req, res, next) {
  upload.single('resume')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') error.statusCode = 413;
    if (error.code === 'LIMIT_UNEXPECTED_FILE') error.statusCode = 400;
    return next(error);
  });
}

module.exports = resumeUpload;
