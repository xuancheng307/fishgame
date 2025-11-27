const axios = require('axios');

const API_BASE = 'https://backend-production-dc27.up.railway.app/api';
const gameId = 17; // 剛才測試的遊戲ID

async function testSettle() {
    try {
        // 登入獲取 token
        const loginRes = await axios.post(`${API_BASE}/auth/login`, {
            username: 'admin',
            password: '123'
        });

        const token = loginRes.data.token;
        console.log('✅ 登入成功\n');

        // 呼叫結算 API
        console.log(`正在對遊戲 ${gameId} 執行結算...\n`);
        const settleRes = await axios.post(
            `${API_BASE}/admin/games/${gameId}/settle`,
            {},
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        console.log('結算回應:');
        console.log(JSON.stringify(settleRes.data, null, 2));
    } catch (error) {
        console.error('❌ 錯誤:');
        if (error.response) {
            console.error('狀態碼:', error.response.status);
            console.error('回應數據:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

testSettle();
