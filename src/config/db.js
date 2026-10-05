const mysql = require('mysql2/promise');

const requiredEnvironmentVariables = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];

function getDatabaseConfig() {
  const missingVariables = requiredEnvironmentVariables.filter((variable) => !process.env[variable]);

  if (missingVariables.length > 0) {
    throw new Error(`Missing required database environment variables: ${missingVariables.join(', ')}`);
  }

  const port = Number(process.env.DB_PORT);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('DB_PORT must be a valid positive integer.');
  }

  return {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  };
}

const pool = mysql.createPool(getDatabaseConfig());

async function testDatabaseConnection() {
  const [rows] = await pool.query('SELECT 1 AS ok');

  if (!rows || rows.length === 0 || rows[0].ok !== 1) {
    throw new Error('Database query did not return the expected result.');
  }

  return true;
}

async function initializeDatabase() {
  const schema = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      mobile VARCHAR(20),
      token_version INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS resumes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      title VARCHAR(150) NOT NULL,
      personal_info JSON,
      professional_summary TEXT,
      education JSON,
      experience JSON,
      skills JSON,
      projects JSON,
      certifications JSON,
      source_file_name VARCHAR(255) NULL,
      extracted_text MEDIUMTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_resumes_user_updated (user_id, updated_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS resume_skills (
      id INT PRIMARY KEY AUTO_INCREMENT,
      resume_id INT NOT NULL,
      skill_name VARCHAR(100) NOT NULL,
      proficiency_level VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS job_descriptions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      title VARCHAR(150) NOT NULL,
      company VARCHAR(150),
      description TEXT,
      required_skills JSON,
      preferred_skills JSON,
      experience_requirements TEXT,
      location VARCHAR(200),
      source_url VARCHAR(2048),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_jobs_user_created (user_id, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS job_matches (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      resume_id INT,
      job_id INT,
      match_percentage INT DEFAULT 0,
      matching_skills JSON,
      missing_skills JSON,
      partial_skills JSON,
      recommendations JSON,
      ats_score INT NULL,
      score_breakdown JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_job_matches_user_created (user_id, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL,
      FOREIGN KEY (job_id) REFERENCES job_descriptions(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS skill_gaps (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      skill_name VARCHAR(100) NOT NULL,
      current_level VARCHAR(50),
      missing_level VARCHAR(50),
      priority VARCHAR(50),
      recommended_topics TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_skill_gaps_user_updated (user_id, updated_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS interview_sessions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      job_id INT NULL,
      resume_id INT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(150),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_interviews_user_created (user_id, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES job_descriptions(id) ON DELETE SET NULL,
      FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS interview_questions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      interview_id INT NOT NULL,
       question_text TEXT NOT NULL,
       question_type VARCHAR(50),
       metadata JSON NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_questions_session_id (interview_id, id),
      FOREIGN KEY (interview_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS interview_answers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      interview_id INT NOT NULL,
      question_id INT NOT NULL,
      user_id INT NOT NULL,
      answer_text TEXT,
      ai_feedback TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_answers_session_user (interview_id, user_id, id),
      FOREIGN KEY (interview_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES interview_questions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS chat_conversations (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      title VARCHAR(150),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS chat_messages (
      id INT PRIMARY KEY AUTO_INCREMENT,
      conversation_id INT NOT NULL,
      role VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS candidate_preferences (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL UNIQUE,
      desired_roles JSON,
      preferred_locations JSON,
      work_modes JSON,
      skills JSON,
      minimum_salary DECIMAL(12, 2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS saved_jobs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      job_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_saved_job (user_id, job_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES job_descriptions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS applications (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      job_id INT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'applied',
      notes TEXT,
      next_action_date DATE,
      interview_date DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_application (user_id, job_id),
      KEY idx_applications_user_status_updated (user_id, status, updated_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES job_descriptions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
  ];

  for (const query of schema) {
    await pool.query(query);
  }

  const ensureColumn = async (tableName, columnName, definition) => {
    const [columns] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [tableName, columnName],
    );
    if (!columns.length) await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  };
  const ensureIndex = async (tableName, indexName, definition) => {
    const [indexes] = await pool.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [tableName, indexName],
    );
    if (!indexes.length) await pool.query(`ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` ${definition}`);
  };
  const ensureForeignKey = async (tableName, columnName, constraintName, definition) => {
    const [constraints] = await pool.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1`,
      [tableName, columnName],
    );
    if (!constraints.length) await pool.query(`ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` ${definition}`);
  };
  await ensureColumn('job_descriptions', 'location', 'VARCHAR(200) NULL');
  await ensureColumn('resumes', 'source_file_name', 'VARCHAR(255) NULL');
  await ensureColumn('resumes', 'extracted_text', 'MEDIUMTEXT NULL');
  await ensureColumn('job_matches', 'ats_score', 'INT NULL');
  await ensureColumn('job_matches', 'score_breakdown', 'JSON NULL');
  await ensureIndex('job_matches', 'idx_job_matches_user_created', '(user_id, created_at)');
  await ensureColumn('job_descriptions', 'source_url', 'VARCHAR(2048) NULL');
  await ensureColumn('interview_sessions', 'job_id', 'INT NULL');
  await ensureColumn('interview_sessions', 'resume_id', 'INT NULL');
  await ensureColumn('interview_questions', 'metadata', 'JSON NULL');
  await ensureIndex('resumes', 'idx_resumes_user_updated', '(user_id, updated_at)');
  await ensureIndex('job_descriptions', 'idx_jobs_user_created', '(user_id, created_at)');
  await ensureIndex('skill_gaps', 'idx_skill_gaps_user_updated', '(user_id, updated_at)');
  await ensureIndex('interview_sessions', 'idx_interviews_user_created', '(user_id, created_at)');
  await ensureIndex('interview_sessions', 'idx_interviews_job_resume', '(job_id, resume_id)');
  await ensureIndex('interview_questions', 'idx_questions_session_id', '(interview_id, id)');
  await ensureIndex('interview_answers', 'idx_answers_session_user', '(interview_id, user_id, id)');
  await ensureForeignKey('interview_sessions', 'job_id', 'fk_interviews_job', 'FOREIGN KEY (job_id) REFERENCES job_descriptions(id) ON DELETE SET NULL');
  await ensureForeignKey('interview_sessions', 'resume_id', 'fk_interviews_resume', 'FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL');
  await ensureIndex('applications', 'idx_applications_user_status_updated', '(user_id, status, updated_at)');

  const [tokenVersionColumn] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version' LIMIT 1`,
  );
  if (!tokenVersionColumn.length) {
    await pool.query('ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0');
  }

  return true;
}

module.exports = {
  pool,
  testDatabaseConnection,
  initializeDatabase,
};
