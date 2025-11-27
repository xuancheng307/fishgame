// 這個腳本會在 Railway 啟動時自動檢查並添加 roi 欄位
const mysql = require('mysql2/promise');

async function checkAndAddRoiColumn() {
    if (!process.env.DB_HOST) {
        console.log('⏭️ 跳過資料庫檢查（非 Railway 環境）');
        return;
    }

    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('🔍 檢查 daily_results 表結構...');

        // 檢查所有欄位
        const [allColumns] = await connection.execute(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'daily_results'
             ORDER BY ORDINAL_POSITION`,
            [process.env.DB_NAME]
        );

        const existingColumns = allColumns.map(col => col.COLUMN_NAME);
        console.log('現有欄位:', existingColumns.join(', '));

        // 檢查必需的欄位
        const requiredColumns = ['revenue', 'cost', 'unsold_fee', 'interest_incurred', 'daily_profit', 'cumulative_profit', 'roi', 'closing_budget', 'closing_loan'];
        const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

        if (missingColumns.length > 0) {
            console.log('❌ 缺少欄位:', missingColumns.join(', '));
            console.log('⚠️  daily_results 表結構不完整，需要重建');

            // 備份現有資料（如果有）
            const [existingData] = await connection.execute('SELECT * FROM daily_results LIMIT 1');
            if (existingData.length > 0) {
                console.log('⚠️  表中有現有資料，建議手動備份後再重建');
                return; // 不自動刪除有資料的表
            }

            // 刪除並重建表
            console.log('🔄 重建 daily_results 表...');
            await connection.execute('DROP TABLE IF EXISTS daily_results');
            await connection.execute(`
                CREATE TABLE daily_results (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    game_id INT NOT NULL,
                    game_day_id INT NOT NULL,
                    day_number INT NOT NULL,
                    team_id INT NOT NULL,
                    revenue DECIMAL(15, 2) NOT NULL,
                    cost DECIMAL(15, 2) NOT NULL,
                    unsold_fee DECIMAL(15, 2) NOT NULL,
                    interest_incurred DECIMAL(15, 2) NOT NULL,
                    daily_profit DECIMAL(15, 2) NOT NULL,
                    cumulative_profit DECIMAL(15, 2) NOT NULL,
                    roi DECIMAL(10, 4) NOT NULL,
                    closing_budget DECIMAL(15, 2) NOT NULL,
                    closing_loan DECIMAL(15, 2) NOT NULL,
                    UNIQUE(game_day_id, team_id),
                    FOREIGN KEY (game_id) REFERENCES games(id),
                    FOREIGN KEY (game_day_id) REFERENCES game_days(id),
                    FOREIGN KEY (team_id) REFERENCES users(id),
                    INDEX idx_game_day (game_id, day_number)
                )
            `);
            console.log('✅ daily_results 表重建成功！');
        } else {
            console.log('✅ daily_results 表結構完整！');
        }
    } catch (error) {
        console.error('❌ 檢查/添加 roi 欄位時發生錯誤:', error.message);
        // 不要因為這個錯誤而中止整個應用程式啟動
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// 如果直接執行這個檔案
if (require.main === module) {
    checkAndAddRoiColumn()
        .then(() => {
            console.log('🎉 資料庫檢查完成');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 執行失敗:', error);
            process.exit(1);
        });
}

module.exports = { checkAndAddRoiColumn };
