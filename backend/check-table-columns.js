const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkColumns() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fishmarket_game'
        });
        
        console.log('=== 檢查 game_days 表結構 ===\n');
        
        const [columns] = await connection.execute(
            'SHOW COLUMNS FROM game_days'
        );
        
        console.log('game_days 表的欄位：');
        columns.forEach(col => {
            console.log(`  ${col.Field} - ${col.Type}`);
        });
        
        console.log('\n查找狀態相關欄位：');
        const statusColumns = columns.filter(col => 
            col.Field.includes('status') || col.Field.includes('state')
        );
        
        if (statusColumns.length > 0) {
            statusColumns.forEach(col => {
                console.log(`  ✓ 找到: ${col.Field} (${col.Type})`);
            });
        } else {
            console.log('  ❌ 沒有找到 status 或 day_status 欄位');
        }
        
        // 檢查一筆實際資料
        const [sample] = await connection.execute(
            'SELECT * FROM game_days LIMIT 1'
        );
        
        if (sample.length > 0) {
            console.log('\n實際資料欄位：');
            console.log(Object.keys(sample[0]));
        }
        
        await connection.end();
        
    } catch (error) {
        console.error('錯誤:', error);
    }
}

checkColumns();