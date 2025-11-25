// 測試 Railway MySQL 連接
const mysql = require('mysql2/promise');

async function testConnection() {
    console.log('測試 Railway MySQL 連接...\n');

    const config = {
        host: 'hopper.proxy.rlwy.net',
        port: 17950,
        user: 'root',
        password: 'vkgxXBmSVyomZFHjWMAOMZupViBgqkYw',
        database: 'fishmarket_game',
        charset: 'utf8mb4',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
    };

    console.log('配置:');
    console.log(`  Host: ${config.host}`);
    console.log(`  Port: ${config.port}`);
    console.log(`  Database: ${config.database}`);
    console.log('');

    let pool;
    try {
        // 創建連接池
        pool = mysql.createPool(config);
        console.log('✅ 連接池已創建');

        // 測試連接
        const connection = await pool.getConnection();
        console.log('✅ 成功獲取連接');

        // 測試查詢
        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('✅ 測試查詢成功:', rows);

        // 查詢 games 表
        const [games] = await connection.execute('SELECT COUNT(*) as count FROM games');
        console.log(`✅ games 表查詢成功: ${games[0].count} 個遊戲`);

        // 釋放連接
        connection.release();
        console.log('✅ 連接已釋放');

        // 測試使用連接池直接查詢
        console.log('\n測試連接池直接查詢...');
        const [poolTest] = await pool.execute('SELECT COUNT(*) as count FROM users');
        console.log(`✅ 連接池查詢成功: ${poolTest[0].count} 個用戶`);

        // 測試插入（回滾以不影響數據）
        console.log('\n測試事務...');
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        try {
            await conn.execute('INSERT INTO game_logs (game_id, day_number, action) VALUES (1, 0, "test")');
            console.log('✅ 測試插入成功');
            await conn.rollback();
            console.log('✅ 事務已回滾');
        } catch (err) {
            await conn.rollback();
            console.log('⚠️  測試插入失敗:', err.message);
        }
        conn.release();

        console.log('\n✅ 所有測試通過！');
        console.log('Railway 連接正常，可以使用。');

    } catch (error) {
        console.error('\n❌ 連接失敗:', error.message);
        console.error('錯誤代碼:', error.code);
        console.error('詳細錯誤:', error);
    } finally {
        if (pool) {
            await pool.end();
            console.log('\n連接池已關閉');
        }
    }
}

testConnection();
