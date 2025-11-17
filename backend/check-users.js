const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function checkUsers() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fishmarket_game'
        });
        
        console.log('=== 檢查資料庫狀態 ===\n');
        
        // 檢查 users 表是否存在
        const [tables] = await connection.execute(
            "SHOW TABLES LIKE 'users'"
        );
        
        if (tables.length === 0) {
            console.log('❌ users 表不存在！需要初始化資料庫。');
            
            // 創建 users 表
            console.log('\n創建 users 表...');
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    team_name VARCHAR(255),
                    role ENUM('admin', 'team') NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ users 表已創建');
            
            // 插入預設用戶
            console.log('\n插入預設用戶...');
            
            // 插入管理員
            const adminHash = await bcrypt.hash('123', 10);
            await connection.execute(
                'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                ['admin', adminHash, 'admin']
            );
            console.log('✅ 管理員帳號已創建: admin / 123');
            
            // 插入學生帳號
            for (let i = 1; i <= 10; i++) {
                const username = String(i).padStart(2, '0');
                const passwordHash = await bcrypt.hash(username, 10);
                await connection.execute(
                    'INSERT INTO users (username, password_hash, team_name, role) VALUES (?, ?, ?, ?)',
                    [username, passwordHash, `Team ${username}`, 'team']
                );
                console.log(`✅ 學生帳號已創建: ${username} / ${username}`);
            }
            
        } else {
            console.log('✅ users 表存在');
            
            // 查詢所有用戶
            const [users] = await connection.execute(
                'SELECT id, username, role, team_name, password_hash FROM users ORDER BY id'
            );
            
            console.log(`\n找到 ${users.length} 個用戶:\n`);
            
            for (const user of users) {
                console.log(`ID: ${user.id}`);
                console.log(`  帳號: ${user.username}`);
                console.log(`  角色: ${user.role}`);
                console.log(`  團隊名稱: ${user.team_name || '(無)'}`);
                console.log(`  密碼 Hash: ${user.password_hash.substring(0, 20)}...`);
                
                // 測試密碼
                if (user.username === 'admin') {
                    const match = await bcrypt.compare('123', user.password_hash);
                    console.log(`  密碼 '123' 驗證: ${match ? '✅ 正確' : '❌ 錯誤'}`);
                } else if (user.role === 'team') {
                    const match = await bcrypt.compare(user.username, user.password_hash);
                    console.log(`  密碼 '${user.username}' 驗證: ${match ? '✅ 正確' : '❌ 錯誤'}`);
                }
                console.log('');
            }
            
            // 如果沒有用戶，創建預設用戶
            if (users.length === 0) {
                console.log('沒有找到任何用戶，創建預設用戶...\n');
                
                // 插入管理員
                const adminHash = await bcrypt.hash('123', 10);
                await connection.execute(
                    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                    ['admin', adminHash, 'admin']
                );
                console.log('✅ 管理員帳號已創建: admin / 123');
                
                // 插入學生帳號
                for (let i = 1; i <= 10; i++) {
                    const username = String(i).padStart(2, '0');
                    const passwordHash = await bcrypt.hash(username, 10);
                    await connection.execute(
                        'INSERT INTO users (username, password_hash, team_name, role) VALUES (?, ?, ?, ?)',
                        [username, passwordHash, `Team ${username}`, 'team']
                    );
                    console.log(`✅ 學生帳號已創建: ${username} / ${username}`);
                }
            }
        }
        
        // 檢查其他必要的表
        console.log('\n=== 檢查其他資料表 ===\n');
        const requiredTables = ['games', 'game_participants', 'game_days', 'bids', 'game_logs'];
        
        for (const tableName of requiredTables) {
            const [result] = await connection.execute(
                `SHOW TABLES LIKE '${tableName}'`
            );
            if (result.length > 0) {
                console.log(`✅ ${tableName} 表存在`);
            } else {
                console.log(`❌ ${tableName} 表不存在`);
            }
        }
        
        await connection.end();
        
    } catch (error) {
        console.error('錯誤:', error);
    }
}

checkUsers();