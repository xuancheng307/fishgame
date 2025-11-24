/**
 * 魚市場遊戲系統健康檢查
 * 檢查所有關鍵修復和功能
 */

const mysql = require('mysql2/promise');
const Decimal = require('decimal.js');
require('dotenv').config();

// 設定 Decimal.js 精度
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

async function checkSystem() {
    console.log('========================================');
    console.log('魚市場遊戲系統健康檢查');
    console.log('檢查時間:', new Date().toLocaleString('zh-TW'));
    console.log('========================================\n');

    let pool;
    const issues = [];
    const passed = [];

    try {
        // 1. 檢查資料庫連接
        console.log('📊 檢查 1: 資料庫連接');
        try {
            pool = mysql.createPool({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME || 'fishmarket_game',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });

            await pool.execute('SELECT 1');
            console.log('✅ 資料庫連接正常\n');
            passed.push('資料庫連接');
        } catch (error) {
            console.log('❌ 資料庫連接失敗:', error.message, '\n');
            issues.push({ type: '資料庫連接', error: error.message });
            return; // 無法連接資料庫，後續檢查無法進行
        }

        // 2. 檢查 Decimal.js
        console.log('🔢 檢查 2: Decimal.js 功能');
        try {
            const d1 = new Decimal(1000000);
            const d2 = new Decimal(0.03);
            const result = d1.times(d2);

            if (result.toString() === '30000') {
                console.log('✅ Decimal.js 計算正確');
                console.log('   測試: 1000000 × 0.03 =', result.toString());
                passed.push('Decimal.js 功能');
            } else {
                throw new Error(`計算結果錯誤: ${result.toString()}`);
            }
        } catch (error) {
            console.log('❌ Decimal.js 測試失敗:', error.message);
            issues.push({ type: 'Decimal.js', error: error.message });
        }
        console.log('');

        // 3. 檢查 games 表結構
        console.log('🗄️  檢查 3: games 表結構');
        try {
            const [columns] = await pool.execute(
                "SHOW COLUMNS FROM games WHERE Field = 'fixed_unsold_ratio'"
            );

            if (columns.length > 0) {
                console.log('✅ fixed_unsold_ratio 欄位存在');

                // 檢查預設值
                const [games] = await pool.execute(
                    'SELECT fixed_unsold_ratio FROM games LIMIT 1'
                );

                if (games.length > 0) {
                    console.log('   預設值:', games[0].fixed_unsold_ratio);
                }
                passed.push('fixed_unsold_ratio 欄位');
            } else {
                throw new Error('fixed_unsold_ratio 欄位不存在');
            }
        } catch (error) {
            console.log('❌ fixed_unsold_ratio 檢查失敗:', error.message);
            issues.push({ type: 'fixed_unsold_ratio', error: error.message });
        }
        console.log('');

        // 4. 檢查 unsold_fee_per_kg
        console.log('💰 檢查 4: unsold_fee_per_kg 預設值');
        try {
            const [columns] = await pool.execute(
                "SHOW COLUMNS FROM games WHERE Field = 'unsold_fee_per_kg'"
            );

            if (columns.length > 0) {
                const defaultValue = columns[0].Default;
                console.log('✅ unsold_fee_per_kg 欄位存在');
                console.log('   預設值:', defaultValue);

                if (parseFloat(defaultValue) === 10.00) {
                    console.log('   ℹ️  注意: 預設值為 10.00，遊戲說明文件為 20.00');
                }
                passed.push('unsold_fee_per_kg 欄位');
            } else {
                throw new Error('unsold_fee_per_kg 欄位不存在');
            }
        } catch (error) {
            console.log('❌ unsold_fee_per_kg 檢查失敗:', error.message);
            issues.push({ type: 'unsold_fee_per_kg', error: error.message });
        }
        console.log('');

        // 5. 檢查其他關鍵欄位
        console.log('📋 檢查 5: 其他關鍵欄位');
        const requiredColumns = [
            'num_teams',
            'loan_interest_rate',
            'max_loan_ratio',
            'distributor_floor_price_a',
            'distributor_floor_price_b',
            'target_price_a',
            'target_price_b',
            'buying_duration',
            'selling_duration',
            'team_names',
            'is_force_ended'
        ];

        let allColumnsExist = true;
        for (const column of requiredColumns) {
            const [result] = await pool.execute(
                `SHOW COLUMNS FROM games WHERE Field = '${column}'`
            );

            if (result.length === 0) {
                console.log(`❌ 缺少欄位: ${column}`);
                issues.push({ type: '缺少欄位', error: column });
                allColumnsExist = false;
            }
        }

        if (allColumnsExist) {
            console.log(`✅ 所有 ${requiredColumns.length} 個關鍵欄位都存在`);
            passed.push('games 表完整結構');
        }
        console.log('');

        // 6. 檢查用戶表
        console.log('👥 檢查 6: 用戶表');
        try {
            const [users] = await pool.execute('SELECT COUNT(*) as count FROM users');
            console.log('✅ 用戶表正常');
            console.log('   用戶數量:', users[0].count);
            passed.push('用戶表');
        } catch (error) {
            console.log('❌ 用戶表檢查失敗:', error.message);
            issues.push({ type: '用戶表', error: error.message });
        }
        console.log('');

        // 7. 檢查遊戲狀態
        console.log('🎮 檢查 7: 遊戲狀態');
        try {
            const [games] = await pool.execute(
                "SELECT id, name, status, phase, current_day, total_days FROM games ORDER BY created_at DESC LIMIT 5"
            );

            console.log('✅ 遊戲表正常');
            console.log('   遊戲數量:', games.length);

            if (games.length > 0) {
                console.log('\n   最近的遊戲:');
                games.forEach((game, index) => {
                    console.log(`   ${index + 1}. ${game.name}`);
                    console.log(`      狀態: ${game.status}, 階段: ${game.phase}`);
                    console.log(`      進度: 第 ${game.current_day}/${game.total_days} 天`);
                });
            }
            passed.push('遊戲狀態');
        } catch (error) {
            console.log('❌ 遊戲狀態檢查失敗:', error.message);
            issues.push({ type: '遊戲狀態', error: error.message });
        }
        console.log('');

        // 8. 檢查 parseInt 使用
        console.log('🔍 檢查 8: parseInt radix 參數');
        const fs = require('fs');
        const serverCode = fs.readFileSync(__dirname + '/server.js', 'utf8');

        // 搜索沒有 radix 的 parseInt
        const parseIntWithoutRadix = serverCode.match(/parseInt\([^,)]+\)(?!,\s*10)/g);

        if (parseIntWithoutRadix && parseIntWithoutRadix.length > 0) {
            console.log('⚠️  發現', parseIntWithoutRadix.length, '處 parseInt 缺少 radix 參數:');
            parseIntWithoutRadix.forEach((match, index) => {
                console.log(`   ${index + 1}. ${match}`);
            });
            issues.push({
                type: 'parseInt radix',
                error: `${parseIntWithoutRadix.length} 處缺少 radix 參數`
            });
        } else {
            console.log('✅ 所有 parseInt 都有 radix 參數');
            passed.push('parseInt 正確使用');
        }
        console.log('');

    } catch (error) {
        console.log('❌ 系統檢查過程發生錯誤:', error.message);
        issues.push({ type: '系統檢查', error: error.message });
    } finally {
        if (pool) {
            await pool.end();
        }
    }

    // 總結報告
    console.log('========================================');
    console.log('檢查總結');
    console.log('========================================');
    console.log('✅ 通過的檢查:', passed.length);
    passed.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item}`);
    });
    console.log('');

    if (issues.length > 0) {
        console.log('❌ 發現的問題:', issues.length);
        issues.forEach((issue, index) => {
            console.log(`   ${index + 1}. [${issue.type}] ${issue.error}`);
        });
        console.log('');
        console.log('系統健康狀態: ⚠️  需要注意');
    } else {
        console.log('系統健康狀態: ✅ 良好');
    }
    console.log('========================================\n');
}

// 執行檢查
checkSystem().catch(error => {
    console.error('檢查失敗:', error);
    process.exit(1);
});
