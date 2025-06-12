const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

console.log('[DB] Criando nova pool com usuário:', process.env.DB_USER);

async function tryConnect(retries = 10, delay = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Conexão com MySQL estabelecida.');
      return pool;
    } catch (error) {
      console.warn(`⏳ Tentativa ${i} falhou: ${error.code}. Tentando novamente em ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('❌ Não foi possível conectar ao banco de dados após várias tentativas.');
}

module.exports = { pool, tryConnect };
