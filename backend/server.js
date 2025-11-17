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
app.use(express.static(path.join(__dirname, '..')));

let db;
let pool;

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
    try {
        // 使用連接池以支援事務
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fishmarket_game',
            charset: 'utf8mb4',
            multipleStatements: true,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        
        db = await pool.getConnection();
        
        console.log('資料庫連接成功');
        
        // 資料庫結構已由 complete_database_structure.sql 建立
        // 不再需要 CREATE TABLE 語句
        
        // 建立管理員帳號
        const [adminExists] = await db.execute(
            'SELECT id FROM users WHERE username = ? AND role = "admin"',
            ['admin']
        );
        
        if (adminExists.length === 0) {
            const hashedPassword = await bcrypt.hash('123', 10);
            await db.execute(
                'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                ['admin', hashedPassword, 'admin']
            );
            console.log('預設管理員帳號已建立 - 帳號: admin, 密碼: 123');
        }
        
        // 建立01-12的團隊帳號
        for (let i = 1; i <= 12; i++) {
            const username = String(i).padStart(2, '0');
            const [teamExists] = await db.execute(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );
            
            if (teamExists.length === 0) {
                const hashedPassword = await bcrypt.hash(username, 10);  // 密碼與帳號相同
                await db.execute(
                    'INSERT INTO users (username, password_hash, team_name, role) VALUES (?, ?, ?, ?)',
                    [username, hashedPassword, `第${i}組`, 'team']
                );
                console.log(`團隊帳號 ${username} 已建立 - 密碼: ${username}`);
            }
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
        const [games] = await db.execute(
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
        const [users] = await db.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: '用戶名或密碼錯誤' });
        }
        
        const user = users[0];
        
        // 使用 plain_password 欄位進行簡單比對（課堂版本）
        const validPassword = (user.plain_password && password === user.plain_password) || 
                             await bcrypt.compare(password, user.password_hash || '');
        
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
            teamName: user.team_name,
            user: {                       // 給前端期待的 user 物件
                username: user.username,
                role: user.role,
                teamName: user.team_name
            }
        });
    } catch (error) {
        console.error('登入錯誤:', error);
        res.status(500).json({ error: '登入失敗' });
    }
});

// 驗證 Token API
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    // req.user 來自 JWT（在 login 時已簽入 userId/username/role）
    return res.json({
        user: {
            username: req.user.username,
            role: req.user.role
        }
    });
});

// 創建遊戲（改進版）
app.post('/api/admin/games/create', authenticateToken, requireAdmin, async (req, res) => {
    // 兼容 snake_case 和 camelCase
    const b = req.body;
    console.log('Received game creation request:', b);
    
    const gameName = b.gameName ?? b.name;
    const initialBudget = b.initialBudget ?? b.initial_budget;
    const loanInterestRate = b.loanInterestRate ?? b.loan_interest_rate;
    const unsoldFeePerKg = b.unsoldFeePerKg ?? b.unsold_fee_per_kg;
    const fixedUnsoldRatio = b.fixedUnsoldRatio ?? b.fixed_unsold_ratio;
    const distributorFloorPriceA = b.distributorFloorPriceA ?? b.distributor_floor_price_a ?? 100;
    const distributorFloorPriceB = b.distributorFloorPriceB ?? b.distributor_floor_price_b ?? 100;
    const targetPriceA = b.targetPriceA ?? b.target_price_a;
    const targetPriceB = b.targetPriceB ?? b.target_price_b;
    const numTeams = b.numTeams ?? b.num_teams;
    const totalDays = b.totalDays ?? b.total_days;
    
    console.log('Parsed parameters:', {
        gameName, initialBudget, loanInterestRate, unsoldFeePerKg,
        fixedUnsoldRatio, distributorFloorPriceA, distributorFloorPriceB,
        targetPriceA, targetPriceB, numTeams, totalDays
    });
    
    try {
        // 結束所有進行中或待開始的遊戲
        await db.execute(
            `UPDATE games SET status = 'finished' WHERE status IN ('active', 'pending', 'paused')`
        );
        
        const teamCount = numTeams || 12;
        
        // 創建新遊戲（使用預設參數或自定義參數）
        const [result] = await db.execute(
            `INSERT INTO games (
                game_name, initial_budget, loan_interest_rate, 
                unsold_fee_per_kg, fixed_unsold_ratio, distributor_floor_price_a, distributor_floor_price_b,
                target_price_a, target_price_b, num_teams, total_days
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                gameName,
                initialBudget ?? defaultGameParameters.initialBudget,
                loanInterestRate ?? defaultGameParameters.loanInterestRate,
                unsoldFeePerKg ?? defaultGameParameters.unsoldFeePerKg,
                fixedUnsoldRatio ?? 2.5,  // 預設2.5%固定滯銷比例
                distributorFloorPriceA ?? defaultGameParameters.distributorFloorPriceA,
                distributorFloorPriceB ?? defaultGameParameters.distributorFloorPriceB,
                targetPriceA ?? defaultGameParameters.targetPriceA,
                targetPriceB ?? defaultGameParameters.targetPriceB,
                teamCount,
                totalDays ?? defaultGameParameters.totalDays
            ]
        );
        
        const gameId = result.insertId;
        
        // 設定為 pending 狀態，第1天
        await db.execute(
            'UPDATE games SET status = "pending", current_day = 1 WHERE id = ?',
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
        
        await db.execute(
            `INSERT INTO game_days (
                game_id, day_number, fish_a_supply, fish_b_supply,
                fish_a_restaurant_budget, fish_b_restaurant_budget, status
            ) VALUES (?, 1, ?, ?, ?, ?, 'pending')`,
            [gameId, fishASupply, fishBSupply, fishABudget, fishBBudget]
        );
        
        console.log(`遊戲 ${gameName} 創建成功，ID: ${gameId}，已進入第1天，等待學生加入`);
        
        // 獲取伺服器IP和埠
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        let serverIP = 'localhost';
        
        Object.keys(networkInterfaces).forEach(interfaceName => {
            networkInterfaces[interfaceName].forEach(interface => {
                if (interface.family === 'IPv4' && !interface.internal) {
                    serverIP = interface.address;
                }
            });
        });
        
        const port = process.env.PORT || 3000;
        const gameUrl = `http://${serverIP}:${port}`;
        
        res.json({ 
            success: true, 
            gameId: gameId,
            message: `遊戲創建成功！\n已自動進入第1天\n請通知學生登入並加入遊戲\n學生加入後即可開始買入投標`,
            numTeams: teamCount,
            gameName: gameName,
            day: 1,
            fishASupply: fishASupply,
            fishBSupply: fishBSupply,
            gameUrl: gameUrl,
            serverIP: serverIP,
            port: port
        });
        
        // 通知所有連線的客戶端
        io.emit('gameUpdate', { event: 'newGameCreated', gameId });
        
    } catch (error) {
        console.error('創建遊戲錯誤:', error);
        console.error('錯誤詳情:', error.message);
        console.error('錯誤堆疊:', error.stack);
        res.status(500).json({ error: '創建遊戲失敗: ' + error.message });
    }
});

// 獲取遊戲列表
app.get('/api/admin/games', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [games] = await db.execute(`
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

// 獲取當前唯一的 active 遊戲
app.get('/api/admin/active-game', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // 查詢當前 active 或 pending 的遊戲 (優先 active)
        const [games] = await db.execute(
            `SELECT * FROM games 
             WHERE status IN ('active', 'pending') 
             ORDER BY 
                CASE status 
                    WHEN 'active' THEN 1 
                    WHEN 'pending' THEN 2 
                END, 
                created_at DESC 
             LIMIT 1`
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '目前沒有正在進行中的遊戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        
        // 獲取當前日資料
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [game.id]
        );
        
        // 獲取所有參與者資訊 (使用 LEFT JOIN 以處理沒有參與者的情況)
        let participants = [];
        try {
            const [result] = await db.execute(`
                SELECT gp.*, u.username, u.team_name
                FROM game_participants gp
                LEFT JOIN users u ON gp.team_id = u.id
                WHERE gp.game_id = ?
                ORDER BY gp.cumulative_profit DESC
            `, [game.id]);
            participants = result;
        } catch (err) {
            console.log('No participants yet for game:', game.id);
            participants = [];
        }
        
        // 組合完整的遊戲資料
        const activeGameData = {
            ...game,
            gameId: game.id,
            gameName: game.game_name,
            currentDayData: currentDay.length > 0 ? currentDay[0] : null,
            teams: participants,
            totalDays: game.total_days,
            currentDay: game.current_day,
            phase: currentDay.length > 0 ? currentDay[0].status : 'pending'
        };
        
        res.json(activeGameData);
        
    } catch (error) {
        console.error('獲取 active 遊戲錯誤:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            error: '獲取遊戲狀態失敗',
            details: error.message 
        });
    }
});

// 獲取單一遊戲狀態
app.get('/api/admin/games/:gameId/status', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [game] = await db.execute(`
            SELECT g.*, 
                   gd.status as status,
                   gd.day_number
            FROM games g
            LEFT JOIN game_days gd ON g.id = gd.game_id 
                AND gd.day_number = g.current_day
            WHERE g.id = ?
        `, [gameId]);
        
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        res.json(game[0]);
    } catch (error) {
        console.error('獲取遊戲狀態錯誤:', error);
        res.status(500).json({ error: '獲取遊戲狀態失敗' });
    }
});

// 獲取遊戲團隊狀態
app.get('/api/admin/games/:gameId/teams', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [teams] = await db.execute(`
            SELECT gp.*, t.username, t.team_name
            FROM game_participants gp
            JOIN users t ON gp.team_id = t.id
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
        const [currentDay] = await db.execute(
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
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.json({ buyBids: [], sellBids: [] });
        }
        
        const dayId = currentDay[0].id;
        
        const [buyBids] = await db.execute(`
            SELECT b.*, u.team_name 
            FROM bids b
            JOIN users u ON b.team_id = u.id
            WHERE b.game_day_id = ? AND b.bid_type = 'buy'
            ORDER BY b.fish_type, b.price DESC
        `, [dayId]);
        
        const [sellBids] = await db.execute(`
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

// 獲取指定天數的投標資料
app.get('/api/admin/games/:gameId/bids/:day', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId, day } = req.params;
    const { type } = req.query; // 'buy' or 'sell'
    
    try {
        // 獲取指定天數的 game_day
        const [gameDays] = await db.execute(
            'SELECT id FROM game_days WHERE game_id = ? AND day_number = ?',
            [gameId, day]
        );
        
        if (gameDays.length === 0) {
            return res.status(404).json({ error: '找不到該天資料' });
        }
        
        const dayId = gameDays[0].id;
        
        // 構建查詢條件
        let bidTypeCondition = '';
        if (type === 'buy' || type === 'sell') {
            bidTypeCondition = 'AND b.bid_type = ?';
        }
        
        const query = `
            SELECT b.*, u.team_name, u.username
            FROM bids b
            JOIN users u ON b.team_id = u.id
            WHERE b.game_day_id = ? ${bidTypeCondition}
            ORDER BY b.bid_type, b.fish_type, b.price ${type === 'sell' ? 'ASC' : 'DESC'}, b.created_at
        `;
        
        const params = type ? [dayId, type] : [dayId];
        const [bids] = await db.execute(query, params);
        
        // 分組結果
        const buyBids = bids.filter(bid => bid.bid_type === 'buy');
        const sellBids = bids.filter(bid => bid.bid_type === 'sell');
        
        res.json({
            day: parseInt(day),
            buyBids,
            sellBids,
            requestedType: type || 'all'
        });
    } catch (error) {
        console.error('獲取歷史投標資料錯誤:', error);
        res.status(500).json({ error: '獲取投標資料失敗' });
    }
});

// 推進天數（可自訂參數）
app.post('/api/admin/games/:gameId/advance-day', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    const { params } = req.body;
    // 兼容 camelCase 和 snake_case
    const p = params || {};
    let fishASupply = p.fishASupply ?? p.fish_a_supply;
    let fishBSupply = p.fishBSupply ?? p.fish_b_supply;
    let fishABudget = p.fishABudget ?? p.fish_a_budget ?? p.fish_a_restaurant_budget;
    let fishBBudget = p.fishBBudget ?? p.fish_b_budget ?? p.fish_b_restaurant_budget;
    
    try {
        const [game] = await db.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        const currentDay = game[0].current_day;
        if (currentDay >= 7) {
            return res.status(400).json({ error: '遊戲已結束' });
        }
        
        // 檢查當前天是否已經結算（第0天除外）
        if (currentDay > 0) {
            const [currentDayRecord] = await db.execute(
                'SELECT * FROM game_days WHERE game_id = ? AND day_number = ?',
                [gameId, currentDay]
            );
            
            // 使用正確的 status 欄位和狀態名稱
            if (currentDayRecord.length > 0 && currentDayRecord[0].status !== 'settled') {
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
        await db.execute(
            `INSERT INTO game_days (
                game_id, day_number, fish_a_supply, fish_b_supply,
                fish_a_restaurant_budget, fish_b_restaurant_budget, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [gameId, nextDay, fishASupply, fishBSupply, fishABudget, fishBBudget]
        );
        
        // 使用正確的狀態名稱
        await db.execute(
            'UPDATE games SET current_day = ?, status = "active" WHERE id = ?',
            [nextDay, gameId]
        );

        // 重置所有團隊狀態 - 清空庫存，貸款利息複利計算
        console.log(`重置第${nextDay}天的團隊狀態...`);
        const [participants] = await db.execute(
            'SELECT * FROM game_participants WHERE game_id = ?',
            [gameId]
        );

        for (const participant of participants) {
            const currentLoan = participant.total_loan || 0;
            const interestRate = game[0].loan_interest_rate || 0.03; // 3%複利
            const newTotalLoan = currentLoan * (1 + interestRate);

            // 更新團隊狀態：清空庫存，更新貸款
            await db.execute(
                `UPDATE game_participants 
                 SET fish_a_inventory = 0, 
                     fish_b_inventory = 0, 
                     total_loan = ?
                 WHERE team_id = ? AND game_id = ?`,
                [newTotalLoan, participant.team_id, gameId]
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

// 推進天數（新版本 - 自動尋找 active 遊戲）
app.post('/api/admin/advance-day', authenticateToken, requireAdmin, async (req, res) => {
    const { params } = req.body;
    
    try {
        // 自動尋找當前 active 遊戲
        const [games] = await db.execute('SELECT * FROM games WHERE status = ? LIMIT 1', ['active']);
        if (games.length === 0) {
            return res.status(404).json({ error: '目前沒有正在進行中的遊戲', code: 'NO_ACTIVE_GAME' });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        // 檢查當前日是否已結算（狀態機驗證）
        const [currentDayData] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? AND day_number = ?', 
            [gameId, game.current_day]
        );
        
        if (currentDayData.length > 0 && currentDayData[0].status !== 'settled') {
            return res.status(400).json({ 
                error: '請先完成當日的所有階段（買入、賣出、結算）', 
                currentPhase: currentDayData[0].status 
            });
        }
        
        const nextDay = game.current_day + 1;
        if (nextDay > game.total_days) {
            // 遊戲結束
            await db.execute('UPDATE games SET status = "finished" WHERE id = ?', [gameId]);
            return res.json({ message: '遊戲已結束', gameCompleted: true });
        }
        
        // 解析參數（兼容 camelCase 和 snake_case）
        const p = params || {};
        let fishASupply = p.fishASupply ?? p.fish_a_supply;
        let fishBSupply = p.fishBSupply ?? p.fish_b_supply;
        let fishABudget = p.fishABudget ?? p.fish_a_budget ?? p.fish_a_restaurant_budget;
        let fishBBudget = p.fishBBudget ?? p.fish_b_budget ?? p.fish_b_restaurant_budget;
        
        // 如果沒有提供參數，使用系統自動生成
        if (!fishASupply || !fishBSupply || !fishABudget || !fishBBudget) {
            const teamCount = game.num_teams || 12;
            const baselineSupplyA = teamCount * 150;
            const baselineSupplyB = teamCount * 300;
            
            // 根據天數調整係數
            let supplyMultiplierA = 1, supplyMultiplierB = 1;
            let budgetMultiplierA = 1, budgetMultiplierB = 1;
            
            switch (nextDay) {
                case 2:
                    supplyMultiplierA = 0.85;
                    supplyMultiplierB = 1.05;
                    budgetMultiplierA = 1.15;
                    budgetMultiplierB = 0.95;
                    break;
                case 3:
                    supplyMultiplierA = 1.05;
                    supplyMultiplierB = 0.92;
                    budgetMultiplierA = 0.95;
                    budgetMultiplierB = 1.18;
                    break;
                case 4:
                    supplyMultiplierA = 1.15;
                    supplyMultiplierB = 1.20;
                    budgetMultiplierA = 1.08;
                    budgetMultiplierB = 1.08;
                    break;
                case 5:
                    supplyMultiplierA = 1.12;
                    supplyMultiplierB = 1.12;
                    budgetMultiplierA = 1.05;
                    budgetMultiplierB = 1.05;
                    break;
                case 6:
                    supplyMultiplierA = 0.95;
                    supplyMultiplierB = 1.25;
                    budgetMultiplierA = 1.20;
                    budgetMultiplierB = 0.90;
                    break;
                case 7:
                    supplyMultiplierA = 1.25;
                    supplyMultiplierB = 0.88;
                    budgetMultiplierA = 0.92;
                    budgetMultiplierB = 1.25;
                    break;
            }
            
            fishASupply = fishASupply || Math.round(baselineSupplyA * supplyMultiplierA);
            fishBSupply = fishBSupply || Math.round(baselineSupplyB * supplyMultiplierB);
            fishABudget = fishABudget || Math.round(fishASupply * (game.target_price_a || 500) * budgetMultiplierA);
            fishBBudget = fishBBudget || Math.round(fishBSupply * (game.target_price_b || 300) * budgetMultiplierB);
        }
        
        // 更新遊戲天數
        await db.execute('UPDATE games SET current_day = ? WHERE id = ?', [nextDay, gameId]);
        
        // 創建新的一天記錄
        await db.execute(`
            INSERT INTO game_days (
                game_id, day_number, fish_a_supply, fish_b_supply,
                fish_a_restaurant_budget, fish_b_restaurant_budget, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `, [gameId, nextDay, fishASupply, fishBSupply, fishABudget, fishBBudget]);
        
        res.json({
            message: `已推進到第 ${nextDay} 天`,
            day: nextDay,
            marketParams: {
                fishASupply,
                fishBSupply,
                fishABudget,
                fishBBudget
            }
        });
        
    } catch (error) {
        console.error('推進天數錯誤:', error);
        res.status(500).json({ error: '推進天數失敗' });
    }
});

// 開始買入投標 (新版本 - 自動尋找 active 遊戲)
app.post('/api/admin/start-buying', authenticateToken, requireAdmin, async (req, res) => {
    const { duration } = req.body; // 允許自定義時間（分鐘）
    
    try {
        // 自動尋找 active 或 pending 遊戲
        const [games] = await db.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '目前沒有正在進行中的遊戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '請先推進到第一天' });
        }
        
        // 狀態檢查 - 必須是 pending 狀態才能開始買入投標
        const dayStatus = currentDay[0].status;
        if (dayStatus !== 'pending') {
            let errorMessage = '';
            switch (dayStatus) {
                case 'buying_open':
                    errorMessage = '買入投標已經開放';
                    break;
                case 'buying_closed':
                    errorMessage = '買入投標已結束，請開始賣出投標';
                    break;
                case 'selling_open':
                    errorMessage = '正在賣出投標中';
                    break;
                case 'selling_closed':
                    errorMessage = '請先執行結算';
                    break;
                case 'settled':
                    errorMessage = '當日已結算，請推進到下一天';
                    break;
                default:
                    errorMessage = `當前狀態(${dayStatus})不允許開始買入投標`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        
        // 如果遊戲還在 pending 狀態，將其激活
        if (game.status === 'pending') {
            await db.execute(
                'UPDATE games SET status = ? WHERE id = ?',
                ['active', gameId]
            );
        }
        
        // 設定投標開始和結束時間（預設7分鐘，可自定義）
        const biddingDuration = duration || 7; // 預設7分鐘
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + biddingDuration * 60 * 1000);
        
        // 更新狀態為 buying_open 並儲存結束時間
        await db.execute(
            'UPDATE game_days SET status = ?, buy_start_time = ?, buy_end_time = ? WHERE id = ?',
            ['buying_open', startTime, endTime, currentDay[0].id]
        );
        
        // 啟動計時器
        startTimer(gameId, biddingDuration * 60, async () => {
            try {
                // 計時器結束時自動關閉買入投標
                await db.execute(
                    'UPDATE game_days SET status = ? WHERE id = ?',
                    ['buying_closed', currentDay[0].id]
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
            duration: biddingDuration,
            gameId: gameId,
            dayNumber: currentDay[0].day_number
        });
        
        // 發送開始買入投標事件
        io.emit('phaseChange', { 
            gameId, 
            phase: 'buying_open',
            dayNumber: currentDay[0].day_number,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000
        });
        
        // 同時發送 gameUpdate 事件以保持相容性
        io.emit('gameUpdate', { 
            gameId, 
            event: 'buyingOpen', 
            dayId: currentDay[0].id,
            dayNumber: currentDay[0].day_number,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000
        });
        
    } catch (error) {
        console.error('開始買入投標失敗:', error);
        res.status(500).json({ error: '開始買入投標失敗' });
    }
});

// 開始買入投標 (舊版本 - 保留相容性)
app.post('/api/admin/games/:gameId/start-buying', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    const { duration } = req.body; // 允許自定義時間（分鐘）
    
    try {
        // 先檢查遊戲是否存在
        const [game] = await db.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '請先推進到第一天' });
        }
        
        // 更詳細的狀態檢查 - 使用正確的 status 欄位
        const dayStatus = currentDay[0].status;
        if (dayStatus === 'buying_open') {
            return res.status(400).json({ error: '買入投標已經開放' });
        } else if (dayStatus === 'buying_closed') {
            return res.status(400).json({ error: '買入投標已結束，請開始賣出投標' });
        } else if (dayStatus === 'selling_open') {
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
        
        // 更新狀態為 buying - 使用正確的 status 欄位並儲存時間
        await db.execute(
            'UPDATE game_days SET status = ?, buy_start_time = ?, buy_end_time = ? WHERE id = ?',
            ['buying_open', startTime, endTime, currentDay[0].id]
        );
        
        // 啟動計時器
        startTimer(gameId, biddingDuration * 60, async () => {
            try {
                // 計時器結束時自動關閉買入投標
                await db.execute(
                    'UPDATE game_days SET status = ? WHERE id = ?',
                    ['buying_closed', currentDay[0].id]
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
            phase: 'buying_open',
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

// 結束買入投標 (新版本 - 自動尋找 active 遊戲)
app.post('/api/admin/close-buying', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // 自動尋找 active 或 pending 遊戲
        const [games] = await db.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '目前沒有正在進行中的遊戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '找不到遊戲天數記錄' });
        }
        
        // 狀態檢查 - 必須是 buying_open 狀態才能結束買入投標
        const dayStatus = currentDay[0].status;
        if (dayStatus !== 'buying_open') {
            let errorMessage = '';
            switch (dayStatus) {
                case 'pending':
                    errorMessage = '買入投標尚未開始';
                    break;
                case 'buying_closed':
                    errorMessage = '買入投標已經結束';
                    break;
                case 'selling_open':
                    errorMessage = '正在賣出投標中';
                    break;
                case 'selling_closed':
                    errorMessage = '賣出投標已結束';
                    break;
                case 'settled':
                    errorMessage = '當日已結算';
                    break;
                default:
                    errorMessage = `當前狀態(${dayStatus})不允許結束買入投標`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        
        // 停止計時器
        stopTimer(gameId);
        
        // 結算買入投標
        await processBuyBids(currentDay[0]);
        
        // 獲取結算結果
        const [buyResults] = await db.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'buy'
             ORDER BY b.fish_type, b.price DESC`,
            [currentDay[0].id]
        );
        
        // 更新為 buying_closed 狀態
        await db.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['buying_closed', currentDay[0].id]
        );
        
        res.json({ 
            success: true, 
            message: '買入投標已結束並結算',
            results: buyResults,
            gameId: gameId,
            dayNumber: currentDay[0].day_number
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
        console.error('結束買入投標錯誤:', error);
        res.status(500).json({ error: '結束買入投標失敗' });
    }
});

// 結束買入投標並結算 (舊版本 - 保留相容性)
app.post('/api/admin/games/:gameId/close-buying', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        // 使用正確的 status 欄位
        if (currentDay.length === 0 || currentDay[0].status !== 'buying_open') {
            return res.status(400).json({ error: '當前沒有進行中的買入投標' });
        }
        
        // 停止計時器
        stopTimer(gameId);
        
        // 結算買入投標
        await processBuyBids(currentDay[0]);
        
        // 獲取結算結果
        const [buyResults] = await db.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'buy'
             ORDER BY b.fish_type, b.price DESC`,
            [currentDay[0].id]
        );
        
        // 更新為 buy_ended 狀態 - 使用正確的 status 欄位
        await db.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['buying_closed', currentDay[0].id]
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
        console.error('結束買入投標錯誤:', error);
        res.status(500).json({ error: '結束買入投標失敗' });
    }
});

// 開始賣出投標 (新版本 - 自動尋找 active 遊戲)
app.post('/api/admin/start-selling', authenticateToken, requireAdmin, async (req, res) => {
    const { duration } = req.body; // 允許自定義時間（分鐘）
    
    try {
        // 自動尋找 active 或 pending 遊戲
        const [games] = await db.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '目前沒有正在進行中的遊戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '找不到遊戲天數記錄' });
        }
        
        // 狀態檢查 - 必須是 buying_closed 狀態才能開始賣出投標
        const dayStatus = currentDay[0].status;
        if (dayStatus !== 'buying_closed') {
            let errorMessage = '';
            switch (dayStatus) {
                case 'pending':
                    errorMessage = '請先開始買入投標';
                    break;
                case 'buying_open':
                    errorMessage = '請先完成買入投標';
                    break;
                case 'selling_open':
                    errorMessage = '賣出投標已經開放';
                    break;
                case 'selling_closed':
                    errorMessage = '賣出投標已結束，請執行結算';
                    break;
                case 'settled':
                    errorMessage = '當日已結算，請推進到下一天';
                    break;
                default:
                    errorMessage = `當前狀態(${dayStatus})不允許開始賣出投標`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        
        // 設定賣出投標開始和結束時間（預設5分鐘，可自定義）
        const sellingDuration = duration || 5; // 預設5分鐘
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + sellingDuration * 60 * 1000);
        
        // 更新狀態為 selling_open 並儲存結束時間
        await db.execute(
            'UPDATE game_days SET status = ?, sell_start_time = ?, sell_end_time = ? WHERE id = ?',
            ['selling_open', startTime, endTime, currentDay[0].id]
        );
        
        // 啟動計時器
        startTimer(gameId, sellingDuration * 60, async () => {
            try {
                // 計時器結束時自動關閉賣出投標
                await db.execute(
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
        
        console.log(`遊戲 ${gameId} 第 ${currentDay[0].day_number} 天賣出投標已開始`);
        
        res.json({ 
            success: true, 
            message: `賣出投標已開始（${sellingDuration}分鐘）`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: sellingDuration,
            gameId: gameId,
            dayNumber: currentDay[0].day_number
        });
        
        // 發送開始賣出投標事件
        io.emit('phaseChange', { 
            gameId, 
            phase: 'selling_open',
            dayNumber: currentDay[0].day_number,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: sellingDuration * 60 * 1000
        });
        
        // 同時發送 gameUpdate 事件以保持相容性
        io.emit('gameUpdate', { 
            gameId, 
            event: 'sellingOpen', 
            dayId: currentDay[0].id,
            dayNumber: currentDay[0].day_number,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: sellingDuration * 60 * 1000
        });
        
    } catch (error) {
        console.error('開始賣出投標失敗:', error);
        res.status(500).json({ error: '開始賣出投標失敗' });
    }
});

// 開始賣出投標 (舊版本 - 保留相容性)
app.post('/api/admin/games/:gameId/start-selling', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    const { duration } = req.body; // 允許自定義時間（分鐘）
    
    try {
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '請先推進到第一天' });
        }
        
        // 使用正確的 status 欄位
        if (currentDay[0].status !== 'buying_closed') {
            return res.status(400).json({ error: '請先完成買入投標' });
        }
        
        // 設定賣出投標開始和結束時間（預設4分鐘，可自定義）
        const biddingDuration = duration || 4; // 預設4分鐘
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + biddingDuration * 60 * 1000); // 轉換為毫秒
        
        // 更新狀態為 selling - 使用正確的 status 欄位並儲存時間
        await db.execute(
            'UPDATE game_days SET status = ?, sell_start_time = ?, sell_end_time = ? WHERE id = ?',
            ['selling_open', startTime, endTime, currentDay[0].id]
        );
        
        // 啟動計時器
        startTimer(`${gameId}-selling`, biddingDuration * 60, async () => {
            try {
                // 計時器結束時自動關閉賣出投標
                await db.execute(
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
            phase: 'selling_open',
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

// 結束賣出投標 (新版本 - 自動尋找 active 遊戲)
app.post('/api/admin/close-selling', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // 自動尋找 active 或 pending 遊戲
        const [games] = await db.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '目前沒有正在進行中的遊戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '找不到遊戲天數記錄' });
        }
        
        // 狀態檢查 - 必須是 selling_open 狀態才能結束賣出投標
        const dayStatus = currentDay[0].status;
        if (dayStatus !== 'selling_open') {
            let errorMessage = '';
            switch (dayStatus) {
                case 'pending':
                    errorMessage = '請先開始買入投標';
                    break;
                case 'buying_open':
                    errorMessage = '請先完成買入投標';
                    break;
                case 'buying_closed':
                    errorMessage = '賣出投標尚未開始';
                    break;
                case 'selling_closed':
                    errorMessage = '賣出投標已經結束';
                    break;
                case 'settled':
                    errorMessage = '當日已結算';
                    break;
                default:
                    errorMessage = `當前狀態(${dayStatus})不允許結束賣出投標`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        
        // 停止計時器
        stopTimer(gameId);
        
        // 結算賣出投標
        await processSellBids(currentDay[0]);
        
        // 獲取結算結果
        const [sellResults] = await db.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'sell'
             ORDER BY b.fish_type, b.price ASC`,
            [currentDay[0].id]
        );
        
        // 更新為 selling_closed 狀態
        await db.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['selling_closed', currentDay[0].id]
        );
        
        res.json({ 
            success: true, 
            message: '賣出投標已結束並結算',
            results: sellResults,
            gameId: gameId,
            dayNumber: currentDay[0].day_number
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

// 結束賣出投標 (舊版本 - 保留相容性)
app.post('/api/admin/games/:gameId/close-selling', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        // 使用正確的 status 欄位
        if (currentDay.length === 0 || currentDay[0].status !== 'selling_open') {
            return res.status(400).json({ error: '當前沒有進行中的賣出投標' });
        }
        
        // 停止計時器
        stopTimer(`${gameId}-selling`);
        
        // 結算賣出投標
        await processSellBids(currentDay[0]);
        
        // 獲取結算結果
        const [sellResults] = await db.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'sell'
             ORDER BY b.fish_type, b.price ASC`,
            [currentDay[0].id]
        );
        
        // 更新為 sell_ended 狀態 - 使用正確的 status 欄位
        await db.execute(
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

// 每日結算 (新版本 - 自動尋找 active 遊戲)
app.post('/api/admin/settle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // 自動尋找 active 或 pending 遊戲
        const [games] = await db.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '目前沒有正在進行中的遊戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '沒有可結算的天數' });
        }
        
        // 狀態檢查 - 必須是 selling_closed 狀態才能執行結算
        const dayStatus = currentDay[0].status;
        if (dayStatus !== 'selling_closed') {
            let errorMessage = '';
            switch (dayStatus) {
                case 'pending':
                    errorMessage = '請先完成當日的投標流程';
                    break;
                case 'buying_open':
                    errorMessage = '請先完成買入投標';
                    break;
                case 'buying_closed':
                    errorMessage = '請先完成賣出投標';
                    break;
                case 'selling_open':
                    errorMessage = '請先結束賣出投標';
                    break;
                case 'settled':
                    errorMessage = '當日已經結算完成';
                    break;
                default:
                    errorMessage = `當前狀態(${dayStatus})不允許執行結算`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        
        // 執行結算邏輯
        await enhancedDailySettlement(pool, gameId, currentDay[0].id, currentDay[0].day_number);
        
        // 更新狀態為 settled
        await db.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['settled', currentDay[0].id]
        );
        
        // 獲取結算後的團隊狀態
        const [updatedTeams] = await db.execute(
            `SELECT gp.*, u.team_name
             FROM game_participants gp
             JOIN users u ON gp.team_id = u.id
             WHERE gp.game_id = ?
             ORDER BY gp.current_budget DESC`,
            [gameId]
        );
        
        res.json({ 
            success: true, 
            message: '每日結算完成',
            gameId: gameId,
            dayNumber: currentDay[0].day_number,
            teams: updatedTeams
        });
        
        // 發送結算完成通知
        io.emit('phaseChange', { 
            gameId, 
            phase: 'settled',
            dayNumber: currentDay[0].day_number,
            message: '每日結算已完成',
            teams: updatedTeams
        });
        
        // 保持相容性
        io.emit('daySettled', { 
            gameId, 
            dayId: currentDay[0].id,
            dayNumber: currentDay[0].day_number,
            teams: updatedTeams
        });
        
    } catch (error) {
        console.error('每日結算錯誤:', error);
        res.status(500).json({ error: '每日結算失敗' });
    }
});

// 每日結算 (舊版本 - 保留相容性)
app.post('/api/admin/games/:gameId/settle', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await db.execute(
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
        await db.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['settled', currentDay[0].id]
        );
        
        if (currentDay[0].day_number === 7) {
            await db.execute(
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
        const [games] = await db.execute(
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
        const [game] = await db.execute(
            'SELECT * FROM games WHERE id = ? AND status IN ("active", "pending", "paused")',
            [gameId]
        );
        
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在或已結束' });
        }
        
        // 檢查是否已加入
        const [existing] = await db.execute(
            'SELECT * FROM game_participants WHERE game_id = ? AND team_id = ?',
            [gameId, teamId]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: '您已經加入此遊戲' });
        }
        
        // 檢查遊戲人數是否已滿
        const [participants] = await db.execute(
            'SELECT COUNT(*) as count FROM game_participants WHERE game_id = ?',
            [gameId]
        );
        
        if (participants[0].count >= game[0].num_teams) {
            return res.status(400).json({ error: '遊戲人數已滿' });
        }
        
        // 加入遊戲
        await db.execute(
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
    const teamNumber = parseInt(req.user.username); // 01, 02... 轉為數字
    const { teamName: customTeamName } = req.body;  // 從前端接收團隊名稱
    
    try {
        // 取得當前進行中的遊戲（最新的 active 狀態優先，其次是 pending）
        const [games] = await db.execute(
            `SELECT * FROM games 
             WHERE status IN ('active', 'pending') 
             ORDER BY 
                CASE status 
                    WHEN 'active' THEN 1 
                    WHEN 'pending' THEN 2 
                END, 
                created_at DESC 
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
        const [existing] = await db.execute(
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
                await db.execute(
                    'UPDATE games SET team_names = ? WHERE id = ?',
                    [JSON.stringify(teamNames), gameId]
                );
                
                // 更新 users 表中的 team_name
                await db.execute(
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
        const [participants] = await db.execute(
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
        await db.execute(
            `INSERT INTO game_participants (game_id, team_id, current_budget, total_loan, total_loan_principal)
             VALUES (?, ?, ?, 0, 0)`,
            [gameId, teamId, game.initial_budget]
        );
        
        // 處理團隊名稱
        const teamNames = JSON.parse(game.team_names || '{}');
        const finalTeamName = customTeamName?.trim() || teamNames[teamNumber] || `第${teamNumber}組`;
        teamNames[teamNumber] = finalTeamName;
        
        // 更新遊戲的團隊名稱記錄
        await db.execute(
            'UPDATE games SET team_names = ? WHERE id = ?',
            [JSON.stringify(teamNames), gameId]
        );
        
        // 更新 users 表中的 team_name
        await db.execute(
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
    const teamNumber = parseInt(req.user.username);
    const { gameId, newName } = req.body;
    
    if (!newName || newName.trim().length === 0) {
        return res.status(400).json({ error: '團隊名稱不能為空' });
    }
    
    if (newName.length > 20) {
        return res.status(400).json({ error: '團隊名稱不能超過20個字' });
    }
    
    try {
        // 檢查遊戲是否存在
        const [games] = await db.execute(
            'SELECT * FROM games WHERE id = ?',
            [gameId]
        );
        
        if (games.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        // 檢查團隊是否參與此遊戲
        const [participants] = await db.execute(
            'SELECT * FROM game_participants WHERE game_id = ? AND team_id = ?',
            [gameId, teamId]
        );
        
        if (participants.length === 0) {
            return res.status(403).json({ error: '您未參與此遊戲' });
        }
        
        // 取得並更新團隊名稱
        const teamNames = JSON.parse(games[0].team_names || '{}');
        teamNames[teamNumber] = newName.trim();
        
        await db.execute(
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
        // 獲取當前進行中或待開始的遊戲
        const [activeGames] = await db.execute(
            `SELECT * FROM games WHERE status IN ('active', 'pending') ORDER BY created_at DESC LIMIT 1`
        );
        
        if (activeGames.length === 0) {
            return res.status(404).json({ error: '目前沒有進行中的遊戲' });
        }
        
        const currentGame = activeGames[0];
        
        // 檢查團隊是否參與此遊戲
        const [participants] = await db.execute(
            `SELECT gp.*, g.* 
             FROM game_participants gp
             JOIN games g ON gp.game_id = g.id
             WHERE gp.team_id = ? AND g.id = ?`,
            [req.user.userId, currentGame.id]
        );
        
        if (participants.length === 0) {
            // 如果團隊編號在範圍內，自動加入
            const teamNumber = parseInt(req.user.username);
            if (!isNaN(teamNumber) && teamNumber >= 1 && teamNumber <= currentGame.num_teams) {
                await db.execute(
                    'INSERT INTO game_participants (game_id, team_id, current_budget) VALUES (?, ?, ?)',
                    [currentGame.id, req.user.userId, currentGame.initial_budget]
                );
                
                // 重新查詢
                const [newParticipants] = await db.execute(
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
        
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        const [dailyResults] = await db.execute(
            `SELECT dr.*, gd.day_number 
             FROM daily_results dr
             JOIN game_days gd ON dr.game_day_id = gd.id
             WHERE dr.team_id = ? AND gd.game_id = ?
             ORDER BY gd.day_number ASC`,
            [req.user.userId, currentGame.id]
        );
        
        // 獲取當天的投標記錄（包含成交數量）
        let todayBids = [];
        if (currentDay[0]) {
            const [bids] = await db.execute(
                `SELECT bid_type, fish_type, price, quantity_submitted, quantity_fulfilled, status 
                 FROM bids 
                 WHERE team_id = ? AND game_day_id = ?`,
                [req.user.userId, currentDay[0].id]
            );
            todayBids = bids;
        }
        
        res.json({
            gameInfo: {
                gameName: participant.game_name,
                currentDay: participant.current_day,
                status: participant.status,
                dayStatus: currentDay[0]?.status || 'pending',
                totalDays: participant.total_days
            },
            financials: {
                currentBudget: participant.current_budget,
                totalLoan: participant.total_loan,
                fishAInventory: participant.fish_a_inventory,
                fishBInventory: participant.fish_b_inventory
            },
            gameRules: {
                initialBudget: participant.initial_budget,
                loanInterestRate: participant.loan_interest_rate,
                unsoldFeePerKg: participant.unsold_fee_per_kg,
                distributorFloorPriceA: participant.distributor_floor_price_a,
                distributorFloorPriceB: participant.distributor_floor_price_b,
                targetPriceA: participant.target_price_a,
                targetPriceB: participant.target_price_b,
                fixedUnsoldRatio: participant.fixed_unsold_ratio
            },
            marketInfo: currentDay[0] ? {
                fishASupply: currentDay[0].fish_a_supply,
                fishBSupply: currentDay[0].fish_b_supply,
                fishABudget: currentDay[0].fish_a_restaurant_budget,
                fishBBudget: currentDay[0].fish_b_restaurant_budget
            } : null,
            history: dailyResults,
            todayBids: todayBids
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
        const [activeGames] = await db.execute(
            `SELECT g.*, gd.id as game_day_id, gd.day_number, gd.status
             FROM games g
             JOIN game_days gd ON g.id = gd.game_id AND g.current_day = gd.day_number
             WHERE g.status IN ('active', 'pending') AND gd.status = 'buying_open'
             ORDER BY g.created_at DESC LIMIT 1`
        );
        
        if (activeGames.length === 0) {
            return res.status(400).json({ error: '現在不是買入投標時間' });
        }
        
        const game = activeGames[0];
        const gameDayId = game.game_day_id;
        const gameId = game.id;
        const dayNumber = game.day_number;
        
        // 獲取團隊在遊戲中的狀態
        const [participant] = await db.execute(
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
        const bidsByType = { A: [], B: [] };
        
        if (buyBids && Array.isArray(buyBids)) {
            // 整理投標資料，支援每種魚最多兩個價格
            for (const bid of buyBids) {
                if (bid && bid.price > 0 && bid.quantity > 0) {
                    const fishType = bid.fish_type || bid.fishType;
                    
                    // 確保 fishType 是有效的 (A 或 B)
                    if (fishType !== 'A' && fishType !== 'B') {
                        console.error(`無效的魚種類型: ${fishType}`);
                        return res.status(400).json({ error: `無效的魚種類型: ${fishType}` });
                    }
                    
                    // 檢查當前提交中是否已達上限（每種魚最多2個價格）
                    if (bidsByType[fishType].length >= 2) {
                        console.log(`${fishType}級魚在本次提交中已有2個投標，跳過此投標`);
                        return res.status(400).json({ error: `${fishType}級魚最多只能提交2個不同價格的投標` });
                    }
                    
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
        
        // 檢查資金是否足夠（貸款不超過初始預算的50%）
        const currentBudget = teamData.current_budget || 0;
        const currentLoan = teamData.total_loan || 0;
        const initialBudget = game.initial_budget || 1000000;
        const maxTotalLoan = initialBudget * 0.5;  // 最大貸款為初始預算的50%
        
        // 計算可用資金（現金 + 可用貸款額度）
        const availableLoan = maxTotalLoan - currentLoan;
        const totalAvailableFunds = currentBudget + availableLoan;
        
        // 計算需要的貸款金額
        let loanNeeded = 0;
        if (totalBidAmount > currentBudget) {
            loanNeeded = totalBidAmount - currentBudget;
        }
        
        // 檢查總投標金額是否超過可用資金
        if (totalBidAmount > totalAvailableFunds) {
            return res.status(400).json({ 
                error: `投標總額 $${totalBidAmount.toFixed(2)} 超過可用資金 $${totalAvailableFunds.toFixed(2)}`,
                currentBudget: currentBudget,
                currentLoan: currentLoan,
                availableLoan: availableLoan,
                totalBidAmount: totalBidAmount,
                maxTotalLoan: maxTotalLoan
            });
        }
        
        // 注意：這裡不更新貸款，貸款將在買入結算時根據實際成交情況處理
        
        // 檢查是否已經提交過投標以及防止過於頻繁提交
        const [existingBids] = await db.execute(
            'SELECT COUNT(*) as count, MAX(created_at) as last_submission FROM bids WHERE game_day_id = ? AND team_id = ? AND bid_type = "buy"',
            [gameDayId, teamId]
        );
        const isUpdate = existingBids[0].count > 0;
        
        // 防止重複提交：如果在5秒內重新提交則拒絕
        if (existingBids[0].last_submission) {
            const lastSubmissionTime = new Date(existingBids[0].last_submission);
            const currentTime = new Date();
            const timeDiff = (currentTime - lastSubmissionTime) / 1000; // 秒
            
            if (timeDiff < 5) {
                return res.status(429).json({ 
                    error: `請勿重複提交，請等待${Math.ceil(5 - timeDiff)}秒後再試` 
                });
            }
        }
        
        // 開始交易：刪除舊的買入投標（允許覆蓋）
        await db.execute(
            'DELETE FROM bids WHERE game_day_id = ? AND team_id = ? AND bid_type = "buy"',
            [gameDayId, teamId]
        );
        
        // 新增投標記錄（根據正確的資料庫結構）
        for (const bid of processedBids) {
            await db.execute(
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
        
        // 如果需要借貸，更新借貸金額
        if (loanNeeded > 0) {
            await db.execute(
                `UPDATE game_participants 
                 SET total_loan = total_loan + ?,
                     total_loan_principal = total_loan_principal + ?
                 WHERE team_id = ? AND game_id = ?`,
                [loanNeeded, loanNeeded, teamId, gameId]
            );
        }
        
        res.json({ 
            success: true, 
            message: isUpdate ? '買入投標已更新（覆蓋前次提交）' : '買入投標已提交',
            isUpdate: isUpdate,
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
            phase: 'buying_open'
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
        const [activeGames] = await db.execute(
            `SELECT g.*, gd.id as game_day_id, gd.day_number, gd.status
             FROM games g
             JOIN game_days gd ON g.id = gd.game_id AND g.current_day = gd.day_number
             WHERE g.status IN ('active', 'pending') AND gd.status = 'selling_open'
             ORDER BY g.created_at DESC LIMIT 1`
        );
        
        if (activeGames.length === 0) {
            return res.status(400).json({ error: '現在不是賣出投標時間' });
        }
        
        const game = activeGames[0];
        const gameDayId = game.game_day_id;
        const gameId = game.id;
        const dayNumber = game.day_number;
        
        // 獲取團隊在遊戲中的狀態
        const [participant] = await db.execute(
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
        
        // 先收集所有有效的投標
        if (sellBids && Array.isArray(sellBids)) {
            for (const bid of sellBids) {
                if (bid && bid.price > 0 && bid.quantity > 0) {
                    const fishType = bid.fish_type || bid.fishType;
                    
                    if (bidsByType[fishType].length < 2) {
                        bidsByType[fishType].push({
                            fish_type: fishType,
                            price: bid.price,
                            quantity: bid.quantity,
                            price_index: bidsByType[fishType].length + 1,
                            total_bid_amount: bid.price * bid.quantity
                        });
                    }
                }
            }
        }
        
        // 驗證每種魚的總賣出數量必須等於庫存
        for (const fishType of ['A', 'B']) {
            const inventoryField = fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory';
            const currentInventory = teamData[inventoryField] || 0;
            const totalSubmitted = bidsByType[fishType].reduce((sum, b) => sum + b.quantity, 0);
            
            // 如果有庫存但沒有提交賣出投標
            if (currentInventory > 0 && totalSubmitted === 0) {
                return res.status(400).json({ 
                    error: `${fishType}級魚有庫存${currentInventory}kg但未提交賣出投標`,
                    fishType: fishType,
                    inventory: currentInventory,
                    submitted: 0
                });
            }
            
            // 如果賣出數量不等於庫存
            if (currentInventory > 0 && totalSubmitted !== currentInventory) {
                return res.status(400).json({ 
                    error: `${fishType}級魚賣出數量必須等於庫存`,
                    fishType: fishType,
                    inventory: currentInventory,
                    submitted: totalSubmitted,
                    message: totalSubmitted > currentInventory ? '賣出數量超過庫存' : '賣出數量少於庫存'
                });
            }
            
            // 將該魚種的投標加入處理列表
            processedBids.push(...bidsByType[fishType]);
        }
        
        // 檢查是否已經提交過投標以及防止過於頻繁提交
        const [existingBids] = await db.execute(
            'SELECT COUNT(*) as count, MAX(created_at) as last_submission FROM bids WHERE game_day_id = ? AND team_id = ? AND bid_type = "sell"',
            [gameDayId, teamId]
        );
        const isUpdate = existingBids[0].count > 0;
        
        // 防止重複提交：如果在5秒內重新提交則拒絕
        if (existingBids[0].last_submission) {
            const lastSubmissionTime = new Date(existingBids[0].last_submission);
            const currentTime = new Date();
            const timeDiff = (currentTime - lastSubmissionTime) / 1000; // 秒
            
            if (timeDiff < 5) {
                return res.status(429).json({ 
                    error: `請勿重複提交，請等待${Math.ceil(5 - timeDiff)}秒後再試` 
                });
            }
        }
        
        // 開始交易：刪除舊的賣出投標（允許覆蓋）
        await db.execute(
            'DELETE FROM bids WHERE game_day_id = ? AND team_id = ? AND bid_type = "sell"',
            [gameDayId, teamId]
        );
        
        // 新增投標記錄（根據正確的資料庫結構）
        for (const bid of processedBids) {
            await db.execute(
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
            message: isUpdate ? '賣出投標已更新（覆蓋前次提交）' : '賣出投標已提交',
            isUpdate: isUpdate,
            summary: {
                bidsSubmitted: processedBids.length,
                fishA: bidsByType.A.length,
                fishB: bidsByType.B.length,
                fishAInventory: teamData.fish_a_inventory || 0,
                fishBInventory: teamData.fish_b_inventory || 0
            }
        });
        
        // 通知所有連線的客戶端
        io.emit('bidsUpdated', { 
            gameId: game.id, 
            teamId: req.user.userId,
            phase: 'selling_open'
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
        const [days] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number ASC',
            [gameId]
        );
        
        const history = [];
        for (const day of days) {
            const [buyBids] = await db.execute(
                `SELECT b.*, u.team_name 
                 FROM bids b
                 JOIN users u ON b.team_id = u.id
                 WHERE b.game_day_id = ? AND b.bid_type = 'buy'
                 ORDER BY b.fish_type, b.price DESC`,
                [day.id]
            );
            
            const [sellBids] = await db.execute(
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
        const [dayInfo] = await db.execute(
            `SELECT * FROM game_days WHERE game_id = ? AND day_number = ?`,
            [gameId, day]
        );
        
        if (dayInfo.length === 0) {
            return res.status(404).json({ error: '找不到該天資料' });
        }
        
        // 獲取當日投標記錄
        const [bids] = await db.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_id = ? AND b.day_number = ?
             ORDER BY b.created_at`,
            [gameId, day]
        );
        
        // 獲取當日團隊結果
        const [teamResults] = await db.execute(
            `SELECT dr.*, u.team_name
             FROM daily_results dr
             JOIN users u ON dr.team_id = u.id
             WHERE dr.game_id = ? AND dr.day_number = ?
             ORDER BY dr.daily_profit DESC`,
            [gameId, day]
        );
        
        res.json({
            dayInfo: dayInfo[0],
            bids,
            teamResults
        });
    } catch (error) {
        console.error('獲取每日結果錯誤:', error);
        res.status(500).json({ error: '獲取每日結果失敗' });
    }
});

// 獲取競標結果統計 - 包含所有團隊投標明細、成交價格統計等
app.get('/api/admin/games/:gameId/day/:day/bid-summary', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId, day } = req.params;
    
    try {
        // 獲取當日遊戲資訊 - 使用正確的資料庫欄位名稱
        const [dayInfo] = await db.execute(
            `SELECT id, game_id, day_number, status, 
                    fish_a_supply, fish_b_supply,
                    fish_a_restaurant_budget, fish_b_restaurant_budget,
                    buy_start_time, buy_end_time, sell_start_time, sell_end_time
             FROM game_days 
             WHERE game_id = ? AND day_number = ?`,
            [gameId, day]
        );
        
        if (dayInfo.length === 0) {
            return res.status(404).json({ error: '找不到該天資料' });
        }
        
        const gameDayId = dayInfo[0].id;
        
        // 獲取所有投標明細 - 根據 bids 表正確結構
        const [allBids] = await db.execute(
            `SELECT b.id, b.game_id, b.game_day_id, b.team_id, b.day_number,
                    b.bid_type, b.fish_type, b.price, 
                    b.quantity_submitted, b.quantity_fulfilled,
                    b.status, b.created_at,
                    u.username, u.team_name
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? 
             ORDER BY b.bid_type, b.fish_type, 
                      CASE WHEN b.bid_type = 'buy' THEN b.price END DESC,
                      CASE WHEN b.bid_type = 'sell' THEN b.price END ASC,
                      b.created_at`,
            [gameDayId]
        );
        
        // 分離買入和賣出投標
        const buyBids = allBids.filter(b => b.bid_type === 'buy');
        const sellBids = allBids.filter(b => b.bid_type === 'sell');
        
        // 計算買入統計 - A魚和B魚分別統計
        const buyStatsA = calculateBuyStats(buyBids.filter(b => b.fish_type === 'A'));
        const buyStatsB = calculateBuyStats(buyBids.filter(b => b.fish_type === 'B'));
        
        // 計算賣出統計 - A魚和B魚分別統計
        const sellStatsA = calculateSellStats(sellBids.filter(b => b.fish_type === 'A'));
        const sellStatsB = calculateSellStats(sellBids.filter(b => b.fish_type === 'B'));
        
        // 獲取團隊分組統計
        const teamStats = await getTeamBidStats(gameDayId);
        
        // 獲取當日結算結果（如果已結算）
        let dailyResults = [];
        if (dayInfo[0].status === 'settled') {
            const [results] = await db.execute(
                `SELECT dr.id, dr.game_day_id, dr.team_id, dr.day_number,
                        dr.revenue, dr.cost, dr.unsold_fee, dr.interest_incurred,
                        dr.daily_profit, dr.cumulative_profit, dr.roi,
                        dr.closing_budget, dr.closing_loan,
                        u.username, u.team_name
                 FROM daily_results dr
                 JOIN users u ON dr.team_id = u.id
                 WHERE dr.game_day_id = ?
                 ORDER BY dr.roi DESC`,
                [gameDayId]
            );
            dailyResults = results;
        }
        
        res.json({
            dayInfo: {
                gameId: dayInfo[0].game_id,
                dayNumber: dayInfo[0].day_number,
                status: dayInfo[0].status,
                supply: {
                    fishA: dayInfo[0].fish_a_supply,
                    fishB: dayInfo[0].fish_b_supply
                },
                restaurantBudget: {
                    fishA: dayInfo[0].fish_a_restaurant_budget,
                    fishB: dayInfo[0].fish_b_restaurant_budget
                }
            },
            bidDetails: {
                buy: {
                    fishA: buyBids.filter(b => b.fish_type === 'A'),
                    fishB: buyBids.filter(b => b.fish_type === 'B')
                },
                sell: {
                    fishA: sellBids.filter(b => b.fish_type === 'A'),
                    fishB: sellBids.filter(b => b.fish_type === 'B')
                }
            },
            statistics: {
                buy: {
                    fishA: buyStatsA,
                    fishB: buyStatsB
                },
                sell: {
                    fishA: sellStatsA,
                    fishB: sellStatsB
                }
            },
            teamStats,
            dailyResults
        });
        
    } catch (error) {
        console.error('獲取競標結果統計錯誤:', error);
        res.status(500).json({ error: '獲取競標結果統計失敗' });
    }
});

// 計算買入投標統計
function calculateBuyStats(bids) {
    if (bids.length === 0) {
        return {
            totalBids: 0,
            totalQuantitySubmitted: 0,
            totalQuantityFulfilled: 0,
            lowestFulfilledPrice: null,
            highestFulfilledPrice: null,
            averageFulfilledPrice: null,
            fulfillmentRate: 0
        };
    }
    
    const fulfilledBids = bids.filter(b => b.quantity_fulfilled > 0);
    const totalSubmitted = bids.reduce((sum, b) => sum + b.quantity_submitted, 0);
    const totalFulfilled = bids.reduce((sum, b) => sum + (b.quantity_fulfilled || 0), 0);
    
    let stats = {
        totalBids: bids.length,
        totalQuantitySubmitted: totalSubmitted,
        totalQuantityFulfilled: totalFulfilled,
        lowestFulfilledPrice: null,
        highestFulfilledPrice: null,
        averageFulfilledPrice: null,
        fulfillmentRate: totalSubmitted > 0 ? (totalFulfilled / totalSubmitted * 100).toFixed(2) : 0
    };
    
    if (fulfilledBids.length > 0) {
        const prices = fulfilledBids.map(b => b.price);
        stats.lowestFulfilledPrice = Math.min(...prices);
        stats.highestFulfilledPrice = Math.max(...prices);
        
        // 加權平均價格
        const weightedSum = fulfilledBids.reduce((sum, b) => 
            sum + (b.price * b.quantity_fulfilled), 0);
        stats.averageFulfilledPrice = (weightedSum / totalFulfilled).toFixed(2);
    }
    
    return stats;
}

// 計算賣出投標統計
function calculateSellStats(bids) {
    if (bids.length === 0) {
        return {
            totalBids: 0,
            totalQuantitySubmitted: 0,
            totalQuantityFulfilled: 0,
            lowestFulfilledPrice: null,
            highestFulfilledPrice: null,
            averageFulfilledPrice: null,
            fulfillmentRate: 0,
            unsoldQuantity: 0,
            highestPriceUnsold: 0  // 新增：最高價滯銷數量
        };
    }
    
    const fulfilledBids = bids.filter(b => b.quantity_fulfilled > 0);
    const totalSubmitted = bids.reduce((sum, b) => sum + b.quantity_submitted, 0);
    const totalFulfilled = bids.reduce((sum, b) => sum + (b.quantity_fulfilled || 0), 0);
    
    // 計算2.5%固定滯銷：找出最高價投標並計算其2.5%滯銷量
    let highestPriceUnsold = 0;
    if (bids.length > 0) {
        const maxPrice = Math.max(...bids.map(b => b.price));
        const highPriceBids = bids.filter(b => b.price === maxPrice);
        
        // 每個最高價投標都有2.5%滯銷
        highestPriceUnsold = highPriceBids.reduce((sum, bid) => {
            return sum + Math.ceil(bid.quantity_submitted * 2.5 / 100);
        }, 0);
    }
    
    // 總滯銷量 = 所有未成交的量（包含2.5%固定滯銷 + 其他原因未成交）
    const unsoldQuantity = totalSubmitted - totalFulfilled;
    
    let stats = {
        totalBids: bids.length,
        totalQuantitySubmitted: totalSubmitted,
        totalQuantityFulfilled: totalFulfilled,
        lowestFulfilledPrice: null,
        highestFulfilledPrice: null,
        averageFulfilledPrice: null,
        fulfillmentRate: totalSubmitted > 0 ? (totalFulfilled / totalSubmitted * 100).toFixed(2) : 0,
        unsoldQuantity: unsoldQuantity,
        highestPriceUnsold: highestPriceUnsold  // 最高價2.5%固定滯銷量
    };
    
    if (fulfilledBids.length > 0) {
        const prices = fulfilledBids.map(b => b.price);
        stats.lowestFulfilledPrice = Math.min(...prices);
        stats.highestFulfilledPrice = Math.max(...prices);
        
        // 加權平均價格
        const weightedSum = fulfilledBids.reduce((sum, b) => 
            sum + (b.price * b.quantity_fulfilled), 0);
        stats.averageFulfilledPrice = (weightedSum / totalFulfilled).toFixed(2);
    }
    
    return stats;
}

// 獲取團隊投標統計
async function getTeamBidStats(gameDayId) {
    const [teamStats] = await db.execute(
        `SELECT 
            u.id as team_id,
            u.username,
            u.team_name,
            SUM(CASE WHEN b.bid_type = 'buy' AND b.fish_type = 'A' THEN b.quantity_fulfilled ELSE 0 END) as buy_a_fulfilled,
            SUM(CASE WHEN b.bid_type = 'buy' AND b.fish_type = 'B' THEN b.quantity_fulfilled ELSE 0 END) as buy_b_fulfilled,
            SUM(CASE WHEN b.bid_type = 'sell' AND b.fish_type = 'A' THEN b.quantity_fulfilled ELSE 0 END) as sell_a_fulfilled,
            SUM(CASE WHEN b.bid_type = 'sell' AND b.fish_type = 'B' THEN b.quantity_fulfilled ELSE 0 END) as sell_b_fulfilled,
            SUM(CASE WHEN b.bid_type = 'buy' THEN b.price * b.quantity_fulfilled ELSE 0 END) as total_buy_cost,
            SUM(CASE WHEN b.bid_type = 'sell' THEN b.price * b.quantity_fulfilled ELSE 0 END) as total_sell_revenue
         FROM users u
         LEFT JOIN bids b ON u.id = b.team_id AND b.game_day_id = ?
         WHERE u.role = 'team'
         GROUP BY u.id, u.username, u.team_name
         ORDER BY u.username`,
        [gameDayId]
    );
    
    return teamStats;
}

// 暫停遊戲
app.post('/api/admin/games/:gameId/pause', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [game] = await db.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        if (game[0].status !== 'active') {
            return res.status(400).json({ error: '只能暫停進行中的遊戲' });
        }
        
        await db.execute('UPDATE games SET status = "paused" WHERE id = ?', [gameId]);
        
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
        const [game] = await db.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        if (game[0].status !== 'paused') {
            return res.status(400).json({ error: '只能恢復暫停的遊戲' });
        }
        
        await db.execute('UPDATE games SET status = "active" WHERE id = ?', [gameId]);
        
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
        const [game] = await db.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        if (game[0].status === 'finished') {
            return res.status(400).json({ error: '遊戲已經結束' });
        }
        
        // 更新遊戲狀態為結束
        await db.execute('UPDATE games SET status = "finished" WHERE id = ?', [gameId]);
        
        // 記錄強制結束的原因和時間
        await db.execute(
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
    const { 
        status, 
        name, 
        dateFrom, 
        dateTo, 
        page = 1, 
        pageSize = 12 
    } = req.query;
    
    try {
        // 構建基礎查詢
        let whereClause = 'WHERE 1=1';
        const params = [];
        
        if (status && status !== '') {
            const dbStatus = status;
            whereClause += ' AND g.status = ?';
            params.push(dbStatus);
        }
        
        if (name && name.trim() !== '') {
            whereClause += ' AND g.name LIKE ?';
            params.push(`%${name.trim()}%`);
        }
        
        if (dateFrom) {
            whereClause += ' AND DATE(g.created_at) >= ?';
            params.push(dateFrom);
        }
        
        if (dateTo) {
            whereClause += ' AND DATE(g.created_at) <= ?';
            params.push(dateTo);
        }
        
        // 計算總數
        const countQuery = `
            SELECT COUNT(DISTINCT g.id) as total
            FROM games g
            ${whereClause}
        `;
        
        const [countResult] = await db.execute(countQuery, params);
        const totalGames = countResult[0].total;
        const totalPages = Math.ceil(totalGames / pageSize);
        
        // 獲取遊戲資料（帶分頁）
        const offset = (page - 1) * pageSize;
        const gamesQuery = `
            SELECT g.id as game_id,
                   g.name,
                   g.status,
                   g.current_day,
                   g.total_days,
                   g.num_teams,
                   g.created_at,
                   g.updated_at,
                   CASE WHEN g.status = 'finished' THEN g.updated_at ELSE NULL END as ended_at
            FROM games g
            ${whereClause}
            ORDER BY g.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const [games] = await db.execute(gamesQuery, [...params, parseInt(pageSize), offset]);
        
        // 為每個遊戲獲取排名資料
        const gamesWithRankings = await Promise.all(games.map(async (game) => {
            if (game.status === 'finished') {
                // 獲取最終排名
                const rankingQuery = `
                    SELECT u.team_name, u.username, dr.roi, dr.cumulative_profit
                    FROM daily_results dr
                    JOIN game_days gd ON dr.game_day_id = gd.id
                    JOIN users u ON dr.team_id = u.id
                    WHERE gd.game_id = ? AND gd.day_number = ?
                    ORDER BY dr.roi DESC
                    LIMIT 3
                `;
                
                const [rankings] = await db.execute(rankingQuery, [game.game_id, game.current_day]);
                game.final_rankings = rankings.map(rank => ({
                    team_name: rank.team_name || `團隊${rank.username}`,
                    roi: rank.roi || 0,
                    profit: rank.cumulative_profit || 0
                }));
            } else {
                game.final_rankings = [];
            }
            
            return game;
        }));
        
        res.json({
            games: gamesWithRankings,
            currentPage: parseInt(page),
            totalPages: totalPages,
            totalGames: totalGames,
            pageSize: parseInt(pageSize)
        });
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
        const [game] = await db.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        // 獲取所有參與團隊
        const [teams] = await db.execute(
            `SELECT gp.*, u.team_name
             FROM game_participants gp
             JOIN users u ON gp.team_id = u.id
             WHERE gp.game_id = ?`,
            [gameId]
        );
        
        // 獲取每日數據
        const [dailyData] = await db.execute(
            `SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number`,
            [gameId]
        );
        
        // 獲取最終排名
        const [finalRanking] = await db.execute(
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
        const [game] = await db.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '遊戲不存在' });
        }
        
        const [results] = await db.execute(
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
        
        console.log(`處理${fishType}級魚買入投標：供給量=${supply}, 底價=${floorPrice}`);
        
        const [bids] = await connection.execute(
            `SELECT * FROM bids 
             WHERE game_day_id = ? AND bid_type = 'buy' AND fish_type = ?
             ORDER BY price DESC, created_at ASC`,
            [gameDay.id, fishType]
        );
        
        console.log(`${fishType}級魚買入投標數量: ${bids.length}`);
        
        for (const bid of bids) {
            console.log(`處理${fishType}級魚投標: 團隊${bid.team_id}, 價格${bid.price}, 數量${bid.quantity_submitted}`);
            
            if (bid.price < floorPrice) {
                console.log(`價格${bid.price}低於底價${floorPrice}，標記為失敗`);
                await connection.execute(
                    'UPDATE bids SET status = "failed" WHERE id = ?',
                    [bid.id]
                );
                continue;
            }
            
            if (remainingSupply <= 0) {
                console.log(`供應量已用完，標記為失敗`);
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
            
            console.log(`成交${fulfilledQuantity}kg，狀態：${status}，剩餘供應：${remainingSupply}`);
            
            await connection.execute(
                'UPDATE bids SET quantity_fulfilled = ?, status = ? WHERE id = ?',
                [fulfilledQuantity, status, bid.id]
            );
            
            if (fulfilledQuantity > 0) {
                const totalCost = fulfilledQuantity * bid.price;
                
                // 檢查並處理借貸
                const [participant] = await connection.execute(
                    'SELECT * FROM game_participants WHERE game_id = ? AND team_id = ?',
                    [gameDay.game_id, bid.team_id]
                );
                
                if (participant[0].current_budget < totalCost) {
                    const loanNeeded = totalCost - participant[0].current_budget;
                    await connection.execute(
                        `UPDATE game_participants 
                         SET total_loan = total_loan + ?,
                             total_loan_principal = total_loan_principal + ?,
                             current_budget = current_budget + ?
                         WHERE game_id = ? AND team_id = ?`,
                        [loanNeeded, loanNeeded, loanNeeded, gameDay.game_id, bid.team_id]
                    );
                }
                
                // 扣除成本並增加庫存
                await connection.execute(
                    `UPDATE game_participants 
                     SET current_budget = current_budget - ?,
                         ${fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory'} = 
                         ${fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory'} + ?
                     WHERE game_id = ? AND team_id = ?`,
                    [totalCost, fulfilledQuantity, gameDay.game_id, bid.team_id]
                );
                
                // 記錄交易到 transactions 表 - 使用正確的欄位名稱
                // 根據 SQL，transactions 表有: game_id, game_day_id, day_number, team_id, 
                // transaction_type, fish_type, price, quantity, total_amount
                await connection.execute(
                    `INSERT INTO transactions 
                     (game_id, game_day_id, day_number, team_id, transaction_type, fish_type, price, quantity, total_amount)
                     VALUES (?, ?, ?, ?, 'buy', ?, ?, ?, ?)`,
                    [gameDay.game_id, gameDay.id, gameDay.day_number, bid.team_id, fishType, bid.price, fulfilledQuantity, totalCost]
                );
            }
        }
        
        console.log(`${fishType}級魚買入投標處理完成，剩餘供給量: ${remainingSupply}`);
    }
    
    // 提交事務
    await connection.commit();
    console.log('買入投標處理完成');
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
            'SELECT unsold_fee_per_kg FROM games WHERE id = ?',
            [gameDay.game_id]
        );
        const fixedUnsoldRatio = 2.5; // 固定2.5%滯銷比例
        const unsoldFeePerKg = gameInfo[0].unsold_fee_per_kg || 10;
        
        console.log(`處理賣出投標 - 固定滯銷比例: ${fixedUnsoldRatio}%`);
        
        for (const fishType of ['A', 'B']) {
            // 根據資料庫結構使用正確的欄位名稱
            const budget = fishType === 'A' ? gameDay.fish_a_restaurant_budget : gameDay.fish_b_restaurant_budget;
            let remainingBudget = Number(budget);
            
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
            const highPriceBids = allBids.filter(bid => bid.price === maxPrice)
                                         .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // 晚出價者優先
            
            // 為每個最高價投標計算各自的2.5%滯銷
            const unsoldAllocation = new Map();
            let totalUnsoldQuantity = 0;
            
            for (const bid of highPriceBids) {
                // 每個最高價投標都有2.5%滯銷
                const bidUnsold = Math.ceil(bid.quantity_submitted * fixedUnsoldRatio / 100);
                unsoldAllocation.set(bid.id, bidUnsold);
                totalUnsoldQuantity += bidUnsold;
                console.log(`團隊${bid.team_id}最高價投標：${bid.quantity_submitted}kg，滯銷${bidUnsold}kg`);
            }
            
            console.log(`${fishType}級魚：最高價${maxPrice}，總滯銷${totalUnsoldQuantity}kg`);
            
            // 步驟2：處理所有投標（價低者得，最高價部分滯銷）
            for (const bid of allBids) {
                if (remainingBudget <= 0) {
                    // 預算不足，標記為失敗
                    await connection.execute(
                        'UPDATE bids SET quantity_fulfilled = 0, status = "failed" WHERE id = ?',
                        [bid.id]
                    );
                    continue;
                }
                
                let availableQuantity = bid.quantity_submitted;
                
                // 如果是最高價投標，需要扣除滯銷數量
                if (bid.price === maxPrice && unsoldAllocation.has(bid.id)) {
                    const bidUnsoldQuantity = unsoldAllocation.get(bid.id);
                    availableQuantity = bid.quantity_submitted - bidUnsoldQuantity;
                    
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
                const maxAffordableQuantity = Math.floor(remainingBudget / bid.price);
                const fulfilledQuantity = Math.min(availableQuantity, maxAffordableQuantity);
                const totalRevenue = fulfilledQuantity * bid.price;
                
                if (fulfilledQuantity > 0) {
                    remainingBudget -= totalRevenue;
                    
                    // 判斷狀態：如果有滯銷，即使全部售出也算部分成交
                    let bidStatus;
                    if (bid.price === maxPrice && unsoldAllocation.has(bid.id)) {
                        // 最高價有滯銷，最多只能是部分成交
                        bidStatus = 'partial';
                    } else {
                        // 非最高價，根據實際成交數量判斷
                        bidStatus = fulfilledQuantity === bid.quantity_submitted ? 'fulfilled' : 'partial';
                    }
                    
                    // 更新投標記錄
                    await connection.execute(
                        'UPDATE bids SET quantity_fulfilled = ?, status = ? WHERE id = ?',
                        [fulfilledQuantity, bidStatus, bid.id]
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
                    
                    // 記錄交易到 transactions 表 - 使用正確的欄位名稱
                    await connection.execute(
                        `INSERT INTO transactions 
                         (game_id, game_day_id, day_number, team_id, transaction_type, fish_type, price, quantity, total_amount)
                         VALUES (?, ?, ?, ?, 'sell', ?, ?, ?, ?)`,
                        [gameDay.game_id, gameDay.id, gameDay.day_number, bid.team_id, fishType, bid.price, fulfilledQuantity, totalRevenue]
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
            
            // 根據新規則：每日結束庫存歸零（不論有沒有賣出）
            const newFishAInventory = 0;
            const newFishBInventory = 0;
            
            // 3.7 計算利息（使用複利）
            const interestIncurred = currentLoan.times(loanInterestRate);
            const newTotalLoan = currentLoan.plus(interestIncurred);
            
            // 3.8 計算新預算（扣除利息）
            let newBudget = currentBudget.plus(totalRevenue).minus(totalCost).minus(unsoldFee).minus(interestIncurred);
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
            
            // 3.12 更新 game_participants 表
            await connection.execute(
                `UPDATE game_participants 
                 SET current_budget = ?,
                     total_loan = ?,
                     total_loan_principal = ?,
                     fish_a_inventory = ?,
                     fish_b_inventory = ?,
                     cumulative_profit = ?
                 WHERE id = ?`,
                [
                    newBudget.toFixed(2),
                    finalTotalLoan.toFixed(2),
                    newLoanPrincipal.toFixed(2),
                    newFishAInventory,
                    newFishBInventory,
                    cumulativeProfit.toFixed(2),
                    participant.id
                ]
            );
            
            // 3.13 插入 daily_results 記錄 - 使用正確的資料庫欄位名稱
            // 根據 fishmarket_game_latest.sql，daily_results 表的正確欄位是：
            // game_id, game_day_id, day_number, team_id,
            // revenue, cost, unsold_fee, interest_incurred,
            // daily_profit, cumulative_profit, roi, closing_budget, closing_loan
            
            await connection.execute(
                `INSERT INTO daily_results (
                    game_id, game_day_id, day_number, team_id,
                    revenue, cost, unsold_fee, interest_incurred,
                    daily_profit, cumulative_profit, roi,
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
        const [game] = await db.execute(
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
        await db.execute(
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
        const [game] = await db.execute(
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
        await db.execute(
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
    
    const connection = await db.getConnection();
    
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
        // MySQL 不支持在 UPDATE 中直接使用 ORDER BY LIMIT，需要用子查詢
        await connection.execute(
            `UPDATE daily_results 
             SET roi = ? 
             WHERE id = (
                SELECT id FROM (
                    SELECT id FROM daily_results 
                    WHERE team_id = ? 
                    ORDER BY id DESC 
                    LIMIT 1
                ) AS tmp
             )`,
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

// New APIs for student interface - Get real-time game status
app.get('/api/game/status', async (req, res) => {
    try {
        // Find the current active or pending game
        const [games] = await db.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.json({ 
                gameActive: false, 
                message: '目前沒有進行中的遊戲' 
            });
        }
        
        const game = games[0];
        
        // Get current day information
        const [currentDay] = await db.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [game.id]
        );
        
        if (currentDay.length === 0) {
            return res.json({
                gameActive: true,
                gameId: game.id,
                gameName: game.game_name,
                dayNumber: 0,
                phase: 'pending',
                endTime: null
            });
        }
        
        const day = currentDay[0];
        let phase = 'pending';
        let endTime = null;
        
        // Determine phase based on status
        switch (day.status) {
            case 'buying_open':
                phase = 'buying';
                // Use buy_end_time if available, otherwise use end_time, or calculate from timestamps
                if (day.buy_end_time) {
                    endTime = new Date(day.buy_end_time).toISOString();
                } else if (day.end_time && day.start_time) {
                    // Use the game's general end_time if available
                    endTime = new Date(day.end_time).toISOString();
                } else {
                    endTime = null; // Let frontend handle this case
                }
                break;
            case 'selling_open':
                phase = 'selling';
                // Use sell_end_time if available, otherwise use end_time, or calculate from timestamps
                if (day.sell_end_time) {
                    endTime = new Date(day.sell_end_time).toISOString();
                } else if (day.end_time && day.start_time) {
                    // Use the game's general end_time if available  
                    endTime = new Date(day.end_time).toISOString();
                } else {
                    endTime = null; // Let frontend handle this case
                }
                break;
            case 'buying_closed':
                phase = 'buy_ended';
                break;
            case 'selling_closed':
                phase = 'sell_ended';
                break;
            case 'settled':
                phase = 'settled';
                break;
            default:
                phase = 'pending';
        }
        
        res.json({
            gameActive: true,
            gameId: game.id,
            gameName: game.game_name,
            dayNumber: day.day_number,
            phase: phase,
            endTime: endTime,
            status: day.status
        });
        
    } catch (error) {
        console.error('Error getting game status:', error);
        res.status(500).json({ 
            error: '獲取遊戲狀態失敗' 
        });
    }
});

// New API for student interface - Get anonymous bid history
app.get('/api/game/bid-history', async (req, res) => {
    try {
        // Find the current active game
        const [games] = await db.execute(
            'SELECT * FROM games WHERE status = ? ORDER BY created_at DESC LIMIT 1',
            ['active']
        );
        
        if (games.length === 0) {
            return res.json({ 
                success: false, 
                message: '目前沒有進行中的遊戲',
                history: []
            });
        }
        
        const game = games[0];
        
        // Get all completed bid history (anonymized)
        const [bidHistory] = await db.execute(
            `SELECT 
                gd.day_number,
                b.bid_type,
                b.fish_type,
                b.price,
                b.quantity_submitted,
                b.quantity_fulfilled,
                b.status
             FROM bids b
             JOIN game_days gd ON b.game_day_id = gd.id
             WHERE gd.game_id = ? AND gd.status = 'settled'
             ORDER BY gd.day_number DESC, b.bid_type, b.fish_type, b.price DESC`,
            [game.id]
        );
        
        // Group data by day and type for easier frontend consumption
        const groupedHistory = {};
        bidHistory.forEach(bid => {
            const key = `${bid.day_number}_${bid.bid_type}`;
            if (!groupedHistory[key]) {
                groupedHistory[key] = {
                    dayNumber: bid.day_number,
                    bidType: bid.bid_type,
                    bids: []
                };
            }
            groupedHistory[key].bids.push({
                fishType: bid.fish_type,
                price: bid.price,
                quantity: bid.quantity_submitted,
                fulfilled: bid.quantity_fulfilled,
                status: bid.status,
                successful: bid.status === 'fulfilled' || (bid.status === 'partial' && bid.quantity_fulfilled > 0)
            });
        });
        
        res.json({
            success: true,
            gameId: game.id,
            gameName: game.game_name,
            history: Object.values(groupedHistory)
        });
        
    } catch (error) {
        console.error('Error getting bid history:', error);
        res.status(500).json({ 
            error: '獲取投標歷史失敗' 
        });
    }
});

const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`伺服器運行在 http://0.0.0.0:${PORT}`);
        console.log(`可從網路訪問: http://192.168.1.104:${PORT}`);
    });
});