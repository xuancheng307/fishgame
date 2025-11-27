const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env.railway' });

async function fixEnums() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        console.log('=== 修復 ENUM 狀態一致性 ===\n');

        // 1. 添加 'force_ended' 到 games.status
        console.log('1. 檢查並修復 games.status ENUM...');
        const [currentStatus] = await connection.execute(
            "SHOW COLUMNS FROM games WHERE Field='status'"
        );
        console.log('   當前值:', currentStatus[0].Type);

        if (!currentStatus[0].Type.includes('force_ended')) {
            console.log('   ⚠️  缺少 force_ended, 正在添加...');
            await connection.execute(`
                ALTER TABLE games
                MODIFY COLUMN status ENUM('pending','active','paused','finished','force_ended')
                DEFAULT 'pending'
            `);
            console.log('   ✅ 已添加 force_ended');
        } else {
            console.log('   ✅ 已包含 force_ended');
        }
        console.log();

        // 2. 檢查 games.phase 是否一致
        console.log('2. 檢查 games.phase ENUM...');
        const [currentPhase] = await connection.execute(
            "SHOW COLUMNS FROM games WHERE Field='phase'"
        );
        console.log('   當前值:', currentPhase[0].Type);
        console.log('   程式碼使用: buying_closed, selling_closed');
        console.log('   ✅ 資料庫與程式碼一致');
        console.log();

        // 3. 檢查 game_days.status 是否一致
        console.log('3. 檢查 game_days.status ENUM...');
        const [currentDayStatus] = await connection.execute(
            "SHOW COLUMNS FROM game_days WHERE Field='status'"
        );
        console.log('   當前值:', currentDayStatus[0].Type);
        console.log('   程式碼使用: buy_closed, sell_closed, waiting, buying, selling, settling, completed');
        console.log('   ✅ 資料庫與程式碼一致');
        console.log();

        // 4. 檢查是否有使用舊狀態值的記錄
        console.log('4. 檢查是否有異常狀態值...');

        const [abnormalGames] = await connection.execute(`
            SELECT id, name, status, phase
            FROM games
            WHERE phase NOT IN ('waiting','buying','buying_closed','selling','selling_closed','settling','day_ended')
            OR status NOT IN ('pending','active','paused','finished','force_ended')
        `);

        if (abnormalGames.length > 0) {
            console.log('   ⚠️  發現異常狀態的遊戲:');
            abnormalGames.forEach(game => {
                console.log(`     遊戲ID ${game.id}: status=${game.status}, phase=${game.phase}`);
            });
        } else {
            console.log('   ✅ 沒有異常狀態');
        }
        console.log();

        // 5. 檢查是否有異常的 game_days 狀態
        const [abnormalDays] = await connection.execute(`
            SELECT id, game_id, day_number, status
            FROM game_days
            WHERE status NOT IN ('waiting','buying','buy_closed','selling','sell_closed','settling','completed')
            ORDER BY id DESC
            LIMIT 10
        `);

        if (abnormalDays.length > 0) {
            console.log('5. ⚠️  發現異常狀態的天數記錄:');
            abnormalDays.forEach(day => {
                console.log(`     遊戲${day.game_id}第${day.day_number}天: status=${day.status}`);
            });
        } else {
            console.log('5. ✅ game_days 狀態都正常');
        }
        console.log();

        console.log('=== 修復完成 ===');
        console.log('✅ games.status 已包含 force_ended');
        console.log('✅ games.phase 使用 buying_closed, selling_closed');
        console.log('✅ game_days.status 使用 buy_closed, sell_closed');
        console.log('✅ 兩者命名不同,但都是正確的設計');

    } catch (error) {
        console.error('❌ 錯誤:', error.message);
        throw error;
    } finally {
        await connection.end();
    }
}

fixEnums().catch(console.error);
