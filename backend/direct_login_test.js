const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function testDirectLogin() {
    const pool = mysql.createPool({
        host: 'hopper.proxy.rlwy.net',
        port: 17950,
        user: 'root',
        password: 'vkgxXBmSVyomZFHjWMAOMZupViBgqkYw',
        database: 'fishmarket_game'
    });

    try {
        console.log('===== 直接測試登入邏輯 =====\n');

        const username = 'admin';
        const password = '123';

        console.log('1. 查詢用戶:', username);
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            console.log('❌ 用戶不存在');
            return;
        }
        console.log('✅ 找到用戶');

        const user = users[0];
        console.log('\n2. 驗證密碼');
        console.log('輸入密碼:', password);
        console.log('哈希值:', user.password_hash.slice(0, 30) + '...');

        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            console.log('❌ 密碼不匹配');

            console.log('\n3. 測試新哈希:');
            const newHash = await bcrypt.hash('123', 10);
            const testNew = await bcrypt.compare('123', newHash);
            console.log('新哈希驗證:', testNew ? '✅ 成功' : '❌ 失敗');

            return;
        }

        console.log('✅ 密碼匹配');
        console.log('\n===== 登入測試完全成功 =====');

    } catch (error) {
        console.error('\n❌ 錯誤:', error.message);
    } finally {
        await pool.end();
    }
}

testDirectLogin();
