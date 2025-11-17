const http = require('http');

async function testCreateGame() {
    // 先登入獲取token
    const loginData = JSON.stringify({
        username: 'admin',
        password: '123'
    });

    const loginOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': loginData.length
        }
    };

    const token = await new Promise((resolve, reject) => {
        const req = http.request(loginOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result.token);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(loginData);
        req.end();
    });

    console.log('登入成功，獲得 token');

    // 測試創建遊戲
    const gameData = JSON.stringify({
        gameName: 'Test Game ' + Date.now(),
        totalDays: 7,
        numTeams: 12,
        initialBudget: 1000000,
        loanInterestRate: 0.03,
        unsoldFeePerKg: 10,
        targetPriceA: 260,
        targetPriceB: 240,
        fixedUnsoldRatio: 2.5,
        buyingDuration: 7,
        sellingDuration: 4
    });

    const createOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/admin/games/create',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Length': gameData.length
        }
    };

    const result = await new Promise((resolve, reject) => {
        const req = http.request(createOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('HTTP Status:', res.statusCode);
                console.log('Response:', data);
                resolve({ status: res.statusCode, data });
            });
        });
        req.on('error', (e) => {
            console.error('Request error:', e);
            reject(e);
        });
        req.write(gameData);
        req.end();
    });

    if (result.status === 200) {
        console.log('遊戲創建成功！');
    } else {
        console.log('遊戲創建失敗');
    }
}

testCreateGame().catch(console.error);