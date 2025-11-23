const mysql = require('mysql2/promise');

/**
 * 數據庫遷移腳本：為 games 表添加缺少的欄位
 *
 * 問題：games 表缺少 fixed_unsold_ratio 和 total_days 欄位
 * 解決：執行 ALTER TABLE 添加這兩個欄位
 */

async function migrateGamesTable() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'hopper.proxy.rlwy.net',
        port: process.env.DB_PORT || 17950,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'vkgxXBmSVyomZFHjWMAOMZupViBgqkYw',
        database: process.env.DB_NAME || 'fishmarket_game'
    });

    try {
        console.log('===== 開始遷移 games 表 =====\n');

        // 檢查表是否存在
        const [tables] = await pool.execute(
            "SHOW TABLES LIKE 'games'"
        );

        if (tables.length === 0) {
            console.log('❌ games 表不存在，無需遷移');
            return;
        }

        console.log('✅ games 表存在，檢查欄位...\n');

        // 檢查欄位是否已存在
        const [columns] = await pool.execute(
            "SHOW COLUMNS FROM games"
        );

        const columnNames = columns.map(col => col.Field);
        const hasFixedUnsoldRatio = columnNames.includes('fixed_unsold_ratio');
        const hasTotalDays = columnNames.includes('total_days');

        console.log(`檢查結果：`);
        console.log(`  fixed_unsold_ratio: ${hasFixedUnsoldRatio ? '✅ 已存在' : '❌ 缺少'}`);
        console.log(`  total_days: ${hasTotalDays ? '✅ 已存在' : '❌ 缺少'}\n`);

        // 添加 fixed_unsold_ratio 欄位
        if (!hasFixedUnsoldRatio) {
            console.log('正在添加 fixed_unsold_ratio 欄位...');
            await pool.execute(`
                ALTER TABLE games
                ADD COLUMN fixed_unsold_ratio DECIMAL(5, 2) NOT NULL DEFAULT 2.50
                AFTER unsold_fee_per_kg
            `);
            console.log('✅ fixed_unsold_ratio 欄位已添加\n');
        }

        // 添加 total_days 欄位
        if (!hasTotalDays) {
            console.log('正在添加 total_days 欄位...');
            await pool.execute(`
                ALTER TABLE games
                ADD COLUMN total_days INT NOT NULL DEFAULT 7
                AFTER num_teams
            `);
            console.log('✅ total_days 欄位已添加\n');
        }

        if (hasFixedUnsoldRatio && hasTotalDays) {
            console.log('✅ 所有必要欄位都已存在，無需遷移');
        } else {
            console.log('===== 遷移完成 =====');

            // 顯示更新後的表結構
            console.log('\n更新後的 games 表結構：');
            const [updatedColumns] = await pool.execute("SHOW COLUMNS FROM games");
            console.table(updatedColumns.map(col => ({
                欄位: col.Field,
                類型: col.Type,
                預設值: col.Default
            })));
        }

    } catch (error) {
        console.error('❌ 遷移失敗:', error.message);
        console.error('錯誤詳情:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// 執行遷移
migrateGamesTable();
