# 🔍 魚市場遊戲 - API 前後端完整對應檢查報告

## 📋 檢查摘要
**檢查日期**：2025-09-12  
**檢查範圍**：backend/server.js 與 simple-team.html 的 API 對應  
**檢查結果**：✅ 整體對應正確，已確認所有參數名稱一致

---

## 📡 API 端點對應檢查

### 1. `/api/team/join-current` - 加入當前遊戲
**HTTP方法**：POST  
**認證**：需要 JWT Token ✅

#### 前端調用 (simple-team.html:709)
```javascript
fetch(`${API_BASE}/team/join-current`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
})
```

#### 後端接收 (server.js:2025)
```javascript
app.post('/api/team/join-current', authenticateToken, async (req, res) => {
    // 不需要 body 參數 ✅
    const teamId = req.user.userId; // 從 token 取得
})
```

#### 回傳資料
```javascript
res.json({ 
    game_id: gameId,  // 前端使用：data.game_id ✅
    message: '成功加入遊戲' 
})
```

**檢查結果**：✅ 完全對應

---

### 2. `/api/team/dashboard` - 團隊儀表板
**HTTP方法**：GET  
**認證**：需要 JWT Token ✅

#### 前端調用 (simple-team.html:753)
```javascript
fetch(`${API_BASE}/team/dashboard`, {
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
})
```

#### 後端回傳結構 (server.js:2286-2317)
```javascript
res.json({
    gameInfo: {
        gameName: participant.game_name,        // ✅
        currentDay: participant.current_day,    // ✅
        status: participant.status,             // ✅
        dayStatus: currentDay[0]?.status,       // ✅ 前端使用
        totalDays: participant.total_days       // ✅
    },
    financials: {
        currentBudget: participant.current_budget,  // ✅ 對應 data.financials.currentBudget
        totalLoan: participant.total_loan,         // ✅ 對應 data.financials.totalLoan
        fishAInventory: participant.fish_a_inventory, // ✅
        fishBInventory: participant.fish_b_inventory  // ✅
    },
    gameRules: {
        initialBudget: participant.initial_budget,  // ✅
        loanInterestRate: participant.loan_interest_rate, // ✅
        unsoldFeePerKg: participant.unsold_fee_per_kg,   // ✅
        targetPriceA: participant.target_price_a,   // ✅
        targetPriceB: participant.target_price_b,   // ✅
        fixedUnsoldRatio: participant.fixed_unsold_ratio // ✅
    },
    marketInfo: {
        fishASupply: currentDay[0].fish_a_supply,   // ✅
        fishBSupply: currentDay[0].fish_b_supply,   // ✅
        fishABudget: currentDay[0].fish_a_restaurant_budget, // ✅
        fishBBudget: currentDay[0].fish_b_restaurant_budget  // ✅
    },
    history: dailyResults  // ✅ 陣列，包含 cumulative_profit, roi
})
```

#### 前端使用對應 (simple-team.html:775-813)
```javascript
// gameInfo 對應
currentPhase = data.gameInfo?.dayStatus || 'waiting';  // ✅
currentDayId = data.gameInfo?.currentDay;              // ✅

// financials 對應
document.getElementById('currentBudget').textContent = financials.currentBudget  // ✅
document.getElementById('totalLoan').textContent = financials.totalLoan          // ✅
document.getElementById('fishAInventory').textContent = financials.fishAInventory // ✅
document.getElementById('fishBInventory').textContent = financials.fishBInventory // ✅

// history 對應
latestHistory.cumulative_profit  // ✅ 注意：這裡用 snake_case
latestHistory.roi                // ✅

// marketInfo 對應
marketInfo.fishASupply   // ✅
marketInfo.fishBSupply   // ✅
marketInfo.fishABudget   // ✅ 注意：前端用 fishABudget，不是 fishARestaurantBudget
marketInfo.fishBBudget   // ✅

// gameRules 對應
gameRules.initialBudget     // ✅
gameRules.loanInterestRate  // ✅
gameRules.unsoldFeePerKg    // ✅
gameRules.targetPriceA      // ✅
gameRules.targetPriceB      // ✅
```

**檢查結果**：✅ 完全對應

---

### 3. `/api/team/submit-buy-bids` - 提交買入投標
**HTTP方法**：POST  
**認證**：需要 JWT Token ✅

#### 前端發送結構 (simple-team.html:889-893, 947)
```javascript
const bids = [];
bids.push({
    fishType: fishType,    // ⚠️ 前端用 fishType (駝峰)
    price: priceGroup1Price,
    quantity: priceGroup1Qty
});

// 發送
body: JSON.stringify({ buyBids: bids })  // ✅
```

#### 後端接收處理 (server.js:2326, 2370)
```javascript
const { buyBids } = req.body;  // ✅ 正確接收

// 處理每個投標
for (const bid of buyBids) {
    const fishType = bid.fish_type || bid.fishType;  // ✅ 容錯處理：支援兩種格式
    // 後端會處理成 fish_type 存入資料庫
}
```

**檢查結果**：✅ 有容錯機制，支援 fishType 和 fish_type

---

### 4. `/api/team/submit-sell-bids` - 提交賣出投標
**HTTP方法**：POST  
**認證**：需要 JWT Token ✅

#### 前端發送結構 (simple-team.html:947)
```javascript
const bidData = { sellBids: bids };  // ✅ 賣出用 sellBids
// bids 結構同買入
```

#### 後端接收處理 (server.js:2474, 2516)
```javascript
const { sellBids } = req.body;  // ✅ 正確接收
// 處理邏輯同買入，有容錯機制
const fishType = bid.fish_type || bid.fishType;  // ✅
```

**檢查結果**：✅ 完全對應

---

### 5. `/api/admin/games/:gameId/current-bids` - 取得當前投標
**HTTP方法**：GET  
**認證**：需要 JWT Token ✅

#### 前端調用 (simple-team.html:1034)
```javascript
fetch(`${API_BASE}/admin/games/${gameId}/current-bids`, {
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
})
```

#### 後端回傳 (server.js:619)
```javascript
// 回傳匿名訂單簿資料
res.json({
    fish_a: [...],  // ⚠️ 注意：用 snake_case
    fish_b: [...]
})
```

**檢查結果**：✅ 對應正確

---

### 6. `/api/leaderboard/:gameId` - 排行榜
**HTTP方法**：GET  
**認證**：需要 JWT Token ✅

#### 前端調用 (simple-team.html:1090)
```javascript
fetch(`${API_BASE}/leaderboard/${gameId}`, {
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
})
```

#### 後端回傳 (server.js:2936)
```javascript
// 回傳排行榜陣列
[{
    team_name: team.team_name,     // ⚠️ snake_case
    username: team.username,
    roi: team.roi
}, ...]
```

#### 前端使用 (simple-team.html:1108-1112)
```javascript
// 前端正確使用 snake_case
team.team_name || team.username  // ✅
team.roi                         // ✅
```

**檢查結果**：✅ 對應正確

---

### 7. `/api/game/status` - 遊戲狀態
**HTTP方法**：GET  
**認證**：不需要 ✅

#### 前端調用 (simple-team.html:1214)
```javascript
fetch('/api/game/status')  // 注意：直接用路徑，不用 API_BASE
```

#### 後端回傳 (server.js:3729)
```javascript
res.json({
    gameActive: true/false,
    gameId: game.id,
    gameName: game.game_name,
    dayNumber: game.current_day,
    phase: dayStatus,
    endTime: buyEndTime || sellEndTime  // 倒數計時用
})
```

**檢查結果**：✅ 對應正確

---

### 8. `/api/game/bid-history` - 投標歷史
**HTTP方法**：GET  
**認證**：不需要 ✅

#### 前端調用 (simple-team.html:1361)
```javascript
fetch('/api/game/bid-history')
```

#### 後端回傳 (server.js:3825)
```javascript
res.json({
    success: true,
    history: [{
        dayNumber: day,
        bidType: 'buy'/'sell',
        bids: [{
            fishType: 'A'/'B',
            price: price,
            quantity: quantity,
            successful: true/false,
            fulfilled: fulfilled_quantity  // 實際成交量
        }]
    }]
})
```

**檢查結果**：✅ 對應正確

---

## ⚠️ 重要發現與注意事項

### 1. 命名規範混用
- **資料庫**：使用 snake_case (如 `current_budget`, `fish_a_inventory`)
- **API回傳**：混用 snake_case 和 camelCase
  - financials 物件：使用 camelCase (如 `currentBudget`)
  - history 陣列：使用 snake_case (如 `cumulative_profit`)
  - 排行榜：使用 snake_case (如 `team_name`)

### 2. 容錯機制
- 後端對 `fishType` vs `fish_type` 有容錯處理 ✅
- 支援兩種格式：`bid.fish_type || bid.fishType`

### 3. 關鍵對應點
- ✅ **current_budget** → API: `currentBudget` → 前端: `financials.currentBudget`
- ✅ **total_loan** → API: `totalLoan` → 前端: `financials.totalLoan`
- ✅ **fish_a_inventory** → API: `fishAInventory` → 前端: `financials.fishAInventory`
- ✅ **fish_b_inventory** → API: `fishBInventory` → 前端: `financials.fishBInventory`
- ⚠️ **cumulative_profit** → API: 保持 `cumulative_profit` (snake_case)
- ⚠️ **team_name** → API: 保持 `team_name` (snake_case)

---

## ✅ 檢查結論

**整體評估**：API 前後端對應 **正確無誤**

### 優點：
1. 所有 API 端點路徑完全對應
2. 認證機制一致使用 JWT Bearer Token
3. 關鍵參數有容錯機制
4. 資料結構對應正確

### 建議改善：
1. 統一 API 回傳的命名規範（建議全部使用 camelCase）
2. 文件化 API 規格
3. 加強錯誤處理的一致性

**檢查完成時間**：2025-09-12 08:30