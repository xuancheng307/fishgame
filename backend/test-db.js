const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log('測試 MySQL 連接...\n');
    console.log('連接參數：');
    console.log('  Host:', process.env.DB_HOST || 'localhost');
    console.log('  User:', process.env.DB_USER || 'root');
    console.log('  Password:', process.env.DB_PASSWORD ? '(已設定)' : '(空密碼)');
    console.log('  Database:', process.env.DB_NAME || 'fishmarket_game');
    console.log('');

    // 測試不同的連接方式
    const configs = [
        {
            name: '使用 .env 配置',
            config: {
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'fishmarket_game'
            }
        },
        {
            name: '不指定資料庫',
            config: {
                host: 'localhost',
                user: 'root',
                password: ''
            }
        },
        {
            name: '使用 127.0.0.1',
            config: {
                host: '127.0.0.1',
                user: 'root',
                password: ''
            }
        }
    ];

    for (const test of configs) {
        console.log(`測試 ${test.name}...`);
        try {
            const connection = await mysql.createConnection(test.config);
            console.log(`✅ 成功連接！`);
            
            // 嘗試查詢
            const [rows] = await connection.execute('SELECT 1+1 as result');
            console.log(`   查詢測試: 1+1 = ${rows[0].result}`);
            
            // 檢查資料庫是否存在
            if (!test.config.database) {
                const [databases] = await connection.execute("SHOW DATABASES LIKE 'fishmarket_game'");
                if (databases.length > 0) {
                    console.log(`   資料庫 'fishmarket_game' 存在`);
                } else {
                    console.log(`   ⚠️ 資料庫 'fishmarket_game' 不存在，需要創建`);
                    console.log(`   執行: CREATE DATABASE fishmarket_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
                }
            }
            
            await connection.end();
            console.log('');
            return true;
        } catch (error) {
            console.log(`❌ 連接失敗: ${error.message}`);
            if (error.code === 'ER_ACCESS_DENIED_ERROR') {
                console.log('   可能原因：');
                console.log('   1. root 用戶需要密碼');
                console.log('   2. root 用戶不允許從 localhost 連接');
                console.log('   3. MySQL 服務未正確啟動');
            } else if (error.code === 'ER_BAD_DB_ERROR') {
                console.log('   資料庫不存在，需要先創建');
            }
            console.log('');
        }
    }
    
    console.log('\n建議解決方案：');
    console.log('1. 如果 root 有密碼，請更新 .env 文件中的 DB_PASSWORD');
    console.log('2. 如果忘記密碼，可以嘗試重設 MySQL root 密碼');
    console.log('3. 確認 MySQL 服務 (MySQL92) 正在運行');
    console.log('4. 創建資料庫：CREATE DATABASE fishmarket_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    
    return false;
}

testConnection().then(success => {
    if (success) {
        console.log('MySQL 連接測試成功！');
    } else {
        console.log('請根據上述建議修復連接問題。');
    }
    process.exit(success ? 0 : 1);
});