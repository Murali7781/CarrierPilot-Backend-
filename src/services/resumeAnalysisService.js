const stopWords = new Set([
  'about', 'after', 'also', 'and', 'are', 'for', 'from', 'have', 'into', 'our',
  'that', 'the', 'their', 'this', 'with', 'you', 'your', 'will', 'years',
]);

function getKeywords(text) {
  return [...new Set(
    String(text || '')
      .toLowerCase()
      .match(/[a-z][a-z0-9+#.-]{2,}/g)
      ?.filter((word) => !stopWords.has(word)) || [],
  )];
}

function analyzeResume(resume, jobDescription) {
  const sourceText = [
    resume.extracted_text || '',
    resume.professional_summary || '',
    ...(Array.isArray(resume.skills) ? resume.skills : []),
    ...(Array.isArray(resume.experience) ? resume.experience.map((entry) => JSON.stringify(entry)) : []),
    ...(Array.isArray(resume.education) ? resume.education.map((entry) => JSON.stringify(entry)) : []),
  ].join(' ');
  const resumeText = sourceText.toLowerCase();
  const keywords = getKeywords(jobDescription);
  const matchedKeywords = keywords.filter((keyword) => resumeText.includes(keyword));
  const missingKeywords = keywords.filter((keyword) => !resumeText.includes(keyword));
  const wordCount = sourceText.trim().split(/\s+/).filter(Boolean).length;
  const checks = [
    { label: 'Contact details', passed: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(sourceText), weight: 10 },
    { label: 'Professional summary', passed: /summary|profile|objective/i.test(sourceText), weight: 10 },
    { label: 'Work experience', passed: /experience|employment|work history/i.test(sourceText), weight: 15 },
    { label: 'Education', passed: /education|university|college|degree/i.test(sourceText), weight: 10 },
    { label: 'Skills', passed: /skills|technologies|technical/i.test(sourceText), weight: 10 },
    { label: 'Resume detail', passed: wordCount >= 150, weight: 10 },
  ];
  const keywordScore = keywords.length
    ? Math.round((matchedKeywords.length / keywords.length) * 45)
    : 0;
  const score = Math.min(
    100,
    keywordScore + checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0),
  );
  const recommendations = checks
    .filter((check) => !check.passed)
    .map((check) => `Add or improve a clearly labelled ${check.label.toLowerCase()} section.`);

  if (missingKeywords.length) {
    recommendations.unshift(
      `If accurate for your experience, consider addressing: ${missingKeywords.slice(0, 8).join(', ')}.`,
    );
  }

  if (wordCount > 900) {
    recommendations.push('Consider tightening the resume; the extracted text is over 900 words.');
  }

  if (resume.file_path && !resume.extracted_text?.trim()) {
    recommendations.push('This PDF has no selectable text. Upload a text-based PDF for a complete ATS check.');
  }

  return {
    score,
    matchedKeywords,
    missingKeywords: missingKeywords.slice(0, 20),
    checks,
    wordCount,
    recommendations,
  };
}

module.exports = {
  analyzeResume,
};
