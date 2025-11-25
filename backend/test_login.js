const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function testLogin() {
    const pool = mysql.createPool({
        host: 'hopper.proxy.rlwy.net',
        port: 17950,
        user: 'root',
        password: 'vkgxXBmSVyomZFHjWMAOMZupViBgqkYw',
        database: 'fishmarket_game'
    });

    try {
        console.log('測試登入: admin / 123');
        
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            ['admin']
        );
        
        if (users.length === 0) {
            console.log('❌ 用戶不存在');
            return;
        }
        
        console.log('✅ 找到用戶:', users[0].username);
        console.log('密碼哈希:', users[0].password_hash.substring(0, 20) + '...');
        
        const validPassword = await bcrypt.compare('123', users[0].password_hash);
        
        if (validPassword) {
            console.log('✅ 密碼驗證成功');
        } else {
            console.log('❌ 密碼驗證失敗');
        }
        
    } catch (error) {
        console.error('錯誤:', error.message);
    } finally {
        await pool.end();
    }
}

testLogin();
