// D:\徐景輝\魚市場遊戲3\backend\reset-passwords.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const {
  MYSQL_HOST = '127.0.0.1',
  MYSQL_PORT = '3306',
  MYSQL_USER = 'root',
  MYSQL_PASSWORD = '',
  MYSQL_DB = 'fishmarket_game',
} = process.env;

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '123';

async function main() {
  const pool = await mysql.createPool({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 10,
  });
  const q = (sql, params=[]) => pool.execute(sql, params).then(([rows])=>rows);

  console.log(`[reset-passwords] DB=${MYSQL_DB} @ ${MYSQL_HOST}:${MYSQL_PORT}`);

  // 1) 確保欄位存在（防守型）
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password VARCHAR(64) NULL`);

  // 2) admin → 123（若無 admin 則建立；有就只改密碼）
  await q(`
    INSERT INTO users (username, role, plain_password)
    VALUES (?, 'admin', ?)
    ON DUPLICATE KEY UPDATE role='admin', plain_password=VALUES(plain_password)
  `, [ADMIN_USERNAME, ADMIN_PASSWORD]);
  console.log(` - admin 密碼已設為 "${ADMIN_PASSWORD}"`);

  // 3) team → 密碼=帳號（只改 role='team' 的）
  const teams = await q(`SELECT id, username, role FROM users WHERE role='team'`);
  let changed = 0;
  for (const t of teams) {
    const pw = String(t.username);
    await q(`UPDATE users SET plain_password=? WHERE id=?`, [pw, t.id]);
    changed++;
  }
  console.log(` - 學生帳號共 ${changed} 筆：已將密碼設為「同帳號」`);

  await pool.end();
  console.log('完成 ✅');
}

main().catch(err => { 
  console.error('重設失敗 ❌', err);
  process.exit(1);
});