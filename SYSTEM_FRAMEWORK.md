# 魚市場遊戲 - 完整系統框架

**建立日期**: 2025-12-01
**目的**: 建立完整系統理解，作為全面修復的基礎

---

## 一、系統架構概覽

```
┌─────────────────────────────────────────────────────────┐
│                     前端介面層                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  admin.html  │  │  team.html   │  │  index.html  │  │
│  │  (管理員)     │  │  (學生團隊)   │  │  (登入)       │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                    後端 API 層                            │
│              backend/server.js (Express)                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 認證 │ 遊戲管理 │ 投標 │ 結算 │ WebSocket(Socket.IO) │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                 Railway MySQL 資料庫                      │
│  ┌──────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐ │
│  │users │ │  games   │ │game_days  │ │game_         │ │
│  │      │ │          │ │           │ │participants  │ │
│  └──────┘ └──────────┘ └───────────┘ └──────────────┘ │
│  ┌──────┐ ┌──────────────┐                            │
│  │bids  │ │daily_results │                            │
│  └──────┘ └──────────────┘                            │
└─────────────────────────────────────────────────────────┘
```

---

## 二、資料庫架構（Railway 實際）

### 2.1 核心表關係

```
games (遊戲)
  ├─→ game_days (遊戲天數)
  │     └─→ bids (投標)
  │     └─→ daily_results (每日結算)
  └─→ game_participants (參與者)
        └─→ users (團隊)
```

### 2.2 狀態管理雙軌制

**重要設計決策**：
- `games.phase` - 遊戲整體階段（前端顯示用）
- `game_days.status` - 當日具體狀態（後端邏輯用）

**狀態對應關係**：
| games.phase | game_days.status | 說明 |
|-------------|------------------|------|
| waiting | pending | 等待開始 |
| buying | buying_open | 買入投標中 |
| buying_closed | buying_closed | 買入已關閉 |
| selling | selling_open | 賣出投標中 |
| selling_closed | selling_closed | 賣出已關閉 |
| settling | settled | 結算中 |
| day_ended | settled | 當日結束 |

### 2.3 完整表結構（26個欄位）

#### games 表
```sql
id, name, description, status, phase, total_days, current_day,
num_teams, initial_budget, daily_interest_rate, loan_interest_rate,
max_loan_ratio, unsold_fee_per_kg, fixed_unsold_ratio,
distributor_floor_price_a, distributor_floor_price_b,
target_price_a, target_price_b, buying_duration, selling_duration,
revenue_settlement,  -- ENUM('daily','end_of_game') DEFAULT 'end_of_game'
created_at, updated_at, team_names, is_force_ended,
force_ended_at, force_end_day
```

**關鍵欄位**：
- `name` (NOT game_name) - VARCHAR(100)
- `status` - ENUM('pending','active','paused','finished','force_ended')
- `phase` - ENUM('waiting','buying','buying_closed','selling','selling_closed','settling','day_ended')

#### game_days 表
```sql
id, game_id, day_number, fish_a_supply, fish_b_supply,
fish_a_restaurant_budget, fish_b_restaurant_budget, status
```

**status ENUM**：
- 'pending', 'buying_open', 'buying_closed', 'selling_open', 'selling_closed', 'settled'

#### bids 表
```sql
id, game_id, game_day_id, day_number, team_id, bid_type,
fish_type, price, quantity_submitted, quantity_fulfilled,
status, created_at
```

**ENUM 值**：
- bid_type: 'buy', 'sell'
- fish_type: 'A', 'B'
- status: 'pending', 'fulfilled', 'partial', 'failed'

---

## 三、遊戲流程與狀態轉換

### 3.1 完整遊戲流程

```
1. 創建遊戲 (POST /api/admin/games)
   ↓ games.status = 'active', phase = 'waiting'

2. 開始買入投標 (POST /api/admin/games/:id/start-buying)
   ↓ games.phase = 'buying', game_days.status = 'buying_open'

3. 關閉買入投標 (POST /api/admin/games/:id/close-buying)
   ↓ games.phase = 'buying_closed', game_days.status = 'buying_closed'
   ↓ 執行 processBuyBids() 結算

4. 開始賣出投標 (POST /api/admin/games/:id/start-selling)
   ↓ games.phase = 'selling', game_days.status = 'selling_open'

5. 關閉賣出投標 (POST /api/admin/games/:id/close-selling)
   ↓ games.phase = 'selling_closed', game_days.status = 'selling_closed'
   ↓ 執行 processSellBids() 結算

6. 執行每日結算 (POST /api/admin/games/:id/settle)
   ↓ games.phase = 'settling', game_days.status = 'settled'
   ↓ 計算利息、滯銷費、ROI等

7. 推進到下一天 (POST /api/admin/games/:id/next-day)
   ↓ games.current_day++, phase = 'waiting'
   ↓ 創建新的 game_days 記錄
```

### 3.2 關鍵更新點（必須同步更新）

每次狀態變更時，必須同時更新：
1. `game_days.status` - 更新當日狀態
2. `games.phase` - 更新遊戲階段
3. WebSocket 廣播 - 通知所有客戶端

---

## 四、API 端點分類

### 4.1 認證相關
- POST /api/login - 登入
- POST /api/logout - 登出
- POST /api/admin/reset-passwords - 重置密碼

### 4.2 遊戲管理（管理員）
- POST /api/admin/games - 創建遊戲
- GET /api/admin/games - 獲取遊戲列表
- GET /api/admin/games/:id - 獲取遊戲詳情
- POST /api/admin/games/:id/start-buying - 開始買入
- POST /api/admin/games/:id/close-buying - 關閉買入
- POST /api/admin/games/:id/start-selling - 開始賣出
- POST /api/admin/games/:id/close-selling - 關閉賣出
- POST /api/admin/games/:id/settle - 每日結算
- POST /api/admin/games/:id/next-day - 推進下一天
- POST /api/admin/games/:id/force-end - 強制結束
- POST /api/admin/games/:id/pause - 暫停
- POST /api/admin/games/:id/resume - 恢復

### 4.3 投標相關（團隊）
- POST /api/bids - 提交投標
- GET /api/games/:gameId/bids - 獲取投標記錄
- PUT /api/bids/:id - 更新投標
- DELETE /api/bids/:id - 刪除投標

### 4.4 查詢相關
- GET /api/games/:id/status - 遊戲狀態
- GET /api/games/:id/teams - 團隊狀態
- GET /api/games/:id/daily-results - 每日結算結果
- GET /api/qr/:gameId - 生成QR碼

---

## 五、已知問題與修復狀態

### 5.1 已修復 ✅
1. game_name → name (10處)
2. UPDATE games SET phase 語句恢復 (5處)
3. DATABASE_ARCHITECTURE.md 更新

### 5.2 待修復 ⏳
1. CREATE TABLE 定義與 Railway 不完全一致
2. ENUM 值需要全面驗證
3. 架構自動修復邏輯需要檢查
4. 可能存在的其他欄位名稱不一致

### 5.3 待測試 🧪
1. 遊戲創建功能
2. 完整遊戲流程
3. 投標提交與結算
4. 每日結算計算

---

## 六、系統性檢查清單

### 6.1 資料庫層檢查
- [ ] 所有 CREATE TABLE 定義與 Railway 一致
- [ ] 所有 ENUM 值與 Railway 一致
- [ ] 所有外鍵關係正確
- [ ] 索引設置合理

### 6.2 SQL 查詢檢查
- [ ] 所有 SELECT 使用正確欄位名
- [ ] 所有 INSERT 包含所有必要欄位
- [ ] 所有 UPDATE 同時更新 games.phase 和 game_days.status
- [ ] 所有 JOIN 關聯正確

### 6.3 業務邏輯檢查
- [ ] 狀態轉換邏輯完整
- [ ] 結算計算公式正確
- [ ] 滯銷處理邏輯正確（扣除2.5%）
- [ ] 利息計算正確
- [ ] ROI 計算正確

### 6.4 API 響應檢查
- [ ] 所有響應使用 camelCase (gameName 不是 game_name)
- [ ] 所有錯誤處理完善
- [ ] 所有 WebSocket 事件正確

### 6.5 前端整合檢查
- [ ] admin.html 正確處理所有遊戲狀態
- [ ] team.html 正確顯示投標介面
- [ ] 所有按鈕狀態控制正確

---

## 七、修復優先順序

### 🔴 高優先級（影響核心功能）
1. ✅ game_name → name
2. ✅ UPDATE games SET phase 恢復
3. ⏳ 驗證所有 ENUM 值
4. ⏳ 檢查所有狀態轉換邏輯

### 🟡 中優先級（影響體驗）
5. ⏳ CREATE TABLE 定義完整性
6. ⏳ 錯誤處理完善
7. ⏳ WebSocket 事件驗證

### 🟢 低優先級（優化）
8. ⏳ 架構自動修復邏輯優化
9. ⏳ 診斷工具完善
10. ⏳ 文檔補充

---

## 八、數據流追蹤

### 8.1 創建遊戲數據流
```
前端 admin.html
  ↓ POST /api/admin/games {gameName, ...}
後端 server.js
  ↓ INSERT INTO games (name, ...) VALUES (?, ...)
  ↓ UPDATE games SET status='active', phase='waiting', current_day=1
  ↓ INSERT INTO game_days (game_id, day_number, status='pending', ...)
  ↓ WebSocket broadcast {gameId, phase: 'waiting'}
Railway MySQL
  ↓ games 記錄, game_days 記錄
前端更新
  ↓ 顯示遊戲，啟用「開始買入投標」按鈕
```

### 8.2 投標數據流
```
前端 team.html
  ↓ POST /api/bids {gameId, fishType, bidType, price, quantity}
後端 server.js
  ↓ 檢查 game_days.status === 'buying_open' or 'selling_open'
  ↓ INSERT INTO bids (game_id, game_day_id, team_id, ...)
Railway MySQL
  ↓ bids 記錄
前端更新
  ↓ 顯示投標記錄
```

### 8.3 結算數據流
```
後端 server.js
  ↓ processBuyBids()
  ↓   按價格由高到低排序，分配魚貨
  ↓   UPDATE bids SET quantity_fulfilled, status
  ↓   UPDATE game_participants SET fish_inventory+, current_budget-（扣買入成本）
  ↓
  ↓ processSellBids()
  ↓   固定滯銷2.5% → 按價格由低到高排序 → 分配餐廳預算
  ↓   UPDATE bids SET quantity_fulfilled, status
  ↓   UPDATE game_participants SET fish_inventory-
  ↓   【日結模式】current_budget += 賣出收入
  ↓   【遊戲結束後結算模式】current_budget 不變（收入記錄在 bids/transactions）
  ↓
  ↓ enhancedDailySettlement()
  ↓   計算利息、滯銷費 → current_budget -= (利息 + 滯銷費)
  ↓   每日損益 = 賣出收入 - 買入成本 - 滯銷費 - 利息（兩種模式計算相同）
  ↓   INSERT INTO daily_results
  ↓   庫存歸零
Railway MySQL
  ↓ 更新所有相關記錄
WebSocket
  ↓ broadcast 'phaseChange' 事件
前端更新
  ↓ 顯示結算結果
```

---

**此框架將作為系統性修復的基礎，確保所有修改都基於完整的系統理解。**
