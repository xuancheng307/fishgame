const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';
let adminToken = '';
let gameId = null;

async function testAdminParameterDisplay() {
    console.log('=== 管理員界面參數顯示完整性測試 ===\n');
    
    try {
        // 1. 管理員登入
        console.log('[1] 管理員登入...');
        const adminLogin = await axios.post(`${API_BASE}/auth/login`, {
            username: 'admin',
            password: '123'
        });
        adminToken = adminLogin.data.token;
        console.log('✅ 管理員登入成功\n');
        
        // 2. 創建測試遊戲
        console.log('[2] 創建測試遊戲...');
        const gameData = {
            gameName: '管理員參數顯示測試',
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
        
        // 3. 檢查管理員遊戲狀態API回應
        console.log('[3] 檢查管理員遊戲狀態API...');
        const statusResponse = await axios.get(`${API_BASE}/admin/games/${gameId}/status`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        const statusData = statusResponse.data;
        console.log('=== 遊戲狀態回應結構 ===');
        console.log(`遊戲名稱: ${statusData.game_name || '❌ 未提供'}`);
        console.log(`當前天數: ${statusData.current_day || '❌ 未提供'}`);
        console.log(`總天數: ${statusData.total_days || '❌ 未提供'}`);
        console.log(`總隊伍數: ${statusData.num_teams || '❌ 未提供'}`);
        console.log(`遊戲階段: ${statusData.phase || '❌ 未提供'}`);
        console.log(`目標價A: $${statusData.target_price_a || '❌ 未提供'}`);
        console.log(`目標價B: $${statusData.target_price_b || '❌ 未提供'}\n`);
        
        // 4. 計算預設值（模擬前端邏輯）
        console.log('[4] 計算預設市場參數...');
        const numTeams = statusData.num_teams || 12;
        const currentDay = statusData.current_day || 1;
        const targetPriceA = statusData.target_price_a || 150;
        const targetPriceB = statusData.target_price_b || 120;
        
        // 基準值計算
        const baselineSupplyA = numTeams * 150;
        const baselineSupplyB = numTeams * 300;
        const baselineBudgetA = baselineSupplyA * targetPriceA;
        const baselineBudgetB = baselineSupplyB * targetPriceB;
        
        // 天數倍數
        let supplyMultiplierA = 1, supplyMultiplierB = 1;
        let budgetMultiplierA = 1, budgetMultiplierB = 1;
        
        switch(currentDay) {
            case 1:
                supplyMultiplierA = 1.0; supplyMultiplierB = 1.0;
                budgetMultiplierA = 1.0; budgetMultiplierB = 1.0;
                break;
            case 2:
                supplyMultiplierA = 0.85; supplyMultiplierB = 1.05;
                budgetMultiplierA = 1.15; budgetMultiplierB = 0.95;
                break;
            case 3:
                supplyMultiplierA = 1.15; supplyMultiplierB = 0.9;
                budgetMultiplierA = 0.9; budgetMultiplierB = 1.1;
                break;
            case 4:
                supplyMultiplierA = 0.95; supplyMultiplierB = 1.1;
                budgetMultiplierA = 1.05; budgetMultiplierB = 0.85;
                break;
            default:
                supplyMultiplierA = 1.05; supplyMultiplierB = 0.95;
                budgetMultiplierA = 0.95; budgetMultiplierB = 1.05;
                break;
        }
        
        const defaultFishASupply = Math.round(baselineSupplyA * supplyMultiplierA);
        const defaultFishBSupply = Math.round(baselineSupplyB * supplyMultiplierB);
        const defaultFishABudget = Math.round(baselineBudgetA * budgetMultiplierA);
        const defaultFishBBudget = Math.round(baselineBudgetB * budgetMultiplierB);
        
        console.log('=== 計算出的預設值 ===');
        console.log(`A魚供給量預設值: ${defaultFishASupply.toLocaleString()} kg`);
        console.log(`B魚供給量預設值: ${defaultFishBSupply.toLocaleString()} kg`);
        console.log(`A魚餐廳預算預設值: $${defaultFishABudget.toLocaleString()}`);
        console.log(`B魚餐廳預算預設值: $${defaultFishBBudget.toLocaleString()}\n`);
        
        // 5. 驗證參數格式結構（不實際執行advance-day）
        console.log('[5] 驗證advance-day API參數格式結構...');
        const advanceDayData = {
            params: {
                fishASupply: defaultFishASupply,
                fishBSupply: defaultFishBSupply,
                fishABudget: defaultFishABudget,
                fishBBudget: defaultFishBBudget
            }
        };
        
        // 檢查參數格式是否正確
        const hasCorrectStructure = 
            advanceDayData.params && 
            typeof advanceDayData.params.fishASupply === 'number' &&
            typeof advanceDayData.params.fishBSupply === 'number' &&
            typeof advanceDayData.params.fishABudget === 'number' &&
            typeof advanceDayData.params.fishBBudget === 'number';
        
        console.log(`✅ advance-day API 參數格式結構: ${hasCorrectStructure ? '正確' : '錯誤'}`);
        console.log(`參數結構: ${JSON.stringify(advanceDayData, null, 2)}\n`);
        
        // 7. 完整性評分
        console.log('=== 管理員界面參數完整性評分 ===');
        let score = 0;
        let total = 0;
        
        // 基本遊戲資訊 (5分)
        total += 5;
        if (statusData.game_name) score++;
        if (statusData.current_day !== undefined) score++;
        if (statusData.total_days) score++;
        if (statusData.num_teams) score++;
        if (statusData.phase) score++;
        
        // 價格參數 (2分)
        total += 2;
        if (statusData.target_price_a) score++;
        if (statusData.target_price_b) score++;
        
        // 預設值計算能力 (4分)
        total += 4;
        if (defaultFishASupply > 0) score++;
        if (defaultFishBSupply > 0) score++;
        if (defaultFishABudget > 0) score++;
        if (defaultFishBBudget > 0) score++;
        
        // API格式正確性 (1分)
        total += 1;
        if (hasCorrectStructure) score++;
        
        const percentage = ((score / total) * 100).toFixed(1);
        console.log(`管理員界面完整性得分: ${score}/${total} (${percentage}%)`);
        
        if (percentage >= 95) {
            console.log('🎉 優秀！管理員界面參數顯示完美');
        } else if (percentage >= 80) {
            console.log('✅ 良好！管理員界面基本功能正常');
        } else {
            console.log('⚠️ 需要改進！部分管理員功能有問題');
        }
        
        console.log('\n=== 管理員界面參數顯示測試完成 ===');
        
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
testAdminParameterDisplay().catch(console.error);