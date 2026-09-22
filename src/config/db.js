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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS interview_sessions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(150),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS interview_questions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      interview_id INT NOT NULL,
      question_text TEXT NOT NULL,
      question_type VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES job_descriptions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
  ];

  for (const query of schema) {
    await pool.query(query);
  }

  return true;
}

module.exports = {
  pool,
  testDatabaseConnection,
  initializeDatabase,
};
