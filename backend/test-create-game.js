const mysql = require('mysql2/promise');

async function testCreateGame() {
    const db = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '123123',
        database: 'fishmarket_game'
    });
    
    try {
        // 測試參數
        const gameName = 'Test Game';
        const initialBudget = 1000000;
        const loanInterestRate = 0.03;
        const unsoldFeePerKg = 10;
        const fixedUnsoldRatio = 2.5;
        const distributorFloorPriceA = 100;
        const distributorFloorPriceB = 100;
        const targetPriceA = 260;
        const targetPriceB = 240;
        const teamCount = 12;
        const totalDays = 7;
        
        console.log('嘗試創建遊戲...');
        
        // 執行插入語句
        const [result] = await db.execute(
            `INSERT INTO games (
                game_name, initial_budget, loan_interest_rate, 
                unsold_fee_per_kg, fixed_unsold_ratio, distributor_floor_price_a, distributor_floor_price_b,
                target_price_a, target_price_b, num_teams, total_days
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                gameName,
                initialBudget,
                loanInterestRate,
                unsoldFeePerKg,
                fixedUnsoldRatio,
                distributorFloorPriceA,
                distributorFloorPriceB,
                targetPriceA,
                targetPriceB,
                teamCount,
                totalDays
            ]
        );
        
        console.log('遊戲創建成功！');
        console.log('Game ID:', result.insertId);
        
    } catch (error) {
        console.error('創建遊戲失敗:');
        console.error('錯誤代碼:', error.code);
        console.error('錯誤訊息:', error.message);
        console.error('SQL狀態:', error.sqlState);
        console.error('SQL訊息:', error.sqlMessage);
    } finally {
        await db.end();
    }
}

testCreateGame();