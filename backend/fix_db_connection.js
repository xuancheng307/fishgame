// 修正資料庫連接管理
// 將 db.execute 改為 pool.execute

const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// 1. 移除全局 db 變量聲明中的 db（保留 pool）
content = content.replace(/let db;\s*let pool;/g, 'let pool;');

// 2. 修改 initDatabase 函數
const oldInit = content.match(/async function initDatabase\(\) \{[\s\S]*?\n\}/);
if (oldInit) {
    const newInit = `async function initDatabase() {
    let connection;
    try {
        // 使用連接池支援多併發
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fishmarket_game',
            port: process.env.DB_PORT || 3306,
            charset: 'utf8mb4',
            multipleStatements: true,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        });

        // 測試連接
        connection = await pool.getConnection();
        console.log('資料庫連接成功');

        // 資料庫結構已由 complete_database_structure.sql 建立
        // 建立管理員帳號
        const [adminExists] = await connection.execute(
            'SELECT id FROM users WHERE username = ? AND role = "admin"',
            ['admin']
        );

        if (adminExists.length === 0) {
            const hashedPassword = await bcrypt.hash('123', 10);
            await connection.execute(
                'INSERT INTO users (username, password_hash, plain_password, role) VALUES (?, ?, ?, ?)',
                ['admin', hashedPassword, '123', 'admin']
            );
            console.log('管理員帳號 admin 已建立 - 密碼: 123');
        }

        // 自動建立10個學生帳號（01-10）
        for (let i = 1; i <= 10; i++) {
            const username = String(i).padStart(2, '0');
            const [teamExists] = await connection.execute(
                'SELECT id FROM users WHERE username = ? AND role = "team"',
                [username]
            );

            if (teamExists.length === 0) {
                const hashedPassword = await bcrypt.hash(username, 10);
                await connection.execute(
                    'INSERT INTO users (username, password_hash, plain_password, team_name, role) VALUES (?, ?, ?, ?, ?)',
                    [username, hashedPassword, username, \`第\${i}組\`, 'team']
                );
                console.log(\`學生帳號 \${username} 已建立 - 密碼: \${username}\`);
            }
        }

        // 釋放連接回連接池
        connection.release();
        console.log('資料庫初始化完成');

    } catch (error) {
        console.error('資料庫初始化失敗:', error);
        if (connection) connection.release();
        process.exit(1);
    }
}`;

    content = content.replace(oldInit[0], newInit);
}

// 3. 將所有 db.execute 改為 pool.execute
content = content.replace(/\bdb\.execute\(/g, 'pool.execute(');
content = content.replace(/\bdb\.query\(/g, 'pool.query(');

// 4. 將所有 await db.execute 改為 await pool.execute
content = content.replace(/await\s+db\./g, 'await pool.');

// 備份原文件
fs.writeFileSync(serverPath + '.backup2', fs.readFileSync(serverPath));

// 寫入修正後的內容
fs.writeFileSync(serverPath, content, 'utf8');

console.log('✅ 資料庫連接管理已修正');
console.log('✅ 原文件已備份為 server.js.backup2');
console.log('✅ 所有 db.execute 已改為 pool.execute');
