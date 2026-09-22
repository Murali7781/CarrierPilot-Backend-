require('dotenv').config();

const app = require('./src/app');
const { testDatabaseConnection, initializeDatabase } = require('./src/config/db');
const { validateEnvironment } = require('./src/config/environment');

const port = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    validateEnvironment();
    await testDatabaseConnection();
    await initializeDatabase();

    app.listen(port, () => {
      console.log(`CareerPilot server running on port ${port}`);
      console.log('MySQL database connected successfully');
    });
  } catch (error) {
    console.error('Unable to start the server because the MySQL connection failed.');
    console.error(error.message);
    process.exitCode = 1;
  }
}

startServer();