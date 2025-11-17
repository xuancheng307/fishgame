const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';
let adminToken = '';
let teamToken = '';
let gameId = null;

async function testParameterDisplay() {
    console.log('=== 學生界面參數顯示完整性測試 ===\n');
    
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
        
        // 3. 創建遊戲
        console.log('[3] 創建測試遊戲...');
        const gameData = {
            gameName: '參數顯示測試遊戲',
            totalDays: 5,
            numTeams: 8,
            initialBudget: 1200000,
            loanInterestRate: 0.04,
            unsoldFeePerKg: 15,
            fixedUnsoldRatio: 3.0,
            distributorFloorPriceA: 120,
            distributorFloorPriceB: 110,
            targetPriceA: 180,
            targetPriceB: 140
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
        console.log('✅ 學生加入成功\n');
        
        // 5. 推進到第1天並設定市場參數
        console.log('[5] 設定市場參數並推進遊戲...');
        const advanceDayData = {
            params: {
                fishASupply: 2500,
                fishBSupply: 4500,
                fishABudget: 600000,
                fishBBudget: 900000
            }
        };
        
        await axios.post(`${API_BASE}/admin/games/${gameId}/advance-day`, advanceDayData, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.log('✅ 遊戲推進並設定市場參數\n');
        
        // 6. 檢查Dashboard完整性
        console.log('[6] 檢查Dashboard參數完整性...');
        const dashboard = await axios.get(`${API_BASE}/team/dashboard`, {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        
        const data = dashboard.data;
        
        console.log('=== 遊戲基本資訊 ===');
        console.log(`遊戲名稱: ${data.gameInfo?.gameName || '❌ 未提供'}`);
        console.log(`當前天數: ${data.gameInfo?.currentDay || '❌ 未提供'}`);
        console.log(`總天數: ${data.gameInfo?.totalDays || '❌ 未提供'}`);
        console.log(`遊戲狀態: ${data.gameInfo?.status || '❌ 未提供'}`);
        console.log(`階段狀態: ${data.gameInfo?.dayStatus || '❌ 未提供'}\n`);
        
        console.log('=== 團隊財務狀況 ===');
        const financials = data.financials || {};
        console.log(`當前預算: $${(financials.currentBudget || 0).toLocaleString()}`);
        console.log(`總借貸: $${(financials.totalLoan || 0).toLocaleString()}`);
        console.log(`A魚庫存: ${financials.fishAInventory || 0} kg`);
        console.log(`B魚庫存: ${financials.fishBInventory || 0} kg\n`);
        
        console.log('=== 當日市場資訊 ===');
        const marketInfo = data.marketInfo || {};
        console.log(`A魚供給量: ${marketInfo.fishASupply ? marketInfo.fishASupply.toLocaleString() : '❌ 未提供'} kg`);
        console.log(`B魚供給量: ${marketInfo.fishBSupply ? marketInfo.fishBSupply.toLocaleString() : '❌ 未提供'} kg`);
        console.log(`A魚餐廳預算: $${marketInfo.fishABudget ? marketInfo.fishABudget.toLocaleString() : '❌ 未提供'}`);
        console.log(`B魚餐廳預算: $${marketInfo.fishBBudget ? marketInfo.fishBBudget.toLocaleString() : '❌ 未提供'}\n`);
        
        console.log('=== 遊戲規則參數 ===');
        const gameRules = data.gameRules || {};
        console.log(`初始預算: $${gameRules.initialBudget ? gameRules.initialBudget.toLocaleString() : '❌ 未提供'}`);
        console.log(`貸款利率: ${gameRules.loanInterestRate ? (gameRules.loanInterestRate * 100).toFixed(1) + '%' : '❌ 未提供'}`);
        console.log(`滯銷費用: $${gameRules.unsoldFeePerKg || '❌ 未提供'}/kg`);
        console.log(`固定滯銷比例: ${gameRules.fixedUnsoldRatio || '❌ 未提供'}%`);
        console.log(`A魚目標價: $${gameRules.targetPriceA || '❌ 未提供'}`);
        console.log(`B魚目標價: $${gameRules.targetPriceB || '❌ 未提供'}`);
        console.log(`A魚底價: $${gameRules.distributorFloorPriceA || '❌ 未提供'}`);
        console.log(`B魚底價: $${gameRules.distributorFloorPriceB || '❌ 未提供'}\n`);
        
        console.log('=== 歷史資料 ===');
        const history = data.history || [];
        console.log(`歷史記錄筆數: ${history.length}`);
        if (history.length > 0) {
            const latest = history[history.length - 1];
            console.log(`最新累積收益: $${(latest.cumulative_profit || 0).toLocaleString()}`);
            console.log(`最新ROI: ${((latest.roi || 0) * 100).toFixed(2)}%`);
        }
        
        // 7. 參數完整性評分
        console.log('\n=== 參數完整性評分 ===');
        let score = 0;
        let total = 0;
        
        // 基本資訊 (5分)
        total += 5;
        if (data.gameInfo?.gameName) score++;
        if (data.gameInfo?.currentDay) score++;
        if (data.gameInfo?.totalDays) score++;
        if (data.gameInfo?.status) score++;
        if (data.gameInfo?.dayStatus) score++;
        
        // 財務資訊 (4分)
        total += 4;
        if (financials.currentBudget !== undefined) score++;
        if (financials.totalLoan !== undefined) score++;
        if (financials.fishAInventory !== undefined) score++;
        if (financials.fishBInventory !== undefined) score++;
        
        // 市場資訊 (4分)
        total += 4;
        if (marketInfo.fishASupply) score++;
        if (marketInfo.fishBSupply) score++;
        if (marketInfo.fishABudget) score++;
        if (marketInfo.fishBBudget) score++;
        
        // 遊戲規則 (8分)
        total += 8;
        if (gameRules.initialBudget) score++;
        if (gameRules.loanInterestRate) score++;
        if (gameRules.unsoldFeePerKg) score++;
        if (gameRules.fixedUnsoldRatio) score++;
        if (gameRules.targetPriceA) score++;
        if (gameRules.targetPriceB) score++;
        if (gameRules.distributorFloorPriceA) score++;
        if (gameRules.distributorFloorPriceB) score++;
        
        const percentage = ((score / total) * 100).toFixed(1);
        console.log(`參數完整性得分: ${score}/${total} (${percentage}%)`);
        
        if (percentage >= 95) {
            console.log('🎉 優秀！所有重要參數都正確顯示');
        } else if (percentage >= 80) {
            console.log('✅ 良好！大部分參數都正確顯示');
        } else {
            console.log('⚠️ 需要改進！部分重要參數未正確顯示');
        }
        
        console.log('\n=== 學生界面參數顯示測試完成 ===');
        
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
testParameterDisplay().catch(console.error);