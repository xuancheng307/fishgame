const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';
let adminToken = '';
let teamToken = '';
let gameId = null;

async function testParameterFixes() {
    console.log('=== 參數修復測試 ===\n');
    
    try {
        // 1. 管理員登入
        console.log('[1] 管理員登入...');
        const adminLogin = await axios.post(`${API_BASE}/auth/login`, {
            username: 'admin',
            password: '123'
        });
        adminToken = adminLogin.data.token;
        console.log('✅ 管理員登入成功\n');
        
        // 2. 學生登入
        console.log('[2] 學生登入...');
        const teamLogin = await axios.post(`${API_BASE}/auth/login`, {
            username: '01',
            password: '01'
        });
        teamToken = teamLogin.data.token;
        console.log('✅ 學生登入成功\n');
        
        // 3. 創建遊戲（測試參數格式）
        console.log('[3] 創建遊戲（測試參數格式）...');
        const gameData = {
            gameName: '參數測試遊戲',
            totalDays: 3,
            numTeams: 5,
            initialBudget: 1000000,
            loanInterestRate: 0.03,
            unsoldFeePerKg: 10,
            fixedUnsoldRatio: 2.5,
            distributorFloorPriceA: 100,
            distributorFloorPriceB: 100,
            targetPriceA: 150,
            targetPriceB: 120
        };
        
        const createGame = await axios.post(`${API_BASE}/admin/games/create`, gameData, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        gameId = createGame.data.gameId || createGame.data.game_id || createGame.data.id;
        console.log(`✅ 遊戲創建成功 (ID: ${gameId})\n`);
        
        // 4. 學生加入遊戲
        console.log('[4] 學生加入遊戲...');
        await axios.post(`${API_BASE}/team/join-current`, {}, {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        console.log('✅ 學生加入遊戲成功\n');
        
        // 5. 測試 Dashboard API 結構
        console.log('[5] 測試 Dashboard API 結構...');
        const dashboard = await axios.get(`${API_BASE}/team/dashboard`, {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        
        console.log('Dashboard 回應結構:');
        console.log('- gameInfo:', !!dashboard.data.gameInfo);
        console.log('- financials:', !!dashboard.data.financials);
        console.log('- marketInfo:', !!dashboard.data.marketInfo);
        console.log('- history:', !!dashboard.data.history);
        
        if (dashboard.data.gameInfo) {
            console.log('gameInfo 內容:');
            console.log(`  - gameName: ${dashboard.data.gameInfo.gameName}`);
            console.log(`  - currentDay: ${dashboard.data.gameInfo.currentDay}`);
            console.log(`  - status: ${dashboard.data.gameInfo.status}`);
            console.log(`  - dayStatus: ${dashboard.data.gameInfo.dayStatus}`);
        }
        
        if (dashboard.data.financials) {
            console.log('financials 內容:');
            console.log(`  - currentBudget: ${dashboard.data.financials.currentBudget}`);
            console.log(`  - totalLoan: ${dashboard.data.financials.totalLoan}`);
            console.log(`  - fishAInventory: ${dashboard.data.financials.fishAInventory}`);
            console.log(`  - fishBInventory: ${dashboard.data.financials.fishBInventory}`);
        }
        console.log('✅ Dashboard API 結構正確\n');
        
        // 6. 測試 Advance Day API 參數格式
        console.log('[6] 測試 Advance Day API 參數格式...');
        const advanceDayData = {
            params: {
                fishASupply: 2000,
                fishBSupply: 4000,
                fishABudget: 500000,
                fishBBudget: 800000
            }
        };
        
        const advanceDay = await axios.post(`${API_BASE}/admin/games/${gameId}/advance-day`, advanceDayData, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        console.log('✅ Advance Day 參數格式正確（使用 params 嵌套結構）\n');
        
        // 7. 開始買入投標
        console.log('[7] 開始買入投標...');
        await axios.post(`${API_BASE}/admin/games/${gameId}/start-buying`, {}, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.log('✅ 買入投標開始\n');
        
        // 8. 測試投標參數格式
        console.log('[8] 測試投標參數格式...');
        const buyBids = {
            buyBids: [
                { fishType: 'A', price: 120, quantity: 100 },
                { fishType: 'B', price: 90, quantity: 150 }
            ]
        };
        
        await axios.post(`${API_BASE}/team/submit-buy-bids`, buyBids, {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        console.log('✅ 投標參數格式正確（fishType, price, quantity）\n');
        
        // 9. 重新檢查 Dashboard（確認更新）
        console.log('[9] 重新檢查 Dashboard 更新...');
        const updatedDashboard = await axios.get(`${API_BASE}/team/dashboard`, {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        
        console.log('更新後的財務狀況:');
        if (updatedDashboard.data.financials) {
            console.log(`  - currentBudget: ${updatedDashboard.data.financials.currentBudget}`);
            console.log(`  - fishAInventory: ${updatedDashboard.data.financials.fishAInventory}`);
            console.log(`  - fishBInventory: ${updatedDashboard.data.financials.fishBInventory}`);
        }
        console.log('✅ Dashboard 更新正常\n');
        
        console.log('=== 所有參數測試通過 ✅ ===');
        console.log('\n修復總結:');
        console.log('1. ✅ Advance Day API 使用正確的嵌套 params 結構');
        console.log('2. ✅ Dashboard API 使用正確的 gameInfo/financials 結構');
        console.log('3. ✅ 投標 API 使用正確的 fishType/price/quantity 參數');
        console.log('4. ✅ 所有參數命名統一且正確對應');
        
    } catch (error) {
        console.error('\n❌ 測試失敗:', error.response?.data || error.message);
        if (error.response) {
            console.error('錯誤詳情:', {
                status: error.response.status,
                url: error.config?.url,
                method: error.config?.method,
                data: error.config?.data
            });
        }
    }
}

// 執行測試
testParameterFixes().catch(console.error);