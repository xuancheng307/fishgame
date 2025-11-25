const mysql = require('mysql2/promise');

/**
 * 測試 INSERT 遊戲並查看具體錯誤
 */

async function testInsertGame() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'hopper.proxy.rlwy.net',
        port: process.env.DB_PORT || 17950,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'vkgxXBmSVyomZFHjWMAOMZupViBgqkYw',
        database: process.env.DB_NAME || 'fishmarket_game'
    });

    try {
        console.log('===== 測試創建遊戲的完整流程 =====\n');

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // 步驟 1: INSERT 遊戲（使用預設 status）
            console.log('步驟 1: INSERT 遊戲記錄...');
            const [result] = await connection.execute(
                `INSERT INTO games (
                    name, initial_budget, loan_interest_rate,
                    unsold_fee_per_kg, fixed_unsold_ratio,
                    distributor_floor_price_a, distributor_floor_price_b,
                    target_price_a, target_price_b, num_teams, total_days,
                    buying_duration, selling_duration
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    '測試遊戲2', 1000000, 0.03, 10, 2.5,
                    100, 100, 500, 300, 12, 7, 7, 4
                ]
            );

            const gameId = result.insertId;
            console.log('✅ INSERT 成功，遊戲 ID:', gameId);

            // 查詢剛插入的記錄
            const [inserted] = await connection.execute(
                'SELECT id, name, status, phase, current_day FROM games WHERE id = ?',
                [gameId]
            );
            console.log('插入後的記錄:', inserted[0]);

            // 步驟 2: UPDATE status 為 active
            console.log('\n步驟 2: UPDATE status 為 active...');
            await connection.execute(
                'UPDATE games SET status = "active", current_day = 1 WHERE id = ?',
                [gameId]
            );
            console.log('✅ UPDATE 成功');

            // 查詢更新後的記錄
            const [updated] = await connection.execute(
                'SELECT id, name, status, phase, current_day FROM games WHERE id = ?',
                [gameId]
            );
            console.log('更新後的記錄:', updated[0]);

            // 步驟 3: INSERT game_days
            console.log('\n步驟 3: INSERT game_days 記錄...');
            await connection.execute(
                `INSERT INTO game_days (
                    game_id, day_number, fish_a_supply, fish_b_supply,
                    fish_a_restaurant_budget, fish_b_restaurant_budget, status
                ) VALUES (?, 1, ?, ?, ?, ?, 'pending')`,
                [gameId, 1800, 3600, 900000, 1080000]
            );
            console.log('✅ INSERT game_days 成功');

            // 回滾，不保存
            await connection.rollback();
            console.log('\n✅ 所有步驟完成，已回滾（未保存）');

        } catch (error) {
            await connection.rollback();
            console.error('\n❌ 測試失敗');
            console.error('錯誤類型:', error.constructor.name);
            console.error('錯誤訊息:', error.message);
            console.error('SQL 錯誤碼:', error.code);
            console.error('SQL 狀態:', error.sqlState);
            console.error('SQL 錯誤訊息:', error.sqlMessage);
            console.error('完整錯誤:', error);
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('❌ 連接失敗:', error.message);
    } finally {
        await pool.end();
    }
}

// 執行測試
testInsertGame();
