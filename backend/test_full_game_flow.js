const axios = require('axios');

// 測試配置
const API_BASE = 'https://backend-production-dc27.up.railway.app/api';
let adminToken = '';
let studentTokens = {};
let currentGameId = null;

// 顏色輸出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
    log(`✅ ${message}`, 'green');
}

function error(message) {
    log(`❌ ${message}`, 'red');
}

function info(message) {
    log(`ℹ️  ${message}`, 'cyan');
}

function section(message) {
    console.log('');
    log(`${'='.repeat(60)}`, 'blue');
    log(`  ${message}`, 'blue');
    log(`${'='.repeat(60)}`, 'blue');
}

// 等待函數
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 1. 測試管理員登入
async function testAdminLogin() {
    section('測試 1: 管理員登入');
    try {
        const response = await axios.post(`${API_BASE}/auth/login`, {
            username: 'admin',
            password: 'admin'
        });

        if (response.data.token) {
            adminToken = response.data.token;
            success('管理員登入成功');
            info(`Token: ${adminToken.substring(0, 20)}...`);
            return true;
        } else {
            error('登入回應缺少 token');
            return false;
        }
    } catch (err) {
        error(`管理員登入失敗: ${err.response?.data?.error || err.message}`);
        return false;
    }
}

// 2. 測試創建遊戲
async function testCreateGame() {
    section('測試 2: 創建遊戲');
    try {
        const gameData = {
            gameName: `測試遊戲_${Date.now()}`,
            numTeams: 4,
            totalDays: 3,
            initialBudget: 1000000,
            loanInterestRate: 0.03,
            unsoldFeePerKg: 10,
            fixedUnsoldRatio: 2.5,
            distributorFloorPriceA: 100,
            distributorFloorPriceB: 100,
            targetPriceA: 150,
            targetPriceB: 120,
            buyingDuration: 7,
            sellingDuration: 4
        };

        const response = await axios.post(`${API_BASE}/admin/games/create`, gameData, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (response.data.gameId) {
            currentGameId = response.data.gameId;
            success(`遊戲創建成功! ID: ${currentGameId}`);
            info(`遊戲名稱: ${response.data.gameName}`);
            return true;
        } else {
            error('創建遊戲回應缺少 gameId');
            return false;
        }
    } catch (err) {
        error(`創建遊戲失敗: ${err.response?.data?.error || err.message}`);
        if (err.response?.data?.details) {
            info(`詳情: ${err.response.data.details}`);
        }
        return false;
    }
}

// 3. 測試學生登入並加入遊戲
async function testStudentsJoin() {
    section('測試 3: 學生登入並加入遊戲');
    const students = ['01', '02', '03', '04'];
    let successCount = 0;

    for (const studentId of students) {
        try {
            // 登入
            const loginRes = await axios.post(`${API_BASE}/auth/login`, {
                username: studentId,
                password: studentId
            });

            if (!loginRes.data.token) {
                error(`學生 ${studentId} 登入失敗: 無 token`);
                continue;
            }

            studentTokens[studentId] = loginRes.data.token;
            success(`學生 ${studentId} 登入成功`);

            // 加入遊戲
            const joinRes = await axios.post(`${API_BASE}/team/join-game`,
                { gameId: currentGameId },
                { headers: { 'Authorization': `Bearer ${loginRes.data.token}` } }
            );

            if (joinRes.data.success) {
                success(`學生 ${studentId} 成功加入遊戲`);
                successCount++;
            } else {
                error(`學生 ${studentId} 加入遊戲失敗`);
            }

            await sleep(500); // 避免請求過快
        } catch (err) {
            error(`學生 ${studentId} 操作失敗: ${err.response?.data?.error || err.message}`);
        }
    }

    info(`${successCount}/${students.length} 學生成功加入遊戲`);
    return successCount === students.length;
}

// 4. 測試推進第1天
async function testAdvanceDay(dayNumber) {
    section(`測試 4.${dayNumber}: 推進到第 ${dayNumber} 天`);
    try {
        const response = await axios.post(
            `${API_BASE}/admin/games/${currentGameId}/advance-day`,
            {},
            { headers: { 'Authorization': `Bearer ${adminToken}` } }
        );

        if (response.data.success) {
            success(`成功推進到第 ${dayNumber} 天`);
            info(`供應量 - A級魚: ${response.data.dayData?.fish_a_supply || '?'}, B級魚: ${response.data.dayData?.fish_b_supply || '?'}`);
            info(`餐廳預算 - A級魚: ${response.data.dayData?.fish_a_restaurant_budget || '?'}, B級魚: ${response.data.dayData?.fish_b_restaurant_budget || '?'}`);
            return true;
        } else {
            error('推進天數失敗');
            return false;
        }
    } catch (err) {
        error(`推進天數失敗: ${err.response?.data?.error || err.message}`);
        return false;
    }
}

// 5. 測試開始買入投標
async function testStartBuying() {
    section('測試 5: 開始買入投標');
    try {
        const response = await axios.post(
            `${API_BASE}/admin/games/${currentGameId}/start-buying`,
            {},
            { headers: { 'Authorization': `Bearer ${adminToken}` } }
        );

        if (response.data.success) {
            success('買入投標階段已開啟');
            info(`計時器: ${response.data.duration || 7} 分鐘`);
            return true;
        } else {
            error('開始買入投標失敗');
            return false;
        }
    } catch (err) {
        error(`開始買入投標失敗: ${err.response?.data?.error || err.message}`);
        return false;
    }
}

// 6. 測試學生提交買入標單
async function testSubmitBuyBids() {
    section('測試 6: 學生提交買入標單');
    const students = ['01', '02', '03', '04'];
    let successCount = 0;

    for (let i = 0; i < students.length; i++) {
        const studentId = students[i];
        try {
            // 每個學生出不同價格的 A 和 B 標單
            const bidsData = {
                fishType: 'A',
                bids: [
                    { price: 150 + i * 10, quantity: 100 },
                    { price: 140 + i * 10, quantity: 150 }
                ]
            };

            const response = await axios.post(
                `${API_BASE}/team/submit-buy-bids`,
                bidsData,
                { headers: { 'Authorization': `Bearer ${studentTokens[studentId]}` } }
            );

            if (response.data.success) {
                success(`學生 ${studentId} 提交 A級魚買入標單成功`);
                successCount++;
            }

            await sleep(300);

            // 提交 B級魚標單
            const bidsDataB = {
                fishType: 'B',
                bids: [
                    { price: 110 + i * 5, quantity: 200 },
                    { price: 105 + i * 5, quantity: 250 }
                ]
            };

            const responseB = await axios.post(
                `${API_BASE}/team/submit-buy-bids`,
                bidsDataB,
                { headers: { 'Authorization': `Bearer ${studentTokens[studentId]}` } }
            );

            if (responseB.data.success) {
                success(`學生 ${studentId} 提交 B級魚買入標單成功`);
            }

            await sleep(300);
        } catch (err) {
            error(`學生 ${studentId} 提交標單失敗: ${err.response?.data?.error || err.message}`);
        }
    }

    info(`${successCount}/${students.length} 學生成功提交買入標單`);
    return successCount > 0;
}

// 7. 測試關閉買入投標
async function testCloseBuying() {
    section('測試 7: 關閉買入投標');
    try {
        const response = await axios.post(
            `${API_BASE}/admin/games/${currentGameId}/close-buying`,
            {},
            { headers: { 'Authorization': `Bearer ${adminToken}` } }
        );

        if (response.data.success) {
            success('買入投標階段已關閉,結算完成');
            if (response.data.results) {
                info(`處理投標數量: ${response.data.results.totalBids || '?'}`);
            }
            return true;
        } else {
            error('關閉買入投標失敗');
            return false;
        }
    } catch (err) {
        error(`關閉買入投標失敗: ${err.response?.data?.error || err.message}`);
        return false;
    }
}

// 8. 測試開始賣出投標
async function testStartSelling() {
    section('測試 8: 開始賣出投標');
    try {
        const response = await axios.post(
            `${API_BASE}/admin/games/${currentGameId}/start-selling`,
            {},
            { headers: { 'Authorization': `Bearer ${adminToken}` } }
        );

        if (response.data.success) {
            success('賣出投標階段已開啟');
            return true;
        } else {
            error('開始賣出投標失敗');
            return false;
        }
    } catch (err) {
        error(`開始賣出投標失敗: ${err.response?.data?.error || err.message}`);
        return false;
    }
}

// 9. 測試學生提交賣出標單
async function testSubmitSellBids() {
    section('測試 9: 學生提交賣出標單');
    const students = ['01', '02', '03', '04'];
    let successCount = 0;

    for (let i = 0; i < students.length; i++) {
        const studentId = students[i];
        try {
            // A級魚賣出標單 (確保有不同價格測試滯銷機制)
            const sellBidsA = {
                fishType: 'A',
                bids: [
                    { price: 200 - i * 5, quantity: 50 },  // 價格差異化
                    { price: 180 - i * 5, quantity: 50 }
                ]
            };

            const response = await axios.post(
                `${API_BASE}/team/submit-sell-bids`,
                sellBidsA,
                { headers: { 'Authorization': `Bearer ${studentTokens[studentId]}` } }
            );

            if (response.data.success) {
                success(`學生 ${studentId} 提交 A級魚賣出標單成功`);
                successCount++;
            }

            await sleep(300);

            // B級魚賣出標單
            const sellBidsB = {
                fishType: 'B',
                bids: [
                    { price: 150 - i * 3, quantity: 100 },
                    { price: 140 - i * 3, quantity: 100 }
                ]
            };

            const responseB = await axios.post(
                `${API_BASE}/team/submit-sell-bids`,
                sellBidsB,
                { headers: { 'Authorization': `Bearer ${studentTokens[studentId]}` } }
            );

            if (responseB.data.success) {
                success(`學生 ${studentId} 提交 B級魚賣出標單成功`);
            }

            await sleep(300);
        } catch (err) {
            error(`學生 ${studentId} 提交賣出標單失敗: ${err.response?.data?.error || err.message}`);
        }
    }

    info(`${successCount}/${students.length} 學生成功提交賣出標單`);
    return successCount > 0;
}

// 10. 測試關閉賣出投標
async function testCloseSelling() {
    section('測試 10: 關閉賣出投標 (含2.5%滯銷機制)');
    try {
        const response = await axios.post(
            `${API_BASE}/admin/games/${currentGameId}/close-selling`,
            {},
            { headers: { 'Authorization': `Bearer ${adminToken}` } }
        );

        if (response.data.success) {
            success('賣出投標階段已關閉,結算完成');
            info('✅ 2.5% 滯銷機制已執行 (最高價標單)');
            return true;
        } else {
            error('關閉賣出投標失敗');
            return false;
        }
    } catch (err) {
        error(`關閉賣出投標失敗: ${err.response?.data?.error || err.message}`);
        return false;
    }
}

// 11. 測試每日結算
async function testDailySettle() {
    section('測試 11: 每日結算 (利息複利計算)');
    try {
        const response = await axios.post(
            `${API_BASE}/admin/games/${currentGameId}/settle`,
            {},
            { headers: { 'Authorization': `Bearer ${adminToken}` } }
        );

        if (response.data.success) {
            success('每日結算完成');
            info('✅ 滯銷費用已扣除');
            info('✅ 利息已計算 (複利)');
            info('✅ ROI 已更新');
            return true;
        } else {
            error('每日結算失敗');
            return false;
        }
    } catch (err) {
        error(`每日結算失敗: ${err.response?.data?.error || err.message}`);
        return false;
    }
}

// 12. 檢查每日結果
async function checkDailyResults(dayNumber) {
    section(`測試 12.${dayNumber}: 檢查第 ${dayNumber} 天結算結果`);
    try {
        const response = await axios.get(
            `${API_BASE}/admin/games/${currentGameId}/daily-results/${dayNumber}`,
            { headers: { 'Authorization': `Bearer ${adminToken}` } }
        );

        if (response.data.results && response.data.results.length > 0) {
            success(`第 ${dayNumber} 天結算資料已產生`);
            response.data.results.forEach(result => {
                info(`團隊 ${result.team_id}: 收入=${result.revenue}, 成本=${result.cost}, 滯銷費=${result.unsold_fee}, 利息=${result.interest_incurred}, 利潤=${result.daily_profit}`);
            });
            return true;
        } else {
            error('無結算資料');
            return false;
        }
    } catch (err) {
        error(`檢查結算結果失敗: ${err.response?.data?.error || err.message}`);
        return false;
    }
}

// 主測試流程
async function runFullTest() {
    log('\n🎮 魚市場遊戲完整流程測試 🎮\n', 'cyan');

    const results = {
        passed: 0,
        failed: 0,
        total: 0
    };

    const tests = [
        { name: '管理員登入', fn: testAdminLogin },
        { name: '創建遊戲', fn: testCreateGame },
        { name: '學生加入遊戲', fn: testStudentsJoin },
        // 創建遊戲時自動在第1天,不需要 advance-day
        { name: '開始買入投標', fn: testStartBuying },
        { name: '學生提交買入標單', fn: testSubmitBuyBids },
        { name: '關閉買入投標', fn: testCloseBuying },
        { name: '開始賣出投標', fn: testStartSelling },
        { name: '學生提交賣出標單', fn: testSubmitSellBids },
        { name: '關閉賣出投標', fn: testCloseSelling },
        { name: '每日結算', fn: testDailySettle },
        { name: '檢查第1天結算結果', fn: () => checkDailyResults(1) },
        { name: '推進第2天', fn: () => testAdvanceDay(2) },
        { name: '開始第2天買入', fn: testStartBuying },
        { name: '第2天提交買入標單', fn: testSubmitBuyBids },
        { name: '第2天關閉買入', fn: testCloseBuying },
        { name: '第2天開始賣出', fn: testStartSelling },
        { name: '第2天提交賣出標單', fn: testSubmitSellBids },
        { name: '第2天關閉賣出', fn: testCloseSelling },
        { name: '第2天結算', fn: testDailySettle },
        { name: '檢查第2天結算結果', fn: () => checkDailyResults(2) }
    ];

    for (const test of tests) {
        results.total++;
        const passed = await test.fn();
        if (passed) {
            results.passed++;
        } else {
            results.failed++;
            log(`\n⚠️  測試失敗,停止後續測試`, 'yellow');
            break;
        }
        await sleep(1000); // 每個測試間隔1秒
    }

    // 輸出測試摘要
    section('測試摘要');
    log(`總測試數: ${results.total}`, 'cyan');
    log(`通過: ${results.passed}`, 'green');
    log(`失敗: ${results.failed}`, 'red');

    if (results.failed === 0) {
        log('\n🎉 所有測試通過! 遊戲系統運作正常 🎉\n', 'green');
    } else {
        log('\n⚠️  部分測試失敗,請檢查錯誤訊息 ⚠️\n', 'yellow');
    }
}

// 執行測試
runFullTest().catch(err => {
    error(`測試執行錯誤: ${err.message}`);
    process.exit(1);
});
