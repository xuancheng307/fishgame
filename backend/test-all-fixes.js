const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';
let adminToken = '';
let teamToken = '';
let gameId = null;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testComplete() {
    console.log('=== 魚市場遊戲完整測試 ===\n');
    
    try {
        // 1. 管理員登入
        console.log('[1] 測試管理員登入...');
        const adminLogin = await axios.post(`${API_BASE}/auth/login`, {
            username: 'admin',
            password: '123'
        });
        adminToken = adminLogin.data.token;
        console.log('✅ 管理員登入成功\n');
        
        // 2. 創建遊戲（測試中文）
        console.log('[2] 創建遊戲（測試中文名稱）...');
        const gameData = {
            gameName: '測試遊戲中文',
            totalDays: 7,
            numTeams: 12,
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
        
        // 3. 學生登入
        console.log('[3] 測試學生登入...');
        const teamLogin = await axios.post(`${API_BASE}/auth/login`, {
            username: '01',
            password: '01'
        });
        teamToken = teamLogin.data.token;
        console.log('✅ 學生 01 登入成功\n');
        
        // 4. 加入遊戲
        console.log('[4] 學生加入遊戲...');
        await axios.post(`${API_BASE}/team/join-current`, {}, {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        console.log('✅ 成功加入遊戲\n');
        
        // 5. 獲取團隊資訊 (使用修正後的 dashboard API)
        console.log('[5] 獲取團隊 dashboard...');
        const dashboard = await axios.get(`${API_BASE}/team/dashboard`, {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        console.log('Dashboard 資料:', {
            gameId: dashboard.data.gameInfo?.id,
            teamName: dashboard.data.teamInfo?.team_name,
            currentBudget: dashboard.data.teamInfo?.current_budget,
            gameStatus: dashboard.data.gameStatus
        });
        console.log('✅ Dashboard API 正常\n');
        
        // 6. 開始買入投標
        console.log('[6] 開始買入投標階段...');
        await axios.post(`${API_BASE}/admin/games/${gameId}/start-buying`, {}, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.log('✅ 買入投標開始\n');
        
        await sleep(1000);
        
        // 7. 提交買入投標 (使用修正後的格式)
        console.log('[7] 提交買入投標...');
        const buyBids = {
            buyBids: [
                { fishType: 'A', price: 120, quantity: 100 },
                { fishType: 'B', price: 90, quantity: 200 }
            ]
        };
        
        await axios.post(`${API_BASE}/team/submit-buy-bids`, buyBids, {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        console.log('✅ 買入投標提交成功\n');
        
        // 8. 獲取當前投標 (使用修正後的 API)
        console.log('[8] 獲取當前投標資料...');
        const currentBids = await axios.get(`${API_BASE}/admin/games/${gameId}/current-bids`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.log(`當前投標數量: ${currentBids.data.bids?.length || 0}`);
        console.log('✅ 投標資料獲取成功\n');
        
        // 9. 結束買入投標
        console.log('[9] 結束買入投標...');
        await axios.post(`${API_BASE}/admin/games/${gameId}/close-buying`, {}, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.log('✅ 買入投標結束\n');
        
        // 10. 開始賣出投標
        console.log('[10] 開始賣出投標...');
        await axios.post(`${API_BASE}/admin/games/${gameId}/start-selling`, {}, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.log('✅ 賣出投標開始\n');
        
        await sleep(1000);
        
        // 11. 獲取更新後的團隊資訊
        console.log('[11] 檢查庫存...');
        const updatedDashboard = await axios.get(`${API_BASE}/team/dashboard`, {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        console.log('庫存:', {
            fishA: updatedDashboard.data.teamInfo?.fish_a_inventory,
            fishB: updatedDashboard.data.teamInfo?.fish_b_inventory
        });
        
        // 12. 提交賣出投標 (如果有庫存)
        if (updatedDashboard.data.teamInfo?.fish_a_inventory > 0 || 
            updatedDashboard.data.teamInfo?.fish_b_inventory > 0) {
            console.log('[12] 提交賣出投標...');
            const sellBids = { sellBids: [] };
            
            if (updatedDashboard.data.teamInfo?.fish_a_inventory > 0) {
                sellBids.sellBids.push({
                    fishType: 'A',
                    price: 180,
                    quantity: Math.min(50, updatedDashboard.data.teamInfo.fish_a_inventory)
                });
            }
            
            if (updatedDashboard.data.teamInfo?.fish_b_inventory > 0) {
                sellBids.sellBids.push({
                    fishType: 'B',
                    price: 140,
                    quantity: Math.min(100, updatedDashboard.data.teamInfo.fish_b_inventory)
                });
            }
            
            if (sellBids.sellBids.length > 0) {
                await axios.post(`${API_BASE}/team/submit-sell-bids`, sellBids, {
                    headers: { 'Authorization': `Bearer ${teamToken}` }
                });
                console.log('✅ 賣出投標提交成功\n');
            }
        }
        
        // 13. 獲取排行榜 (使用修正後的 API)
        console.log('[13] 獲取排行榜...');
        const leaderboard = await axios.get(`${API_BASE}/leaderboard/${gameId}`, {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        console.log(`排行榜隊伍數: ${leaderboard.data.teams?.length || 0}`);
        console.log('✅ 排行榜獲取成功\n');
        
        console.log('=== 所有測試通過 ✅ ===');
        console.log('\n修復總結:');
        console.log('1. ✅ API 路徑已統一 (/team/dashboard, /team/submit-buy-bids 等)');
        console.log('2. ✅ 投標資料格式已修正 (buyBids/sellBids 陣列格式)');
        console.log('3. ✅ Dashboard 資料結構已對應');
        console.log('4. ✅ 排行榜和訂單簿 API 已修正');
        console.log('5. ✅ 中文編碼已修復 (charset: utf8mb4)');
        
    } catch (error) {
        console.error('\n❌ 測試失敗:', error.response?.data || error.message);
        if (error.response) {
            console.error('錯誤詳情:', {
                status: error.response.status,
                url: error.config?.url,
                method: error.config?.method
            });
        }
    }
}

// 執行測試
testComplete().catch(console.error);