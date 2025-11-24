const mysql = require('mysql2/promise');

/**
 * 檢查並修復 games.status ENUM 定義
 */

async function checkAndFixGamesStatus() {
    // 從 MYSQL_URL 環境變數解析連接資訊
    const mysqlUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;

    let config;
    if (mysqlUrl) {
        // 解析 mysql://user:password@host:port/database 格式
        const url = new URL(mysqlUrl);
        config = {
            host: url.hostname,
            port: parseInt(url.port) || 3306,
            user: url.username,
            password: url.password,
            database: url.pathname.slice(1)
        };
    } else {
        // 使用環境變數或預設值
        config = {
            host: process.env.DB_HOST || 'hopper.proxy.rlwy.net',
            port: process.env.DB_PORT || 17950,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'vkgxXBmSVyomZFHjWMAOMZupViBgqkYw',
            database: process.env.DB_NAME || 'fishmarket_game'
        };
    }

    console.log('連接配置:', {
        host: config.host,
        port: config.port,
        user: config.user,
        database: config.database
    });

    const pool = mysql.createPool(config);

    try {
        console.log('===== 檢查 games.status ENUM 定義 =====\n');

        // 顯示當前 status 欄位定義
        const [columns] = await pool.execute(
            "SHOW COLUMNS FROM games WHERE Field = 'status'"
        );

        if (columns.length > 0) {
            console.log('✅ 當前 games.status 欄位資訊：');
            console.log('類型:', columns[0].Type);
            console.log('預設值:', columns[0].Default);
            console.log('允許 NULL:', columns[0].Null);
            console.log();

            // 檢查是否包含 'finished'
            const enumType = columns[0].Type;
            const hasFinished = enumType.includes("'finished'");

            if (!hasFinished) {
                console.log('❌ 問題：ENUM 中缺少 "finished" 值');
                console.log('當前 ENUM 值:', enumType);
                console.log('\n準備修復...\n');

                // 修復 ENUM 定義，添加 'finished'
                await pool.execute(
                    `ALTER TABLE games MODIFY COLUMN status
                     ENUM('pending', 'active', 'paused', 'finished', 'completed')
                     DEFAULT 'pending'`
                );

                console.log('✅ 已成功修復 games.status ENUM 定義');
                console.log('新的 ENUM 值: pending, active, paused, finished, completed');

                // 再次確認
                const [newColumns] = await pool.execute(
                    "SHOW COLUMNS FROM games WHERE Field = 'status'"
                );
                console.log('\n修復後的欄位類型:', newColumns[0].Type);

            } else {
                console.log('✅ ENUM 定義正確，包含 "finished" 值');
            }
        } else {
            console.log('❌ games 表沒有 status 欄位');
        }

    } catch (error) {
        console.error('❌ 操作失敗:', error.message);
        console.error('錯誤詳情:', error);
    } finally {
        await pool.end();
    }
}

// 執行檢查和修復
checkAndFixGamesStatus();
