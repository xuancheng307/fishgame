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

// 設�? Decimal.js 精度
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ?�設?�戲?�數
let defaultGameParameters = {
    initialBudget: 1000000,
    loanInterestRate: 0.03,
    maxLoanRatio: 0.50,          // ?�大貸款�?例�?50%�?
    unsoldFeePerKg: 10,
    fixedUnsoldRatio: 2.50,      // ?��?滯銷比�?�?.5%�?
    distributorFloorPriceA: 100,
    targetPriceA: 150,
    distributorFloorPriceB: 100,
    targetPriceB: 120,
    numTeams: 10,                // ?��??��??��?
    totalDays: 7,
    buyingDuration: 7,           // ?��?
    sellingDuration: 4           // ?��?
};

app.use(cors());
app.use(express.json());
// Serve static frontend from bundled webroot (copied for deployment)
app.use(express.static(path.join(__dirname, 'webroot')));

let pool;

// 計�??�管??
const timers = new Map(); // ?��?每個�??��?計�???

// ?��?計�??�函??
function startTimer(gameId, duration, callback) {
    // 清除?��?計�???
    if (timers.has(gameId)) {
        clearInterval(timers.get(gameId).interval);
    }
    
    const endTime = Date.now() + duration * 1000; // duration ?��???
    
    const interval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        
        // �?��?��??��?給�??�客?�端
        io.emit('timer', { 
            gameId: gameId,
            remaining: remaining 
        });
        
        if (remaining <= 0) {
            clearInterval(interval);
            timers.delete(gameId);
            if (callback) callback();
        }
    }, 1000); // 每�??�新一�?
    
    timers.set(gameId, { interval, endTime });
    
    // 立即?�送第一次更??
    io.emit('timer', { 
        gameId: gameId,
        remaining: Math.floor(duration) 
    });
}

// ?�止計�???
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
        // 使用連接池支援多併發
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fishmarket_game',
            port: process.env.DB_PORT || 3306,
            charset: 'utf8mb4',
            multipleStatements: true,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        });

        // 測試連接
        connection = await pool.getConnection();
        console.log('資料庫連接成功');

        // 資料庫結構已由 complete_database_structure.sql 建立
        // 建立管理員帳號
        const [adminExists] = await connection.execute(
            'SELECT id FROM users WHERE username = ? AND role = "admin"',
            ['admin']
        );

        if (adminExists.length === 0) {
            const hashedPassword = await bcrypt.hash('123', 10);
            await connection.execute(
                'INSERT INTO users (username, password_hash, plain_password, role) VALUES (?, ?, ?, ?)',
                ['admin', hashedPassword, '123', 'admin']
            );
            console.log('管理員帳號 admin 已建立 - 密碼: 123');
        }

        // 自動建立10個學生帳號（01-10）
        for (let i = 1; i <= 10; i++) {
            const username = String(i).padStart(2, '0');
            const [teamExists] = await connection.execute(
                'SELECT id FROM users WHERE username = ? AND role = "team"',
                [username]
            );

            if (teamExists.length === 0) {
                const hashedPassword = await bcrypt.hash(username, 10);
                await connection.execute(
                    'INSERT INTO users (username, password_hash, plain_password, team_name, role) VALUES (?, ?, ?, ?, ?)',
                    [username, hashedPassword, username, `第${i}組`, 'team']
                );
                console.log(`學生帳號 ${username} 已建立 - 密碼: ${username}`);
            }
        }

        // 釋放連接回連接池
        connection.release();
        console.log('資料庫初始化完成');

    } catch (error) {
        console.error('資料庫初始化失敗:', error);
        if (connection) connection.release();
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
        return res.status(403).json({ error: '?�要管?�員權�?' });
    }
    next();
}

// 網路資�? API
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

// QR Code ?��? API
app.get('/api/qr/:gameId', async (req, res) => {
    const { gameId } = req.params;
    
    try {
        // ?��??�戲資�?
        const [games] = await pool.execute(
            'SELECT name FROM games WHERE id = ?',
            [gameId]
        );

        if (games.length === 0) {
            return res.status(404).json({ error: '?�戲不�??? });
        }

        // ?��?網路 IP
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

        // ?��??�戲???
        const gameUrl = `http://${serverIP}:${process.env.PORT || 3000}/team?gameId=${gameId}`;
        
        // ?��? QR Code
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
            gameName: games[0].name,
            gameUrl,
            qrCode: qrCodeDataURL,
            serverIP,
            port: process.env.PORT || 3000
        });

    } catch (error) {
        console.error('?��? QR Code ?�誤:', error);
        res.status(500).json({ error: '?��? QR Code 失�?' });
    }
});

// ?�入
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: '?�戶?��?密碼?�誤' });
        }
        
        const user = users[0];
        
        // 使用 plain_password 欄�??��?簡單比�?（課?��??��?
        const validPassword = (user.plain_password && password === user.plain_password) || 
                             await bcrypt.compare(password, user.password_hash || '');
        
        if (!validPassword) {
            return res.status(401).json({ error: '?�戶?��?密碼?�誤' });
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
            user: {                       // 給�?端�?待�? user ?�件
                username: user.username,
                role: user.role,
                teamName: user.team_name
            }
        });
    } catch (error) {
        console.error('?�入?�誤:', error);
        res.status(500).json({ error: '?�入失�?' });
    }
});

// 驗�? Token API
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    // req.user 來自 JWT（在 login ?�已簽入 userId/username/role�?
    return res.json({
        user: {
            username: req.user.username,
            role: req.user.role
        }
    });
});

// ?�建?�戲（改?��?�?
app.post('/api/admin/games/create', authenticateToken, requireAdmin, async (req, res) => {
    // ?�容 snake_case ??camelCase
    const b = req.body;
    console.log('Received game creation request:', b);
    
    const gameName = b.gameName ?? b.name;
    const initialBudget = b.initialBudget ?? b.initial_budget;
    const loanInterestRate = b.loanInterestRate ?? b.loan_interest_rate;
    const maxLoanRatio = b.maxLoanRatio ?? b.max_loan_ratio;
    const unsoldFeePerKg = b.unsoldFeePerKg ?? b.unsold_fee_per_kg;
    const fixedUnsoldRatio = b.fixedUnsoldRatio ?? b.fixed_unsold_ratio;
    const distributorFloorPriceA = b.distributorFloorPriceA ?? b.distributor_floor_price_a ?? 100;
    const distributorFloorPriceB = b.distributorFloorPriceB ?? b.distributor_floor_price_b ?? 100;
    const targetPriceA = b.targetPriceA ?? b.target_price_a;
    const targetPriceB = b.targetPriceB ?? b.target_price_b;
    const numTeams = b.numTeams ?? b.num_teams;
    const totalDays = b.totalDays ?? b.total_days;
    
    console.log('Parsed parameters:', {
        gameName, initialBudget, loanInterestRate, maxLoanRatio, unsoldFeePerKg,
        fixedUnsoldRatio, distributorFloorPriceA, distributorFloorPriceB,
        targetPriceA, targetPriceB, numTeams, totalDays
    });
    
    try {
        // 結�??�?�進�?中�?待�?始�??�戲
        await pool.execute(
            `UPDATE games SET status = 'completed' WHERE status IN ('active', 'pending')`
        );
        
        const teamCount = numTeams || 12;
        
        // ?�建?��??��?使用?�設?�數?�自定義?�數�?
        const [result] = await pool.execute(
            `INSERT INTO games (
                name, initial_budget, loan_interest_rate, max_loan_ratio,
                unsold_fee_per_kg, fixed_unsold_ratio, distributor_floor_price_a, distributor_floor_price_b,
                target_price_a, target_price_b, num_teams, total_days
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                gameName,
                initialBudget ?? defaultGameParameters.initialBudget,
                loanInterestRate ?? defaultGameParameters.loanInterestRate,
                maxLoanRatio ?? defaultGameParameters.maxLoanRatio,
                unsoldFeePerKg ?? defaultGameParameters.unsoldFeePerKg,
                fixedUnsoldRatio ?? defaultGameParameters.fixedUnsoldRatio,
                distributorFloorPriceA ?? defaultGameParameters.distributorFloorPriceA,
                distributorFloorPriceB ?? defaultGameParameters.distributorFloorPriceB,
                targetPriceA ?? defaultGameParameters.targetPriceA,
                targetPriceB ?? defaultGameParameters.targetPriceB,
                teamCount,
                totalDays ?? defaultGameParameters.totalDays
            ]
        );
        
        const gameId = result.insertId;
        
        // 設�???pending ?�?��?�?�?
        await pool.execute(
            'UPDATE games SET status = "pending", current_day = 1 WHERE id = ?',
            [gameId]
        );
        
        // ?��??�建�?天�?記�?
        const baselineSupplyA = teamCount * 150;
        const baselineSupplyB = teamCount * 300;
        const baselineBudgetA = baselineSupplyA * (targetPriceA || 150);
        const baselineBudgetB = baselineSupplyB * (targetPriceB || 120);
        
        // �?天使?��?準�???
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
        
        console.log(`?�戲 ${gameName} ?�建?��?，ID: ${gameId}，已?�入�?天�?等�?學�??�入`);
        
        // ?��?伺�??�IP?��?
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
            message: `?�戲?�建?��?！\n已自?�進入�?天\n請通知學�??�入並�??��??�\n學�??�入後即?��?始買?��?標`,
            numTeams: teamCount,
            gameName: gameName,
            day: 1,
            fishASupply: fishASupply,
            fishBSupply: fishBSupply,
            gameUrl: gameUrl,
            serverIP: serverIP,
            port: port
        });
        
        // ?�知?�?��???�客?�端
        io.emit('gameUpdate', { event: 'newGameCreated', gameId });
        
    } catch (error) {
        console.error('?�建?�戲?�誤:', error);
        console.error('?�誤詳�?:', error.message);
        console.error('?�誤?��?:', error.stack);
        res.status(500).json({ error: '?�建?�戲失�?: ' + error.message });
    }
});

// ?��??�戲?�表
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
        console.error('?��??�戲?�表?�誤:', error);
        res.status(500).json({ error: '?��??�戲?�表失�?' });
    }
});

// ?��??��??��???active ?�戲
app.get('/api/admin/active-game', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // ?�詢?��? active ??pending ?��???(?��? active)
        const [games] = await pool.execute(
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
                error: '?��?沒�?�?��?��?中�??�戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        
        // ?��??��??��???
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [game.id]
        );
        
        // ?��??�?��??�者�?�?(使用 LEFT JOIN 以�??��??��??�者�??��?)
        let participants = [];
        try {
            const [result] = await pool.execute(`
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
        
        // 組�?完整?��??��???
        const activeGameData = {
            ...game,
            gameId: game.id,
            gameName: game.name,
            currentDayData: currentDay.length > 0 ? currentDay[0] : null,
            teams: participants,
            totalDays: game.total_days,
            currentDay: game.current_day,
            phase: currentDay.length > 0 ? currentDay[0].status : 'pending'
        };
        
        res.json(activeGameData);
        
    } catch (error) {
        console.error('?��? active ?�戲?�誤:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            error: '?��??�戲?�?�失??,
            details: error.message 
        });
    }
});

// ?��??��??�戲?�??
app.get('/api/admin/games/:gameId/status', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [game] = await pool.execute(`
            SELECT g.*, 
                   gd.status as status,
                   gd.day_number
            FROM games g
            LEFT JOIN game_days gd ON g.id = gd.game_id 
                AND gd.day_number = g.current_day
            WHERE g.id = ?
        `, [gameId]);
        
        if (game.length === 0) {
            return res.status(404).json({ error: '?�戲不�??? });
        }
        
        res.json(game[0]);
    } catch (error) {
        console.error('?��??�戲?�?�錯�?', error);
        res.status(500).json({ error: '?��??�戲?�?�失?? });
    }
});

// ?��??�戲?��??�??
app.get('/api/admin/games/:gameId/teams', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [teams] = await pool.execute(`
            SELECT gp.*, t.username, t.team_name
            FROM game_participants gp
            JOIN users t ON gp.team_id = t.id
            WHERE gp.game_id = ?
            ORDER BY gp.cumulative_profit DESC
        `, [gameId]);
        
        res.json(teams);
    } catch (error) {
        console.error('?��??��??�?�錯�?', error);
        res.status(500).json({ error: '?��??��??�?�失?? });
    }
});

// ?��?伺�??��??��??��??��??�??
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
        console.error('?��?計�??��??�錯�?', error);
        res.status(500).json({ error: '?��?計�??��??�失?? });
    }
});

// ?��??��??��?資�?
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
        console.error('?��??��?資�??�誤:', error);
        res.status(500).json({ error: '?��??��?資�?失�?' });
    }
});

// ?��??��?天數?��?標�???
app.get('/api/admin/games/:gameId/bids/:day', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId, day } = req.params;
    const { type } = req.query; // 'buy' or 'sell'
    
    try {
        // ?��??��?天數??game_day
        const [gameDays] = await pool.execute(
            'SELECT id FROM game_days WHERE game_id = ? AND day_number = ?',
            [gameId, day]
        );
        
        if (gameDays.length === 0) {
            return res.status(404).json({ error: '?��??�該天�??? });
        }
        
        const dayId = gameDays[0].id;
        
        // 構建?�詢條件
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
        const [bids] = await pool.execute(query, params);
        
        // ?��?結�?
        const buyBids = bids.filter(bid => bid.bid_type === 'buy');
        const sellBids = bids.filter(bid => bid.bid_type === 'sell');
        
        res.json({
            day: parseInt(day),
            buyBids,
            sellBids,
            requestedType: type || 'all'
        });
    } catch (error) {
        console.error('?��?歷史?��?資�??�誤:', error);
        res.status(500).json({ error: '?��??��?資�?失�?' });
    }
});

// ?�進天?��??�自訂�??��?
// ?�進天?��??��???- ?��?尋找 active ?�戲�?
app.post('/api/admin/advance-day', authenticateToken, requireAdmin, async (req, res) => {
    const { params } = req.body;
    
    try {
        // ?��?尋找?��? active ?�戲
        const [games] = await pool.execute('SELECT * FROM games WHERE status = ? LIMIT 1', ['active']);
        if (games.length === 0) {
            return res.status(404).json({ error: '?��?沒�?�?��?��?中�??�戲', code: 'NO_ACTIVE_GAME' });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        // 檢查?��??�是?�已結�?（�??��?驗�?�?
        const [currentDayData] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? AND day_number = ?', 
            [gameId, game.current_day]
        );
        
        if (currentDayData.length > 0 && currentDayData[0].status !== 'completed') {
            return res.status(400).json({
                error: '請�?完�??�日?��??��?段�?買入?�賣?�、�?算�?',
                currentPhase: currentDayData[0].status
            });
        }
        
        const nextDay = game.current_day + 1;
        if (nextDay > game.total_days) {
            // ?�戲結�?
            await pool.execute('UPDATE games SET status = "completed" WHERE id = ?', [gameId]);
            return res.json({ message: '?�戲已�???, gameCompleted: true });
        }
        
        // �???�數（兼�?camelCase ??snake_case�?
        const p = params || {};
        let fishASupply = p.fishASupply ?? p.fish_a_supply;
        let fishBSupply = p.fishBSupply ?? p.fish_b_supply;
        let fishABudget = p.fishABudget ?? p.fish_a_budget ?? p.fish_a_restaurant_budget;
        let fishBBudget = p.fishBBudget ?? p.fish_b_budget ?? p.fish_b_restaurant_budget;
        
        // 如�?沒�??��??�數，使?�系統自?��???
        if (!fishASupply || !fishBSupply || !fishABudget || !fishBBudget) {
            const teamCount = game.num_teams || 12;
            const baselineSupplyA = teamCount * 150;
            const baselineSupplyB = teamCount * 300;
            
            // ?��?天數調整係數
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
        
        // ?�新?�戲天數和狀�?
        await pool.execute('UPDATE games SET current_day = ?, status = "active" WHERE id = ?', [nextDay, gameId]);

        // ?�建?��?一天�???
        await pool.execute(`
            INSERT INTO game_days (
                game_id, day_number, fish_a_supply, fish_b_supply,
                fish_a_restaurant_budget, fish_b_restaurant_budget, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `, [gameId, nextDay, fishASupply, fishBSupply, fishABudget, fishBBudget]);

        // ?�置?�?��??��???- 清空庫�?，貸款利?��??��?�?
        console.log(`?�置�?{nextDay}天�??��??�??..`);
        const [participants] = await pool.execute(
            'SELECT * FROM game_participants WHERE game_id = ?',
            [gameId]
        );

        for (const participant of participants) {
            const currentLoan = participant.total_loan || 0;
            const interestRate = game.loan_interest_rate || 0.03; // 3%複利
            const newTotalLoan = currentLoan * (1 + interestRate);

            // ?�新?��??�?��?清空庫�?，更?�貸�?
            await pool.execute(
                `UPDATE game_participants
                 SET fish_a_inventory = 0,
                     fish_b_inventory = 0,
                     total_loan = ?
                 WHERE team_id = ? AND game_id = ?`,
                [newTotalLoan, participant.team_id, gameId]
            );
        }

        console.log(`�?{nextDay}天�??��??�已?�置`);

        res.json({
            message: `已推?�到�?${nextDay} 天`,
            day: nextDay,
            marketParams: {
                fishASupply,
                fishBSupply,
                fishABudget,
                fishBBudget
            }
        });

        io.emit('gameUpdate', { gameId, event: 'newDay', dayNumber: nextDay });
        
    } catch (error) {
        console.error('?�進天?�錯�?', error);
        res.status(500).json({ error: '?�進天?�失?? });
    }
});

// ?��?買入?��? (?��???- ?��?尋找 active ?�戲)
app.post('/api/admin/start-buying', authenticateToken, requireAdmin, async (req, res) => {
    const { duration } = req.body; // ?�許?��?義�??��??��?�?
    
    try {
        // ?��?尋找 active ??pending ?�戲
        const [games] = await pool.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '?��?沒�?�?��?��?中�??�戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '請�??�進到第�?�? });
        }
        
        // ?�?�檢??- 必�???pending ?�?��??��?始買?��?�?
        const dayStatus = currentDay[0].status;
        if (dayStatus !== 'pending') {
            let errorMessage = '';
            switch (dayStatus) {
                case 'buying_open':
                    errorMessage = '買入?��?已�??�放';
                    break;
                case 'buying_closed':
                    errorMessage = '買入?��?已�??��?請�?始賣?��?�?;
                    break;
                case 'selling_open':
                    errorMessage = '�?���?��?��?�?;
                    break;
                case 'selling_closed':
                    errorMessage = '請�??��?結�?';
                    break;
                case 'completed':
                    errorMessage = '?�日已�?算�?請推?�到下�?�?;
                    break;
                default:
                    errorMessage = `?��??�??${dayStatus})不�?許�?始買?��?標`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        
        // 如�??�戲?�在 pending ?�?��?將其激�?
        if (game.status === 'pending') {
            await pool.execute(
                'UPDATE games SET status = ? WHERE id = ?',
                ['active', gameId]
            );
        }
        
        // 設�??��??��??��??��??��??�設7?��?，可?��?義�?
        const biddingDuration = duration || 7; // ?�設7?��?
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + biddingDuration * 60 * 1000);
        
        // ?�新?�?�為 buying_open 並儲存�??��???
        await pool.execute(
            'UPDATE game_days SET status = ?, buy_start_time = ?, buy_end_time = ? WHERE id = ?',
            ['buying_open', startTime, endTime, currentDay[0].id]
        );
        
        // ?��?計�???
        startTimer(gameId, biddingDuration * 60, async () => {
            try {
                // 計�??��??��??��??��?買入?��?
                await pool.execute(
                    'UPDATE game_days SET status = ? WHERE id = ?',
                    ['buying_closed', currentDay[0].id]
                );
                
                console.log(`?�戲 ${gameId} �?${currentDay[0].day_number} 天買?��?標已?��?結�?`);
                
                // ?�知?�?�客?�端買入?�段結�?
                io.emit('phaseChange', { 
                    gameId, 
                    phase: 'buying_closed',
                    dayNumber: currentDay[0].day_number,
                    message: '買入?��??��?結�?'
                });
            } catch (error) {
                console.error('?��?結�?買入?��??�誤:', error);
            }
        });
        
        console.log(`?�戲 ${gameId} �?${currentDay[0].day_number} 天買?��?標已?��?`);
        
        res.json({ 
            success: true, 
            message: `買入?��?已�?始�?${biddingDuration}?��?）`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration,
            gameId: gameId,
            dayNumber: currentDay[0].day_number
        });
        
        // ?�送�?始買?��?標�?�?
        io.emit('phaseChange', { 
            gameId, 
            phase: 'buying_open',
            dayNumber: currentDay[0].day_number,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000
        });
        
        // ?��??��?gameUpdate 事件以�??�相容�?
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
        console.error('?��?買入?��?失�?:', error);
        res.status(500).json({ error: '?��?買入?��?失�?' });
    }
});

// ?��?買入?��? (?��???- 保�??�容??
app.post('/api/admin/games/:gameId/start-buying', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    const { duration } = req.body; // ?�許?��?義�??��??��?�?
    
    try {
        // ?�檢?��??�是?��???
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '?�戲不�??? });
        }
        
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '請�??�進到第�?�? });
        }
        
        // ?�詳細�??�?�檢??- 使用�?��??status 欄�?
        const dayStatus = currentDay[0].status;
        if (dayStatus === 'buying_open') {
            return res.status(400).json({ error: '買入?��?已�??�放' });
        } else if (dayStatus === 'buying_closed') {
            return res.status(400).json({ error: '買入?��?已�??��?請�?始賣?��?�? });
        } else if (dayStatus === 'selling_open') {
            return res.status(400).json({ error: '�?���?��?��?�? });
        } else if (dayStatus === 'selling_closed') {
            return res.status(400).json({ error: '請�??��?結�?' });
        } else if (dayStatus === 'completed') {
            return res.status(400).json({ error: '?�日已�?算�?請推?�到下�?�? });
        } else if (dayStatus !== 'pending') {
            return res.status(400).json({ error: `?��??�??${dayStatus})不�?許�?始買?��?標` });
        }
        
        // 設�??��??��??��??��??��??�設7?��?，可?��?義�?
        const biddingDuration = duration || 7; // ?�設7?��?
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + biddingDuration * 60 * 1000); // 轉�??�毫�?
        
        // ?�新?�?�為 buying - 使用�?��??status 欄�?並儲存�???
        await pool.execute(
            'UPDATE game_days SET status = ?, buy_start_time = ?, buy_end_time = ? WHERE id = ?',
            ['buying_open', startTime, endTime, currentDay[0].id]
        );
        
        // ?��?計�???
        startTimer(gameId, biddingDuration * 60, async () => {
            try {
                // 計�??��??��??��??��?買入?��?
                await pool.execute(
                    'UPDATE game_days SET status = ? WHERE id = ?',
                    ['buying_closed', currentDay[0].id]
                );
                
                console.log(`?�戲 ${gameId} �?${currentDay[0].day_number} 天買?��?標已?��?結�?`);
                
                // ?�知?�?�客?�端買入?�段結�?
                io.emit('phaseChange', { 
                    gameId, 
                    phase: 'buying_closed',
                    dayNumber: currentDay[0].day_number,
                    message: '買入?��??��?結�?'
                });
            } catch (error) {
                console.error('?��?結�?買入?��??�誤:', error);
            }
        });
        
        console.log(`?�戲 ${gameId} �?${currentDay[0].day_number} 天買?��?標已?��?`);
        
        res.json({ 
            success: true, 
            message: `買入?��?已�?始�?${biddingDuration}?��?）`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration
        });
        
        // ?�送�?始買?��?標�?件�??�含?��?資�?
        io.emit('phaseChange', { 
            gameId, 
            phase: 'buying_open',
            dayNumber: currentDay[0].day_number,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000 // 轉�??�毫�?
        });
        
        // ?��??��?gameUpdate 事件以�??�相容�?
        io.emit('gameUpdate', { 
            gameId, 
            event: 'buyingOpen', 
            dayId: currentDay[0].id,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000
        });
    } catch (error) {
        console.error('?��?買入?��??�誤:', error);
        res.status(500).json({ error: `?��?買入?��?失�?: ${error.message}` });
    }
});

// 結�?買入?��? (?��???- ?��?尋找 active ?�戲)
app.post('/api/admin/close-buying', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // ?��?尋找 active ??pending ?�戲
        const [games] = await pool.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '?��?沒�?�?��?��?中�??�戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '?��??��??�天?��??? });
        }
        
        // ?�?�檢??- 必�???buying_open ?�?��??��??�買?��?�?
        const dayStatus = currentDay[0].status;
        if (dayStatus !== 'buying_open') {
            let errorMessage = '';
            switch (dayStatus) {
                case 'pending':
                    errorMessage = '買入?��?尚未?��?';
                    break;
                case 'buying_closed':
                    errorMessage = '買入?��?已�?結�?';
                    break;
                case 'selling_open':
                    errorMessage = '�?���?��?��?�?;
                    break;
                case 'selling_closed':
                    errorMessage = '�?��?��?已�???;
                    break;
                case 'completed':
                    errorMessage = '?�日已�?�?;
                    break;
                default:
                    errorMessage = `?��??�??${dayStatus})不�?許�??�買?��?標`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        
        // ?�止計�???
        stopTimer(gameId);
        
        // 結�?買入?��?
        await processBuyBids(currentDay[0]);
        
        // ?��?結�?結�?
        const [buyResults] = await pool.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'buy'
             ORDER BY b.fish_type, b.price DESC`,
            [currentDay[0].id]
        );
        
        // ?�新??buying_closed ?�??
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['buying_closed', currentDay[0].id]
        );
        
        res.json({ 
            success: true, 
            message: '買入?��?已�??�並結�?',
            results: buyResults,
            gameId: gameId,
            dayNumber: currentDay[0].day_number
        });
        
        // ?�送�?段�??�通知
        io.emit('phaseChange', { 
            gameId, 
            phase: 'buying_closed',
            dayNumber: currentDay[0].day_number,
            message: '買入?��??��?結�?',
            results: buyResults
        });
        
        // 保�??�容??
        io.emit('buyingResults', { 
            gameId, 
            dayId: currentDay[0].id,
            results: buyResults 
        });
        
    } catch (error) {
        console.error('結�?買入?��??�誤:', error);
        res.status(500).json({ error: '結�?買入?��?失�?' });
    }
});

// 結�?買入?��?並�?�?(?��???- 保�??�容??
app.post('/api/admin/games/:gameId/close-buying', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        // 使用�?��??status 欄�?
        if (currentDay.length === 0 || currentDay[0].status !== 'buying_open') {
            return res.status(400).json({ error: '?��?沒�??��?中�?買入?��?' });
        }
        
        // ?�止計�???
        stopTimer(gameId);
        
        // 結�?買入?��?
        await processBuyBids(currentDay[0]);
        
        // ?��?結�?結�?
        const [buyResults] = await pool.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'buy'
             ORDER BY b.fish_type, b.price DESC`,
            [currentDay[0].id]
        );
        
        // ?�新??buy_ended ?�??- 使用�?��??status 欄�?
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['buying_closed', currentDay[0].id]
        );
        
        res.json({ 
            success: true, 
            message: '買入?��?已�??�並結�?',
            results: buyResults
        });
        
        // ?�送�?段�??�通知
        io.emit('phaseChange', { 
            gameId, 
            phase: 'buying_closed',
            dayNumber: currentDay[0].day_number,
            message: '買入?��??��?結�?',
            results: buyResults
        });
        
        // 保�??�容??
        io.emit('buyingResults', { 
            gameId, 
            dayId: currentDay[0].id,
            results: buyResults 
        });
    } catch (error) {
        console.error('結�?買入?��??�誤:', error);
        res.status(500).json({ error: '結�?買入?��?失�?' });
    }
});

// ?��?�?��?��? (?��???- ?��?尋找 active ?�戲)
app.post('/api/admin/start-selling', authenticateToken, requireAdmin, async (req, res) => {
    const { duration } = req.body; // ?�許?��?義�??��??��?�?
    
    try {
        // ?��?尋找 active ??pending ?�戲
        const [games] = await pool.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '?��?沒�?�?��?��?中�??�戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '?��??��??�天?��??? });
        }
        
        // ?�?�檢??- 必�???buying_closed ?�?��??��?始賣?��?�?
        const dayStatus = currentDay[0].status;
        if (dayStatus !== 'buying_closed') {
            let errorMessage = '';
            switch (dayStatus) {
                case 'pending':
                    errorMessage = '請�??��?買入?��?';
                    break;
                case 'buying_open':
                    errorMessage = '請�?完�?買入?��?';
                    break;
                case 'selling_open':
                    errorMessage = '�?��?��?已�??�放';
                    break;
                case 'selling_closed':
                    errorMessage = '�?��?��?已�??��?請執行�?�?;
                    break;
                case 'completed':
                    errorMessage = '?�日已�?算�?請推?�到下�?�?;
                    break;
                default:
                    errorMessage = `?��??�??${dayStatus})不�?許�?始賣?��?標`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        
        // 設�?�?��?��??��??��??��??��??�設5?��?，可?��?義�?
        const sellingDuration = duration || 5; // ?�設5?��?
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + sellingDuration * 60 * 1000);
        
        // ?�新?�?�為 selling_open 並儲存�??��???
        await pool.execute(
            'UPDATE game_days SET status = ?, sell_start_time = ?, sell_end_time = ? WHERE id = ?',
            ['selling_open', startTime, endTime, currentDay[0].id]
        );
        
        // ?��?計�???
        startTimer(gameId, sellingDuration * 60, async () => {
            try {
                // 計�??��??��??��??��?�?��?��?
                await pool.execute(
                    'UPDATE game_days SET status = ? WHERE id = ?',
                    ['selling_closed', currentDay[0].id]
                );
                
                console.log(`?�戲 ${gameId} �?${currentDay[0].day_number} 天賣?��?標已?��?結�?`);
                
                // ?�知?�?�客?�端�?��?�段結�?
                io.emit('phaseChange', { 
                    gameId, 
                    phase: 'selling_closed',
                    dayNumber: currentDay[0].day_number,
                    message: '�?��?��??��?結�?'
                });
            } catch (error) {
                console.error('?��?結�?�?��?��??�誤:', error);
            }
        });
        
        console.log(`?�戲 ${gameId} �?${currentDay[0].day_number} 天賣?��?標已?��?`);
        
        res.json({ 
            success: true, 
            message: `�?��?��?已�?始�?${sellingDuration}?��?）`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: sellingDuration,
            gameId: gameId,
            dayNumber: currentDay[0].day_number
        });
        
        // ?�送�?始賣?��?標�?�?
        io.emit('phaseChange', { 
            gameId, 
            phase: 'selling_open',
            dayNumber: currentDay[0].day_number,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: sellingDuration * 60 * 1000
        });
        
        // ?��??��?gameUpdate 事件以�??�相容�?
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
        console.error('?��?�?��?��?失�?:', error);
        res.status(500).json({ error: '?��?�?��?��?失�?' });
    }
});

// ?��?�?��?��? (?��???- 保�??�容??
app.post('/api/admin/games/:gameId/start-selling', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    const { duration } = req.body; // ?�許?��?義�??��??��?�?
    
    try {
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '請�??�進到第�?�? });
        }
        
        // 使用�?��??status 欄�?
        if (currentDay[0].status !== 'buying_closed') {
            return res.status(400).json({ error: '請�?完�?買入?��?' });
        }
        
        // 設�?�?��?��??��??��??��??��??�設4?��?，可?��?義�?
        const biddingDuration = duration || 4; // ?�設4?��?
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + biddingDuration * 60 * 1000); // 轉�??�毫�?
        
        // ?�新?�?�為 selling - 使用�?��??status 欄�?並儲存�???
        await pool.execute(
            'UPDATE game_days SET status = ?, sell_start_time = ?, sell_end_time = ? WHERE id = ?',
            ['selling_open', startTime, endTime, currentDay[0].id]
        );
        
        // ?��?計�???
        startTimer(`${gameId}-selling`, biddingDuration * 60, async () => {
            try {
                // 計�??��??��??��??��?�?��?��?
                await pool.execute(
                    'UPDATE game_days SET status = ? WHERE id = ?',
                    ['selling_closed', currentDay[0].id]
                );
                
                console.log(`?�戲 ${gameId} �?${currentDay[0].day_number} 天賣?��?標已?��?結�?`);
                
                // ?�知?�?�客?�端�?��?�段結�?
                io.emit('phaseChange', { 
                    gameId, 
                    phase: 'selling_closed',
                    dayNumber: currentDay[0].day_number,
                    message: '�?��?��??��?結�?'
                });
            } catch (error) {
                console.error('?��?結�?�?��?��??�誤:', error);
            }
        });
        
        res.json({ 
            success: true, 
            message: `�?��?��?已�?始�?${biddingDuration}?��?）`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration
        });
        
        // ?�送�?始賣?��?標�?件�??�含?��?資�?
        io.emit('phaseChange', { 
            gameId, 
            phase: 'selling_open',
            dayNumber: currentDay[0].day_number,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000 // 轉�??�毫�?
        });
        
        // ?��??��?gameUpdate 事件以�??�相容�?
        io.emit('gameUpdate', { 
            gameId, 
            event: 'sellingOpen', 
            dayId: currentDay[0].id,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: biddingDuration * 60 * 1000
        });
    } catch (error) {
        console.error('?��?�?��?��??�誤:', error);
        res.status(500).json({ error: '?��?�?��?��?失�?' });
    }
});

// 結�?�?��?��? (?��???- ?��?尋找 active ?�戲)
app.post('/api/admin/close-selling', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // ?��?尋找 active ??pending ?�戲
        const [games] = await pool.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '?��?沒�?�?��?��?中�??�戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '?��??��??�天?��??? });
        }
        
        // ?�?�檢??- 必�???selling_open ?�?��??��??�賣?��?�?
        const dayStatus = currentDay[0].status;
        if (dayStatus !== 'selling_open') {
            let errorMessage = '';
            switch (dayStatus) {
                case 'pending':
                    errorMessage = '請�??��?買入?��?';
                    break;
                case 'buying_open':
                    errorMessage = '請�?完�?買入?��?';
                    break;
                case 'buying_closed':
                    errorMessage = '�?��?��?尚未?��?';
                    break;
                case 'selling_closed':
                    errorMessage = '�?��?��?已�?結�?';
                    break;
                case 'completed':
                    errorMessage = '?�日已�?�?;
                    break;
                default:
                    errorMessage = `?��??�??${dayStatus})不�?許�??�賣?��?標`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        
        // ?�止計�???
        stopTimer(gameId);
        
        // 結�?�?��?��?
        await processSellBids(currentDay[0]);
        
        // ?��?結�?結�?
        const [sellResults] = await pool.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'sell'
             ORDER BY b.fish_type, b.price ASC`,
            [currentDay[0].id]
        );
        
        // ?�新??selling_closed ?�??
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['selling_closed', currentDay[0].id]
        );
        
        res.json({ 
            success: true, 
            message: '�?��?��?已�??�並結�?',
            results: sellResults,
            gameId: gameId,
            dayNumber: currentDay[0].day_number
        });
        
        // ?�送�?段�??�通知
        io.emit('phaseChange', { 
            gameId, 
            phase: 'selling_closed',
            dayNumber: currentDay[0].day_number,
            message: '�?��?��??��?結�?',
            results: sellResults
        });
        
        // 保�??�容??
        io.emit('sellingResults', { 
            gameId, 
            dayId: currentDay[0].id,
            results: sellResults 
        });
        
    } catch (error) {
        console.error('結�?�?��?��??�誤:', error);
        res.status(500).json({ error: '結�?�?��?��?失�?' });
    }
});

// 結�?�?��?��? (?��???- 保�??�容??
app.post('/api/admin/games/:gameId/close-selling', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        // 使用�?��??status 欄�?
        if (currentDay.length === 0 || currentDay[0].status !== 'selling_open') {
            return res.status(400).json({ error: '?��?沒�??��?中�?�?��?��?' });
        }
        
        // ?�止計�???
        stopTimer(`${gameId}-selling`);
        
        // 結�?�?��?��?
        await processSellBids(currentDay[0]);
        
        // ?��?結�?結�?
        const [sellResults] = await pool.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_day_id = ? AND b.bid_type = 'sell'
             ORDER BY b.fish_type, b.price ASC`,
            [currentDay[0].id]
        );
        
        // ?�新??sell_ended ?�??- 使用�?��??status 欄�?
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['selling_closed', currentDay[0].id]
        );
        
        res.json({ 
            success: true, 
            message: '�?��?��?已�??�並結�?',
            results: sellResults
        });
        
        // ?�送�?段�??�通知
        io.emit('phaseChange', { 
            gameId, 
            phase: 'selling_closed',
            dayNumber: currentDay[0].day_number,
            message: '�?��?��??��?結�?',
            results: sellResults
        });
        
        // 保�??�容??
        io.emit('sellingResults', { 
            gameId, 
            dayId: currentDay[0].id,
            results: sellResults 
        });
    } catch (error) {
        console.error('結�?�?��?��??�誤:', error);
        res.status(500).json({ error: '結�?�?��?��?失�?' });
    }
});

// 每日結�? (?��???- ?��?尋找 active ?�戲)
app.post('/api/admin/settle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // ?��?尋找 active ??pending ?�戲
        const [games] = await pool.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.status(404).json({ 
                error: '?��?沒�?�?��?��?中�??�戲', 
                code: 'NO_ACTIVE_GAME' 
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '沒�??��?算�?天數' });
        }
        
        // ?�?�檢??- 必�???selling_closed ?�?��??�執行�?�?
        const dayStatus = currentDay[0].status;
        if (dayStatus !== 'selling_closed') {
            let errorMessage = '';
            switch (dayStatus) {
                case 'pending':
                    errorMessage = '請�?完�??�日?��?標�?�?;
                    break;
                case 'buying_open':
                    errorMessage = '請�?完�?買入?��?';
                    break;
                case 'buying_closed':
                    errorMessage = '請�?完�?�?��?��?';
                    break;
                case 'selling_open':
                    errorMessage = '請�?結�?�?��?��?';
                    break;
                case 'completed':
                    errorMessage = '?�日已�?結�?完�?';
                    break;
                default:
                    errorMessage = `?��??�??${dayStatus})不�?許執行�?算`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        
        // ?��?結�??�輯
        await enhancedDailySettlement(pool, gameId, currentDay[0].id, currentDay[0].day_number);
        
        // ?�新?�?�為 settled
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['completed', currentDay[0].id]
        );
        
        // ?��?結�?後�??��??�??
        const [updatedTeams] = await pool.execute(
            `SELECT gp.*, u.team_name
             FROM game_participants gp
             JOIN users u ON gp.team_id = u.id
             WHERE gp.game_id = ?
             ORDER BY gp.current_budget DESC`,
            [gameId]
        );
        
        res.json({ 
            success: true, 
            message: '每日結�?完�?',
            gameId: gameId,
            dayNumber: currentDay[0].day_number,
            teams: updatedTeams
        });
        
        // ?�送�?算�??�通知
        io.emit('phaseChange', { 
            gameId, 
            phase: 'settled',
            dayNumber: currentDay[0].day_number,
            message: '每日結�?已�???,
            teams: updatedTeams
        });
        
        // 保�??�容??
        io.emit('daySettled', { 
            gameId, 
            dayId: currentDay[0].id,
            dayNumber: currentDay[0].day_number,
            teams: updatedTeams
        });
        
    } catch (error) {
        console.error('每日結�??�誤:', error);
        res.status(500).json({ error: '每日結�?失�?' });
    }
});

// 每日結�? (?��???- 保�??�容??
app.post('/api/admin/games/:gameId/settle', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        if (currentDay.length === 0) {
            return res.status(400).json({ error: '沒�??��?算�?天數' });
        }
        
        // 使用�?��??status 欄�??��??��?�?
        if (currentDay[0].status === 'completed') {
            return res.status(400).json({ error: '?�日已�?結�?完�?' });
        }
        
        if (currentDay[0].status !== 'selling_closed') {
            return res.status(400).json({ error: '請�?完�??�?��?標�?�? });
        }
        
        // ?��?�?��?��?
        await processSellBids(currentDay[0]);
        
        // 使用強�??��?算�??��??�含事�??��?�?
        await enhancedDailySettlement(pool, gameId, currentDay[0].id, currentDay[0].day_number);
        
        // 使用�?��?��??��?�?
        await pool.execute(
            'UPDATE game_days SET status = ? WHERE id = ?',
            ['completed', currentDay[0].id]
        );
        
        if (currentDay[0].day_number === 7) {
            await pool.execute(
                'UPDATE games SET status = "completed" WHERE id = ?',
                [gameId]
            );
        }
        
        res.json({ success: true, message: '結�?完�?' });
        io.emit('gameUpdate', { gameId, event: 'settled', dayId: currentDay[0].id });
    } catch (error) {
        console.error('結�??�誤:', error);
        res.status(500).json({ error: '結�?失�?' });
    }
});

// ?��??��??��??�戲?�表
app.get('/api/team/available-games', authenticateToken, async (req, res) => {
    try {
        // ?�詢?��?中�?待�?始�??�戲
        const [games] = await pool.execute(
            `SELECT g.*, COUNT(gp.team_id) as current_teams
             FROM games g
             LEFT JOIN game_participants gp ON g.id = gp.game_id
             WHERE g.status = 'active'
             GROUP BY g.id`,
            []
        );
        
        res.json(games);
    } catch (error) {
        console.error('?��??�戲?�表?�誤:', error);
        res.status(500).json({ error: '?��??�戲?�表失�?' });
    }
});

// ?�入?�戲
app.post('/api/team/join-game', authenticateToken, async (req, res) => {
    const teamId = req.user.userId;
    const { gameId } = req.body;
    
    try {
        // 檢查?�戲?�否存在且可?�入
        const [game] = await pool.execute(
            'SELECT * FROM games WHERE id = ? AND status IN ("active", "pending")',
            [gameId]
        );
        
        if (game.length === 0) {
            return res.status(404).json({ error: '?�戲不�??��?已�??? });
        }
        
        // 檢查?�否已�???
        const [existing] = await pool.execute(
            'SELECT * FROM game_participants WHERE game_id = ? AND team_id = ?',
            [gameId, teamId]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: '?�已經�??�此?�戲' });
        }
        
        // 檢查?�戲人數?�否已滿
        const [participants] = await pool.execute(
            'SELECT COUNT(*) as count FROM game_participants WHERE game_id = ?',
            [gameId]
        );
        
        if (participants[0].count >= game[0].num_teams) {
            return res.status(400).json({ error: '?�戲人數已滿' });
        }
        
        // ?�入?�戲
        await pool.execute(
            `INSERT INTO game_participants (game_id, team_id, current_budget, total_loan, total_loan_principal)
             VALUES (?, ?, ?, 0, 0)`,
            [gameId, teamId, game[0].initial_budget]
        );
        
        console.log(`?��? ${teamId} ?�入?�戲 ${gameId}`);
        res.json({ success: true, message: '?��??�入?�戲' });
        
        // ?�知?��?�?
        io.emit('teamJoined', { gameId, teamId });
    } catch (error) {
        console.error('?�入?�戲?�誤:', error);
        res.status(500).json({ error: '?�入?�戲失�?' });
    }
});

// 一?��??�當?��???
app.post('/api/team/join-current', authenticateToken, async (req, res) => {
    const teamId = req.user.userId; // 修正：使??userId ?��? id
    const teamNumber = parseInt(req.user.username); // 01, 02... 轉為?��?
    const { teamName: customTeamName } = req.body;  // 從�?端接?��??��?�?
    
    try {
        // ?��??��??��?中�??�戲（�??��? active ?�?�優?��??�次??pending�?
        const [games] = await pool.execute(
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
                error: '?��?沒�??��??��??�戲',
                code: 'NO_ACTIVE_GAME'
            });
        }
        
        const game = games[0];
        const gameId = game.id;
        
        // 檢查?�否已�??�入
        const [existing] = await pool.execute(
            'SELECT * FROM game_participants WHERE game_id = ? AND team_id = ?',
            [gameId, teamId]
        );
        
        if (existing.length > 0) {
            // 已�??�入，�??��??��?訊�??��??�稱
            const teamNames = JSON.parse(game.team_names || '{}');
            const existingTeamName = teamNames[teamNumber] || `�?{teamNumber}組`;
            
            // 如�??��?了新?��??��?稱�??�新�?
            if (customTeamName && customTeamName.trim()) {
                teamNames[teamNumber] = customTeamName.trim();
                await pool.execute(
                    'UPDATE games SET team_names = ? WHERE id = ?',
                    [JSON.stringify(teamNames), gameId]
                );
                
                // ?�新 users 表中??team_name
                await pool.execute(
                    'UPDATE users SET team_name = ? WHERE id = ?',
                    [customTeamName.trim(), teamId]
                );
            }
            
            return res.json({ 
                success: true, 
                alreadyJoined: true,
                gameId,
                gameName: game.name,
                teamNumber,
                teamName: customTeamName || existingTeamName,
                message: '?�已經在此�??�中'
            });
        }
        
        // 檢查?�戲人數?�否已滿
        const [participants] = await pool.execute(
            'SELECT COUNT(*) as count FROM game_participants WHERE game_id = ?',
            [gameId]
        );
        
        if (participants[0].count >= game.num_teams) {
            return res.status(400).json({ 
                error: '?�戲人數已滿',
                code: 'GAME_FULL'
            });
        }
        
        // ?�入?�戲
        await pool.execute(
            `INSERT INTO game_participants (game_id, team_id, current_budget, total_loan, total_loan_principal)
             VALUES (?, ?, ?, 0, 0)`,
            [gameId, teamId, game.initial_budget]
        );
        
        // ?��??��??�稱
        const teamNames = JSON.parse(game.team_names || '{}');
        const finalTeamName = customTeamName?.trim() || teamNames[teamNumber] || `�?{teamNumber}組`;
        teamNames[teamNumber] = finalTeamName;
        
        // ?�新?�戲?��??��?稱�???
        await pool.execute(
            'UPDATE games SET team_names = ? WHERE id = ?',
            [JSON.stringify(teamNames), gameId]
        );
        
        // ?�新 users 表中??team_name
        await pool.execute(
            'UPDATE users SET team_name = ? WHERE id = ?',
            [finalTeamName, teamId]
        );
        
        console.log(`?��? ${teamNumber} (${finalTeamName}) ?�入?�戲 ${gameId}`);
        
        // ?�知?��?�?
        io.emit('teamJoined', { 
            gameId, 
            teamId,
            teamNumber,
            teamName: finalTeamName 
        });
        
        res.json({ 
            success: true,
            gameId,
            gameName: game.name,
            teamNumber,
            teamName: finalTeamName,
            message: '?��??�入?�戲'
        });
        
    } catch (error) {
        console.error('一?��??��??�錯�?', error);
        res.status(500).json({ error: '?�入?�戲失�?' });
    }
});

// ?�新?��??�稱
app.post('/api/team/update-name', authenticateToken, async (req, res) => {
    const teamId = req.user.userId;
    const teamNumber = parseInt(req.user.username);
    const { gameId, newName } = req.body;
    
    if (!newName || newName.trim().length === 0) {
        return res.status(400).json({ error: '?��??�稱不能?�空' });
    }
    
    if (newName.length > 20) {
        return res.status(400).json({ error: '?��??�稱不能超�?20?��?' });
    }
    
    try {
        // 檢查?�戲?�否存在
        const [games] = await pool.execute(
            'SELECT * FROM games WHERE id = ?',
            [gameId]
        );
        
        if (games.length === 0) {
            return res.status(404).json({ error: '?�戲不�??? });
        }
        
        // 檢查?��??�否?��?此�???
        const [participants] = await pool.execute(
            'SELECT * FROM game_participants WHERE game_id = ? AND team_id = ?',
            [gameId, teamId]
        );
        
        if (participants.length === 0) {
            return res.status(403).json({ error: '?�未?��?此�??? });
        }
        
        // ?��?並更?��??��?�?
        const teamNames = JSON.parse(games[0].team_names || '{}');
        teamNames[teamNumber] = newName.trim();
        
        await pool.execute(
            'UPDATE games SET team_names = ? WHERE id = ?',
            [JSON.stringify(teamNames), gameId]
        );
        
        console.log(`?��? ${teamNumber} ?�新?�稱?? ${newName}`);
        
        // ?�知?�?��???�用??
        io.to(`game-${gameId}`).emit('teamNameUpdated', {
            teamNumber,
            newName: newName.trim()
        });
        
        res.json({ 
            success: true,
            teamNumber,
            newName: newName.trim(),
            message: '?��??�稱?�新?��?'
        });
        
    } catch (error) {
        console.error('?�新?��??�稱?�誤:', error);
        res.status(500).json({ error: '?�新?��??�稱失�?' });
    }
});

// ?��?介面 - ?��??��??�戲資�?（修�??�?
app.get('/api/team/dashboard', authenticateToken, async (req, res) => {
    try {
        // ?��??��??��?中�?待�?始�??�戲
        const [activeGames] = await pool.execute(
            `SELECT * FROM games WHERE status IN ('active', 'pending') ORDER BY created_at DESC LIMIT 1`
        );
        
        if (activeGames.length === 0) {
            return res.status(404).json({ error: '?��?沒�??��?中�??�戲' });
        }
        
        const currentGame = activeGames[0];
        
        // 檢查?��??�否?��?此�???
        const [participants] = await pool.execute(
            `SELECT gp.*, g.* 
             FROM game_participants gp
             JOIN games g ON gp.game_id = g.id
             WHERE gp.team_id = ? AND g.id = ?`,
            [req.user.userId, currentGame.id]
        );
        
        if (participants.length === 0) {
            // 如�??��?編�??��??�內，自?��???
            const teamNumber = parseInt(req.user.username);
            if (!isNaN(teamNumber) && teamNumber >= 1 && teamNumber <= currentGame.num_teams) {
                await pool.execute(
                    'INSERT INTO game_participants (game_id, team_id, current_budget) VALUES (?, ?, ?)',
                    [currentGame.id, req.user.userId, currentGame.initial_budget]
                );
                
                // ?�新?�詢
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
                    error: `?��??�戲?��???${currentGame.num_teams} 組�??��??��?組別不在範�??�` 
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
        
        // ?��??�天?��?標�??��??�含?�交?��?�?
        let todayBids = [];
        if (currentDay[0]) {
            const [bids] = await pool.execute(
                `SELECT bid_type, fish_type, price, quantity_submitted, quantity_fulfilled, status 
                 FROM bids 
                 WHERE team_id = ? AND game_day_id = ?`,
                [req.user.userId, currentDay[0].id]
            );
            todayBids = bids;
        }
        
        res.json({
            gameInfo: {
                gameName: participant.name,
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
        console.error('?��??��?資�??�誤:', error);
        res.status(500).json({ error: '?��?資�?失�?' });
    }
});

// ?�交買入?��?（支?��??�格?��??�檢?��?
app.post('/api/team/submit-buy-bids', authenticateToken, async (req, res) => {
    const { buyBids } = req.body;
    const teamId = req.user.userId;
    
    try {
        // ?��??��??��?中�??�戲?�當?�天
        const [activeGames] = await pool.execute(
            `SELECT g.*, gd.id as game_day_id, gd.day_number, gd.status
             FROM games g
             JOIN game_days gd ON g.id = gd.game_id AND g.current_day = gd.day_number
             WHERE g.status IN ('active', 'pending') AND gd.status = 'buying_open'
             ORDER BY g.created_at DESC LIMIT 1`
        );
        
        if (activeGames.length === 0) {
            return res.status(400).json({ error: '?�在不是買入?��??��?' });
        }
        
        const game = activeGames[0];
        const gameDayId = game.game_day_id;
        const gameId = game.id;
        const dayNumber = game.day_number;
        
        // ?��??��??��??�中?��???
        const [participant] = await pool.execute(
            'SELECT * FROM game_participants WHERE team_id = ? AND game_id = ?',
            [teamId, gameId]
        );
        
        if (participant.length === 0) {
            return res.status(404).json({ error: '?��??��??�當?��??? });
        }
        
        const teamData = participant[0];
        
        // 計�?總出?��?額�??�援多價?��?
        let totalBidAmount = 0;
        const processedBids = [];
        const bidsByType = { A: [], B: [] };
        
        if (buyBids && Array.isArray(buyBids)) {
            // ?��??��?資�?，支?��?種�??�多兩?�價??
            for (const bid of buyBids) {
                if (bid && bid.price > 0 && bid.quantity > 0) {
                    const fishType = bid.fish_type || bid.fishType;
                    
                    // 確�? fishType ?��??��? (A ??B)
                    if (fishType !== 'A' && fishType !== 'B') {
                        console.error(`?��??��?種�??? ${fishType}`);
                        return res.status(400).json({ error: `?��??��?種�??? ${fishType}` });
                    }
                    
                    // 檢查?��??�交中是?�已?��??��?每種魚�?�??�價?��?
                    if (bidsByType[fishType].length >= 2) {
                        console.log(`${fishType}級�??�本次�?交中已�?2?��?標�?跳�?此�?標`);
                        return res.status(400).json({ error: `${fishType}級�??�多只?��?�??��??�價?��??��?` });
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
        
        // 檢查資�??�否足�?（貸款�?超�??��??��??�設定�?例�?
        const currentBudget = teamData.current_budget || 0;
        const currentLoan = teamData.total_loan || 0;
        const initialBudget = game.initial_budget || 1000000;
        const maxLoanRatio = game.max_loan_ratio || 0.5;
        const maxTotalLoan = initialBudget * maxLoanRatio;

        // 計�??�用資�?（現??+ ?�用貸款額度�?
        const availableLoan = maxTotalLoan - currentLoan;
        const totalAvailableFunds = currentBudget + availableLoan;
        
        // 計�??�要�?貸款?��?
        let loanNeeded = 0;
        if (totalBidAmount > currentBudget) {
            loanNeeded = totalBidAmount - currentBudget;
        }
        
        // 檢查總�?標�?額是?��??�可?��???
        if (totalBidAmount > totalAvailableFunds) {
            return res.status(400).json({ 
                error: `?��?總�? $${totalBidAmount.toFixed(2)} 超�??�用資�? $${totalAvailableFunds.toFixed(2)}`,
                currentBudget: currentBudget,
                currentLoan: currentLoan,
                availableLoan: availableLoan,
                totalBidAmount: totalBidAmount,
                maxTotalLoan: maxTotalLoan
            });
        }
        
        // 注�?：這裡不更?�貸款�?貸款將在買入結�??�根?�實?��?交�?況�???

        // 檢查?�否已�??�交?��?標以?�防止�??�頻繁�?�?
        const [existingBids] = await pool.execute(
            'SELECT COUNT(*) as count, MAX(created_at) as last_submission FROM bids WHERE game_day_id = ? AND team_id = ? AND bid_type = "buy"',
            [gameDayId, teamId]
        );
        const isUpdate = existingBids[0].count > 0;

        // ?�止?��??�交：�??�在5秒內?�新?�交?��?�?
        if (existingBids[0].last_submission) {
            const lastSubmissionTime = new Date(existingBids[0].last_submission);
            const currentTime = new Date();
            const timeDiff = (currentTime - lastSubmissionTime) / 1000; // �?

            if (timeDiff < 5) {
                return res.status(429).json({
                    error: `請勿?��??�交，�?等�?${Math.ceil(5 - timeDiff)}秒�??�試`
                });
            }
        }

        // ?��?交�?：刪?��??�買?��?標�??�許覆�?�?
        await pool.execute(
            'DELETE FROM bids WHERE game_day_id = ? AND team_id = ? AND bid_type = "buy"',
            [gameDayId, teamId]
        );

        // ?��??��?記�?（根?�正確�?資�?庫�?構�?
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

        // 貸款將在買入?��??�根?�實?��?交�?額自?�執行�?不在此�??��??�貸
        
        res.json({ 
            success: true, 
            message: isUpdate ? '買入?��?已更?��?覆�??�次?�交�? : '買入?��?已�?�?,
            isUpdate: isUpdate,
            summary: {
                totalBidAmount: totalBidAmount,
                currentBudget: currentBudget,
                loanNeeded: loanNeeded,
                bidsSubmitted: processedBids.length
            }
        });
        
        // ?�知?�?��???�客?�端
        io.emit('bidsUpdated', { 
            gameId: game.id, 
            teamId: req.user.userId,
            phase: 'buying_open'
        });
        
    } catch (error) {
        console.error('?�交買入?��??�誤:', error);
        res.status(500).json({ error: '?�交買入?��?失�?�? + error.message });
    }
});

// ?�交�?��?��?（支?��??�格�?
app.post('/api/team/submit-sell-bids', authenticateToken, async (req, res) => {
    const { sellBids } = req.body;
    const teamId = req.user.userId;
    
    try {
        // ?��??��??��?中�??�戲?�當?�天
        const [activeGames] = await pool.execute(
            `SELECT g.*, gd.id as game_day_id, gd.day_number, gd.status
             FROM games g
             JOIN game_days gd ON g.id = gd.game_id AND g.current_day = gd.day_number
             WHERE g.status IN ('active', 'pending') AND gd.status = 'selling_open'
             ORDER BY g.created_at DESC LIMIT 1`
        );
        
        if (activeGames.length === 0) {
            return res.status(400).json({ error: '?�在不是�?��?��??��?' });
        }
        
        const game = activeGames[0];
        const gameDayId = game.game_day_id;
        const gameId = game.id;
        const dayNumber = game.day_number;
        
        // ?��??��??��??�中?��???
        const [participant] = await pool.execute(
            'SELECT * FROM game_participants WHERE team_id = ? AND game_id = ?',
            [teamId, gameId]
        );
        
        if (participant.length === 0) {
            return res.status(404).json({ error: '?��??��??�當?��??? });
        }
        
        const teamData = participant[0];
        
        // ?��??��?資�?，支?��?種�??�多兩?�價??
        const processedBids = [];
        const bidsByType = { A: [], B: [] };
        
        // ?�收?��??��??��??��?
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
        
        // 驗�?每種魚�?總賣?�數?��??��??�庫�?
        for (const fishType of ['A', 'B']) {
            const inventoryField = fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory';
            const currentInventory = teamData[inventoryField] || 0;
            const totalSubmitted = bidsByType[fishType].reduce((sum, b) => sum + b.quantity, 0);
            
            // 如�??�庫存�?沒�??�交�?��?��?
            if (currentInventory > 0 && totalSubmitted === 0) {
                return res.status(400).json({ 
                    error: `${fishType}級�??�庫�?{currentInventory}kg但未?�交�?��?��?`,
                    fishType: fishType,
                    inventory: currentInventory,
                    submitted: 0
                });
            }
            
            // 如�?�?��?��?不�??�庫�?
            if (currentInventory > 0 && totalSubmitted !== currentInventory) {
                return res.status(400).json({ 
                    error: `${fishType}級�?�?��?��?必�?等於庫�?`,
                    fishType: fishType,
                    inventory: currentInventory,
                    submitted: totalSubmitted,
                    message: totalSubmitted > currentInventory ? '�?��?��?超�?庫�?' : '�?��?��?少於庫�?'
                });
            }
            
            // 將該魚種?��?標�??��??��?�?
            processedBids.push(...bidsByType[fishType]);
        }
        
        // 檢查?�否已�??�交?��?標以?�防止�??�頻繁�?�?
        const [existingBids] = await pool.execute(
            'SELECT COUNT(*) as count, MAX(created_at) as last_submission FROM bids WHERE game_day_id = ? AND team_id = ? AND bid_type = "sell"',
            [gameDayId, teamId]
        );
        const isUpdate = existingBids[0].count > 0;
        
        // ?�止?��??�交：�??�在5秒內?�新?�交?��?�?
        if (existingBids[0].last_submission) {
            const lastSubmissionTime = new Date(existingBids[0].last_submission);
            const currentTime = new Date();
            const timeDiff = (currentTime - lastSubmissionTime) / 1000; // �?
            
            if (timeDiff < 5) {
                return res.status(429).json({ 
                    error: `請勿?��??�交，�?等�?${Math.ceil(5 - timeDiff)}秒�??�試` 
                });
            }
        }
        
        // ?��?交�?：刪?��??�賣?��?標�??�許覆�?�?
        await pool.execute(
            'DELETE FROM bids WHERE game_day_id = ? AND team_id = ? AND bid_type = "sell"',
            [gameDayId, teamId]
        );
        
        // ?��??��?記�?（根?�正確�?資�?庫�?構�?
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
            message: isUpdate ? '�?��?��?已更?��?覆�??�次?�交�? : '�?��?��?已�?�?,
            isUpdate: isUpdate,
            summary: {
                bidsSubmitted: processedBids.length,
                fishA: bidsByType.A.length,
                fishB: bidsByType.B.length,
                fishAInventory: teamData.fish_a_inventory || 0,
                fishBInventory: teamData.fish_b_inventory || 0
            }
        });
        
        // ?�知?�?��???�客?�端
        io.emit('bidsUpdated', { 
            gameId: game.id, 
            teamId: req.user.userId,
            phase: 'selling_open'
        });
        
    } catch (error) {
        console.error('?�交�?��?��??�誤:', error);
        res.status(500).json({ error: '?�交�?��?��?失�?�? + error.message });
    }
});

// ?��?歷史?��?結�?
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
        console.error('?��?歷史?�誤:', error);
        res.status(500).json({ error: '?��?歷史失�?' });
    }
});

// ?��??��?�?
// ?��?每日結�?
app.get('/api/admin/games/:gameId/daily-results/:day', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId, day } = req.params;
    
    try {
        // ?��??�日?�戲資�?
        const [dayInfo] = await pool.execute(
            `SELECT * FROM game_days WHERE game_id = ? AND day_number = ?`,
            [gameId, day]
        );
        
        if (dayInfo.length === 0) {
            return res.status(404).json({ error: '?��??�該天�??? });
        }
        
        // ?��??�日?��?記�?
        const [bids] = await pool.execute(
            `SELECT b.*, u.team_name 
             FROM bids b
             JOIN users u ON b.team_id = u.id
             WHERE b.game_id = ? AND b.day_number = ?
             ORDER BY b.created_at`,
            [gameId, day]
        );
        
        // ?��??�日?��?結�?
        const [teamResults] = await pool.execute(
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
        console.error('?��?每日結�??�誤:', error);
        res.status(500).json({ error: '?��?每日結�?失�?' });
    }
});

// ?��?競�?結�?統�? - ?�含?�?��??��?標�?細、�?交價?�統計�?
app.get('/api/admin/games/:gameId/day/:day/bid-summary', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId, day } = req.params;
    
    try {
        // ?��??�日?�戲資�? - 使用�?��?��??�庫欄�??�稱
        const [dayInfo] = await pool.execute(
            `SELECT id, game_id, day_number, status, 
                    fish_a_supply, fish_b_supply,
                    fish_a_restaurant_budget, fish_b_restaurant_budget,
                    buy_start_time, buy_end_time, sell_start_time, sell_end_time
             FROM game_days 
             WHERE game_id = ? AND day_number = ?`,
            [gameId, day]
        );
        
        if (dayInfo.length === 0) {
            return res.status(404).json({ error: '?��??�該天�??? });
        }
        
        const gameDayId = dayInfo[0].id;
        
        // ?��??�?��?標�?�?- ?��? bids 表正確�?�?
        const [allBids] = await pool.execute(
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
        
        // ?�離買入?�賣?��?�?
        const buyBids = allBids.filter(b => b.bid_type === 'buy');
        const sellBids = allBids.filter(b => b.bid_type === 'sell');
        
        // 計�?買入統�? - A魚�?B魚�??�統�?
        const buyStatsA = calculateBuyStats(buyBids.filter(b => b.fish_type === 'A'));
        const buyStatsB = calculateBuyStats(buyBids.filter(b => b.fish_type === 'B'));
        
        // 計�?�?��統�? - A魚�?B魚�??�統�?
        const sellStatsA = calculateSellStats(sellBids.filter(b => b.fish_type === 'A'));
        const sellStatsB = calculateSellStats(sellBids.filter(b => b.fish_type === 'B'));
        
        // ?��??��??��?統�?
        const teamStats = await getTeamBidStats(gameDayId);
        
        // ?��??�日結�?結�?（�??�已結�?�?
        let dailyResults = [];
        if (dayInfo[0].status === 'completed') {
            const [results] = await pool.execute(
                `SELECT dr.id, dr.game_day_id, dr.team_id, dr.day_number,
                        dr.starting_cash, dr.ending_cash,
                        dr.starting_loan, dr.ending_loan,
                        dr.fish_a_bought, dr.fish_a_sold, dr.fish_a_unsold,
                        dr.fish_b_bought, dr.fish_b_sold, dr.fish_b_unsold,
                        dr.buy_cost, dr.sell_revenue, dr.unsold_fee, dr.interest_paid,
                        dr.daily_profit, dr.cumulative_profit, dr.roi,
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
        console.error('?��?競�?結�?統�??�誤:', error);
        res.status(500).json({ error: '?��?競�?結�?統�?失�?' });
    }
});

// 計�?買入?��?統�?
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
        
        // ?��?平�??�格
        const weightedSum = fulfilledBids.reduce((sum, b) => 
            sum + (b.price * b.quantity_fulfilled), 0);
        stats.averageFulfilledPrice = (weightedSum / totalFulfilled).toFixed(2);
    }
    
    return stats;
}

// 計�?�?��?��?統�?
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
            highestPriceUnsold: 0  // ?��?：�?高價滯銷?��?
        };
    }
    
    const fulfilledBids = bids.filter(b => b.quantity_fulfilled > 0);
    const totalSubmitted = bids.reduce((sum, b) => sum + b.quantity_submitted, 0);
    const totalFulfilled = bids.reduce((sum, b) => sum + (b.quantity_fulfilled || 0), 0);
    
    // 計�?2.5%?��?滯銷：找?��?高價?��?並�?算其2.5%滯銷??
    let highestPriceUnsold = 0;
    if (bids.length > 0) {
        const maxPrice = Math.max(...bids.map(b => b.price));
        const highPriceBids = bids.filter(b => b.price === maxPrice);
        
        // 每個�?高價?��??��?2.5%滯銷
        highestPriceUnsold = highPriceBids.reduce((sum, bid) => {
            return sum + Math.ceil(bid.quantity_submitted * 2.5 / 100);
        }, 0);
    }
    
    // 總滯?��? = ?�?�未?�交?��?（�???.5%?��?滯銷 + ?��??��??��?交�?
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
        highestPriceUnsold: highestPriceUnsold  // ?�高價2.5%?��?滯銷??
    };
    
    if (fulfilledBids.length > 0) {
        const prices = fulfilledBids.map(b => b.price);
        stats.lowestFulfilledPrice = Math.min(...prices);
        stats.highestFulfilledPrice = Math.max(...prices);
        
        // ?��?平�??�格
        const weightedSum = fulfilledBids.reduce((sum, b) => 
            sum + (b.price * b.quantity_fulfilled), 0);
        stats.averageFulfilledPrice = (weightedSum / totalFulfilled).toFixed(2);
    }
    
    return stats;
}

// ?��??��??��?統�?
async function getTeamBidStats(gameDayId) {
    const [teamStats] = await pool.execute(
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

// 強制結�??�戲
app.post('/api/admin/games/:gameId/force-end', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '?�戲不�??? });
        }
        
        if (game[0].status === 'completed') {
            return res.status(400).json({ error: '?�戲已�?結�?' });
        }
        
        // ?�新?�戲?�?�為結�?
        await pool.execute('UPDATE games SET status = "completed", is_force_ended = TRUE, force_ended_at = NOW(), force_end_day = ? WHERE id = ?', [game[0].current_day, gameId]);
        
        // 記�?強制結�??��??��??��?
        await pool.execute(
            `INSERT INTO game_logs (game_id, action, details, created_at) 
             VALUES (?, 'force_ended', 'Game was forcefully ended by admin', NOW())`,
            [gameId]
        );
        
        console.log(`?�戲 ${gameId} 已強?��??�`);
        res.json({ success: true, message: '?�戲已強?��??? });
        io.emit('gameUpdate', { gameId, event: 'gameForceEnded' });
    } catch (error) {
        console.error('強制結�??�戲?�誤:', error);
        res.status(500).json({ error: '強制結�??�戲失�?' });
    }
});

// ?��?歷史?�戲?�表
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
        // 構建?��??�詢
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
        
        // 計�?總數
        const countQuery = `
            SELECT COUNT(DISTINCT g.id) as total
            FROM games g
            ${whereClause}
        `;
        
        const [countResult] = await pool.execute(countQuery, params);
        const totalGames = countResult[0].total;
        const totalPages = Math.ceil(totalGames / pageSize);
        
        // ?��??�戲資�?（帶?��?�?
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
                   CASE WHEN g.status = 'completed' THEN g.updated_at ELSE NULL END as ended_at
            FROM games g
            ${whereClause}
            ORDER BY g.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const [games] = await pool.execute(gamesQuery, [...params, parseInt(pageSize), offset]);
        
        // ?��??��??�獲?��??��???
        const gamesWithRankings = await Promise.all(games.map(async (game) => {
            if (game.status === 'completed') {
                // ?��??�終�???
                const rankingQuery = `
                    SELECT u.team_name, u.username, dr.roi, dr.cumulative_profit
                    FROM daily_results dr
                    JOIN game_days gd ON dr.game_day_id = gd.id
                    JOIN users u ON dr.team_id = u.id
                    WHERE gd.game_id = ? AND gd.day_number = ?
                    ORDER BY dr.roi DESC
                    LIMIT 3
                `;
                
                const [rankings] = await pool.execute(rankingQuery, [game.game_id, game.current_day]);
                game.final_rankings = rankings.map(rank => ({
                    team_name: rank.team_name || `?��?${rank.username}`,
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
        console.error('?��?歷史?�戲?�誤:', error);
        res.status(500).json({ error: '?��?歷史?�戲失�?' });
    }
});

// ?��??�戲詳細資�?
app.get('/api/admin/games/:gameId/details', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    try {
        // ?��??�戲?�本資�?
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        
        if (game.length === 0) {
            return res.status(404).json({ error: '?�戲不�??? });
        }
        
        // ?��??�?��??��???
        const [teams] = await pool.execute(
            `SELECT gp.*, u.team_name
             FROM game_participants gp
             JOIN users u ON gp.team_id = u.id
             WHERE gp.game_id = ?`,
            [gameId]
        );
        
        // ?��?每日?��?
        const [dailyData] = await pool.execute(
            `SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number`,
            [gameId]
        );
        
        // ?��??�終�???
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
        console.error('?��??�戲詳�??�誤:', error);
        res.status(500).json({ error: '?��??�戲詳�?失�?' });
    }
});

app.get('/api/leaderboard/:gameId', async (req, res) => {
    const { gameId } = req.params;
    
    try {
        const [game] = await pool.execute('SELECT * FROM games WHERE id = ?', [gameId]);
        if (game.length === 0) {
            return res.status(404).json({ error: '?�戲不�??? });
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
        console.error('?��??��?榜錯�?', error);
        res.status(500).json({ error: '?��??��?榜失?? });
    }
});

// ?��?買入?��?
async function processBuyBids(gameDay) {
    // ?��???��並�?始�???
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
        
        console.log(`?��?${fishType}級�?買入?��?：�?給�?=${supply}, 底價=${floorPrice}`);
        
        const [bids] = await connection.execute(
            `SELECT * FROM bids 
             WHERE game_day_id = ? AND bid_type = 'buy' AND fish_type = ?
             ORDER BY price DESC, created_at ASC`,
            [gameDay.id, fishType]
        );
        
        console.log(`${fishType}級�?買入?��??��?: ${bids.length}`);
        
        for (const bid of bids) {
            console.log(`?��?${fishType}級�??��?: ?��?${bid.team_id}, ?�格${bid.price}, ?��?${bid.quantity_submitted}`);
            
            if (bid.price < floorPrice) {
                console.log(`?�格${bid.price}低於底價${floorPrice}，�?記為失�?`);
                await connection.execute(
                    'UPDATE bids SET status = "failed" WHERE id = ?',
                    [bid.id]
                );
                continue;
            }
            
            if (remainingSupply <= 0) {
                console.log(`供�??�已?��?，�?記為失�?`);
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
            
            console.log(`?�交${fulfilledQuantity}kg，�??��?${status}，剩餘�??��?${remainingSupply}`);
            
            await connection.execute(
                'UPDATE bids SET quantity_fulfilled = ?, status = ? WHERE id = ?',
                [fulfilledQuantity, status, bid.id]
            );
            
            if (fulfilledQuantity > 0) {
                const totalCost = fulfilledQuantity * bid.price;
                
                // 檢查並�??�借貸
                const [participant] = await connection.execute(
                    'SELECT * FROM game_participants WHERE game_id = ? AND team_id = ?',
                    [gameDay.game_id, bid.team_id]
                );

                if (participant[0].current_budget < totalCost) {
                    const loanNeeded = totalCost - participant[0].current_budget;

                    // 檢查借貸額度限制
                    const maxLoan = game[0].initial_budget * game[0].max_loan_ratio;
                    const newLoanPrincipal = participant[0].total_loan_principal + loanNeeded;

                    if (newLoanPrincipal > maxLoan) {
                        throw new Error(`團隊 ${bid.team_id} 借貸超過額度限制 (需要 ${newLoanPrincipal}, 上限 ${maxLoan})`);
                    }

                    await connection.execute(
                        `UPDATE game_participants
                         SET total_loan = total_loan + ?,
                             total_loan_principal = total_loan_principal + ?,
                             current_budget = current_budget + ?
                         WHERE game_id = ? AND team_id = ?`,
                        [loanNeeded, loanNeeded, loanNeeded, gameDay.game_id, bid.team_id]
                    );
                }
                
                // ??��?�本並�??�庫�?
                await connection.execute(
                    `UPDATE game_participants 
                     SET current_budget = current_budget - ?,
                         ${fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory'} = 
                         ${fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory'} + ?
                     WHERE game_id = ? AND team_id = ?`,
                    [totalCost, fulfilledQuantity, gameDay.game_id, bid.team_id]
                );
                
                // 記�?交�???transactions �?- 使用�?��?��?位�?�?
                // ?��? SQL，transactions 表�?: game_id, game_day_id, day_number, team_id, 
                // transaction_type, fish_type, price, quantity, total_amount
                await connection.execute(
                    `INSERT INTO transactions 
                     (game_id, game_day_id, day_number, team_id, transaction_type, fish_type, price, quantity, total_amount)
                     VALUES (?, ?, ?, ?, 'buy', ?, ?, ?, ?)`,
                    [gameDay.game_id, gameDay.id, gameDay.day_number, bid.team_id, fishType, bid.price, fulfilledQuantity, totalCost]
                );
            }
        }
        
        console.log(`${fishType}級�?買入?��??��?完�?，剩餘�?給�?: ${remainingSupply}`);
    }
    
    // ?�交事�?
    await connection.commit();
    console.log('買入?��??��?完�?');
    } catch (error) {
        // ?��??�誤?��?滾�???
        await connection.rollback();
        throw error;
    } finally {
        // ?�放??��
        connection.release();
    }
}

// ?��?�?��?��? - ?�含?��?滯銷機制（修復�?�?
async function processSellBids(gameDay) {
    // ?��???��並�?始�???
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
        // ?��??�戲設�?
        const [gameInfo] = await connection.execute(
            'SELECT unsold_fee_per_kg, fixed_unsold_ratio FROM games WHERE id = ?',
            [gameDay.game_id]
        );
        const fixedUnsoldRatio = gameInfo[0].fixed_unsold_ratio || 2.5;
        const unsoldFeePerKg = gameInfo[0].unsold_fee_per_kg || 10;
        
        console.log(`?��?�?��?��? - ?��?滯銷比�?: ${fixedUnsoldRatio}%`);
        
        for (const fishType of ['A', 'B']) {
            // ?��?資�?庫�?構使?�正確�?欄�??�稱
            const budget = fishType === 'A' ? gameDay.fish_a_restaurant_budget : gameDay.fish_b_restaurant_budget;
            let remainingBudget = Number(budget);
            
            // ?��??�?�賣?��?標�??�格?��??��? - ?��??��?�?
            const [allBids] = await connection.execute(
                `SELECT * FROM bids 
                 WHERE game_day_id = ? AND bid_type = 'sell' AND fish_type = ?
                 ORDER BY price ASC, created_at ASC`,
                [gameDay.id, fishType]
            );
            
            if (allBids.length === 0) continue;

            // 步�?1：�?算�??��?標�?總�?（根?��??��??��??�部?�交?��?2.5%?�滯?��?
            const totalBidQuantity = allBids.reduce((sum, bid) => sum + bid.quantity_submitted, 0);
            const fixedUnsoldQuantity = Math.ceil(totalBidQuantity * fixedUnsoldRatio / 100);

            console.log(`${fishType}級�?：總?��???${totalBidQuantity}kg，固定滯??${fixedUnsoldQuantity}kg (${fixedUnsoldRatio}%)`);

            // 步�?2：找?��??��?標並?�價?��?序、�??��?序�??��??��??��??��?，�??��??��??�滯?��?
            const sortedBids = [...allBids].sort((a, b) => {
                if (b.price !== a.price) {
                    return b.price - a.price; // ?�格高�??��?
                }
                return new Date(b.created_at) - new Date(a.created_at); // ?�價?��?，�??��??�優?��??��?被�??�滯?��?
            });

            // 步�?3：�??�高價?��??��??��?滯銷??
            const unsoldAllocation = new Map();
            let remainingUnsoldQuantity = fixedUnsoldQuantity;

            for (const bid of sortedBids) {
                if (remainingUnsoldQuantity <= 0) break;

                const bidUnsold = Math.min(bid.quantity_submitted, remainingUnsoldQuantity);
                if (bidUnsold > 0) {
                    unsoldAllocation.set(bid.id, bidUnsold);
                    remainingUnsoldQuantity -= bidUnsold;
                    console.log(`?��?${bid.team_id} ?�格${bid.price} ?��?${bid.quantity_submitted}kg，�??�滯??{bidUnsold}kg`);
                }
            }

            console.log(`${fishType}級�?：總滯銷?��?完�?，剩餘未?��?=${remainingUnsoldQuantity}kg`);

            // 步�?4：�??��??��?標�?交�??��??��?，已?��?滯銷?�部?��??�賣?��?
            for (const bid of allBids) {
                if (remainingBudget <= 0) {
                    // ?��?不足，�?記為失�?
                    await connection.execute(
                        'UPDATE bids SET quantity_fulfilled = 0, status = "failed" WHERE id = ?',
                        [bid.id]
                    );
                    continue;
                }
                
                // 計�??�售?��?（扣?�滯?�部?��?
                let availableQuantity = bid.quantity_submitted;
                const bidUnsoldQuantity = unsoldAllocation.get(bid.id) || 0;

                if (bidUnsoldQuantity > 0) {
                    availableQuantity = bid.quantity_submitted - bidUnsoldQuantity;
                    console.log(`?��?${bid.team_id} ?�格${bid.price}：總??{bid.quantity_submitted}kg，滯??{bidUnsoldQuantity}kg，可??{availableQuantity}kg`);
                }
                
                if (availableQuantity <= 0) {
                    // ?�部滯銷
                    await connection.execute(
                        'UPDATE bids SET quantity_fulfilled = 0, status = "failed" WHERE id = ?',
                        [bid.id]
                    );
                    continue;
                }
                
                // 計�?實�??�交?��?（基?��?廳�?算�?
                const maxAffordableQuantity = Math.floor(remainingBudget / bid.price);
                const fulfilledQuantity = Math.min(availableQuantity, maxAffordableQuantity);
                const totalRevenue = fulfilledQuantity * bid.price;
                
                if (fulfilledQuantity > 0) {
                    remainingBudget -= totalRevenue;

                    // ?�斷?�?��?如�??�滯?��??�使?�售?��??�部?�出也�??��??�交
                    let bidStatus;
                    if (bidUnsoldQuantity > 0) {
                        // ?�滯?��??�多只?�是?��??�交
                        bidStatus = 'partial';
                    } else {
                        // ?�滯?��??��?實�??�交?��??�斷
                        bidStatus = fulfilledQuantity === bid.quantity_submitted ? 'fulfilled' : 'partial';
                    }
                    
                    // ?�新?��?記�?
                    await connection.execute(
                        'UPDATE bids SET quantity_fulfilled = ?, status = ? WHERE id = ?',
                        [fulfilledQuantity, bidStatus, bid.id]
                    );
                    
                    // ??��庫�?（注?��??��??�戲規�?，銷?�收?��??��?資�?池�?
                    // 資�?池只減�?增�??�入?�用?�利潤�?�?
                    await connection.execute(
                        `UPDATE game_participants
                         SET ${fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory'} =
                             ${fishType === 'A' ? 'fish_a_inventory' : 'fish_b_inventory'} - ?
                         WHERE game_id = ? AND team_id = ?`,
                        [fulfilledQuantity, gameDay.game_id, bid.team_id]
                    );
                    
                    // 記�?交�???transactions �?- 使用�?��?��?位�?�?
                    await connection.execute(
                        `INSERT INTO transactions 
                         (game_id, game_day_id, day_number, team_id, transaction_type, fish_type, price, quantity, total_amount)
                         VALUES (?, ?, ?, ?, 'sell', ?, ?, ?, ?)`,
                        [gameDay.game_id, gameDay.id, gameDay.day_number, bid.team_id, fishType, bid.price, fulfilledQuantity, totalRevenue]
                    );
                    
                    console.log(`?��?${bid.team_id}�?��${fulfilledQuantity}kg ${fishType}級�?，單??{bid.price}，收??{totalRevenue}`);
                } else {
                    // ?��??�交
                    await connection.execute(
                        'UPDATE bids SET quantity_fulfilled = 0, status = "failed" WHERE id = ?',
                        [bid.id]
                    );
                }
            }
        }
        
        // ?�交事�?
        await connection.commit();
        console.log('�?��?��??��?完�?（含?��?2.5%滯銷機制�?);
        
    } catch (error) {
        // ?��??�誤?��?滾�???
        await connection.rollback();
        throw error;
    } finally {
        // ?�放??��
        connection.release();
    }
}

/**
 * 強�??��??��?算�???- 使用事�??��?精度計�?
 * @param {Object} pool - MySQL ??���?
 * @param {Number} gameId - ?�戲ID
 * @param {Number} gameDayId - ?�戲天ID
 * @param {Number} dayNumber - 天數
 * @param {Boolean} isForceEnd - ?�否?�強?��??��?強制計�?ROI�?
 */
async function enhancedDailySettlement(pool, gameId, gameDayId, dayNumber, isForceEnd = false) {
    // ?��?資�?庫�?��以�?始�???
    const connection = await pool.getConnection();
    
    try {
        // ?��?事�?
        await connection.beginTransaction();
        console.log(`?��?�?${dayNumber} 天�?算�?事�?模�?）`);
        
        // 1. 讀?��??�基?��?�?
        const [game] = await connection.execute(
            'SELECT * FROM games WHERE id = ? FOR UPDATE',
            [gameId]
        );
        
        if (game.length === 0) {
            throw new Error('?�戲不�???);
        }
        
        const gameInfo = game[0];
        
        // 使用 Decimal.js ?��??�?��?�?
        const initialBudget = new Decimal(gameInfo.initial_budget);
        // 注�?：�??�庫�?loan_interest_rate 已�??��??�形式�?0.03 = 3%）�?不�?要�??�以100
        const loanInterestRate = new Decimal(gameInfo.loan_interest_rate);
        const unsoldFeePerKg = new Decimal(gameInfo.unsold_fee_per_kg);
        
        // 2. 讀?��??��??��??��??��??�止並發修改�?
        const [participants] = await connection.execute(
            'SELECT * FROM game_participants WHERE game_id = ? FOR UPDATE',
            [gameId]
        );
        
        // 3. ?��?每個�??��?結�?
        for (const participant of participants) {
            console.log(`?��??��? ${participant.team_id} ?��?�?..`);
            
            // 3.1 讀?�當?��??�買?��?�?
            const [buyBids] = await connection.execute(
                `SELECT fish_type, price, quantity_fulfilled 
                 FROM bids 
                 WHERE game_day_id = ? AND team_id = ? AND bid_type = 'buy'`,
                [gameDayId, participant.team_id]
            );
            
            // 3.2 讀?�當?��??�賣?��?�?
            const [sellBids] = await connection.execute(
                `SELECT fish_type, price, quantity_fulfilled 
                 FROM bids 
                 WHERE game_day_id = ? AND team_id = ? AND bid_type = 'sell'`,
                [gameDayId, participant.team_id]
            );
            
            // 3.3 使用高精度�?算�???
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
            
            // 3.4 使用高精度�?算收??
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
            
            // 3.5 計�?庫�?變�?
            const currentBudget = new Decimal(participant.current_budget);
            const currentLoan = new Decimal(participant.total_loan);
            const currentLoanPrincipal = new Decimal(participant.total_loan_principal);
            
            // 計�??�日?�售?�數?��??�日買入 - ?�日�?���?
            const fishAUnsold = Math.max(0, fishABought - fishASold);
            const fishBUnsold = Math.max(0, fishBBought - fishBSold);
            
            // 3.6 計�?滯銷費�??�售?��?魚�?
            const unsoldQuantity = fishAUnsold + fishBUnsold;
            const unsoldFee = unsoldFeePerKg.times(unsoldQuantity);
            
            // ?��??��??��?每日結�?庫�?歸零（�?論�?沒�?�?���?
            const newFishAInventory = 0;
            const newFishBInventory = 0;
            
            // 3.7 計�??�息（使?��??��?
            const interestIncurred = currentLoan.times(loanInterestRate);
            const newTotalLoan = currentLoan.plus(interestIncurred);

            // 3.8 計�??��?算�?注�?：根?��??��??��??�售?�入不�??��??��?�?
            // 資�?池只減�?增�??�扣?��??�、滯?�費?�利??
            let newBudget = currentBudget.minus(unsoldFee).minus(interestIncurred);
            let additionalLoan = new Decimal(0);

            // 如�??��?不足，自?�借貸
            if (newBudget.lessThan(0)) {
                additionalLoan = newBudget.abs();

                // 檢查借貸額度限制
                const maxLoan = initialBudget.times(new Decimal(gameInfo.max_loan_ratio));
                const newLoanPrincipal = currentLoanPrincipal.plus(additionalLoan);

                if (newLoanPrincipal.greaterThan(maxLoan)) {
                    throw new Error(`團隊 ${participant.team_id} 每日結算時借貸超過額度限制 (需要 ${newLoanPrincipal.toFixed(2)}, 上限 ${maxLoan.toFixed(2)})`);
                }

                newBudget = new Decimal(0);
            }
            
            const newLoanPrincipal = currentLoanPrincipal.plus(additionalLoan);
            const finalTotalLoan = newTotalLoan.plus(additionalLoan);
            
            // 3.9 計�?每日?�潤
            const dailyProfit = totalRevenue.minus(totalCost).minus(unsoldFee).minus(interestIncurred);
            
            // 3.10 ?��?累�??�潤
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
            
            // 3.11 計�? ROI（在?�後�?天�?強制結�??��?
            let roi = new Decimal(0);
            const [gameSettings] = await connection.execute(
                'SELECT total_days FROM games WHERE id = ?',
                [gameId]
            );
            const totalDays = gameSettings[0].total_days || 7;
            
            if (isForceEnd || dayNumber === totalDays) {
                // 使用精確?��?: ROI = (cumulative_profit / (initial_budget + total_loan_principal)) * 100
                const totalInvestment = initialBudget.plus(newLoanPrincipal);
                if (totalInvestment.greaterThan(0)) {
                    roi = cumulativeProfit.dividedBy(totalInvestment).times(100);
                }
                console.log(`?��? ${participant.team_id} ${isForceEnd ? '強制結�?' : '?��?} ROI: ${roi.toFixed(2)}%`);
            }
            
            // 3.12 ?�新 game_participants �?
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
            
            // 3.13 ?�入 daily_results 記�? - 使用�?��?�主要�?位�?�?
            // 使用主�?欄�??��??�容欄�?�?
            // starting_cash, ending_cash (NOT closing_budget)
            // starting_loan, ending_loan (NOT closing_loan)
            // buy_cost (NOT cost), sell_revenue (NOT revenue)
            // interest_paid (NOT interest_incurred)

            await connection.execute(
                `INSERT INTO daily_results (
                    game_id, game_day_id, day_number, team_id,
                    starting_cash, ending_cash,
                    starting_loan, ending_loan,
                    fish_a_bought, fish_a_sold, fish_a_unsold,
                    fish_b_bought, fish_b_sold, fish_b_unsold,
                    buy_cost, sell_revenue, unsold_fee, interest_paid,
                    daily_profit, cumulative_profit, roi
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    gameId,
                    gameDayId,
                    dayNumber,
                    participant.team_id,
                    currentBudget.toFixed(2),          // starting_cash
                    newBudget.toFixed(2),              // ending_cash
                    currentLoan.toFixed(2),            // starting_loan
                    finalTotalLoan.toFixed(2),         // ending_loan
                    fishABought,                       // fish_a_bought
                    fishASold,                         // fish_a_sold
                    fishAUnsold,                       // fish_a_unsold
                    fishBBought,                       // fish_b_bought
                    fishBSold,                         // fish_b_sold
                    fishBUnsold,                       // fish_b_unsold
                    totalCost.toFixed(2),              // buy_cost
                    totalRevenue.toFixed(2),           // sell_revenue
                    unsoldFee.toFixed(2),              // unsold_fee
                    interestIncurred.toFixed(2),       // interest_paid
                    dailyProfit.toFixed(2),            // daily_profit
                    cumulativeProfit.toFixed(2),       // cumulative_profit
                    roi.toFixed(2)                     // roi
                ]
            );
            
            console.log(`?��? ${participant.team_id} 結�?完�?`);
        }
        
        // ?�交事�?
        await connection.commit();
        console.log(`�?${dayNumber} 天�?算�??��??��?事�?已�?交�?`);
        
        return { success: true, message: '結�?完�?' };
        
    } catch (error) {
        // ?��??�誤，�?滾�???
        await connection.rollback();
        console.error('結�?失�?，�??�已?�滾:', error);
        throw error;
        
    } finally {
        // ?�放??��
        connection.release();
    }
}

// ===== ?��?：�??��??�管??API =====

// ?��??�戲?�數
app.get('/api/admin/game-parameters', authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.json(defaultGameParameters);
    } catch (error) {
        console.error('?��??�數失�?:', error);
        res.status(500).json({ error: '?��??�數失�?' });
    }
});

// ?�新?�戲?�數
app.post('/api/admin/game-parameters', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const newParams = req.body;
        
        // 驗�??�數
        if (newParams.initialBudget && newParams.initialBudget < 0) {
            return res.status(400).json({ error: '?��??��?不能?��??? });
        }
        if (newParams.loanInterestRate && (newParams.loanInterestRate < 0 || newParams.loanInterestRate > 1)) {
            return res.status(400).json({ error: '?��?必�???0-100% 之�?' });
        }
        if (newParams.totalDays && (newParams.totalDays < 1 || newParams.totalDays > 30)) {
            return res.status(400).json({ error: '?�戲天數必�???1-30 天�??? });
        }
        
        // ?�新?�數
        defaultGameParameters = {
            ...defaultGameParameters,
            ...newParams
        };
        
        console.log('?�戲?�數已更??', defaultGameParameters);
        
        res.json({ 
            message: '?�數已�??�更??,
            parameters: defaultGameParameters
        });
        
    } catch (error) {
        console.error('?�新?�數失�?:', error);
        res.status(500).json({ error: '?�新?�數失�?' });
    }
});


// 強制結�??�戲（�?�?ROI�?
app.post('/admin/games/:gameId/force-end', authenticateToken, requireAdmin, async (req, res) => {
    const { gameId } = req.params;
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // 檢查?�戲?�??
        const [game] = await connection.execute(
            'SELECT * FROM games WHERE id = ? FOR UPDATE',
            [gameId]
        );
        
        if (game.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: '?�戲不�??? });
        }
        
        if (game[0].status === 'completed') {
            await connection.rollback();
            return res.status(400).json({ error: '?�戲已�??? });
        }
        
        // ?��??��?天數
        const [currentDay] = await connection.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [gameId]
        );
        
        const currentDayNumber = currentDay.length > 0 ? currentDay[0].day_number : 1;
        
        // 如�??�當天未結�??��??��??�進�?結�?
        if (currentDay.length > 0 && currentDay[0].status !== 'completed') {
            // ?��??��??��??��?
            if (currentDay[0].status === 'buying_open' || currentDay[0].status === 'buying_closed') {
                await processBuyBids(currentDay[0]);
            }
            if (currentDay[0].status === 'selling_open' || currentDay[0].status === 'selling_closed') {
                await processSellBids(currentDay[0]);
            }

            // ?��??�天結�?（強?��?�?ROI�?
            await forceEndDailySettlement(connection, gameId, currentDay[0].id, currentDayNumber, true);

            await connection.execute(
                'UPDATE game_days SET status = ? WHERE id = ?',
                ['completed', currentDay[0].id]
            );
        } else if (currentDayNumber > 0) {
            // 如�?已�?算�??�戲?��??��??�新計�??��?ROI
            await calculateFinalROI(connection, gameId, currentDayNumber);
        }
        
        // ?�新?�戲?�??
        await connection.execute(
            'UPDATE games SET status = "completed", is_force_ended = TRUE, force_ended_at = NOW(), force_end_day = ? WHERE id = ?',
            [currentDayNumber, gameId]
        );
        
        await connection.commit();
        
        // ?�知?�?��?��?�客?�端
        io.to(`game-${gameId}`).emit('gameStatusUpdate', {
            status: 'completed', isForceEnded: true,
            message: '?�戲已強?��???,
            endDay: currentDayNumber
        });
        
        res.json({ 
            message: '?�戲已強?��???,
            endDay: currentDayNumber,
            roiCalculated: true
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('強制結�??�戲失�?:', error);
        res.status(500).json({ error: '強制結�??�戲失�?' });
    } finally {
        connection.release();
    }
});

// 強制結�??��?結�??�數（�?�?ROI�?
async function forceEndDailySettlement(connection, gameId, gameDayId, dayNumber, isForceEnd = true) {
    console.log(`?��?強制結�?結�?（第 ${dayNumber} 天�?`);
    
    // ?�接調用 enhancedDailySettlement，�?使用 connection ?��???pool
    // ?�建一?�模?��? pool 對象以適??
    const mockPool = {
        getConnection: async () => connection
    };
    
    // 調用?��???enhancedDailySettlement，傳??isForceEnd = true
    await enhancedDailySettlement(mockPool, gameId, gameDayId, dayNumber, true);
}

// 計�??��?ROI（用?�已結�?但�?要強?��??��??��?�?
async function calculateFinalROI(connection, gameId, dayNumber) {
    console.log(`計�??��?ROI（第 ${dayNumber} 天強?��??��?`);
    
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
        
        // ?�新?�後�?�?daily_results ??ROI
        // MySQL 不支?�在 UPDATE 中直?�使??ORDER BY LIMIT，�?要用子查�?
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
        
        console.log(`?��? ${participant.team_id} 強制結�? ROI: ${roi.toFixed(2)}%`);
    }
}

// Socket.io ????��?
io.on('connection', (socket) => {
    console.log('?�用?��?��');
    
    socket.on('joinGame', (gameId) => {
        socket.join(`game-${gameId}`);
        console.log(`?�戶?�入?�戲?��?: game-${gameId}`);
    });
    
    socket.on('disconnect', () => {
        console.log('?�戶?��???��');
    });
});

// New APIs for student interface - Get real-time game status
app.get('/api/game/status', async (req, res) => {
    try {
        // Find the current active or pending game
        const [games] = await pool.execute(
            'SELECT * FROM games WHERE status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
            ['active', 'pending']
        );
        
        if (games.length === 0) {
            return res.json({ 
                gameActive: false, 
                message: '?��?沒�??��?中�??�戲' 
            });
        }
        
        const game = games[0];
        
        // Get current day information
        const [currentDay] = await pool.execute(
            'SELECT * FROM game_days WHERE game_id = ? ORDER BY day_number DESC LIMIT 1',
            [game.id]
        );
        
        if (currentDay.length === 0) {
            return res.json({
                gameActive: true,
                gameId: game.id,
                gameName: game.name,
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
            case 'completed':
                phase = 'settled';
                break;
            default:
                phase = 'pending';
        }
        
        res.json({
            gameActive: true,
            gameId: game.id,
            gameName: game.name,
            dayNumber: day.day_number,
            phase: phase,
            endTime: endTime,
            status: day.status
        });
        
    } catch (error) {
        console.error('Error getting game status:', error);
        res.status(500).json({ 
            error: '?��??�戲?�?�失?? 
        });
    }
});

// New API for student interface - Get anonymous bid history
app.get('/api/game/bid-history', async (req, res) => {
    try {
        // Find the current active game
        const [games] = await pool.execute(
            'SELECT * FROM games WHERE status = ? ORDER BY created_at DESC LIMIT 1',
            ['active']
        );
        
        if (games.length === 0) {
            return res.json({ 
                success: false, 
                message: '?��?沒�??��?中�??�戲',
                history: []
            });
        }
        
        const game = games[0];
        
        // Get all completed bid history (anonymized)
        const [bidHistory] = await pool.execute(
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
             WHERE gd.game_id = ? AND gd.status = 'completed'
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
            gameName: game.name,
            history: Object.values(groupedHistory)
        });
        
    } catch (error) {
        console.error('Error getting bid history:', error);
        res.status(500).json({ 
            error: '?��??��?歷史失�?' 
        });
    }
});

const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`伺�??��?行在 http://0.0.0.0:${PORT}`);
        console.log(`?��?網路訪�?: http://192.168.1.104:${PORT}`);
    });
});

