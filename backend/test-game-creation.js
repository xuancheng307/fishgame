const mysql = require('mysql2/promise');
require('dotenv').config();

async function testGameCreation() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fishmarket_game'
        });
        
        console.log('=== 檢查最新創建的遊戲 ===\n');
        
        // 查詢最新的遊戲
        const [games] = await connection.execute(
            `SELECT * FROM games ORDER BY id DESC LIMIT 3`
        );
        
        if (games.length === 0) {
            console.log('沒有找到任何遊戲');
            return;
        }
        
        console.log(`找到 ${games.length} 個最近的遊戲:\n`);
        
        for (const game of games) {
            console.log(`遊戲 ID: ${game.id}`);
            console.log(`  名稱: ${game.game_name}`);
            console.log(`  初始資金: ${game.initial_budget}`);
            console.log(`  貸款利率: ${game.loan_interest_rate}`);
            console.log(`  滯銷費用: ${game.unsold_fee_per_kg}`);
            console.log(`  固定滯銷比例: ${game.fixed_unsold_ratio}`);
            console.log(`  A級魚底價: ${game.distributor_floor_price_a}`);
            console.log(`  B級魚底價: ${game.distributor_floor_price_b}`);
            console.log(`  A級魚目標價: ${game.target_price_a}`);
            console.log(`  B級魚目標價: ${game.target_price_b}`);
            console.log(`  隊伍數: ${game.num_teams}`);
            console.log(`  總天數: ${game.total_days}`);
            console.log(`  狀態: ${game.status}`);
            console.log(`  當前天: ${game.current_day}`);
            console.log('---');
        }
        
        // 檢查預設值
        console.log('\n=== 參數分析 ===\n');
        const latestGame = games[0];
        
        const defaultParams = {
            initial_budget: 1000000,
            loan_interest_rate: 0.03,
            unsold_fee_per_kg: 10,
            fixed_unsold_ratio: 2.5,
            distributor_floor_price_a: 100,
            distributor_floor_price_b: 100,
            target_price_a: 150,
            target_price_b: 120,
            total_days: 7
        };
        
        console.log('參數是否使用預設值:');
        for (const [key, defaultValue] of Object.entries(defaultParams)) {
            const actualValue = parseFloat(latestGame[key]);
            const isDefault = Math.abs(actualValue - defaultValue) < 0.001;
            console.log(`  ${key}: ${actualValue} ${isDefault ? '(預設值)' : `(自定義，預設: ${defaultValue})`}`);
        }
        
        await connection.end();
        
    } catch (error) {
        console.error('錯誤:', error);
    }
}

testGameCreation();