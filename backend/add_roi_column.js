const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.railway' });

async function addRoiColumn() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        console.log('=== 檢查 daily_results 表是否有 roi 欄位 ===\n');

        const [columns] = await connection.execute(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'daily_results'",
            [process.env.DB_NAME]
        );

        const columnNames = columns.map(col => col.COLUMN_NAME);
        console.log('現有欄位:', columnNames.join(', '));

        if (columnNames.includes('roi')) {
            console.log('\n✅ roi 欄位已存在，無需新增');
        } else {
            console.log('\n❌ roi 欄位不存在，正在新增...');

            await connection.execute(`
                ALTER TABLE daily_results
                ADD COLUMN roi DECIMAL(10, 4) NOT NULL DEFAULT 0
                AFTER cumulative_profit
            `);

            console.log('✅ roi 欄位新增成功!');
        }

        console.log('\n=== 檢查更新後的結構 ===');
        const [updatedColumns] = await connection.execute(
            "SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'daily_results' ORDER BY ORDINAL_POSITION",
            [process.env.DB_NAME]
        );

        updatedColumns.forEach(col => {
            console.log(`${col.COLUMN_NAME.padEnd(25)} ${col.COLUMN_TYPE}`);
        });
    } finally {
        await connection.end();
    }
}

addRoiColumn();
