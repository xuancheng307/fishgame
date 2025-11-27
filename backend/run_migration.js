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

        console.log('🔍 檢查 daily_results 表是否有 roi 欄位...');

        const [columns] = await connection.execute(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'daily_results' AND COLUMN_NAME = 'roi'`,
            [process.env.DB_NAME]
        );

        if (columns.length > 0) {
            console.log('✅ roi 欄位已存在，無需添加');
        } else {
            console.log('❌ roi 欄位不存在，正在添加...');

            await connection.execute(`
                ALTER TABLE daily_results
                ADD COLUMN roi DECIMAL(10, 4) NOT NULL DEFAULT 0
                AFTER cumulative_profit
            `);

            console.log('✅ roi 欄位添加成功！');
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
