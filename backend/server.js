const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const Decimal = require('decimal.js');
const QRCode = require('qrcode');
require('dotenv').config();

// 設定 Decimal.js 精度
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// 預設遊戲參數
let defaultGameParameters = {
    initialBudget: 1000000,
    loanInterestRate: 0.03,
    unsoldFeePerKg: 10,
    distributorFloorPriceA: 100,
    targetPriceA: 150,
    distributorFloorPriceB: 100,
    targetPriceB: 120,
    totalDays: 7,
    buyingDuration: 7,  // 分鐘
    sellingDuration: 4   // 分鐘
};

app.use(cors());
app.use(express.json());
// 提供靜態文件 - 從項目根目錄（包含所有 HTML 文件）
app.use(express.static(path.join(__dirname, '..')));

let pool;
let originalPoolExecute;

// 計時器管理
const timers = new Map(); // 儲存每個遊戲的計時器

// 啟動計時器函數
function startTimer(gameId, duration, callback) {
    // 清除舊的計時器
    if (timers.has(gameId)) {
        clearInterval(timers.get(gameId).interval);
    }
    
    const endTime = Date.now() + duration * 1000; // duration 是秒數
    
    const interval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        
        // 廣播剩餘時間給所有客戶端
        io.emit('timer', { 
            gameId: gameId,
            remaining: remaining 
        });
        
        if (remaining <= 0) {
            clearInterval(interval);
            timers.delete(gameId);
            if (callback) callback();
        }
    }, 1000); // 每秒更新一次
    
    timers.set(gameId, { interval, endTime });
    
    // 立即發送第一次更新
    io.emit('timer', { 
        gameId: gameId,
        remaining: Math.floor(duration) 
    });
}

// 停止計時器
function stopTimer(gameId) {
    if (timers.has(gameId)) {
        clearInterval(timers.get(gameId).interval);
        timers.delete(gameId);
        io.emit('timer', { gameId: gameId, remaining: 0 });
    }
}

async function initDatabase() {
    let connection;
    try {
        // 使用連接池以支援事務
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fishmarket_game',
            charset: 'utf8mb4',
            multipleStatements: true,
            waitForConnections: true,
            connectionLimit: 5,
            maxIdle: 2,
            idleTimeout: 10000,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
            connectTimeout: 10000
        });

        // 覆蓋 pool.execute 方法，添加自動重試邏輯
        originalPoolExecute = pool.execute.bind(pool);
        pool.execute = async function(sql, params) {
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    return await originalPoolExecute(sql, params);
                } catch (error) {
                    const isConnectionError = error.message && error.message.includes('closed state');
                    const isLastAttempt = attempt === maxRetries;

                    if (isConnectionError && !isLastAttempt) {
                        console.log(`連接已關閉，自動重試 (${attempt}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, 200));
                        continue;
                    }
                    throw error;
                }
            }
        };

        connection = await pool.getConnection();
        
        console.log('資料庫連接成功');
        
        // 建立所有必要的資料表
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
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS games (
                id INT PRIMARY KEY AUTO_INCREMENT,
                game_name VARCHAR(255) NOT NULL,
                initial_budget DECIMAL(15, 2) NOT NULL,
                loan_interest_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.03,
                unsold_fee_per_kg DECIMAL(10, 2) NOT NULL DEFAULT 10.00,
                fixed_unsold_ratio DECIMAL(5, 2) NOT NULL DEFAULT 2.50,
                distributor_floor_price_a DECIMAL(10, 2) DEFAULT 100.00,
                distributor_floor_price_b DECIMAL(10, 2) DEFAULT 100.00,
                target_price_a DECIMAL(10, 2) NOT NULL,
                target_price_b DECIMAL(10, 2) NOT NULL,
                num_teams INT NOT NULL DEFAULT 12,
                total_days INT NOT NULL DEFAULT 7,
                status ENUM('pending', 'active', 'paused', 'finished') DEFAULT 'pending',
                current_day INT DEFAULT 0,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS game_participants (
                id INT PRIMARY KEY AUTO_INCREMENT,
                game_id INT,
                team_id INT,
                current_budget DECIMAL(15, 2) NOT NULL,
                total_loan DECIMAL(15, 2) DEFAULT 0.00,
                total_loan_principal DECIMAL(15, 2) DEFAULT 0.00,
                fish_a_inventory INT DEFAULT 0,
                fish_b_inventory INT DEFAULT 0,
                cumulative_profit DECIMAL(15, 2) DEFAULT 0.00,
                UNIQUE(game_id, team_id),
                FOREIGN KEY (game_id) REFERENCES games(id),
                FOREIGN KEY (team_id) REFERENCES users(id)
            )
        `);
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS game_days (
                id INT PRIMARY KEY AUTO_INCREMENT,
                game_id INT,
                day_number INT NOT NULL,
                fish_a_supply INT NOT NULL,
                fish_b_supply INT NOT NULL,
                fish_a_restaurant_budget DECIMAL(15, 2) NOT NULL,
                fish_b_restaurant_budget DECIMAL(15, 2) NOT NULL,
                status ENUM('pending', 'buying_open', 'buying_closed', 'selling_open', 'selling_closed', 'settled') DEFAULT 'pending',
                UNIQUE(game_id, day_number),
                FOREIGN KEY (game_id) REFERENCES games(id)
            )
        `);
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS bids (
                id INT PRIMARY KEY AUTO_INCREMENT,
                game_id INT NOT NULL,
                game_day_id INT NOT NULL,
                day_number INT NOT NULL,
                team_id INT NOT NULL,
                bid_type ENUM('buy', 'sell') NOT NULL,
                fish_type ENUM('A', 'B') NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                quantity_submitted INT NOT NULL,
                quantity_fulfilled INT DEFAULT 0,
                status ENUM('pending', 'fulfilled', 'partial', 'failed') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id),
                FOREIGN KEY (game_day_id) REFERENCES game_days(id),
                FOREIGN KEY (team_id) REFERENCES users(id),
                INDEX idx_game_bids (game_id, day_number)
            )
        `);
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS game_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                game_id INT,
                action VARCHAR(50),
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id)
            )
        `);
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS daily_results (
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
        
        // 建立管理員帳號
        const [adminExists] = await connection.execute(
            'SELECT id FROM users WHERE username = ? AND role = "admin"',
            ['admin']
        );
        
        if (adminExists.length === 0) {
            const hashedPassword = await bcrypt.hash('123', 10);
            await connection.execute(
                'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                ['admin', hashedPassword, 'admin']
            );
            console.log('預設管理員帳號已建立 - 帳號: admin, 密碼: 123');
        }
        
        // 建立01-12的團隊帳號
        for (let i = 1; i <= 12; i++) {
            const username = String(i).padStart(2, '0');
            const [teamExists] = await connection.execute(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );
            
            if (teamExists.length === 0) {
                const hashedPassword = await bcrypt.hash(username, 10);  // 密碼與帳號相同
                await connection.execute(
                    'INSERT INTO users (username, password_hash, team_name, role) VALUES (?, ?, ?, ?)',
                    [username, hashedPassword, `第${i}組`, 'team']
                );
                console.log(`團隊帳號 ${username} 已建立 - 密碼: ${username}`);
            }
        }
        

        // 釋放連接回連接池
        connection.release();
        console.log('資料庫初始化完成');

        // ========================================
        // 架構修復: 確保資料庫與標準架構一致
        // ========================================
        try {
            console.log('🔧 檢查資料庫架構一致性...');

            // 1. 修復 game_days.status ENUM
            console.log('   檢查 game_days.status ENUM...');

            // 1a. 先更新現有數據，將舊值轉換為新值
            console.log('   更新現有 game_days 數據...');
            await pool.execute(`
                UPDATE game_days
                SET status = CASE
                    WHEN status = 'waiting' THEN 'pending'
                    WHEN status = 'buy_closed' THEN 'buying_closed'
                    WHEN status = 'sell_closed' THEN 'selling_closed'
                    WHEN status = 'completed' THEN 'settled'
                    ELSE status
                END
                WHERE status IN ('waiting', 'buy_closed', 'sell_closed', 'completed')
            `);

            // 1b. 然後更新 ENUM 定義
            await pool.execute(`
                ALTER TABLE game_days
                MODIFY COLUMN status ENUM('pending', 'buying_open', 'buying_closed', 'selling_open', 'selling_closed', 'settled')
                DEFAULT 'pending'
            `);
            console.log('   ✅ game_days.status ENUM 已更新');

            // 2. 檢查並添加 bids.game_id 欄位
            const [bidsCols] = await pool.execute(`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'bids'
            `);
            const bidsColumns = bidsCols.map(col => col.COLUMN_NAME);

            if (!bidsColumns.includes('game_id')) {
                console.log('   添加 bids.game_id 欄位...');
                await pool.execute(`
                    ALTER TABLE bids
                    ADD COLUMN game_id INT NOT NULL AFTER id
                `);

                // 填充數據
                await pool.execute(`
                    UPDATE bids b
                    JOIN game_days gd ON b.game_day_id = gd.id
                    SET b.game_id = gd.game_id
                `);

                // 添加外鍵
                await pool.execute(`
                    ALTER TABLE bids
                    ADD CONSTRAINT fk_bids_game
                    FOREIGN KEY (game_id) REFERENCES games(id)
                `);
                console.log('   ✅ bids.game_id 欄位已添加');
            }

            console.log('✅ 資料庫架構檢查完成');
        } catch (schemaError) {
            // 架構修復錯誤不應導致伺服器停止
            console.error('⚠️  架構修復警告:', schemaError.message);
        }

    } catch (error) {
        console.error('資料庫初始化失敗:', error);
        process.exit(1);
    }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.sendStatus(401);
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.sendStatus(403);
        }
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理員權限' });
    }
    next();
}

// 網路資訊 API
app.get('/api/network-info', (req, res) => {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    const ips = [];
    
    Object.keys(networkInterfaces).forEach(interfaceName => {
        networkInterfaces[interfaceName].forEach(interface => {
            if (interface.family === 'IPv4' && !interface.internal) {
                ips.push(interface.address);
            }
        });
    });
    
    res.json({
        ips,
        port: PORT,
        hostname: os.hostname()
    });
});

// QR Code 生成 API
app.get('/api/qr/:gameId', async (req, res) => {
    const { gameId } = req.params;
    
    try {
        // 獲取遊戲資訊
        const [games] = await pool.execute(
            'SELECT game_name FROM games WHERE id = ?',
            [gameId]
        );

        if (games.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }

        // 獲取網路 IP
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        let serverIP = 'localhost';
        
        Object.keys(networkInterfaces).forEach(interfaceName => {
            networkInterfaces[interfaceName].forEach(interface => {
                if (interface.family === 'IPv4' && !interface.internal && serverIP === 'localhost') {
                    serverIP = interface.address;
                }
            });
        });

        // 生成遊戲連結
        const gameUrl = `http://${serverIP}:${process.env.PORT || 3000}/team?gameId=${gameId}`;
        
        // 生成 QR Code
        const qrCodeDataURL = await QRCode.toDataURL(gameUrl, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        res.json({
            gameId,
            gameName: games[0].game_name,
            gameUrl,
            qrCode: qrCodeDataURL,
            serverIP,
            port: process.env.PORT || 3000
        });

    } catch (error) {
        console.error('生成 QR Code 錯誤:', error);
        res.status(500).json({ error: '生成 QR Code 失敗' });
    }
});

// 登入
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: '用戶名或密碼錯誤' });
        }
        
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: '用戶名或密碼錯誤' });
        }
        
        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            JWT_SECRET
        );
        
        res.json({ 
            token, 
            username: user.username, 
            role: user.role,
            teamName: user.team_name 
        });
    } catch (error) {
        console.error('登入錯誤:', error);
        res.status(500).json({ error: '登入失敗' });
    }
});

// 更新用戶設定 (小組名稱和密碼)
app.put('/api/users/settings', authenticateToken, async (req, res) => {
    const { teamName, newPassword } = req.body;
    const userId = req.user.userId;

    try {
        // 至少需要提供一個要更新的欄位
        if (!teamName && !newPassword) {
            return res.status(400).json({ error: '請提供要更新的資料' });
        }

        let updateFields = [];
        let updateValues = [];

        // 更新小組名稱
        if (teamName) {
            updateFields.push('team_name = ?');
            updateValues.push(teamName);
        }

        // 更新密碼
        if (newPassword) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            updateFields.push('password_hash = ?');
            updateValues.push(hashedPassword);
        }

        updateValues.push(userId);

        const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
        await pool.execute(updateQuery, updateValues);

        // 獲取更新後的用戶資料
        const [users] = await pool.execute(
            'SELECT id, username, team_name, role FROM users WHERE id = ?',
            [userId]
        );

        res.json({
            message: '設定更新成功',
            user: users[0]
        });
    } catch (error) {
        console.error('更新設定錯誤:', error);
        res.status(500).json({ error: '更新設定失敗' });
    }
});

// 重置所有用戶密碼為預設值 (僅管理員)
app.post('/api/admin/reset-all-passwords', authenticateToken, requireAdmin, async (req, res) => {
    try {
        console.log('===== 開始重置所有用戶密碼 =====');

        // 重置 admin 密碼為 "admin"
        const adminHash = await bcrypt.hash('admin', 10);
        await pool.execute(
            'UPDATE users SET password_hash = ? WHERE username = ?',
            [adminHash, 'admin']
        );
        console.log('✅ Admin 密碼已重置為: admin');

        // 重置所有學生帳號密碼為其用戶名 (01 -> 01, 02 -> 02, etc.)
        const [students] = await pool.execute(
            'SELECT id, username FROM users WHERE role = ?',
            ['team']
        );

        let resetCount = 0;
        for (const student of students) {
            const hash = await bcrypt.hash(student.username, 10);
            await pool.execute(
                'UPDATE users SET password_hash = ?, team_name = NULL WHERE id = ?',
                [hash, student.id]
            );
            console.log(`✅ ${student.username} 密碼已重置為: ${student.username}`);
            resetCount++;
        }

        console.log(`===== 重置完成: ${resetCount + 1} 個帳號 =====`);

        res.json({
            message: `成功重置 ${resetCount + 1} 個帳號密碼`,
            details: {
                admin: 'admin',
                students: '密碼重置為各自的用戶名',
                teamNamesCleared: true
            }
        });
    } catch (error) {
        console.error('重置密碼錯誤:', error);
        res.status(500).json({ error: '重置密碼失敗' });
    }
});

// 創建遊戲（改進版）
app.post('/api/admin/games/create', authenticateToken, requireAdmin, async (req, res) => {
    const {
        gameName,
        initialBudget,
        loanInterestRate,
        unsoldFeePerKg,
        fixedUnsoldRatio,  // 新增：固定滯銷比例
        distributorFloorPriceA,
        distributorFloorPriceB,
        targetPriceA,
        targetPriceB,
        numTeams,
        totalDays,  // 新增：可配置的遊戲天數
        buyingDuration,  // 買入階段時間（分鐘）
        sellingDuration  // 賣出階段時間（分鐘）
    } = req.body;

    // 詳細記錄請求參數（用於調試）
    console.log('===== 收到創建遊戲請求 =====');
    console.log('請求參數:', JSON.stringify(req.body, null, 2));

    try {
        // 結束所有進行中的遊戲
        await pool.execute(
            `UPDATE games SET status = 'finished' WHERE status IN ('active', 'paused')`
        );
        
        const teamCount = numTeams || 12;
        
        // 創建新遊戲（匹配 Railway 實際表結構）
        const [result] = await pool.execute(
            `INSERT INTO games (
                name, initial_budget, loan_interest_rate,
                unsold_fee_per_kg, fixed_unsold_ratio, distributor_floor_price_a, distributor_floor_price_b,
                target_price_a, target_price_b, num_teams, total_days,
                buying_duration, selling_duration
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                gameName,
                initialBudget || defaultGameParameters.initialBudget,
                loanInterestRate || defaultGameParameters.loanInterestRate,
                unsoldFeePerKg || defaultGameParameters.unsoldFeePerKg,
                fixedUnsoldRatio || 2.5,  // 預設2.5%固定滯銷比例
                distributorFloorPriceA || defaultGameParameters.distributorFloorPriceA,
                distributorFloorPriceB || defaultGameParameters.distributorFloorPriceB,
                targetPriceA || defaultGameParameters.targetPriceA,
                targetPriceB || defaultGameParameters.targetPriceB,
                teamCount,
                totalDays || defaultGameParameters.totalDays,
                buyingDuration || 7,  // 買入階段時間（分鐘）
                sellingDuration || 4  // 賣出階段時間（分鐘）
            ]
        );
        
        const gameId = result.insertId;
        
        // 直接設定為第1天，準備開始
        await pool.execute(
            'UPDATE games SET status = "active", current_day = 1 WHERE id = ?',
            [gameId]
        );
        
        // 自動創建第1天的記錄
        const baselineSupplyA = teamCount * 150;
        const baselineSupplyB = teamCount * 300;
        const baselineBudgetA = baselineSupplyA * (targetPriceA || 150);
        const baselineBudgetB = baselineSupplyB * (targetPriceB || 120);
        
        // 第1天使用標準參數
        const fishASupply = baselineSupplyA;
        const fishBSupply = baselineSupplyB;
        const fishABudget = baselineBudgetA;
        const fishBBudget = baselineBudgetB;
        
        await pool.execute(
            `INSERT INTO game_days (
                game_id, day_number, fish_a_supply, fish_b_supply,
                fish_a_restaurant_budget, fish_b_restaurant_budget, status
            ) VALUES (?, 1, ?, ?, ?, ?, 'pending')`,
            [gameId, fishASupply, fishBSupply, fishABudget, fishBBudget]
        );
        
        console.log(`遊戲 ${gameName} 創建成功，ID: ${gameId}，已進入第1天，等待學生加入`);
        
        res.json({ 
            success: true, 
            gameId: gameId,
            message: `遊戲創建成功！\n已自動進入第1天\n請通知學生登入並加入遊戲\n學生加入後即可開始買入投標`,
            numTeams: teamCount,
            gameName: gameName,
            day: 1,
            fishASupply: fishASupply,
            fishBSupply: fishBSupply
        });
        
        // 通知所有連線的客戶端
        io.emit('gameUpdate', { event: 'newGameCreated', gameId });

    } catch (error) {
        console.error('===== 創建遊戲錯誤 =====');
        console.error('錯誤類型:', error.constructor.name);
        console.error('錯誤訊息:', error.message);
        console.error('SQL 錯誤碼:', error.code);
        console.error('SQL 錯誤狀態:', error.sqlState);
        console.error('SQL 錯誤訊息:', error.sqlMessage);
        console.error('完整錯誤堆疊:', error.stack);
        console.error('請求的參數:', JSON.stringify(req.body, null, 2));

        // 返回詳細的錯誤訊息給前端
        res.status(500).json({
            error: '創建遊戲失敗',
            details: error.message,
            sqlError: error.sqlMessage || error.message,
            code: error.code,
            sqlState: error.sqlState,
            // 在開發環境顯示完整堆疊
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 獲取遊戲列表
app.get('/api/admin/games', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [games] = await pool.execute(`
            SELECT g.*, COUNT(gp.id) as participant_count 
            FROM games g 
            LEFT JOIN game_participants gp ON g.id = gp.game_id
            GROUP BY g.id
            ORDER BY g.created_at DESC
        `);
        res.json(games);
    } catch (error) {
        console.error('獲取遊戲列表錯誤:', error);
        res.status(500).json({ error: '獲取遊戲列表失敗' });
    }
});

// 獲取當前進行中的遊戲
app.get('/api/admin/active-game', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // 查詢 status = 'active' 的遊戲
        const [games] = await pool.execute(`
            SELECT g.*,
                   COUNT(gp.id) as participant_count,
                   gd.id as day_id,
                   gd.status as day_status,
                   gd.day_number,
                   gd.fish_a_supply,
                   gd.fish_b_supply,
                   gd.fish_a_restaurant_budget,
                   gd.fish_b_restaurant_budget
            FROM games g
            LEFT JOIN game_participants gp ON g.id = gp.game_id
            LEFT JOIN game_days gd ON g.id = gd.game_id AND gd.day_number = g.current_day
            WHERE g.status = 'active'
            GROUP BY g.id, gd.id, gd.status, gd.day_number, gd.fish_a_supply,
                     gd.fish_b_supply, gd.fish_a_restaurant_budget, gd.fish_b_restaurant_budget
            ORDER BY g.created_at DESC
            LIMIT 1
        `);

        if (games.length === 0) {
            return res.status(404).json({
                error: '沒有進行中的遊戲',
                code: 'NO_ACTIVE_GAME'
            });
        }

        // 轉換 snake_case 為 camelCase 以符合前端期待
        const game = games[0];
        const responseData = {
            ...game,
            gameName: game.game_name,
            currentDay: game.current_day,
            totalDays: game.total_days,
            initialBudget: game.initial_budget,
            loanInterestRate: game.loan_interest_rate,
            unsoldFeePerKg: game.unsold_fee_per_kg,
            fixedUnsoldRatio: game.fixed_unsold_ratio,
            distributorFloorPriceA: game.distributor_floor_price_a,
            distributorFloorPriceB: game.distributor_floor_price_b,
            targetPriceA: game.target_price_a,
            targetPriceB: game.target_price_b,
            numTeams: game.num_teams,
            createdBy: game.created_by,
            createdAt: game.created_at,
            participantCount: game.participant_count,
            phase: game.day_status || 'pending'  // 如果還沒有當天記錄，使用 pending
        };

        // 如果有當前天數資料，添加 currentDayData 嵌套物件
        if (game.day_id) {
            responseData.currentDayData = {
                id: game.day_id,
                day_number: game.day_number,
                fish_a_supply: game.fish_a_supply,
                fish_b_supply: game.fish_b_supply,
                fish_a_restaurant_budget: game.fish_a_restaurant_budget,
                fish_b_restaurant_budget: game.fish_b_restaurant_budget,
                status: game.day_status
            };
        }

        res.json(responseData);
    } catch (error) {
        console.error('獲取進行中遊戲錯誤:', error);
        res.status(500).json({ error: '獲取遊戲資料失敗' });
    }
});

// 獲取單一遊戲狀態
app.get('/api/admin/games/:gameId/status', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;

    try {
        const [game] = await pool.execute(`
            SELECT g.*,
                   gd.id as day_id,
                   gd.status as day_status,
                   gd.day_number,
                   gd.fish_a_supply,
                   gd.fish_b_supply,
                   gd.fish_a_restaurant_budget,
                   gd.fish_b_restaurant_budget
            FROM games g
            LEFT JOIN game_days gd ON g.id = gd.game_id
                AND gd.day_number = g.current_day
            WHERE g.id = ?
        `, [gameId]);

        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }

        // 轉換 snake_case 為 camelCase 以符合前端期待
        const gameData = game[0];
        const responseData = {
            ...gameData,
            gameName: gameData.game_name,
            currentDay: gameData.current_day,
            totalDays: gameData.total_days,
            initialBudget: gameData.initial_budget,
            loanInterestRate: gameData.loan_interest_rate,
            unsoldFeePerKg: gameData.unsold_fee_per_kg,
            fixedUnsoldRatio: gameData.fixed_unsold_ratio,
            distributorFloorPriceA: gameData.distributor_floor_price_a,
            distributorFloorPriceB: gameData.distributor_floor_price_b,
            targetPriceA: gameData.target_price_a,
            targetPriceB: gameData.target_price_b,
            numTeams: gameData.num_teams,
            createdBy: gameData.created_by,
            createdAt: gameData.created_at,
            dayStatus: gameData.day_status,
            dayNumber: gameData.day_number,
            phase: gameData.day_status || 'pending'  // 如果還沒有當天記錄，使用 pending
        };

        // 如果有當前天數資料，添加 currentDayData 嵌套物件
        if (gameData.day_id) {
            responseData.currentDayData = {
                id: gameData.day_id,
                day_number: gameData.day_number,
                fish_a_supply: gameData.fish_a_supply,
                fish_b_supply: gameData.fish_b_supply,
                fish_a_restaurant_budget: gameData.fish_a_restaurant_budget,
                fish_b_restaurant_budget: gameData.fish_b_restaurant_budget,
                status: gameData.day_status
            };
        }

        res.json(responseData);
    } catch (error) {
        console.error('獲取遊戲狀態錯誤:', error);
        res.status(500).json({ error: '獲取遊戲狀態失敗' });
    }
});

// 獲取遊戲團隊狀態
app.get('/api/admin/games/:gameId/teams', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;

    try {
        const [teams] = await pool.execute(`
            SELECT gp.*,
                   t.username,
                   t.team_name,
                   g.initial_budget,
                   CASE
                       WHEN (g.initial_budget + gp.total_loan_principal) > 0
                       THEN (gp.cumulative_profit / (g.initial_budget + gp.total_loan_principal)) * 100
                       ELSE 0
                   END as roi
            FROM game_participants gp
            JOIN users t ON gp.team_id = t.id
            JOIN games g ON gp.game_id = g.id
            WHERE gp.game_id = ?
            ORDER BY gp.cumulative_profit DESC
        `, [gameId]);

        res.json(teams);
    } catch (error) {
        console.error('獲取團隊狀態錯誤:', error);
        res.status(500).json({ error: '獲取團隊狀態失敗' });
    }
});

// 獲取伺服器時間和當前投標狀態
app.get('/api/games/:gameId/timer-status', async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.json({ 
                serverTime: new Date().toISOString(),
                status: 'no_active_day' 
            });
        }
        
        const day = currentDay[0];
        const now = new Date();
        
        let timeRemaining = null;
        let isActive = false;
        
        if (day.end_time) {
            const endTime = new Date(day.end_time);
            const msRemaining = Math.max(0, endTime - now);
            timeRemaining = Math.floor(msRemaining / 1000); // Convert to seconds
            isActive = msRemaining > 0 && (day.status === 'buying_open' || day.status === 'selling_open');
        }
        
        res.json({
            serverTime: now.toISOString(),
            status: day.status,
            dayNumber: day.day_number,
            startTime: day.start_time ? new Date(day.start_time).toISOString() : null,
            endTime: day.end_time ? new Date(day.end_time).toISOString() : null,
            timeRemaining: timeRemaining,
            isActive: isActive
        });
    } catch (error) {
        console.error('獲取計時器狀態錯誤:', error);
        res.status(500).json({ error: '獲取計時器狀態失敗' });
    }
});

// 獲取當前投標資料
app.get('/api/admin/games/:gameId/current-bids', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.json({ buyBids: [], sellBids: [] });
        }
        
        const dayId = currentDay[0].id;
        
        const [buyBids] = await pool.execute(`
            SELECT b.*, u.team_name 
            FROM bids b
            JOIN users u ON b.team_id = u.id
            WHERE b.game_day_id = ? AND b.bid_type = 'buy'
            ORDER BY b.fish_type, b.price DESC
        `, [dayId]);
        
        const [sellBids] = await pool.execute(`
            SELECT b.*, u.team_name 
            FROM bids b
            JOIN users u ON b.team_id = u.id
            WHERE b.game_day_id = ? AND b.bid_type = 'sell'
            ORDER BY b.fish_type, b.price ASC
        `, [dayId]);
        
        res.json({ buyBids, sellBids });
    } catch (error) {
        console.error('獲取投標資料錯誤:', error);
        res.status(500).json({ error: '獲取投標資料失敗' });
    }
});

// 推進天數（可自訂參數）
app.post('/api/admin/games/:gameId/advance-day', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    const { params } = req.body;
    let { fishASupply, fishBSupply, fishABudget, fishBBudget } = params || {};
    
    try {
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        const currentDay = game[0].current_day;
        if (currentDay >= 7) {
            return res.status(400).json({ error: '遊戲已結束' });
        }
        
        // 檢查當前天是否已經結算（第0天除外）
        if (currentDay > 0) {
            const [currentDayRecord] = await pool.execute(
                'SELECT * FROM game_days WHERE game_id = ? AND day_number = ?',
                [gameId, currentDay]
            );

            // 使用正確的 status 欄位和狀態名稱
            // 允許 sell_closed 或 completed 狀態才能進入下一天
            if (currentDayRecord.length > 0 &&
                currentDayRecord[0].status !== 'selling_closed' &&
                currentDayRecord[0].status !== 'settled') {
                return res.status(400).json({ error: `請先完成第${currentDay}天的結算` });
            }
        }
        
        const nextDay = currentDay + 1;
        const numTeams = game[0].num_teams;
        
        // 如果沒有提供參數，使用自動生成
        if (!fishASupply || !fishBSupply || !fishABudget || !fishBBudget) {
            const baselineSupplyA = numTeams * 150;
            const baselineSupplyB = numTeams * 300;
            const baselineBudgetA = baselineSupplyA * game[0].target_price_a;
            const baselineBudgetB = baselineSupplyB * game[0].target_price_b;
            
            // 根據天數的變化模式
            let supplyMultiplierA = 1;
            let supplyMultiplierB = 1;
            let budgetMultiplierA = 1;
            let budgetMultiplierB = 1;
            
            // 更新：供給量變動範圍從±30%改為±20%
            switch(nextDay) {
                case 1:
                    supplyMultiplierA = 1.0;
                    supplyMultiplierB = 1.0;
                    budgetMultiplierA = 1.0;
                    budgetMultiplierB = 1.0;
                    break;
                case 2:
                    supplyMultiplierA = 0.85;  // 原0.7，現在改為更小的變動
                    supplyMultiplierB = 1.05;
                    budgetMultiplierA = 1.15;
                    budgetMultiplierB = 0.95;
                    break;
                case 3:
                    supplyMultiplierA = 1.05;
                    supplyMultiplierB = 0.92;
                    budgetMultiplierA = 0.95;
                    budgetMultiplierB = 1.18;  // 原1.3，現在改為更小的變動
                    break;
                case 4:
                    supplyMultiplierA = 1.15;  // 原1.3
                    supplyMultiplierB = 1.20;  // 原1.4
                    budgetMultiplierA = 1.08;
                    budgetMultiplierB = 1.08;
                    break;
                case 5:
                    supplyMultiplierA = 1.12;
                    supplyMultiplierB = 1.12;
                    budgetMultiplierA = 0.85;
                    budgetMultiplierB = 0.82;
                    break;
                case 6:
                    supplyMultiplierA = 0.88;
                    supplyMultiplierB = 1.15;  // 原1.3
                    budgetMultiplierA = 1.20;  // 原1.4
                    budgetMultiplierB = 0.92;
                    break;
                case 7:
                    supplyMultiplierA = 0.92;
                    supplyMultiplierB = 0.90;
                    budgetMultiplierA = 1.20;  // 原1.5
                    budgetMultiplierB = 1.18;  // 原1.4
                    break;
            }
            
            // 隨機因子：±5%的額外變動
            const randomFactorA = 0.95 + Math.random() * 0.1;
            const randomFactorB = 0.95 + Math.random() * 0.1;
            
            fishASupply = Math.round(baselineSupplyA * supplyMultiplierA * randomFactorA);
            fishBSupply = Math.round(baselineSupplyB * supplyMultiplierB * randomFactorB);
            fishABudget = Math.ceil(baselineBudgetA * budgetMultiplierA * randomFactorA / 50000) * 50000;
            fishBBudget = Math.ceil(baselineBudgetB * budgetMultiplierB * randomFactorB / 50000) * 50000;
        }
        
        // 使用正確的欄位名稱和初始狀態
        await pool.execute(
            `INSERT INTO game_days (
                game_id, day_number, fish_a_supply, fish_b_supply,
                fish_a_restaurant_budget, fish_b_restaurant_budget, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [gameId, nextDay, fishASupply, fishBSupply, fishABudget, fishBBudget]
        );
        
        // 使用正確的狀態名稱
        await pool.execute(
            'UPDATE games SET current_day = ?, status = "active" WHERE id = ?',
            [nextDay, gameId]
        );

        // 重置所有團隊狀態 - 清空庫存，貸款利息複利計算
        console.log(`重置第${nextDay}天的團隊狀態...`);
        const [participants] = await pool.execute(
            'SELECT * FROM game_participants WHERE game_id = ?',
            [gameId]
        );

        for (const participant of participants) {
            // 更新團隊狀態：清空庫存(利息在每日結算時計算)
            await pool.execute(
                `UPDATE game_participants
                 SET fish_a_inventory = 0,
                     fish_b_inventory = 0
                 WHERE team_id = ? AND game_id = ?`,
                [participant.team_id, gameId]
            );
        }
        
        console.log(`第${nextDay}天團隊狀態已重置`);
        
        res.json({
            success: true,
            dayNumber: nextDay,
            parameters: {
                fishASupply,
                fishBSupply,
                fishABudget,
                fishBBudget
            }
        });
        
        io.emit('gameUpdate', { gameId, event: 'newDay', dayNumber: nextDay });
    } catch (error) {
        console.error('推進天數錯誤:', error);
        res.status(500).json({ error: '推進天數失敗' });
    }
});

// 開始買入投標
app.post('/api/admin/games/:gameId/start-buying', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    const { duration } = req.body; // 允許自定義時間（分鐘）
    
    try {
        // 先檢查遊戲是否存在
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '請先推進到第一天' });
        }
        
        // 更詳細的狀態檢查 - 使用正確的 status 欄位
        const dayStatus = currentDay[0].status;
        if (dayStatus === 'buying') {
            return res.status(400).json({ error: '買入投標已經開放' });
        } else if (dayStatus === 'buy_closed') {
            return res.status(400).json({ error: '買入投標已結束，請開始賣出投標' });
        } else if (dayStatus === 'selling') {
            return res.status(400).json({ error: '正在賣出投標中' });
        } else if (dayStatus === 'selling_closed') {
            return res.status(400).json({ error: '請先執行結算' });
        } else if (dayStatus === 'settled') {
            return res.status(400).json({ error: '當日已結算，請推進到下一天' });
        } else if (dayStatus !== 'pending') {
            return res.status(400).json({ error: `當前狀態(${dayStatus})不允許開始買入投標` });
        }
        
        // 設定投標開始和結束時間（預設7分鐘，可自定義）
        const biddingDuration = duration || 7; // 預設7分鐘
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + biddingDuration * 60 * 1000); // 轉換為毫秒
        
        // 更新狀態為 buying
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['buying', currentDay[0].id]
        );

        // 啟動計時器 (duration 參數單位為秒)
        startTimer(gameId, biddingDuration * 60, async () => {
            try {
                // 計時器結束時自動關閉買入投標
                await pool.execute(
                    'UPDATE game_days SET status = ? WHERE id = ?',
                    ['buy_closed', currentDay[0].id]
                );

                console.log(`遊戲 ${gameId} 第 ${currentDay[0].day_number} 天買入投標已自動結束`);

                // 通知所有客戶端買入階段結束
                io.emit('phaseChange', {
                    gameId,
                    phase: 'buying_closed',
                    dayNumber: currentDay[0].day_number,
                    message: '買入投標時間結束'
                });
            } catch (error) {
                console.error('自動結束買入投標錯誤:', error);
            }
        });
        
        console.log(`遊戲 ${gameId} 第 ${currentDay[0].day_number} 天買入投標已開始`);
        
        res.json({ 
            success: true, 
            message: `買入投標已開始（${biddingDuration}分鐘）`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration
        });
        
        // 發送開始買入投標事件，包含時間資訊
        io.emit('phaseChange', { 
            gameId, 
            phase: 'buying',
            dayNumber: currentDay[0].day_number,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000 // 轉換為毫秒
        });
        
        // 同時發送 gameUpdate 事件以保持相容性
        io.emit('gameUpdate', { 
            gameId, 
            event: 'buyingOpen', 
            dayId: currentDay[0].id,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000
        });
    } catch (error) {
        console.error('開始買入投標錯誤:', error);
        res.status(500).json({ error: `開始買入投標失敗: ${error.message}` });
    }
});

// 結束買入投標並結算
app.post('/api/admin/games/:gameId/close-buying', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        // 使用正確的 status 欄位
        if (currentDay.length === 0 || currentDay[0].status !== 'buying') {
            return res.status(400).json({ error: '當前沒有進行中的買入投標' });
        }
        
        // 停止計時器
        stopTimer(gameId);
        
        // 結算買入投標
        await processBuyBids(currentDay[0]);
        
        // 獲取結算結果
        const [buyResults] = await pool.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'buy'
             ORDER BY b.fish_type, b.price DESC`,
            [currentDay[0].id]
        );
        
        // 更新為 buy_closed 狀態
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['buy_closed', currentDay[0].id]
        );

        res.json({
            success: true,
            message: '買入投標已結束並結算',
            results: buyResults
        });

        // 發送階段變更通知
        io.emit('phaseChange', {
            gameId,
            phase: 'buying_closed',
            dayNumber: currentDay[0].day_number,
            message: '買入投標手動結束',
            results: buyResults
        });
        
        // 保持相容性
        io.emit('buyingResults', { 
            gameId, 
            dayId: currentDay[0].id,
            results: buyResults 
        });
    } catch (error) {
        console.error('===== 結束買入投標錯誤 =====');
        console.error('錯誤類型:', error.constructor.name);
        console.error('錯誤訊息:', error.message);
        console.error('SQL 錯誤碼:', error.code);
        console.error('SQL 狀態:', error.sqlState);
        console.error('SQL 錯誤訊息:', error.sqlMessage);
        console.error('完整錯誤堆疊:', error.stack);
        res.status(500).json({
            error: '結束買入投標失敗',
            details: error.message,
            sqlError: error.sqlMessage || error.message
        });
    }
});

// 開始賣出投標
app.post('/api/admin/games/:gameId/start-selling', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    const { duration } = req.body; // 允許自定義時間（分鐘）
    
    try {
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '請先推進到第一天' });
        }
        
        // 使用正確的 status 欄位
        if (currentDay[0].status !== 'buy_closed') {
            return res.status(400).json({ error: '請先完成買入投標' });
        }
        
        // 設定賣出投標開始和結束時間（預設4分鐘，可自定義）
        const biddingDuration = duration || 4; // 預設4分鐘
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + biddingDuration * 60 * 1000); // 轉換為毫秒
        
        // 更新狀態為 selling
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['selling', currentDay[0].id]
        );

        // 啟動計時器 (duration 參數單位為秒)
        startTimer(`${gameId}-selling`, biddingDuration * 60, async () => {
            try {
                // 計時器結束時自動關閉賣出投標
                await pool.execute(
                    'UPDATE game_days SET status = ? WHERE id = ?',
                    ['selling_closed', currentDay[0].id]
                );

                console.log(`遊戲 ${gameId} 第 ${currentDay[0].day_number} 天賣出投標已自動結束`);

                // 通知所有客戶端賣出階段結束
                io.emit('phaseChange', {
                    gameId,
                    phase: 'selling_closed',
                    dayNumber: currentDay[0].day_number,
                    message: '賣出投標時間結束'
                });
            } catch (error) {
                console.error('自動結束賣出投標錯誤:', error);
            }
        });
        
        res.json({ 
            success: true, 
            message: `賣出投標已開始（${biddingDuration}分鐘）`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration
        });
        
        // 發送開始賣出投標事件，包含時間資訊
        io.emit('phaseChange', { 
            gameId, 
            phase: 'selling',
            dayNumber: currentDay[0].day_number,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000 // 轉換為毫秒
        });
        
        // 同時發送 gameUpdate 事件以保持相容性
        io.emit('gameUpdate', { 
            gameId, 
            event: 'sellingOpen', 
            dayId: currentDay[0].id,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000
        });
    } catch (error) {
        console.error('開始賣出投標錯誤:', error);
        res.status(500).json({ error: '開始賣出投標失敗' });
    }
});

// 結束賣出投標
app.post('/api/admin/games/:gameId/close-selling', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        // 使用正確的 status 欄位
        if (currentDay.length === 0 || currentDay[0].status !== 'selling') {
            return res.status(400).json({ error: '當前沒有進行中的賣出投標' });
        }
        
        // 停止計時器
        stopTimer(`${gameId}-selling`);
        
        // 結算賣出投標
        await processSellBids(currentDay[0]);
        
        // 獲取結算結果
        const [sellResults] = await pool.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'sell'
             ORDER BY b.fish_type, b.price ASC`,
            [currentDay[0].id]
        );
        
        // 更新為 selling_closed 狀態
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['selling_closed', currentDay[0].id]
        );

        res.json({
            success: true,
            message: '賣出投標已結束並結算',
            results: sellResults
        });

        // 發送階段變更通知
        io.emit('phaseChange', {
            gameId,
            phase: 'selling_closed',
            dayNumber: currentDay[0].day_number,
            message: '賣出投標手動結束',
            results: sellResults
        });
        
        // 保持相容性
        io.emit('sellingResults', { 
            gameId, 
            dayId: currentDay[0].id,
            results: sellResults 
        });
    } catch (error) {
        console.error('結束賣出投標錯誤:', error);
        res.status(500).json({ error: '結束賣出投標失敗' });
    }
});

// 每日結算
app.post('/api/admin/games/:gameId/settle', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '沒有可結算的天數' });
        }
        
        // 使用正確的 status 欄位和狀態名稱
        if (currentDay[0].status === 'settled') {
            return res.status(400).json({ error: '本日已經結算完成' });
        }

        if (currentDay[0].status !== 'selling_closed') {
            return res.status(400).json({ error: '請先完成所有投標階段' });
        }
        
        // 處理賣出投標
        await processSellBids(currentDay[0]);

        // 使用強化版結算功能（包含事務處理）
        await enhancedDailySettlement(pool, gameId, currentDay[0].id, currentDay[0].day_number);
        
        // 使用正確的狀態名稱
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['settled', currentDay[0].id]
        );
        
        if (currentDay[0].day_number === 7) {
            await pool.execute(
                'UPDATE games SET status = "finished" WHERE id = ?',
                [gameId]
            );
        }
        
        res.json({ success: true, message: '結算完成' });
        io.emit('gameUpdate', { gameId, event: 'settled', dayId: currentDay[0].id });
    } catch (error) {
        console.error('結算錯誤:', error);
        res.status(500).json({ error: '結算失敗' });
    }
});

// 獲取可加入的遊戲列表
app.get('/api/team/available-games', authenticateToken, async (req, res) => {
    try {
        // 查詢進行中或待開始的遊戲
        const [games] = await pool.execute(
            `SELECT g.*, COUNT(gp.team_id) as current_teams
             FROM games g
             LEFT JOIN game_participants gp ON g.id = gp.game_id
             WHERE g.status IN ('active', 'paused')
             GROUP BY g.id`,
            []
        );
        
        res.json(games);
    } catch (error) {
        console.error('獲取遊戲列表錯誤:', error);
        res.status(500).json({ error: '獲取遊戲列表失敗' });
    }
});

// 加入遊戲
app.post('/api/team/join-game', authenticateToken, async (req, res) => {
    const teamId = req.user.userId;
    const { gameId } = req.body;
    
    try {
        // 檢查遊戲是否存在且可加入
        const [game] = await pool.execute(
            'SELECT * FROM games WHERE id = ? AND status IN ("active", "paused")',
            [gameId]
        );
        
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在或已結束' });
        }
        
        // 檢查是否已加入
        const [existing] = await pool.execute(
            'SELECT * FROM game_participants WHERE game_id = ? AND team_id = ?',
            [gameId, teamId]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: '您已經加入此遊戲' });
        }
        
        // 檢查遊戲人數是否已滿
        const [participants] = await pool.execute(
            'SELECT COUNT(*) as count FROM game_participants WHERE game_id = ?',
            [gameId]
        );
        
        if (participants[0].count >= game[0].num_teams) {
            return res.status(400).json({ error: '遊戲人數已滿' });
        }
        
        // 加入遊戲
        await pool.execute(
            `INSERT INTO game_participants (game_id, team_id, current_budget, total_loan, total_loan_principal)
             VALUES (?, ?, ?, 0, 0)`,
            [gameId, teamId, game[0].initial_budget]
        );
        
        console.log(`團隊 ${teamId} 加入遊戲 ${gameId}`);
        res.json({ success: true, message: '成功加入遊戲' });
        
        // 通知其他人
        io.emit('teamJoined', { gameId, teamId });
    } catch (error) {
        console.error('加入遊戲錯誤:', error);
        res.status(500).json({ error: '加入遊戲失敗' });
    }
});

// 一鍵加入當前遊戲
app.post('/api/team/join-current', authenticateToken, async (req, res) => {
    const teamId = req.user.userId; // 修正：使用 userId 而非 id
    const teamNumber = parseInt(req.user.username, 10); // 01, 02... 轉為數字
    const { teamName: customTeamName } = req.body;  // 從前端接收團隊名稱
    
    try {
        // 取得當前進行中的遊戲（最新的 active 狀態優先，其次是 pending）
        const [games] = await pool.execute(
            `SELECT * FROM games 
             WHERE status = 'active' 
             ORDER BY status DESC, created_at DESC 
             LIMIT 1`
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '目前沒有可加入的遊戲',
                code: 'NO_ACTIVE_GAME'
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        // 檢查是否已經加入
        const [existing] = await pool.execute(
            'SELECT * FROM game_participants WHERE game_id = ? AND team_id = ?',
            [gameId, teamId]
        );
        
        if (existing.length > 0) {
            // 已經加入，返回遊戲資訊和團隊名稱
            const teamNames = JSON.parse(game.team_names || '{}');
            const existingTeamName = teamNames[teamNumber] || `第${teamNumber}組`;
            
            // 如果提供了新的團隊名稱，更新它
            if (customTeamName && customTeamName.trim()) {
                teamNames[teamNumber] = customTeamName.trim();
                await pool.execute(
                    'UPDATE games SET team_names = ? WHERE id = ?',
                    [JSON.stringify(teamNames), gameId]
                );
                
                // 更新 users 表中的 team_name
                await pool.execute(
                    'UPDATE users SET team_name = ? WHERE id = ?',
                    [customTeamName.trim(), teamId]
                );
            }
            
            return res.json({ 
                success: true, 
                alreadyJoined: true,
                gameId,
                gameName: game.game_name,
                teamNumber,
                teamName: customTeamName || existingTeamName,
                message: '您已經在此遊戲中'
            });
        }
        
        // 檢查遊戲人數是否已滿
        const [participants] = await pool.execute(
            'SELECT COUNT(*) as count FROM game_participants WHERE game_id = ?',
            [gameId]
        );
        
        if (participants[0].count >= game.num_teams) {
            return res.status(400).json({ 
                error: '遊戲人數已滿',
                code: 'GAME_FULL'
            });
        }
        
        // 加入遊戲
        await pool.execute(
            `INSERT INTO game_participants (game_id, team_id, current_budget, total_loan, total_loan_principal)
             VALUES (?, ?, ?, 0, 0)`,
            [gameId, teamId, game.initial_budget]
        );
        
        // 處理團隊名稱
        const teamNames = JSON.parse(game.team_names || '{}');
        const finalTeamName = customTeamName?.trim() || teamNames[teamNumber] || `第${teamNumber}組`;
        teamNames[teamNumber] = finalTeamName;
        
        // 更新遊戲的團隊名稱記錄
        await pool.execute(
            'UPDATE games SET team_names = ? WHERE id = ?',
            [JSON.stringify(teamNames), gameId]
        );
        
        // 更新 users 表中的 team_name
        await pool.execute(
            'UPDATE users SET team_name = ? WHERE id = ?',
            [finalTeamName, teamId]
        );
        
        console.log(`團隊 ${teamNumber} (${finalTeamName}) 加入遊戲 ${gameId}`);
        
        // 通知其他人
        io.emit('teamJoined', { 
            gameId, 
            teamId,
            teamNumber,
            teamName: finalTeamName 
        });
        
        res.json({ 
            success: true,
            gameId,
            gameName: game.game_name,
            teamNumber,
            teamName: finalTeamName,
            message: '成功加入遊戲'
        });
        
    } catch (error) {
        console.error('一鍵加入遊戲錯誤:', error);
        res.status(500).json({ error: '加入遊戲失敗' });
    }
});

// 更新團隊名稱
app.post('/api/team/update-name', authenticateToken, async (req, res) => {
    const teamId = req.user.userId;
    const teamNumber = parseInt(req.user.username, 10);
    const { gameId, newName } = req.body;
    
    if (!newName || newName.trim().length === 0) {
        return res.status(400).json({ error: '團隊名稱不能為空' });
    }
    
    if (newName.length > 20) {
        return res.status(400).json({ error: '團隊名稱不能超過20個字' });
    }
    
    try {
        // 檢查遊戲是否存在
        const [games] = await pool.execute(
            'SELECT * FROM games WHERE id = ?',
            [gameId]
        );
        
        if (games.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        // 檢查團隊是否參與此遊戲
        const [participants] = await pool.execute(
            'SELECT * FROM game_participants WHERE game_id = ? AND team_id = ?',
            [gameId, teamId]
        );
        
        if (participants.length === 0) {
            return res.status(403).json({ error: '您未參與此遊戲' });
        }
        
        // 取得並更新團隊名稱
        const teamNames = JSON.parse(games[0].team_names || '{}');
        teamNames[teamNumber] = newName.trim();
        
        await pool.execute(
            'UPDATE games SET team_names = ? WHERE id = ?',
            [JSON.stringify(teamNames), gameId]
        );
        
        console.log(`團隊 ${teamNumber} 更新名稱為: ${newName}`);
        
        // 通知所有連線的用戶
        io.to(`game-${gameId}`).emit('teamNameUpdated', {
            teamNumber,
            newName: newName.trim()
        });
        
        res.json({ 
            success: true,
            teamNumber,
            newName: newName.trim(),
            message: '團隊名稱更新成功'
        });
        
    } catch (error) {
        console.error('更新團隊名稱錯誤:', error);
        res.status(500).json({ error: '更新團隊名稱失敗' });
    }
});

// 團隊介面 - 獲取當前遊戲資訊（修正版）
app.get('/api/team/dashboard', authenticateToken, async (req, res) => {
    try {
        // 獲取當前進行中的遊戲
        const [activeGames] = await pool.execute(
            `SELECT * FROM games WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`
        );
        
        if (activeGames.length === 0) {
            return res.status(404).json({ error: '目前沒有進行中的遊戲' });
        }
        
        const currentGame = activeGames[0];
        
        // 檢查團隊是否參與此遊戲
        const [participants] = await pool.execute(
            `SELECT gp.*, g.* 
             FROM game_participants gp
             JOIN games g ON gp.game_id = g.id
             WHERE gp.team_id = ? AND g.id = ?`,
            [req.user.userId, currentGame.id]
        );
        
        if (participants.length === 0) {
            // 如果團隊編號在範圍內，自動加入
            const teamNumber = parseInt(req.user.username, 10);
            if (!isNaN(teamNumber) && teamNumber >= 1 && teamNumber <= currentGame.num_teams) {
                await pool.execute(
                    'INSERT INTO game_participants (game_id, team_id, current_budget) VALUES (?, ?, ?)',
                    [currentGame.id, req.user.userId, currentGame.initial_budget]
                );
                
                // 重新查詢
                const [newParticipants] = await pool.execute(
                    `SELECT gp.*, g.* 
                     FROM game_participants gp
                     JOIN games g ON gp.game_id = g.id
                     WHERE gp.team_id = ? AND g.id = ?`,
                    [req.user.userId, currentGame.id]
                );
                
                if (newParticipants.length > 0) {
                    participants.push(newParticipants[0]);
                }
            } else {
                return res.status(403).json({ 
                    error: `本局遊戲只開放 ${currentGame.num_teams} 組團隊，您的組別不在範圍內` 
                });
            }
        }
        
        const participant = participants[0];
        const gameId = participant.game_id;
        
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        const [dailyResults] = await pool.execute(
            `SELECT dr.*, gd.day_number 
             FROM daily_results dr
             JOIN game_days gd ON dr.game_day_id = gd.id
             WHERE dr.team_id = ? AND gd.game_id = ?
             ORDER BY gd.day_number ASC`,
            [req.user.userId, currentGame.id]
        );
        
        res.json({
            gameInfo: {
                gameName: participant.game_name,
                currentDay: participant.current_day,
                status: participant.status,
                dayStatus: currentDay[0]?.status || 'pending'
            },
            financials: {
                currentBudget: participant.current_budget,
                totalLoan: participant.total_loan,
                fishAInventory: participant.fish_a_inventory,
                fishBInventory: participant.fish_b_inventory
            },
            marketInfo: currentDay[0] ? {
                fishASupply: currentDay[0].fish_a_supply,
                fishBSupply: currentDay[0].fish_b_supply,
                fishABudget: currentDay[0].fish_a_restaurant_budget,
                fishBBudget: currentDay[0].fish_b_restaurant_budget
            } : null,
            history: dailyResults
        });
    } catch (error) {
        console.error('獲取團隊資訊錯誤:', error);
        res.status(500).json({ error: '獲取資訊失敗' });
    }
});

// 提交買入投標（支援多價格和資金檢查）
app.post('/api/team/submit-buy-bids', authenticateToken, async (req, res) => {
    const { buyBids } = req.body;
    const teamId = req.user.userId;
    
    try {
        // 獲取當前進行中的遊戲和當前天
        const [activeGames] = await pool.execute(
            `SELECT g.*, gd.id as game_day_id, gd.day_number, gd.status
             FROM games g
             JOIN game_days gd ON g.id = gd.game_id AND g.current_day = gd.day_number
             WHERE g.status = 'active' AND gd.status = 'buying'
             ORDER BY g.created_at DESC LIMIT 1`
        );
        
        if (activeGames.length === 0) {
            return res.status(404).json({ error: '目前沒有進行買入投標階段的遊戲' });
        }
        
        const game = activeGames[0];
        const gameDayId = game.game_day_id;
        const gameId = game.id;
        const dayNumber = game.day_number;
        
        // 獲取團隊在遊戲中的狀態
        const [participant] = await pool.execute(
            'SELECT * FROM game_participants WHERE team_id = ? AND game_id = ?',
            [teamId, gameId]
        );
        
        if (participant.length === 0) {
            return res.status(404).json({ error: '您尚未加入當前遊戲' });
        }
        
        const teamData = participant[0];
        
        // 計算總出價金額（支援多價格）
        let totalBidAmount = 0;
        const processedBids = [];
        
        if (buyBids && Array.isArray(buyBids)) {
            // 整理投標資料，支援每種魚最多兩個價格
            const bidsByType = { A: [], B: [] };
            
            for (const bid of buyBids) {
                if (bid && bid.price > 0 && bid.quantity > 0) {
                    const fishType = bid.fish_type || bid.fishType;
                    if (bidsByType[fishType] && bidsByType[fishType].length < 2) {
                        const bidAmount = bid.price * bid.quantity;
                        totalBidAmount += bidAmount;
                        
                        processedBids.push({
                            fish_type: fishType,
                            price: bid.price,
                            quantity: bid.quantity,
                            price_index: bidsByType[fishType].length + 1,
                            total_bid_amount: bidAmount
                        });
                        
                        bidsByType[fishType].push(bid);
                    }
                }
            }
        }
        
        // 檢查資金是否足夠（貸款不超過初始預算的50%）
        const currentBudget = teamData.current_budget || 0;
        const currentLoan = teamData.total_loan || 0;
        const initialBudget = game.initial_budget || 1000000;
        const maxTotalLoan = initialBudget * 0.5;  // 最大貸款為初始預算的50%
        
        // 計算需要借貸的金額
        const loanNeeded = Math.max(0, totalBidAmount - currentBudget);
        const newTotalLoan = currentLoan + loanNeeded;
        
        // 檢查貸款上限
        if (newTotalLoan > maxTotalLoan) {
            return res.status(400).json({ 
                error: `貸款總額 $${newTotalLoan.toFixed(2)} 超過上限 $${maxTotalLoan.toFixed(2)} (初始預算的50%)`,
                currentBudget: currentBudget,
                currentLoan: currentLoan,
                loanNeeded: loanNeeded,
                totalBidAmount: totalBidAmount,
                maxTotalLoan: maxTotalLoan
            });
        }
        
        // 開始交易：刪除舊的買入投標
        await pool.execute(
            'DELETE FROM bids WHERE game_day_id = ? AND team_id = ? AND bid_type = "buy"',
            [gameDayId, teamId]
        );
        
        // 新增投標記錄（根據正確的資料庫結構）
        for (const bid of processedBids) {
            await pool.execute(
                `INSERT INTO bids (
                    game_id, game_day_id, day_number, team_id, bid_type, fish_type,
                    price, quantity_submitted, status, created_at
                ) VALUES (?, ?, ?, ?, 'buy', ?, ?, ?, 'pending', NOW())`,
                [
                    gameId,
                    gameDayId,
                    dayNumber,
                    teamId,
                    bid.fish_type,
                    bid.price,
                    bid.quantity
                ]
            );
        }
        
        // 如果需要借貸，更新借貸金額並同步發放現金
        if (loanNeeded > 0) {
            await pool.execute(
                `UPDATE game_participants
                 SET total_loan = total_loan + ?,
                     total_loan_principal = total_loan_principal + ?,
                     current_budget = current_budget + ?
                 WHERE team_id = ? AND game_id = ?`,
                [loanNeeded, loanNeeded, loanNeeded, teamId, gameId]
            );
        }
        
        res.json({ 
            success: true, 
            message: '買入投標已提交',
            summary: {
                totalBidAmount: totalBidAmount,
                currentBudget: currentBudget,
                loanNeeded: loanNeeded,
                bidsSubmitted: processedBids.length
            }
        });
        
        // 通知所有連線的客戶端
        io.emit('bidsUpdated', { 
            gameId: game.id, 
            teamId: req.user.userId,
            phase: 'buying'
        });
        
    } catch (error) {
        console.error('提交買入投標錯誤:', error);
        res.status(500).json({ error: '提交買入投標失敗：' + error.message });
    }
});

// 提交賣出投標（支援多價格）
app.post('/api/team/submit-sell-bids', authenticateToken, async (req, res) => {
    const { sellBids } = req.body;
    const teamId = req.user.userId;
    
    try {
        // 獲取當前進行中的遊戲和當前天
        const [activeGames] = await pool.execute(
            `SELECT g.*, gd.id as game_day_id, gd.day_number, gd.status
             FROM games g
             JOIN game_days gd ON g.id = gd.game_id AND g.current_day = gd.day_number
             WHERE g.status = 'active' AND gd.status = 'selling'
             ORDER BY g.created_at DESC LIMIT 1`
        );
        
        if (activeGames.length === 0) {
            return res.status(404).json({ error: '目前沒有進行賣出投標階段的遊戲' });
        }
        
        const game = activeGames[0];
        const gameDayId = game.game_day_id;
        const gameId = game.id;
        const dayNumber = game.day_number;
        
        // 獲取團隊在遊戲中的狀態
        const [participant] = await pool.execute(
            'SELECT * FROM game_participants WHERE team_id = ? AND game_id = ?',
            [teamId, gameId]
        );
        
        if (participant.length === 0) {
            return res.status(404).json({ error: '您尚未加入當前遊戲' });
        }
        
        const teamData = participant[0];
        
        // 整理投標資料，支援每種魚最多兩個價格
        const processedBids = [];
        const bidsByType = { A: [], B: [] };
        
        if (sellBids && Array.isArray(sellBids)) {
            for (const bid of sellBids) {
                if (bid && bid.price > 0 && bid.quantity > 0) {
                    const fishType = bid.fish_type || bid.fishType;
                    
                    // 檢查庫存
                    const inventoryField = fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory';
                    const currentInventory = teamData[inventoryField] || 0;
                    
                    // 計算該魚種已提交的總數量
                    const totalSubmitted = bidsByType[fishType].reduce((sum, b) => sum + b.quantity, 0);
                    
                    if (bid.quantity + totalSubmitted <= currentInventory && bidsByType[fishType].length < 2) {
                        processedBids.push({
                            fish_type: fishType,
                            price: bid.price,
                            quantity: bid.quantity,
                            price_index: bidsByType[fishType].length + 1,
                            total_bid_amount: bid.price * bid.quantity
                        });
                        
                        bidsByType[fishType].push(bid);
                    } else if (bid.quantity + totalSubmitted > currentInventory) {
                        return res.status(400).json({ 
                            error: `${fishType}級魚賣出數量超過庫存`,
                            fishType: fishType,
                            requested: bid.quantity + totalSubmitted,
                            available: currentInventory
                        });
                    }
                }
            }
        }
        
        // 開始交易：刪除舊的賣出投標
        await pool.execute(
            'DELETE FROM bids WHERE game_day_id = ? AND team_id = ? AND bid_type = "sell"',
            [gameDayId, teamId]
        );
        
        // 新增投標記錄（根據正確的資料庫結構）
        for (const bid of processedBids) {
            await pool.execute(
                `INSERT INTO bids (
                    game_id, game_day_id, day_number, team_id, bid_type, fish_type,
                    price, quantity_submitted, status, created_at
                ) VALUES (?, ?, ?, ?, 'sell', ?, ?, ?, 'pending', NOW())`,
                [
                    gameId,
                    gameDayId,
                    dayNumber,
                    teamId,
                    bid.fish_type,
                    bid.price,
                    bid.quantity
                ]
            );
        }
        
        res.json({ 
            success: true, 
            message: '賣出投標已提交',
            summary: {
                bidsSubmitted: processedBids.length,
                fishA: bidsByType.A.length,
                fishB: bidsByType.B.length
            }
        });
        
        // 通知所有連線的客戶端
        io.emit('bidsUpdated', { 
            gameId: game.id, 
            teamId: req.user.userId,
            phase: 'selling'
        });
        
    } catch (error) {
        console.error('提交賣出投標錯誤:', error);
        res.status(500).json({ error: '提交賣出投標失敗：' + error.message });
    }
});

// 獲取歷史投標結果
app.get('/api/games/:gameId/bid-history', authenticateToken, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [days] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number ASC',
            [gameId]
        );
        
        const history = [];
        for (const day of days) {
            const [buyBids] = await pool.execute(
                `SELECT b.*, u.team_name 
                 FROM bids b
                 JOIN users u ON b.team_id = u.id
                 WHERE b.game_day_id = ? AND b.bid_type = 'buy'
                 ORDER BY b.fish_type, b.price DESC`,
                [day.id]
            );
            
            const [sellBids] = await pool.execute(
                `SELECT b.*, u.team_name 
                 FROM bids b
                 JOIN users u ON b.team_id = u.id
                 WHERE b.game_day_id = ? AND b.bid_type = 'sell'
                 ORDER BY b.fish_type, b.price ASC`,
                [day.id]
            );
            
            history.push({
                day: day.day_number,
                status: day.status,
                parameters: {
                    fishASupply: day.fish_a_supply,
                    fishBSupply: day.fish_b_supply,
                    fishABudget: day.fish_a_restaurant_budget,
                    fishBBudget: day.fish_b_restaurant_budget
                },
                buyBids,
                sellBids
            });
        }
        
        res.json(history);
    } catch (error) {
        console.error('獲取歷史錯誤:', error);
        res.status(500).json({ error: '獲取歷史失敗' });
    }
});

// 獲取排行榜
// 獲取每日結果
app.get('/api/admin/games/:gameId/daily-results/:day', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId, day } = req.params;
    
    try {
        // 獲取當日遊戲資訊
        const [dayInfo] = await pool.execute(
            `SELECT * FROM game_days WHERE game_id = ? AND day_number = ?`,
            [gameId, day]
        );
        
        if (dayInfo.length === 0) {
            return res.status(404).json({ error: '找不到該天資料' });
        }
        
        // 獲取當日投標記錄
        const gameDayId = dayInfo[0].id;
        const [bids] = await pool.execute(
            `SELECT b.*, u.team_name
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ?
             ORDER BY b.created_at`,
            [gameDayId]
        );
        
        // 獲取當日團隊結果
        const [teamResults] = await pool.execute(
            `SELECT dr.*, u.team_name
             FROM daily_results dr
             JOIN users u ON dr.team_id = u.id
             WHERE dr.game_day_id = ?
             ORDER BY dr.daily_profit DESC`,
            [gameDayId]
        );
        
        res.json({
            dayInfo: dayInfo[0],
            bids,
            teamResults,
            results: teamResults  // 為向後兼容添加 results 別名
        });
    } catch (error) {
        console.error('獲取每日結果錯誤:', error);
        res.status(500).json({
            error: '獲取每日結果失敗',
            message: error.message,
            code: error.code,
            sqlMessage: error.sqlMessage,
            details: error.toString()
        });
    }
});

// 獲取指定天數的完整投標統計
app.get('/api/admin/games/:gameId/day/:day/bid-summary', authenticateToken, async (req, res) => {
    const { gameId, day } = req.params;

    try {
        // 1. 獲取當日遊戲資訊
        const [dayInfo] = await pool.execute(
            `SELECT gd.*, g.initial_budget, g.loan_interest_rate, g.unsold_fee_per_kg,
                    g.distributor_floor_price_a, g.distributor_floor_price_b,
                    g.target_price_a, g.target_price_b
             FROM game_days gd
             JOIN games g ON gd.game_id = g.id
             WHERE gd.game_id = ? AND gd.day_number = ?`,
            [gameId, day]
        );

        if (dayInfo.length === 0) {
            return res.status(404).json({ error: `找不到遊戲 ${gameId} 的第 ${day} 天資料` });
        }

        const gameDayId = dayInfo[0].id;

        // 2. 獲取買入投標
        const [buyBids] = await pool.execute(
            `SELECT b.*, u.username, u.team_name
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'buy'
             ORDER BY b.fish_type, b.price DESC`,
            [gameDayId]
        );

        // 3. 獲取賣出投標
        const [sellBids] = await pool.execute(
            `SELECT b.*, u.username, u.team_name
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'sell'
             ORDER BY b.fish_type, b.price ASC`,
            [gameDayId]
        );

        // 4. 獲取當日結算結果
        const [dailyResults] = await pool.execute(
            `SELECT dr.*, u.username, u.team_name
             FROM daily_results dr
             JOIN users u ON dr.team_id = u.id
             WHERE dr.game_day_id = ?
             ORDER BY dr.roi DESC`,
            [gameDayId]
        );

        // 5. 統計資料處理
        const statistics = {
            buy: {
                fishA: calculateBidStatistics(buyBids.filter(b => b.fish_type === 'A')),
                fishB: calculateBidStatistics(buyBids.filter(b => b.fish_type === 'B'))
            },
            sell: {
                fishA: calculateBidStatistics(sellBids.filter(b => b.fish_type === 'A')),
                fishB: calculateBidStatistics(sellBids.filter(b => b.fish_type === 'B'))
            }
        };

        // 6. 投標明細
        const bidDetails = {
            buy: {
                fishA: buyBids.filter(b => b.fish_type === 'A'),
                fishB: buyBids.filter(b => b.fish_type === 'B')
            },
            sell: {
                fishA: sellBids.filter(b => b.fish_type === 'A'),
                fishB: sellBids.filter(b => b.fish_type === 'B')
            }
        };

        // 7. 返回完整資料
        res.json({
            dayInfo: {
                dayNumber: dayInfo[0].day_number,
                status: dayInfo[0].status,
                supply: {
                    fishA: dayInfo[0].fish_a_supply,
                    fishB: dayInfo[0].fish_b_supply
                },
                budget: {
                    fishA: dayInfo[0].fish_a_budget,
                    fishB: dayInfo[0].fish_b_budget
                }
            },
            statistics,
            bidDetails,
            dailyResults
        });

    } catch (error) {
        console.error('獲取投標統計錯誤:', error);
        res.status(500).json({
            error: '獲取投標統計失敗',
            message: error.message
        });
    }
});

// 計算投標統計的輔助函數
function calculateBidStatistics(bids) {
    if (!bids || bids.length === 0) {
        return {
            totalBids: 0,
            totalQuantitySubmitted: 0,
            totalQuantityFulfilled: 0,
            fulfillmentRate: '0.00',
            maxPrice: 0,
            minPrice: 0,
            avgPrice: 0,
            weightedAvgPrice: 0
        };
    }

    const totalBids = bids.length;
    const totalQuantitySubmitted = bids.reduce((sum, b) => sum + (b.quantity_submitted || 0), 0);
    const totalQuantityFulfilled = bids.reduce((sum, b) => sum + (b.quantity_fulfilled || 0), 0);
    const fulfillmentRate = totalQuantitySubmitted > 0
        ? ((totalQuantityFulfilled / totalQuantitySubmitted) * 100).toFixed(2)
        : '0.00';

    const prices = bids.map(b => b.price).filter(p => p > 0);
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const avgPrice = prices.length > 0
        ? (prices.reduce((sum, p) => sum + p, 0) / prices.length).toFixed(2)
        : 0;

    // 加權平均價（按成交量加權）
    let weightedSum = 0;
    let weightedTotal = 0;
    bids.forEach(b => {
        if (b.quantity_fulfilled > 0) {
            weightedSum += b.price * b.quantity_fulfilled;
            weightedTotal += b.quantity_fulfilled;
        }
    });
    const weightedAvgPrice = weightedTotal > 0
        ? (weightedSum / weightedTotal).toFixed(2)
        : 0;

    return {
        totalBids,
        totalQuantitySubmitted,
        totalQuantityFulfilled,
        fulfillmentRate,
        maxPrice,
        minPrice,
        avgPrice,
        weightedAvgPrice
    };
}

// 暫停遊戲
app.post('/api/admin/games/:gameId/pause', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        if (game[0].status !== 'active') {
            return res.status(400).json({ error: '只能暫停進行中的遊戲' });
        }
        
        await pool.execute('UPDATE games SET status = "paused" WHERE id = ?', [gameId]);
        
        console.log(`遊戲 ${gameId} 已暫停`);
        res.json({ success: true, message: '遊戲已暫停' });
        io.emit('gameUpdate', { gameId, event: 'gamePaused' });
    } catch (error) {
        console.error('暫停遊戲錯誤:', error);
        res.status(500).json({ error: '暫停遊戲失敗' });
    }
});

// 恢復遊戲
app.post('/api/admin/games/:gameId/resume', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        if (game[0].status !== 'paused') {
            return res.status(400).json({ error: '只能恢復暫停的遊戲' });
        }
        
        await pool.execute('UPDATE games SET status = "active" WHERE id = ?', [gameId]);
        
        console.log(`遊戲 ${gameId} 已恢復`);
        res.json({ success: true, message: '遊戲已恢復' });
        io.emit('gameUpdate', { gameId, event: 'gameResumed' });
    } catch (error) {
        console.error('恢復遊戲錯誤:', error);
        res.status(500).json({ error: '恢復遊戲失敗' });
    }
});

// 強制結束遊戲
app.post('/api/admin/games/:gameId/force-end', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        if (game[0].status === 'finished') {
            return res.status(400).json({ error: '遊戲已經結束' });
        }
        
        // 更新遊戲狀態為結束
        await pool.execute('UPDATE games SET status = "finished" WHERE id = ?', [gameId]);
        
        // 記錄強制結束的原因和時間
        await pool.execute(
            `INSERT INTO game_logs (game_id, action, details, created_at) 
             VALUES (?, 'force_ended', 'Game was forcefully ended by admin', NOW())`,
            [gameId]
        );
        
        console.log(`遊戲 ${gameId} 已強制結束`);
        res.json({ success: true, message: '遊戲已強制結束' });
        io.emit('gameUpdate', { gameId, event: 'gameForceEnded' });
    } catch (error) {
        console.error('強制結束遊戲錯誤:', error);
        res.status(500).json({ error: '強制結束遊戲失敗' });
    }
});

// 獲取歷史遊戲列表
app.get('/api/admin/games/history', authenticateToken, requireAdmin, async (req, res) => {
    const { status, startDate, endDate } = req.query;
    
    try {
        let query = `
            SELECT g.*, 
                   COUNT(DISTINCT gp.team_id) as team_count,
                   MAX(CASE WHEN g.status = 'finished' THEN dr.roi ELSE NULL END) as max_roi,
                   MAX(CASE WHEN g.status = 'finished' AND dr.roi = (
                       SELECT MAX(dr2.roi)
                       FROM daily_results dr2
                       WHERE dr2.game_day_id IN (
                           SELECT id FROM game_days 
                           WHERE game_id = g.id AND day_number = g.current_day
                       )
                   ) THEN u.team_name ELSE NULL END) as champion_team
            FROM games g
            LEFT JOIN game_participants gp ON g.id = gp.game_id
            LEFT JOIN game_days gd ON g.id = gd.game_id AND gd.day_number = g.current_day
            LEFT JOIN daily_results dr ON gd.id = dr.game_day_id
            LEFT JOIN users u ON dr.team_id = u.id
            WHERE 1=1`;
        
        const params = [];
        
        if (status && status !== 'all') {
            query += ' AND g.status = ?';
            params.push(status);
        }
        
        if (startDate) {
            query += ' AND DATE(g.created_at) >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += ' AND DATE(g.created_at) <= ?';
            params.push(endDate);
        }
        
        query += ' GROUP BY g.id ORDER BY g.created_at DESC';
        
        const [games] = await pool.execute(query, params);
        res.json(games);
    } catch (error) {
        console.error('獲取歷史遊戲錯誤:', error);
        res.status(500).json({ error: '獲取歷史遊戲失敗' });
    }
});

// 獲取遊戲詳細資料
app.get('/api/admin/games/:gameId/details', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        // 獲取遊戲基本資訊
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        // 獲取所有參與團隊
        const [teams] = await pool.execute(
            `SELECT gp.*, u.team_name
             FROM game_participants gp
             JOIN users u ON gp.team_id = u.id
             WHERE gp.game_id = ?`,
            [gameId]
        );
        
        // 獲取每日數據
        const [dailyData] = await pool.execute(
            `SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number`,
            [gameId]
        );
        
        // 獲取最終排名
        const [finalRanking] = await pool.execute(
            `SELECT u.team_name, dr.cumulative_profit, 
                    (dr.cumulative_profit / (g.initial_budget + gp.total_loan_principal)) * 100 as roi
             FROM daily_results dr
             JOIN users u ON dr.team_id = u.id
             JOIN game_participants gp ON dr.team_id = gp.team_id AND dr.game_id = gp.game_id
             JOIN games g ON dr.game_id = g.id
             WHERE dr.game_id = ? AND dr.day_number = (SELECT MAX(day_number) FROM daily_results WHERE game_id = ?)
             ORDER BY roi DESC`,
            [gameId, gameId]
        );
        
        res.json({
            game: game[0],
            teams,
            dailyData,
            finalRanking
        });
    } catch (error) {
        console.error('獲取遊戲詳情錯誤:', error);
        res.status(500).json({ error: '獲取遊戲詳情失敗' });
    }
});

app.get('/api/leaderboard/:gameId', async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        const [results] = await pool.execute(
            `SELECT 
                u.team_name,
                gp.current_budget,
                gp.total_loan,
                gp.total_loan_principal,
                COALESCE(dr.cumulative_profit, 0) as total_profit,
                (game.initial_budget + gp.total_loan_principal) as total_investment,
                CASE 
                    WHEN (game.initial_budget + gp.total_loan_principal) > 0 
                    THEN (COALESCE(dr.cumulative_profit, 0) / (game.initial_budget + gp.total_loan_principal)) * 100
                    ELSE 0
                END as roi
             FROM game_participants gp
             JOIN users u ON gp.team_id = u.id
             JOIN games game ON gp.game_id = game.id
             LEFT JOIN (
                SELECT team_id, cumulative_profit 
                FROM daily_results 
                WHERE id IN (
                    SELECT MAX(id) FROM daily_results GROUP BY team_id
                )
             ) dr ON gp.team_id = dr.team_id
             WHERE gp.game_id = ?
             ORDER BY roi DESC`,
            [gameId]
        );
        
        res.json(results);
    } catch (error) {
        console.error('獲取排行榜錯誤:', error);
        res.status(500).json({ error: '獲取排行榜失敗' });
    }
});

// 處理買入投標
async function processBuyBids(gameDay) {
    // 獲取連接並開始事務
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
        const [game] = await connection.execute(
            'SELECT * FROM games WHERE id = ?',
            [gameDay.game_id]
        );
    
    for (const fishType of ['A', 'B']) {
        const supply = fishType === 'A' ? gameDay.fish_a_supply : gameDay.fish_b_supply;
        const floorPrice = fishType === 'A' ? game[0].distributor_floor_price_a : game[0].distributor_floor_price_b;
        let remainingSupply = supply;
        
        const [bids] = await connection.execute(
            `SELECT * FROM bids 
             WHERE game_day_id = ? AND bid_type = 'buy' AND fish_type = ?
             ORDER BY price DESC, created_at ASC`,
            [gameDay.id, fishType]
        );
        
        for (const bid of bids) {
            if (bid.price < floorPrice) {
                await connection.execute(
                    'UPDATE bids SET status = "failed" WHERE id = ?',
                    [bid.id]
                );
                continue;
            }
            
            if (remainingSupply <= 0) {
                await connection.execute(
                    'UPDATE bids SET status = "failed" WHERE id = ?',
                    [bid.id]
                );
                continue;
            }
            
            const fulfilledQuantity = Math.min(bid.quantity_submitted, remainingSupply);
            remainingSupply -= fulfilledQuantity;
            
            const status = fulfilledQuantity === bid.quantity_submitted ? 'fulfilled' : 
                          fulfilledQuantity > 0 ? 'partial' : 'failed';
            
            await connection.execute(
                'UPDATE bids SET quantity_fulfilled = ?, status = ? WHERE id = ?',
                [fulfilledQuantity, status, bid.id]
            );
            
            if (fulfilledQuantity > 0) {
                const totalCost = fulfilledQuantity * bid.price;

                // 貸款已在提交投標時處理,這裡直接扣除成本並增加庫存
                await connection.execute(
                    `UPDATE game_participants 
                     SET current_budget = current_budget - ?,
                         ${fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory'} = 
                         ${fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory'} + ?
                     WHERE game_id = ? AND team_id = ?`,
                    [totalCost, fulfilledQuantity, gameDay.game_id, bid.team_id]
                );
                
                // 記錄交易到 transactions 表
                await connection.execute(
                    `INSERT INTO transactions
                     (game_day_id, team_id, transaction_type, fish_type, quantity, price_per_unit, total_amount)
                     VALUES (?, ?, 'buy', ?, ?, ?, ?)`,
                    [gameDay.id, bid.team_id, fishType, fulfilledQuantity, bid.price, totalCost]
                );
            }
        }
    }
        // 提交事務
        await connection.commit();
    } catch (error) {
        // 發生錯誤時回滾事務
        await connection.rollback();
        throw error;
    } finally {
        // 釋放連接
        connection.release();
    }
}

// 處理賣出投標 - 包含固定滯銷機制（修復版）
async function processSellBids(gameDay) {
    // 獲取連接並開始事務
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
        // 獲取遊戲設定
        const [gameInfo] = await connection.execute(
            'SELECT unsold_fee_per_kg, fixed_unsold_ratio FROM games WHERE id = ?',
            [gameDay.game_id]
        );
        const fixedUnsoldRatio = gameInfo[0].fixed_unsold_ratio || 2.5; // 從資料庫讀取固定滯銷比例
        const unsoldFeePerKg = gameInfo[0].unsold_fee_per_kg || 10;

        console.log(`處理賣出投標 - 固定滯銷比例: ${fixedUnsoldRatio}%`);

        for (const fishType of ['A', 'B']) {
            // 根據資料庫結構使用正確的欄位名稱
            const budget = fishType === 'A' ? gameDay.fish_a_restaurant_budget : gameDay.fish_b_restaurant_budget;
            let remainingBudget = Decimal(budget); // 使用 Decimal.js 確保精度
            
            // 獲取所有賣出投標（價格由低到高 - 價低者得）
            const [allBids] = await connection.execute(
                `SELECT * FROM bids 
                 WHERE game_day_id = ? AND bid_type = 'sell' AND fish_type = ?
                 ORDER BY price ASC, created_at ASC`,
                [gameDay.id, fishType]
            );
            
            if (allBids.length === 0) continue;
            
            // 步驟1：找出最高價並處理2.5%固定滯銷
            const maxPrice = Math.max(...allBids.map(bid => bid.price));
            const highPriceBids = allBids.filter(bid => bid.price === maxPrice);
            
            // 計算最高價投標的滯銷數量
            const totalHighPriceQuantity = highPriceBids.reduce((sum, bid) => sum + bid.quantity_submitted, 0);
            let unsoldQuantity = Math.ceil(totalHighPriceQuantity * fixedUnsoldRatio / 100);
            
            console.log(`${fishType}級魚：最高價${maxPrice}，總量${totalHighPriceQuantity}kg，固定滯銷${unsoldQuantity}kg`);
            
            // 步驟2：處理所有投標（價低者得，最高價部分滯銷）
            for (const bid of allBids) {
                if (remainingBudget.lte(0)) {
                    // 預算不足，標記為失敗
                    await connection.execute(
                        'UPDATE bids SET quantity_fulfilled = 0, status = "failed" WHERE id = ?',
                        [bid.id]
                    );
                    continue;
                }
                
                let availableQuantity = bid.quantity_submitted;
                
                // 如果是最高價投標，需要扣除滯銷數量
                if (bid.price === maxPrice && unsoldQuantity > 0) {
                    const bidUnsoldQuantity = Math.min(bid.quantity_submitted, unsoldQuantity);
                    availableQuantity = bid.quantity_submitted - bidUnsoldQuantity;
                    unsoldQuantity -= bidUnsoldQuantity;
                    
                    console.log(`團隊${bid.team_id}最高價投標：總量${bid.quantity_submitted}kg，滯銷${bidUnsoldQuantity}kg，可售${availableQuantity}kg`);
                }
                
                if (availableQuantity <= 0) {
                    // 全部滯銷
                    await connection.execute(
                        'UPDATE bids SET quantity_fulfilled = 0, status = "failed" WHERE id = ?',
                        [bid.id]
                    );
                    continue;
                }
                
                // 計算實際成交數量（基於餐廳預算）
                const maxAffordableQuantity = remainingBudget.dividedBy(bid.price).floor().toNumber();
                const fulfilledQuantity = Math.min(availableQuantity, maxAffordableQuantity);
                const totalRevenue = fulfilledQuantity * bid.price;

                if (fulfilledQuantity > 0) {
                    remainingBudget = remainingBudget.minus(totalRevenue);
                    
                    // 更新投標記錄
                    await connection.execute(
                        'UPDATE bids SET quantity_fulfilled = ?, status = ? WHERE id = ?',
                        [fulfilledQuantity, fulfilledQuantity === bid.quantity_submitted ? 'fulfilled' : 'partial', bid.id]
                    );
                    
                    // 更新團隊現金和扣除庫存
                    await connection.execute(
                        `UPDATE game_participants 
                         SET current_budget = current_budget + ?,
                             ${fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory'} = 
                             ${fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory'} - ?
                         WHERE game_id = ? AND team_id = ?`,
                        [totalRevenue, fulfilledQuantity, gameDay.game_id, bid.team_id]
                    );
                    
                    // 記錄交易到 transactions 表
                    await connection.execute(
                        `INSERT INTO transactions
                         (game_day_id, team_id, transaction_type, fish_type, quantity, price_per_unit, total_amount)
                         VALUES (?, ?, 'sell', ?, ?, ?, ?)`,
                        [gameDay.id, bid.team_id, fishType, fulfilledQuantity, bid.price, totalRevenue]
                    );
                    
                    console.log(`團隊${bid.team_id}賣出${fulfilledQuantity}kg ${fishType}級魚，單價${bid.price}，收入${totalRevenue}`);
                } else {
                    // 無法成交
                    await connection.execute(
                        'UPDATE bids SET quantity_fulfilled = 0, status = "failed" WHERE id = ?',
                        [bid.id]
                    );
                }
            }
        }
        
        // 提交事務
        await connection.commit();
        console.log('賣出投標處理完成（含固定2.5%滯銷機制）');
        
    } catch (error) {
        // 發生錯誤時回滾事務
        await connection.rollback();
        throw error;
    } finally {
        // 釋放連接
        connection.release();
    }
}

/**
 * 強化版每日結算功能 - 使用事務和高精度計算
 * @param {Object} pool - MySQL 連接池
 * @param {Number} gameId - 遊戲ID
 * @param {Number} gameDayId - 遊戲天ID
 * @param {Number} dayNumber - 天數
 * @param {Boolean} isForceEnd - 是否為強制結束（強制計算ROI）
 */
async function enhancedDailySettlement(pool, gameId, gameDayId, dayNumber, isForceEnd = false) {
    // 獲取資料庫連接以開始事務
    const connection = await pool.getConnection();
    
    try {
        // 開始事務
        await connection.beginTransaction();
        console.log(`開始第 ${dayNumber} 天結算（事務模式）`);
        
        // 1. 讀取遊戲基本資訊
        const [game] = await connection.execute(
            'SELECT * FROM games WHERE id = ? FOR UPDATE',
            [gameId]
        );
        
        if (game.length === 0) {
            throw new Error('遊戲不存在');
        }
        
        const gameInfo = game[0];
        
        // 使用 Decimal.js 處理所有金額
        const initialBudget = new Decimal(gameInfo.initial_budget);
        const loanInterestRate = new Decimal(gameInfo.loan_interest_rate).dividedBy(100); // 轉換為小數
        const unsoldFeePerKg = new Decimal(gameInfo.unsold_fee_per_kg);
        
        // 2. 讀取所有參與團隊（加鎖防止並發修改）
        const [participants] = await connection.execute(
            'SELECT * FROM game_participants WHERE game_id = ? FOR UPDATE',
            [gameId]
        );
        
        // 3. 處理每個團隊的結算
        for (const participant of participants) {
            console.log(`處理團隊 ${participant.team_id} 的結算...`);
            
            // 3.1 讀取當日所有買入投標
            const [buyBids] = await connection.execute(
                `SELECT fish_type, price, quantity_fulfilled 
                 FROM bids 
                 WHERE game_day_id = ? AND team_id = ? AND bid_type = 'buy'`,
                [gameDayId, participant.team_id]
            );
            
            // 3.2 讀取當日所有賣出投標
            const [sellBids] = await connection.execute(
                `SELECT fish_type, price, quantity_fulfilled 
                 FROM bids 
                 WHERE game_day_id = ? AND team_id = ? AND bid_type = 'sell'`,
                [gameDayId, participant.team_id]
            );
            
            // 3.3 使用高精度計算成本
            let totalCost = new Decimal(0);
            let fishABought = 0;
            let fishBBought = 0;
            
            for (const bid of buyBids) {
                const price = new Decimal(bid.price);
                const quantity = new Decimal(bid.quantity_fulfilled || 0);
                totalCost = totalCost.plus(price.times(quantity));
                
                if (bid.fish_type === 'A') {
                    fishABought += bid.quantity_fulfilled || 0;
                } else {
                    fishBBought += bid.quantity_fulfilled || 0;
                }
            }
            
            // 3.4 使用高精度計算收入
            let totalRevenue = new Decimal(0);
            let fishASold = 0;
            let fishBSold = 0;
            
            for (const bid of sellBids) {
                const price = new Decimal(bid.price);
                const quantity = new Decimal(bid.quantity_fulfilled || 0);
                totalRevenue = totalRevenue.plus(price.times(quantity));
                
                if (bid.fish_type === 'A') {
                    fishASold += bid.quantity_fulfilled || 0;
                } else {
                    fishBSold += bid.quantity_fulfilled || 0;
                }
            }
            
            // 3.5 計算庫存變化
            const currentBudget = new Decimal(participant.current_budget);
            const currentLoan = new Decimal(participant.total_loan);
            const currentLoanPrincipal = new Decimal(participant.total_loan_principal);
            
            // 計算當日未售出數量（當日買入 - 當日賣出）
            const fishAUnsold = Math.max(0, fishABought - fishASold);
            const fishBUnsold = Math.max(0, fishBBought - fishBSold);
            
            // 3.6 計算滯銷費（未售出的魚）
            const unsoldQuantity = fishAUnsold + fishBUnsold;
            const unsoldFee = unsoldFeePerKg.times(unsoldQuantity);

            // 庫存在推進天數時清空,這裡不處理

            // 3.7 計算利息（使用複利）
            const interestIncurred = currentLoan.times(loanInterestRate);
            const newTotalLoan = currentLoan.plus(interestIncurred);
            
            // 3.8 計算新預算
            let newBudget = currentBudget.plus(totalRevenue).minus(totalCost).minus(unsoldFee);
            let additionalLoan = new Decimal(0);
            
            // 如果預算不足，自動借貸
            if (newBudget.lessThan(0)) {
                additionalLoan = newBudget.abs();
                newBudget = new Decimal(0);
            }
            
            const newLoanPrincipal = currentLoanPrincipal.plus(additionalLoan);
            const finalTotalLoan = newTotalLoan.plus(additionalLoan);
            
            // 3.9 計算每日利潤
            const dailyProfit = totalRevenue.minus(totalCost).minus(unsoldFee).minus(interestIncurred);
            
            // 3.10 獲取累積利潤
            const [prevResults] = await connection.execute(
                `SELECT cumulative_profit FROM daily_results 
                 WHERE team_id = ? 
                 ORDER BY id DESC LIMIT 1`,
                [participant.team_id]
            );
            
            const prevCumulativeProfit = prevResults.length > 0 
                ? new Decimal(prevResults[0].cumulative_profit) 
                : new Decimal(0);
            const cumulativeProfit = prevCumulativeProfit.plus(dailyProfit);
            
            // 3.11 計算 ROI（在最後一天或強制結束時）
            let roi = new Decimal(0);
            const [gameSettings] = await connection.execute(
                'SELECT total_days FROM games WHERE id = ?',
                [gameId]
            );
            const totalDays = gameSettings[0].total_days || 7;
            
            if (isForceEnd || dayNumber === totalDays) {
                // 使用精確公式: ROI = (cumulative_profit / (initial_budget + total_loan_principal)) * 100
                const totalInvestment = initialBudget.plus(newLoanPrincipal);
                if (totalInvestment.greaterThan(0)) {
                    roi = cumulativeProfit.dividedBy(totalInvestment).times(100);
                }
                console.log(`團隊 ${participant.team_id} ${isForceEnd ? '強制結束' : '最終'} ROI: ${roi.toFixed(2)}%`);
            }
            
            // 3.12 更新 game_participants 表(庫存在推進天數時清空)
            await connection.execute(
                `UPDATE game_participants
                 SET current_budget = ?,
                     total_loan = ?,
                     total_loan_principal = ?,
                     cumulative_profit = ?
                 WHERE id = ?`,
                [
                    newBudget.toFixed(2),
                    finalTotalLoan.toFixed(2),
                    newLoanPrincipal.toFixed(2),
                    cumulativeProfit.toFixed(2),
                    participant.id
                ]
            );
            
            // 3.13 插入 daily_results 記錄
            await connection.execute(
                `INSERT INTO daily_results (
                    game_id, game_day_id, day_number, team_id, revenue, cost, unsold_fee,
                    interest_incurred, daily_profit, cumulative_profit, roi,
                    closing_budget, closing_loan
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    gameId,
                    gameDayId,
                    dayNumber,
                    participant.team_id,
                    totalRevenue.toFixed(2),
                    totalCost.toFixed(2),
                    unsoldFee.toFixed(2),
                    interestIncurred.toFixed(2),
                    dailyProfit.toFixed(2),
                    cumulativeProfit.toFixed(2),
                    roi.toFixed(2),
                    newBudget.toFixed(2),
                    finalTotalLoan.toFixed(2)
                ]
            );
            
            console.log(`團隊 ${participant.team_id} 結算完成`);
        }
        
        // 提交事務
        await connection.commit();
        console.log(`第 ${dayNumber} 天結算成功完成（事務已提交）`);
        
        return { success: true, message: '結算完成' };
        
    } catch (error) {
        // 發生錯誤，回滾事務
        await connection.rollback();
        console.error('結算失敗，事務已回滾:', error);
        throw error;
        
    } finally {
        // 釋放連接
        connection.release();
    }
}

// ===== 新增：遊戲參數管理 API =====

// 獲取遊戲參數
app.get('/api/admin/game-parameters', authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.json(defaultGameParameters);
    } catch (error) {
        console.error('獲取參數失敗:', error);
        res.status(500).json({ error: '獲取參數失敗' });
    }
});

// 更新遊戲參數
app.post('/api/admin/game-parameters', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const newParams = req.body;
        
        // 驗證參數
        if (newParams.initialBudget && newParams.initialBudget < 0) {
            return res.status(400).json({ error: '初始預算不能為負數' });
        }
        if (newParams.loanInterestRate && (newParams.loanInterestRate < 0 || newParams.loanInterestRate > 1)) {
            return res.status(400).json({ error: '利率必須在 0-100% 之間' });
        }
        if (newParams.totalDays && (newParams.totalDays < 1 || newParams.totalDays > 30)) {
            return res.status(400).json({ error: '遊戲天數必須在 1-30 天之間' });
        }
        
        // 更新參數
        defaultGameParameters = {
            ...defaultGameParameters,
            ...newParams
        };
        
        console.log('遊戲參數已更新:', defaultGameParameters);
        
        res.json({ 
            message: '參數已成功更新',
            parameters: defaultGameParameters
        });
        
    } catch (error) {
        console.error('更新參數失敗:', error);
        res.status(500).json({ error: '更新參數失敗' });
    }
});

// ===== 新增：遊戲控制 API =====

// 暫停遊戲
app.post('/admin/games/:gameId/pause', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        // 檢查遊戲狀態
        const [game] = await pool.execute(
            'SELECT * FROM games WHERE id = ?',
            [gameId]
        );
        
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        if (game[0].status !== 'active') {
            return res.status(400).json({ error: '只有進行中的遊戲可以暫停' });
        }
        
        // 更新狀態為暫停
        await pool.execute(
            'UPDATE games SET status = ?, paused_at = NOW() WHERE id = ?',
            ['paused', gameId]
        );
        
        // 通知所有連接的客戶端
        io.to(`game-${gameId}`).emit('gameStatusUpdate', {
            status: 'paused',
            message: '遊戲已暫停'
        });
        
        res.json({ message: '遊戲已暫停' });
    } catch (error) {
        console.error('暫停遊戲失敗:', error);
        res.status(500).json({ error: '暫停遊戲失敗' });
    }
});

// 恢復遊戲
app.post('/admin/games/:gameId/resume', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        // 檢查遊戲狀態
        const [game] = await pool.execute(
            'SELECT * FROM games WHERE id = ?',
            [gameId]
        );
        
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        if (game[0].status !== 'paused') {
            return res.status(400).json({ error: '只有暫停的遊戲可以恢復' });
        }
        
        // 更新狀態為進行中
        await pool.execute(
            'UPDATE games SET status = ?, paused_at = NULL WHERE id = ?',
            ['active', gameId]
        );
        
        // 通知所有連接的客戶端
        io.to(`game-${gameId}`).emit('gameStatusUpdate', {
            status: 'active',
            message: '遊戲已恢復'
        });
        
        res.json({ message: '遊戲已恢復' });
    } catch (error) {
        console.error('恢復遊戲失敗:', error);
        res.status(500).json({ error: '恢復遊戲失敗' });
    }
});

// 強制結束遊戲（計算 ROI）
app.post('/admin/games/:gameId/force-end', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;

    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // 檢查遊戲狀態
        const [game] = await connection.execute(
            'SELECT * FROM games WHERE id = ? FOR UPDATE',
            [gameId]
        );
        
        if (game.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        if (game[0].status === 'finished' || game[0].status === 'force_ended') {
            await connection.rollback();
            return res.status(400).json({ error: '遊戲已結束' });
        }
        
        // 獲取當前天數
        const [currentDay] = await connection.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        const currentDayNumber = currentDay.length > 0 ? currentDay[0].day_number : 1;
        
        // 如果有當天未結算的記錄，先進行結算
        if (currentDay.length > 0 && currentDay[0].status !== 'settled') {
            // 處理未完成的投標
            if (currentDay[0].status === 'buying_open' || currentDay[0].status === 'buying_closed') {
                await processBuyBids(currentDay[0]);
            }
            if (currentDay[0].status === 'selling_open' || currentDay[0].status === 'selling_closed') {
                await processSellBids(currentDay[0]);
            }
            
            // 執行當天結算（強制計算 ROI）
            await forceEndDailySettlement(connection, gameId, currentDay[0].id, currentDayNumber, true);
            
            await connection.execute(
                'UPDATE game_days SET status = ? WHERE id = ?',
                ['settled', currentDay[0].id]
            );
        } else if (currentDayNumber > 0) {
            // 如果已結算但遊戲未結束，重新計算最終 ROI
            await calculateFinalROI(connection, gameId, currentDayNumber);
        }
        
        // 更新遊戲狀態
        await connection.execute(
            'UPDATE games SET status = ?, force_ended_at = NOW(), force_end_day = ? WHERE id = ?',
            ['force_ended', currentDayNumber, gameId]
        );
        
        await connection.commit();
        
        // 通知所有連接的客戶端
        io.to(`game-${gameId}`).emit('gameStatusUpdate', {
            status: 'force_ended',
            message: '遊戲已強制結束',
            endDay: currentDayNumber
        });
        
        res.json({ 
            message: '遊戲已強制結束',
            endDay: currentDayNumber,
            roiCalculated: true
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('強制結束遊戲失敗:', error);
        res.status(500).json({ error: '強制結束遊戲失敗' });
    } finally {
        connection.release();
    }
});

// 強制結束時的結算函數（計算 ROI）
async function forceEndDailySettlement(connection, gameId, gameDayId, dayNumber, isForceEnd = true) {
    console.log(`開始強制結束結算（第 ${dayNumber} 天）`);
    
    // 直接調用 enhancedDailySettlement，但使用 connection 而不是 pool
    // 創建一個模擬的 pool 對象以適配
    const mockPool = {
        getConnection: async () => connection
    };
    
    // 調用原始的 enhancedDailySettlement，傳入 isForceEnd = true
    await enhancedDailySettlement(mockPool, gameId, gameDayId, dayNumber, true);
}

// 計算最終 ROI（用於已結算但需要強制結束的情況）
async function calculateFinalROI(connection, gameId, dayNumber) {
    console.log(`計算最終 ROI（第 ${dayNumber} 天強制結束）`);
    
    const [game] = await connection.execute(
        'SELECT * FROM games WHERE id = ?',
        [gameId]
    );
    
    const gameInfo = game[0];
    const initialBudget = new Decimal(gameInfo.initial_budget);
    
    const [participants] = await connection.execute(
        'SELECT * FROM game_participants WHERE game_id = ?',
        [gameId]
    );
    
    for (const participant of participants) {
        const totalInvestment = initialBudget.plus(participant.total_loan_principal || 0);
        let roi = new Decimal(0);
        
        if (totalInvestment.greaterThan(0)) {
            const cumulativeProfit = new Decimal(participant.cumulative_profit || 0);
            roi = cumulativeProfit.dividedBy(totalInvestment).times(100);
        }
        
        // 更新最後一筆 daily_results 的 ROI
        await connection.execute(
            `UPDATE daily_results 
             SET roi = ? 
             WHERE team_id = ? 
             ORDER BY id DESC 
             LIMIT 1`,
            [roi.toFixed(2), participant.team_id]
        );
        
        console.log(`團隊 ${participant.team_id} 強制結束 ROI: ${roi.toFixed(2)}%`);
    }
}

// Socket.io 連線處理
io.on('connection', (socket) => {
    console.log('新用戶連接');
    
    socket.on('joinGame', (gameId) => {
        socket.join(`game-${gameId}`);
        console.log(`用戶加入遊戲房間: game-${gameId}`);
    });
    
    socket.on('disconnect', () => {
        console.log('用戶斷開連接');
    });
});

const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`伺服器運行在 http://0.0.0.0:${PORT}`);
        console.log(`可從網路訪問: http://192.168.1.104:${PORT}`);
    });
});