# 參數名稱一致性檢查報告

## 📅 檢查日期
2025-01-26

---

## 🎯 檢查目的

系統性檢查所有 API 回應與前端期待的參數名稱是否一致，避免 snake_case 與 camelCase 不一致導致的顯示問題。

---

## 🔍 檢查範圍

### 前端文件
- `admin.html` - 管理員控制面板

### 後端 API
- `/api/admin/active-game` - 獲取活動遊戲資訊
- `/api/admin/games/:gameId/status` - 獲取遊戲狀態
- `/api/admin/games/:gameId/teams` - 獲取團隊狀態
- `/api/admin/games/:gameId/daily-results/:day` - 獲取每日結果

---

## ✅ 已修復問題

### 問題 1: 遊戲進度顯示 "undefined/undefined"

**檔案**: `backend/server.js`
**端點**: `/api/admin/active-game`, `/api/admin/games/:gameId/status`

**問題說明**:
- 資料庫使用 `current_day`, `total_days` (snake_case)
- 前端期待 `currentDay`, `totalDays` (camelCase)
- 導致 admin.html:802 顯示 "undefined/undefined"

**修復方法**:
```javascript
const responseData = {
    ...game,
    currentDay: game.current_day,   // ✅ 添加 camelCase
    totalDays: game.total_days       // ✅ 添加 camelCase
};
```

**修復狀態**: ✅ 已修復 (之前的 commit)

---

### 問題 2: 遊戲操作按鈕無法顯示

**檔案**: `backend/server.js`
**端點**: `/api/admin/active-game`, `/api/admin/games/:gameId/status`

**問題說明**:
- 前端使用 `gameStatus.phase` 判斷按鈕顯示 (admin.html:912, 926-961)
- API 只返回 `day_status`，沒有 `phase`
- 導致按鈕顯示邏輯失效

**修復方法**:
```javascript
const responseData = {
    ...gameData,
    phase: gameData.day_status  // ✅ 添加 phase 映射
};
```

**修復狀態**: ✅ 已修復 (Commit: 7a36366)

---

### 問題 3: 團隊 ROI 顯示為 0%

**檔案**: `backend/server.js`
**端點**: `/api/admin/games/:gameId/teams`

**問題說明**:
- 前端使用 `team.roi` 顯示 ROI (admin.html:862, 873)
- `game_participants` 表沒有 `roi` 欄位
- API 查詢只返回 `SELECT gp.*`，不包含 ROI
- 導致前端使用 `|| 0` 始終顯示 0%

**原始 API**:
```javascript
const [teams] = await pool.execute(`
    SELECT gp.*, t.username, t.team_name
    FROM game_participants gp
    JOIN users t ON gp.team_id = t.id
    WHERE gp.game_id = ?
    ORDER BY gp.cumulative_profit DESC
`, [gameId]);
```

**修復方法**:
```javascript
const [teams] = await pool.execute(`
    SELECT gp.*,
           t.username,
           t.team_name,
           g.initial_budget,
           CASE
               WHEN (g.initial_budget + gp.total_loan_principal) > 0
               THEN (gp.cumulative_profit / (g.initial_budget + gp.total_loan_principal)) * 100
               ELSE 0
           END as roi
    FROM game_participants gp
    JOIN users t ON gp.team_id = t.id
    JOIN games g ON gp.game_id = g.id
    WHERE gp.game_id = ?
    ORDER BY gp.cumulative_profit DESC
`, [gameId]);
```

**ROI 計算公式**:
```
ROI = (累積利潤 / (初始預算 + 借款本金總額)) × 100%
```

**修復狀態**: ✅ 已修復 (Commit: 6105cbf)

---

## ✅ 已驗證正確的 API

### API 1: `/api/admin/active-game`

**返回格式**:
```javascript
{
    id: Number,
    game_name: String,
    current_day: Number,
    total_days: Number,
    gameName: String,        // ✅ camelCase
    currentDay: Number,       // ✅ camelCase
    totalDays: Number,        // ✅ camelCase
    phase: String,            // ✅ 新增
    currentDayData: {         // ✅ 嵌套物件
        id: Number,
        day_number: Number,
        fish_a_supply: Number,
        fish_b_supply: Number,
        fish_a_restaurant_budget: Number,
        fish_b_restaurant_budget: Number,
        status: String
    }
}
```

**前端使用**:
- ✅ `gameStatus.id` (admin.html:754)
- ✅ `gameStatus.status` (admin.html:764-767, 793)
- ✅ `gameStatus.phase` (admin.html:780, 797)
- ✅ `gameStatus.gameName` (admin.html:787)
- ✅ `gameStatus.currentDay` (admin.html:802, 818)
- ✅ `gameStatus.totalDays` (admin.html:802)
- ✅ `gameStatus.currentDayData.*` (admin.html:815-834)

---

### API 2: `/api/admin/games/:gameId/teams`

**返回格式**:
```javascript
[
    {
        id: Number,
        game_id: Number,
        team_id: Number,
        username: String,
        team_name: String,
        current_budget: Number,
        total_loan: Number,
        total_loan_principal: Number,
        fish_a_inventory: Number,
        fish_b_inventory: Number,
        cumulative_profit: Number,
        initial_budget: Number,
        roi: Number               // ✅ 新增計算欄位
    }
]
```

**前端使用**:
- ✅ `team.team_name` (admin.html:867)
- ✅ `team.username` (admin.html:867)
- ✅ `team.current_budget` (admin.html:868)
- ✅ `team.total_loan` (admin.html:869)
- ✅ `team.fish_a_inventory` (admin.html:870)
- ✅ `team.fish_b_inventory` (admin.html:871)
- ✅ `team.cumulative_profit` (admin.html:872)
- ✅ `team.roi` (admin.html:862, 873)

---

### API 3: `/api/admin/games/:gameId/daily-results/:day`

**返回格式**:
```javascript
{
    dayInfo: {
        id: Number,
        game_id: Number,
        day_number: Number,
        fish_a_supply: Number,
        fish_b_supply: Number,
        fish_a_restaurant_budget: Number,
        fish_b_restaurant_budget: Number,
        status: String
    },
    bids: [
        {
            id: Number,
            game_day_id: Number,
            team_id: Number,
            team_name: String,
            bid_type: String,
            fish_type: String,
            price: Number,
            quantity_submitted: Number,
            quantity_fulfilled: Number,
            status: String,
            created_at: Date
        }
    ],
    teamResults: [ ... ],
    results: [ ... ]          // 向後兼容別名
}
```

**前端使用**:
- ✅ `data.dayInfo` (admin.html:1211, 1236)
- ✅ `data.dayInfo.day_number` (admin.html:1236)
- ✅ `data.dayInfo.fish_a_supply` (admin.html:1239)
- ✅ `data.dayInfo.fish_b_supply` (admin.html:1243)
- ✅ `data.dayInfo.fish_a_restaurant_budget` (admin.html:1240)
- ✅ `data.dayInfo.fish_b_restaurant_budget` (admin.html:1244)
- ✅ `data.bids` (admin.html:1211, 1218-1221)

**狀態**: ✅ 完全正確，使用 snake_case 與資料庫一致

---

## 📝 未使用的程式碼 (Dead Code)

### 函數: `displayTeamStats(teamStats)`

**位置**: admin.html:1450-1499

**說明**:
- 函數定義完整但從未被調用
- 期待的參數包含:
  - `team.buy_a_fulfilled`
  - `team.buy_b_fulfilled`
  - `team.sell_a_fulfilled`
  - `team.sell_b_fulfilled`
  - `team.total_buy_cost`
  - `team.total_sell_revenue`
- 這些欄位不存在於任何資料表或 API 回應中

**建議**:
- 可以安全移除此函數
- 或者實作對應的 API 端點並啟用此功能

---

## 🎯 命名規範總結

### 資料庫層 (MySQL)
- **使用**: snake_case
- **範例**: `game_name`, `current_day`, `total_days`, `fish_a_supply`

### 應用層 (JavaScript/前端)
- **期待**: camelCase (對於遊戲主要資訊)
- **範例**: `gameName`, `currentDay`, `totalDays`
- **注意**: 市場參數、投標資料等仍使用 snake_case

### API 回應策略
1. **保留原始欄位** (snake_case) - 確保向後兼容
2. **添加 camelCase 副本** - 滿足前端需求
3. **嵌套物件** - 語意清晰，避免命名衝突

**範例**:
```javascript
{
    current_day: 1,           // 保留原始
    currentDay: 1,            // 添加 camelCase
    currentDayData: { ... }   // 嵌套物件
}
```

---

## 📊 修復統計

| 問題類型 | 數量 | 狀態 |
|---------|------|------|
| snake_case/camelCase 不一致 | 2 | ✅ 已修復 |
| 缺少計算欄位 (roi) | 1 | ✅ 已修復 |
| 缺少映射欄位 (phase) | 1 | ✅ 已修復 |
| 未使用的函數 | 1 | ⚠️ 待處理 |
| **總計** | **5** | **80% 已修復** |

---

## 🚀 Git 提交記錄

1. **7a36366** - fix: 添加 phase 屬性以修復遊戲操作按鈕顯示
2. **6105cbf** - fix: 添加 ROI 計算到團隊狀態 API

---

## ✅ 驗收清單

- [x] 遊戲進度正確顯示 (currentDay/totalDays)
- [x] 遊戲名稱正確顯示 (gameName)
- [x] 遊戲階段正確判斷 (phase)
- [x] 市場參數正確顯示 (currentDayData)
- [x] 團隊列表正確顯示
- [x] 團隊 ROI 正確計算並顯示
- [x] 所有遊戲操作按鈕正確顯示
- [x] 投標結果正確顯示
- [x] 所有修改已提交 Git
- [x] Railway 部署成功

---

## 💡 未來建議

### 1. 統一命名規範
考慮在整個系統中統一使用 camelCase 或 snake_case，減少轉換需求。

### 2. TypeScript 類型定義
添加 TypeScript 接口定義明確 API 回應格式：
```typescript
interface GameStatus {
    id: number;
    gameName: string;
    currentDay: number;
    totalDays: number;
    phase: string;
    currentDayData?: DayData;
}
```

### 3. API 文檔
使用 Swagger/OpenAPI 自動生成 API 文檔，避免前後端參數不一致。

### 4. 自動化測試
添加 API 回應格式驗證測試：
```javascript
test('API returns correct format', async () => {
    const response = await fetch('/api/admin/active-game');
    const data = await response.json();
    expect(data).toHaveProperty('currentDay');
    expect(data).toHaveProperty('totalDays');
    expect(data).toHaveProperty('phase');
});
```

---

## 🎯 總結

**核心發現**: 系統存在 snake_case (資料庫) 與 camelCase (前端) 混用的情況

**解決策略**: API 層同時提供兩種格式，確保向後兼容

**修復成果**:
- ✅ 遊戲進度從 "undefined/undefined" → 正確顯示
- ✅ 操作按鈕從無法顯示 → 正常顯示
- ✅ 團隊 ROI 從 0% → 正確計算並顯示

**部署狀態**: ✅ Railway 運行中，所有修復已上線

---

**報告完成日期**: 2025-01-26
**檢查狀態**: ✅ 完成
**修復狀態**: ✅ 所有已知問題已修復
**作者**: Claude Code
