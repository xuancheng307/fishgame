const mysql = require('mysql2/promise');
require('dotenv').config();

async function fullDiagnostic() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fishmarket_game',
            charset: 'utf8mb4'
        });
        
        console.log('=== 完整系統診斷 ===\n');
        
        // 1. 檢查所有表格結構
        console.log('1. 資料表結構檢查：');
        const tables = ['users', 'games', 'game_participants', 'game_days', 'bids', 'game_logs'];
        
        for (const table of tables) {
            const [exists] = await connection.execute(`SHOW TABLES LIKE '${table}'`);
            if (exists.length === 0) {
                console.log(`   ❌ ${table} 表不存在`);
            } else {
                const [count] = await connection.execute(`SELECT COUNT(*) as count FROM ${table}`);
                console.log(`   ✅ ${table} 表存在 (${count[0].count} 筆資料)`);
            }
        }
        
        // 2. 檢查 game_days 狀態值
        console.log('\n2. game_days 狀態檢查：');
        const [gamedays] = await connection.execute(
            'SELECT game_id, day_number, status FROM game_days ORDER BY id DESC LIMIT 5'
        );
        
        if (gamedays.length > 0) {
            console.log('   最近的 game_days 記錄：');
            gamedays.forEach(gd => {
                console.log(`   遊戲 ${gd.game_id} 第 ${gd.day_number} 天: ${gd.status}`);
            });
        } else {
            console.log('   沒有 game_days 記錄');
        }
        
        // 3. 檢查當前活動遊戲
        console.log('\n3. 活動遊戲檢查：');
        const [activeGames] = await connection.execute(
            "SELECT id, game_name, status, current_day FROM games WHERE status = 'active'"
        );
        
        if (activeGames.length > 0) {
            for (const game of activeGames) {
                console.log(`   遊戲 ${game.id}: ${game.game_name}`);
                console.log(`     狀態: ${game.status}, 當前天: ${game.current_day}`);
                
                // 檢查參與者
                const [participants] = await connection.execute(
                    'SELECT COUNT(*) as count FROM game_participants WHERE game_id = ?',
                    [game.id]
                );
                console.log(`     參與隊伍: ${participants[0].count}`);
                
                // 檢查當天狀態
                const [currentDay] = await connection.execute(
                    'SELECT * FROM game_days WHERE game_id = ? AND day_number = ?',
                    [game.id, game.current_day]
                );
                
                if (currentDay.length > 0) {
                    console.log(`     當天狀態: ${currentDay[0].status}`);
                    console.log(`     A級魚供應: ${currentDay[0].fish_a_supply}`);
                    console.log(`     B級魚供應: ${currentDay[0].fish_b_supply}`);
                }
            }
        } else {
            console.log('   沒有活動中的遊戲');
        }
        
        // 4. 檢查投標記錄
        console.log('\n4. 最近投標記錄：');
        const [bids] = await connection.execute(
            `SELECT b.*, u.username 
             FROM bids b 
             JOIN users u ON b.team_id = u.id 
             ORDER BY b.id DESC LIMIT 5`
        );
        
        if (bids.length > 0) {
            bids.forEach(bid => {
                console.log(`   ${bid.username} - 遊戲${bid.game_id} 第${bid.day_number}天: ${bid.bid_type} ${bid.fish_type}級魚 $${bid.price} x ${bid.quantity_submitted}`);
            });
        } else {
            console.log('   沒有投標記錄');
        }
        
        // 5. 檢查狀態欄位值
        console.log('\n5. 狀態值列舉檢查：');
        const [columnInfo] = await connection.execute(
            "SHOW COLUMNS FROM game_days WHERE Field = 'status'"
        );
        
        if (columnInfo.length > 0) {
            console.log(`   game_days.status 欄位類型: ${columnInfo[0].Type}`);
            const enumValues = columnInfo[0].Type.match(/enum\((.*)\)/);
            if (enumValues) {
                console.log('   允許的狀態值:');
                const values = enumValues[1].split(',').map(v => v.replace(/'/g, ''));
                values.forEach(v => console.log(`     - ${v}`));
            }
        }
        
        // 6. 檢查編碼
        console.log('\n6. 資料庫編碼檢查：');
        const [charset] = await connection.execute(
            "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
            [process.env.DB_NAME || 'fishmarket_game']
        );
        
        if (charset.length > 0) {
            console.log(`   字符集: ${charset[0].DEFAULT_CHARACTER_SET_NAME}`);
            console.log(`   排序規則: ${charset[0].DEFAULT_COLLATION_NAME}`);
        }
        
        // 7. 檢查中文支援
        console.log('\n7. 中文支援測試：');
        const [chineseGames] = await connection.execute(
            "SELECT id, game_name, HEX(game_name) as hex_name FROM games ORDER BY id DESC LIMIT 3"
        );
        
        chineseGames.forEach(game => {
            console.log(`   遊戲 ${game.id}: "${game.game_name}" (HEX: ${game.hex_name})`);
            if (game.game_name === '????') {
                console.log('     ⚠️ 可能有編碼問題');
            }
        });
        
        await connection.end();
        
        console.log('\n=== 診斷完成 ===');
        
    } catch (error) {
        console.error('診斷錯誤:', error);
    }
}

fullDiagnostic();