const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool;

const getConnection = async () => {
  try {
    if (!pool) {
      console.log('🔄 Conectando a SQL Server con SQL Authentication...');
      console.log('Usuario:', config.user);
      console.log('Servidor:', config.server);
      console.log('Base de datos:', config.database);
      pool = await sql.connect(config);
      console.log('✅ ¡CONECTADO A SQL SERVER!');
    }
    return pool;
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    throw error;
  }
};

module.exports = { getConnection, sql };