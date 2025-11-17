const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkTableStructure() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fishmarket_game'
        });
        
        console.log('=== users 表結構 ===\n');
        
        const [columns] = await connection.execute(
            'SHOW COLUMNS FROM users'
        );
        
        console.log('欄位列表：');
        columns.forEach(col => {
            console.log(`  ${col.Field} - ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Key ? `(${col.Key})` : ''}`);
        });
        
        // 檢查是否有 plain_password 欄位
        const hasPlainPassword = columns.some(col => col.Field === 'plain_password');
        
        if (!hasPlainPassword) {
            console.log('\n❌ 缺少 plain_password 欄位！');
            console.log('正在新增 plain_password 欄位...');
            
            // 新增 plain_password 欄位
            await connection.execute(
                'ALTER TABLE users ADD COLUMN plain_password VARCHAR(255) NULL'
            );
            
            // 更新現有用戶的 plain_password
            await connection.execute(
                "UPDATE users SET plain_password = '123' WHERE username = 'admin'"
            );
            
            for (let i = 1; i <= 12; i++) {
                const username = String(i).padStart(2, '0');
                await connection.execute(
                    'UPDATE users SET plain_password = ? WHERE username = ?',
                    [username, username]
                );
            }
            
            console.log('✅ plain_password 欄位已新增並更新');
        } else {
            console.log('\n✅ plain_password 欄位存在');
            
            // 檢查值
            const [users] = await connection.execute(
                'SELECT username, plain_password FROM users LIMIT 5'
            );
            
            console.log('\n前 5 個用戶的 plain_password:');
            users.forEach(user => {
                console.log(`  ${user.username}: ${user.plain_password || '(空)'}`);
            });
        }
        
        await connection.end();
        
    } catch (error) {
        console.error('錯誤:', error);
    }
}

checkTableStructure();