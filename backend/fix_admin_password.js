const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function fixAdminPassword() {
    const pool = mysql.createPool({
        host: 'hopper.proxy.rlwy.net',
        port: 17950,
        user: 'root',
        password: 'vkgxXBmSVyomZFHjWMAOMZupViBgqkYw',
        database: 'fishmarket_game'
    });

    try {
        console.log('===== 修復 Admin 密碼 =====\n');

        // 生成新的密碼哈希
        const newHash = await bcrypt.hash('123', 10);
        console.log('新密碼哈希:', newHash.slice(0, 30) + '...');

        // 更新 admin 用戶的密碼
        await pool.execute(
            'UPDATE users SET password_hash = ? WHERE username = ?',
            [newHash, 'admin']
        );

        console.log('✅ Admin 密碼已更新');

        // 同時更新所有學生帳號的密碼
        console.log('\n更新學生帳號密碼...');
        for (let i = 1; i <= 12; i++) {
            const username = String(i).padStart(2, '0');
            const hash = await bcrypt.hash(username, 10);
            await pool.execute(
                'UPDATE users SET password_hash = ? WHERE username = ?',
                [hash, username]
            );
            console.log(`✅ ${username} 密碼已更新`);
        }

        console.log('\n===== 所有密碼已修復 =====');

    } catch (error) {
        console.error('❌ 錯誤:', error.message);
    } finally {
        await pool.end();
    }
}

fixAdminPassword();
