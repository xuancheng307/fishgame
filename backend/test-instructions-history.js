const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';
let adminToken = '';

async function testInstructionsAndHistory() {
    console.log('=== 遊戲說明與歷史功能測試 ===\n');
    
    try {
        // 1. 管理員登入
        console.log('[1] 管理員登入...');
        const adminLogin = await axios.post(`${API_BASE}/auth/login`, {
            username: 'admin',
            password: '123'
        });
        adminToken = adminLogin.data.token;
        console.log('✅ 管理員登入成功\n');
        
        // 2. 測試歷史遊戲API
        console.log('[2] 測試歷史遊戲API...');
        const historyResponse = await axios.get(`${API_BASE}/admin/games/history`, {
            headers: { 'Authorization': `Bearer ${adminToken}` },
            params: {
                page: 1,
                pageSize: 5
            }
        });
        
        console.log('=== 歷史遊戲API回應結構 ===');
        const historyData = historyResponse.data;
        console.log(`遊戲總數: ${historyData.totalGames || 0}`);
        console.log(`總頁數: ${historyData.totalPages || 0}`);
        console.log(`當前頁: ${historyData.currentPage || 1}`);
        console.log(`遊戲列表: ${(historyData.games || []).length} 筆`);
        
        if (historyData.games && historyData.games.length > 0) {
            const firstGame = historyData.games[0];
            console.log('\n=== 第一筆遊戲資料範例 ===');
            console.log(`遊戲ID: ${firstGame.game_id}`);
            console.log(`遊戲名稱: ${firstGame.game_name}`);
            console.log(`狀態: ${firstGame.status}`);
            console.log(`隊伍數: ${firstGame.num_teams}`);
            console.log(`當前天數: ${firstGame.current_day}/${firstGame.total_days}`);
            console.log(`創建時間: ${new Date(firstGame.created_at).toLocaleString('zh-TW')}`);
            
            if (firstGame.final_rankings && firstGame.final_rankings.length > 0) {
                console.log('\n前三名:');
                firstGame.final_rankings.forEach((team, index) => {
                    console.log(`  ${index + 1}. ${team.team_name} - ROI: ${(team.roi * 100).toFixed(2)}%`);
                });
            } else {
                console.log('排名: 尚無排名資料');
            }
        } else {
            console.log('目前沒有歷史遊戲記錄');
        }
        
        // 3. 測試篩選功能
        console.log('\n[3] 測試歷史遊戲篩選功能...');
        const filterResponse = await axios.get(`${API_BASE}/admin/games/history`, {
            headers: { 'Authorization': `Bearer ${adminToken}` },
            params: {
                status: 'active',
                page: 1,
                pageSize: 10
            }
        });
        
        const activeGames = filterResponse.data.games || [];
        console.log(`進行中遊戲數量: ${activeGames.length}`);
        
        // 4. 驗證前端檔案存在性
        console.log('\n[4] 驗證前端檔案...');
        const fs = require('fs');
        const path = require('path');
        
        const files = [
            { name: '遊戲說明頁面', path: '../game-instructions.html' },
            { name: '歷史遊戲頁面', path: '../game-history.html' },
            { name: '學生介面', path: '../simple-team.html' },
            { name: '管理員介面', path: '../admin.html' }
        ];
        
        files.forEach(file => {
            const fullPath = path.join(__dirname, file.path);
            if (fs.existsSync(fullPath)) {
                console.log(`✅ ${file.name}: 檔案存在`);
                
                // 檢查關鍵功能
                const content = fs.readFileSync(fullPath, 'utf8');
                if (file.name === '學生介面') {
                    if (content.includes('openGameInstructions')) {
                        console.log('   ✅ 包含遊戲說明功能');
                    } else {
                        console.log('   ❌ 缺少遊戲說明功能');
                    }
                }
                
                if (file.name === '管理員介面') {
                    if (content.includes('openGameInstructions') && content.includes('openGameHistory')) {
                        console.log('   ✅ 包含說明和歷史功能');
                    } else {
                        console.log('   ❌ 缺少部分功能');
                    }
                }
                
                if (file.name === '遊戲說明頁面') {
                    if (content.includes('遊戲概述') && content.includes('策略指南')) {
                        console.log('   ✅ 包含完整說明內容');
                    } else {
                        console.log('   ❌ 說明內容不完整');
                    }
                }
                
                if (file.name === '歷史遊戲頁面') {
                    if (content.includes('loadGameHistory') && content.includes('pagination')) {
                        console.log('   ✅ 包含歷史載入和分頁功能');
                    } else {
                        console.log('   ❌ 功能不完整');
                    }
                }
            } else {
                console.log(`❌ ${file.name}: 檔案不存在`);
            }
        });
        
        // 5. 功能完整性評分
        console.log('\n=== 功能完整性評分 ===');
        let score = 0;
        let total = 0;
        
        // API功能 (4分)
        total += 4;
        if (historyResponse.status === 200) score++;
        if (historyData.games !== undefined) score++;
        if (historyData.totalPages !== undefined) score++;
        if (filterResponse.status === 200) score++;
        
        // 前端檔案 (4分)
        total += 4;
        files.forEach(file => {
            const fullPath = path.join(__dirname, file.path);
            if (fs.existsSync(fullPath)) score++;
        });
        
        // 功能整合 (4分)
        total += 4;
        const adminContent = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
        const studentContent = fs.readFileSync(path.join(__dirname, '../simple-team.html'), 'utf8');
        const instructionsContent = fs.readFileSync(path.join(__dirname, '../game-instructions.html'), 'utf8');
        const historyContent = fs.readFileSync(path.join(__dirname, '../game-history.html'), 'utf8');
        
        if (adminContent.includes('openGameInstructions')) score++;
        if (adminContent.includes('openGameHistory')) score++;
        if (studentContent.includes('openGameInstructions')) score++;
        if (instructionsContent.includes('策略指南') && historyContent.includes('pagination')) score++;
        
        const percentage = ((score / total) * 100).toFixed(1);
        console.log(`說明與歷史功能得分: ${score}/${total} (${percentage}%)`);
        
        if (percentage >= 95) {
            console.log('🎉 優秀！說明與歷史功能完美實現');
        } else if (percentage >= 80) {
            console.log('✅ 良好！主要功能都已實現');
        } else {
            console.log('⚠️ 需要改進！部分功能有問題');
        }
        
        console.log('\n=== 新功能說明 ===');
        console.log('📚 遊戲說明功能:');
        console.log('  - 完整的遊戲規則與流程說明');
        console.log('  - 詳細的策略指南和風險管理');
        console.log('  - 計算邏輯和實戰範例');
        console.log('  - 學生和管理員都可以訪問');
        
        console.log('\n📊 歷史遊戲功能:');
        console.log('  - 分頁顯示所有歷史遊戲');
        console.log('  - 支持狀態、名稱、日期篩選');
        console.log('  - 顯示遊戲基本資訊和前三名');
        console.log('  - 管理員專用功能');
        
        console.log('\n🔧 技術實現:');
        console.log('  - 後端API支持分頁和篩選');
        console.log('  - 前端響應式設計');
        console.log('  - 彈窗式頁面設計');
        console.log('  - 完整的錯誤處理');
        
        console.log('\n=== 說明與歷史功能測試完成 ===');
        
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
testInstructionsAndHistory().catch(console.error);