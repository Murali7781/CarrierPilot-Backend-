const mysql = require('mysql2/promise');
const { lookup } = require('node:dns/promises');

const requiredEnvironmentVariables = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];

function getDatabaseConfig() {
  const missingVariables = requiredEnvironmentVariables.filter(
    (variable) => !process.env[variable]?.trim(),
  );

  if (missingVariables.length > 0) {
    throw new Error(`Missing required database environment variables: ${missingVariables.join(', ')}`);
  }

  const port = Number(process.env.DB_PORT);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('DB_PORT must be a valid positive integer.');
  }

  return {
    host: process.env.DB_HOST.trim(),
    user: process.env.DB_USER.trim(),
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME.trim(),
    port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    ssl: {
      // Aiven requires TLS; disabling certificate verification matches its
      // "required" mode when the service CA certificate is not configured.
      rejectUnauthorized: false,
    },
  };
}

let poolPromise;

async function getPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const config = getDatabaseConfig();
      console.info('MySQL connection configuration:', {
        DB_HOST: config.host,
        DB_PORT: config.port,
        DB_USER: config.user,
        DB_NAME: config.database,
      });

      try {
        await lookup(config.host);
      } catch (error) {
        console.error(`DNS lookup failed for DB_HOST: ${config.host}`);
        const dnsError = new Error(
          `DNS lookup failed for DB_HOST ${config.host}${error.code ? ` (${error.code})` : ''}.`,
          { cause: error },
        );
        dnsError.code = error.code;
        throw dnsError;
      }

      return mysql.createPool(config);
    })().catch((error) => {
      poolPromise = undefined;
      throw error;
    });
  }

  return poolPromise;
}

const pool = {
  query(...args) {
    return getPool().then((connectionPool) => connectionPool.query(...args));
  },
  getConnection() {
    return getPool().then((connectionPool) => connectionPool.getConnection());
  },
  async end() {
    if (!poolPromise) return;
    const connectionPool = await poolPromise;
    return connectionPool.end();
  },
};

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
      target_role VARCHAR(150) NULL,
      personal_info JSON,
      professional_summary TEXT,
      education JSON,
      experience JSON,
      skills JSON,
      projects JSON,
      certifications JSON,
      file_path VARCHAR(500) NULL,
      original_file_name VARCHAR(255) NULL,
      file_size INT UNSIGNED NULL,
      source_file_name VARCHAR(255) NULL,
      extracted_text MEDIUMTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_resumes_user_updated (user_id, updated_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS resume_analyses (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      resume_id INT NOT NULL,
      target_role VARCHAR(150) NULL,
      job_description TEXT NOT NULL,
      score TINYINT UNSIGNED NOT NULL,
      result JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_resume_analysis_latest (user_id, resume_id, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
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
      source VARCHAR(40) NOT NULL DEFAULT 'manual',
      source_job_id VARCHAR(120) NULL,
      source_country CHAR(2) NOT NULL DEFAULT '',
      location VARCHAR(255) NULL,
      work_mode VARCHAR(40) NULL,
      salary_min DECIMAL(12, 2) NULL,
      salary_max DECIMAL(12, 2) NULL,
      salary_currency CHAR(3) NULL,
      employment_type VARCHAR(60) NULL,
      apply_url VARCHAR(1000) NULL,
      published_at DATETIME NULL,
      fetched_at DATETIME NULL,
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

  const resumeColumns = {
    target_role: 'VARCHAR(150) NULL',
    file_path: 'VARCHAR(500) NULL',
    original_file_name: 'VARCHAR(255) NULL',
    file_size: 'INT UNSIGNED NULL',
    source_file_name: 'VARCHAR(255) NULL',
    extracted_text: 'MEDIUMTEXT NULL',
  };

  for (const [column, definition] of Object.entries(resumeColumns)) {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'resumes' AND COLUMN_NAME = ?`,
      [column],
    );

    if (!rows.length) {
      await pool.query(`ALTER TABLE resumes ADD COLUMN ${column} ${definition}`);
    }
  }

  const jobColumns = {
    source: "VARCHAR(40) NOT NULL DEFAULT 'manual'",
    source_job_id: 'VARCHAR(120) NULL',
    source_country: "CHAR(2) NOT NULL DEFAULT ''",
    location: 'VARCHAR(255) NULL',
    work_mode: 'VARCHAR(40) NULL',
    salary_min: 'DECIMAL(12, 2) NULL',
    salary_max: 'DECIMAL(12, 2) NULL',
    salary_currency: 'CHAR(3) NULL',
    employment_type: 'VARCHAR(60) NULL',
    apply_url: 'VARCHAR(1000) NULL',
    published_at: 'DATETIME NULL',
    fetched_at: 'DATETIME NULL',
  };

  for (const [column, definition] of Object.entries(jobColumns)) {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_descriptions' AND COLUMN_NAME = ?`,
      [column],
    );

    if (!rows.length) {
      await pool.query(`ALTER TABLE job_descriptions ADD COLUMN ${column} ${definition}`);
    }
  }

  const [externalJobIndex] = await pool.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_descriptions'
       AND INDEX_NAME = 'unique_external_job_per_user' LIMIT 1`,
  );
  if (!externalJobIndex.length) {
    await pool.query(
      'ALTER TABLE job_descriptions ADD UNIQUE KEY unique_external_job_per_user (user_id, source, source_country, source_job_id)',
    );
  }

  try {
    await pool.query('ALTER TABLE interview_sessions ADD COLUMN scheduled_at DATETIME NULL AFTER status');
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }

  const [users] = await pool.query('SELECT id FROM users');
  const starterJobs = [
    ['Frontend Engineer', 'Northstar Labs', 'Build and maintain responsive, accessible web experiences with React and modern JavaScript. Partner with product designers and backend engineers to turn requirements into reusable UI, integrate APIs, write component and browser tests, investigate production issues, and improve page performance. Required: React, JavaScript, HTML, CSS, accessibility, API integration, Git, and testing. Preferred: TypeScript and design systems.', ['React', 'JavaScript', 'HTML', 'CSS', 'Accessibility', 'Testing'], ['TypeScript', 'Design systems'], '2+ years'],
    ['Product Designer', 'Orbit Studio', 'Lead product design from early discovery through detailed delivery. Interview users, map workflows, create wireframes and interactive prototypes, test concepts, maintain accessible design patterns, and work with engineers through implementation. Required: Figma, user research, interaction design, prototyping, accessibility, and communication. Preferred: design systems and usability testing.', ['Figma', 'UX research', 'Interaction design', 'Prototyping', 'Accessibility'], ['Design systems', 'Usability testing'], '2+ years'],
    ['Backend Developer', 'SignalWorks', 'Design, implement, and operate dependable Node.js services and APIs. Model relational data, apply authentication and validation, write automated tests, review changes, monitor service health, and work with frontend and product teams. Required: Node.js, API design, SQL, authentication, testing, Git, and debugging. Preferred: Docker and cloud deployment.', ['Node.js', 'API design', 'SQL', 'Authentication', 'Testing'], ['Docker', 'Cloud'], '1+ year'],
    ['Data Analyst', 'Greenline Mobility', 'Analyze operational and product data to help teams make better decisions. Write documented SQL, validate data quality, build clear dashboards, investigate changes in key measures, and present practical findings to non-technical partners. Required: SQL, spreadsheets, data visualization, analytical reasoning, and communication. Preferred: Python and Tableau.', ['SQL', 'Spreadsheets', 'Data visualization', 'Communication'], ['Python', 'Tableau'], '1+ year'],
  ];

  for (const user of users) {
    const [existingJobs] = await pool.query('SELECT id FROM job_descriptions WHERE user_id = ? LIMIT 1', [user.id]);
    if (existingJobs.length) continue;
    await pool.query(
      `INSERT INTO job_descriptions
       (user_id, title, company, description, required_skills, preferred_skills, experience_requirements, source)
       VALUES ?`,
      [starterJobs.map(([title, company, description, required, preferred, experience]) => [
        user.id,
        title,
        company,
        description,
        JSON.stringify(required),
        JSON.stringify(preferred),
        experience,
        'demo',
      ])],
    );
  }

  await pool.query(
    `UPDATE job_descriptions SET description = CASE title
       WHEN 'Frontend Engineer' THEN ? WHEN 'Product Designer' THEN ?
       WHEN 'Backend Developer' THEN ? WHEN 'Data Analyst' THEN ? ELSE description END
     WHERE source = 'demo' AND (
       (title = 'Frontend Engineer' AND description = 'Build accessible React interfaces and collaborate with product and design teams.') OR
       (title = 'Product Designer' AND description = 'Design user-centred experiences from discovery through polished delivery.') OR
       (title = 'Backend Developer' AND description = 'Create reliable Node.js services and APIs backed by relational data.') OR
       (title = 'Data Analyst' AND description = 'Turn operational data into clear insights and practical decisions.')
     )`,
    [
      starterJobs[0][2], starterJobs[1][2], starterJobs[2][2], starterJobs[3][2],
    ],
  );

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
  await ensureColumn('job_descriptions', 'location', 'VARCHAR(255) NULL');
  await ensureColumn('job_descriptions', 'source', "VARCHAR(40) NOT NULL DEFAULT 'manual'");
  await ensureColumn('job_descriptions', 'source_job_id', 'VARCHAR(120) NULL');
  await ensureColumn('job_descriptions', 'source_country', "CHAR(2) NOT NULL DEFAULT ''");
  await ensureColumn('job_descriptions', 'work_mode', 'VARCHAR(40) NULL');
  await ensureColumn('job_descriptions', 'salary_min', 'DECIMAL(12, 2) NULL');
  await ensureColumn('job_descriptions', 'salary_max', 'DECIMAL(12, 2) NULL');
  await ensureColumn('job_descriptions', 'salary_currency', 'CHAR(3) NULL');
  await ensureColumn('job_descriptions', 'employment_type', 'VARCHAR(60) NULL');
  await ensureColumn('job_descriptions', 'apply_url', 'VARCHAR(1000) NULL');
  await ensureColumn('job_descriptions', 'published_at', 'DATETIME NULL');
  await ensureColumn('job_descriptions', 'fetched_at', 'DATETIME NULL');
  await ensureColumn('resumes', 'source_file_name', 'VARCHAR(255) NULL');
  await ensureColumn('resumes', 'extracted_text', 'MEDIUMTEXT NULL');
  await ensureColumn('job_matches', 'ats_score', 'INT NULL');
  await ensureColumn('job_matches', 'score_breakdown', 'JSON NULL');
  await ensureIndex('job_matches', 'idx_job_matches_user_created', '(user_id, created_at)');
  await ensureColumn('job_descriptions', 'source_url', 'VARCHAR(2048) NULL');
  await ensureColumn('interview_sessions', 'job_id', 'INT NULL');
  await ensureColumn('interview_sessions', 'resume_id', 'INT NULL');
  await ensureColumn('interview_questions', 'metadata', 'JSON NULL');
  await ensureColumn('interview_sessions', 'scheduled_at', 'DATETIME NULL');
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
