const mysql = require('mysql2/promise');

/**
 * 數據庫遷移腳本：修改 games 表的 status ENUM
 *
 * 問題：status ENUM 定義為 ('pending', 'running', 'finished')
 *       但代碼使用 'active' 和 'paused'
 * 解決：修改為 ('pending', 'active', 'paused', 'finished')
 */

async function migrateStatusEnum() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'hopper.proxy.rlwy.net',
        port: process.env.DB_PORT || 17950,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'vkgxXBmSVyomZFHjWMAOMZupViBgqkYw',
        database: process.env.DB_NAME || 'fishmarket_game'
    });

    try {
        console.log('===== 開始遷移 games 表的 status ENUM =====\n');

        // 檢查表是否存在
        const [tables] = await pool.execute(
            "SHOW TABLES LIKE 'games'"
        );

        if (tables.length === 0) {
            console.log('❌ games 表不存在，無需遷移');
            return;
        }

        console.log('✅ games 表存在，檢查 status 欄位...\n');

        // 檢查當前 status 欄位的定義
        const [columns] = await pool.execute(
            "SHOW COLUMNS FROM games WHERE Field = 'status'"
        );

        if (columns.length === 0) {
            console.log('❌ status 欄位不存在');
            return;
        }

        const currentType = columns[0].Type;
        console.log('當前 status 類型:', currentType);

        // 修改 status ENUM
        console.log('\n正在修改 status ENUM...');
        console.log('從: ENUM(\'pending\', \'running\', \'finished\')');
        console.log('到: ENUM(\'pending\', \'active\', \'paused\', \'finished\')');

        await pool.execute(`
            ALTER TABLE games
            MODIFY COLUMN status ENUM('pending', 'active', 'paused', 'finished') DEFAULT 'pending'
        `);

        console.log('✅ status ENUM 已更新\n');

        // 顯示更新後的定義
        const [updatedColumns] = await pool.execute(
            "SHOW COLUMNS FROM games WHERE Field = 'status'"
        );

        console.log('更新後的 status 類型:', updatedColumns[0].Type);
        console.log('\n===== 遷移完成 =====');

    } catch (error) {
        console.error('❌ 遷移失敗:', error.message);
        console.error('錯誤詳情:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// 執行遷移
migrateStatusEnum();
