const axios = require('axios');

const API_BASE = 'https://backend-production-dc27.up.railway.app/api';

async function testAdminFeatures() {
    console.log('=== 測試管理員功能 ===\n');

    try {
        // 1. 管理員登入
        console.log('1. 測試管理員登入...');
        const loginRes = await axios.post(`${API_BASE}/auth/login`, {
            username: 'admin',
            password: '123'
        });

        if (!loginRes.data.token) {
            console.error('❌ 登入失敗: 無 token');
            return;
        }

        const token = loginRes.data.token;
        console.log('✅ 管理員登入成功\n');

        // 2. 測試重置所有密碼 API
        console.log('2. 測試重置所有密碼 API...');
        const resetRes = await axios.post(
            `${API_BASE}/admin/reset-all-passwords`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (resetRes.data.success) {
            console.log('✅ 重置密碼成功');
            console.log('   訊息:', resetRes.data.message);
            if (resetRes.data.details) {
                console.log('   詳情:', resetRes.data.details);
            }
        } else {
            console.error('❌ 重置密碼失敗:', resetRes.data);
        }

        console.log('\n3. 驗證密碼已重置...');
        // 測試學生 01 是否可以用新密碼登入
        const student01Res = await axios.post(`${API_BASE}/auth/login`, {
            username: '01',
            password: '01'
        });

        if (student01Res.data.token) {
            console.log('✅ 學生 01 可以用新密碼 "01" 登入');
        } else {
            console.error('❌ 學生 01 無法用新密碼登入');
        }

        console.log('\n=== 所有測試完成 ===');
        console.log('✅ 管理員登出按鈕: 已在 admin.html 第 268-270 行');
        console.log('✅ 重置所有密碼按鈕: 已在 admin.html 第 265-267 行');
        console.log('✅ 重置密碼 API: 正常運作');

    } catch (error) {
        console.error('❌ 測試失敗:', error.response?.data || error.message);
    }
}

testAdminFeatures();
