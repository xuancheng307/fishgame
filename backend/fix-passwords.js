const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function fixPasswords() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fishmarket_game'
        });
        
        console.log('=== 修正用戶密碼 ===\n');
        
        // 修正 admin 密碼
        console.log('修正 admin 密碼為 123...');
        const adminHash = await bcrypt.hash('123', 10);
        await connection.execute(
            "UPDATE users SET password_hash = ?, plain_password = '123' WHERE username = 'admin'",
            [adminHash]
        );
        console.log('✅ admin 密碼已修正');
        
        // 修正學生密碼（密碼與帳號相同）
        for (let i = 1; i <= 12; i++) {
            const username = String(i).padStart(2, '0');
            const passwordHash = await bcrypt.hash(username, 10);
            
            await connection.execute(
                'UPDATE users SET password_hash = ?, plain_password = ? WHERE username = ?',
                [passwordHash, username, username]
            );
            console.log(`✅ ${username} 密碼已修正為 ${username}`);
        }
        
        console.log('\n=== 驗證修正結果 ===\n');
        
        // 驗證所有用戶
        const [users] = await connection.execute(
            'SELECT username, plain_password, password_hash FROM users ORDER BY id'
        );
        
        for (const user of users) {
            if (user.username === 'admin') {
                const match = await bcrypt.compare('123', user.password_hash);
                console.log(`admin: plain_password='${user.plain_password}', bcrypt驗證='123': ${match ? '✅' : '❌'}`);
            } else if (user.username.match(/^\d{2}$/)) {
                const match = await bcrypt.compare(user.username, user.password_hash);
                console.log(`${user.username}: plain_password='${user.plain_password}', bcrypt驗證='${user.username}': ${match ? '✅' : '❌'}`);
            }
        }
        
        await connection.end();
        console.log('\n密碼修正完成！');
        
    } catch (error) {
        console.error('錯誤:', error);
    }
}

fixPasswords();