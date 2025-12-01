# 完整參數與資料庫欄位檢查報告

## 檢查日期
2025-01-26

---

## 🎯 檢查目標

1. 所有資料表欄位定義
2. 程式碼使用的欄位是否存在
3. 是否有重複功能的參數
4. snake_case 與 camelCase 一致性

---

## 📊 資料庫表結構

### 1. users 表

```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    team_name VARCHAR(255),
    role ENUM('admin', 'team') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

**欄位**: id, username, password_hash, team_name, role, created_at

**狀態**: ✅ 正常

---

### 2. games 表

```sql
CREATE TABLE games (
    id INT PRIMARY KEY AUTO_INCREMENT,
    game_name VARCHAR(255) NOT NULL,
    initial_budget DECIMAL(15, 2) NOT NULL,
    loan_interest_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.03,
    unsold_fee_per_kg DECIMAL(10, 2) NOT NULL DEFAULT 10.00,
    fixed_unsold_ratio DECIMAL(5, 2) NOT NULL DEFAULT 2.50,
    distributor_floor_price_a DECIMAL(10, 2) DEFAULT 100.00,
    distributor_floor_price_b DECIMAL(10, 2) DEFAULT 100.00,
    target_price_a DECIMAL(10, 2) NOT NULL,
    target_price_b DECIMAL(10, 2) NOT NULL,
    num_teams INT NOT NULL DEFAULT 12,
    total_days INT NOT NULL DEFAULT 7,
    status ENUM('pending', 'active', 'paused', 'finished') DEFAULT 'pending',
    current_day INT DEFAULT 0,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

**欄位**: 16個欄位（見上）

**⚠️ 缺少 phase 欄位**: 但程式碼嘗試更新它！

---

### 3. game_participants 表

```sql
CREATE TABLE game_participants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    game_id INT,
    team_id INT,
    current_budget DECIMAL(15, 2) NOT NULL,
    total_loan DECIMAL(15, 2) DEFAULT 0.00,
    total_loan_principal DECIMAL(15, 2) DEFAULT 0.00,
    fish_a_inventory INT DEFAULT 0,
    fish_b_inventory INT DEFAULT 0,
    cumulative_profit DECIMAL(15, 2) DEFAULT 0.00
)
```

**欄位**: id, game_id, team_id, current_budget, total_loan, total_loan_principal, fish_a_inventory, fish_b_inventory, cumulative_profit

**⚠️ 缺少 roi 欄位**: API 需要實時計算（已在之前的修復中處理）

**狀態**: ✅ 已修復（API 計算 roi）

---

### 4. game_days 表

```sql
CREATE TABLE game_days (
    id INT PRIMARY KEY AUTO_INCREMENT,
    game_id INT,
    day_number INT NOT NULL,
    fish_a_supply INT NOT NULL,
    fish_b_supply INT NOT NULL,
    fish_a_restaurant_budget DECIMAL(15, 2) NOT NULL,
    fish_b_restaurant_budget DECIMAL(15, 2) NOT NULL,
    status ENUM('pending', 'buying_open', 'buying_closed', 'selling_open', 'selling_closed', 'settled') DEFAULT 'pending'
)
```

**欄位**: id, game_id, day_number, fish_a_supply, fish_b_supply, fish_a_restaurant_budget, fish_b_restaurant_budget, status

**狀態**: ✅ 正常（已修復 ENUM 值不一致問題）

---

### 5. bids 表

```sql
CREATE TABLE bids (
    id INT PRIMARY KEY AUTO_INCREMENT,
    game_id INT NOT NULL,
    game_day_id INT NOT NULL,
    day_number INT NOT NULL,
    team_id INT NOT NULL,
    bid_type ENUM('buy', 'sell') NOT NULL,
    fish_type ENUM('A', 'B') NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity_submitted INT NOT NULL,
    quantity_fulfilled INT DEFAULT 0,
    status ENUM('pending', 'fulfilled', 'partial', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

**欄位**: id, game_id, game_day_id, day_number, team_id, bid_type, fish_type, price, quantity_submitted, quantity_fulfilled, status, created_at

**⚠️ 冗餘設計**: game_id, game_day_id, day_number 同時存在
- game_id 可關聯到 games 表
- game_day_id 可關聯到 game_days 表
- day_number 可從 game_days 查到

**評估**: 冗餘設計可能是為了查詢性能優化，可接受

**狀態**: ✅ 可接受的冗餘設計

---

### 6. daily_results 表

```sql
CREATE TABLE daily_results (
    id INT PRIMARY KEY AUTO_INCREMENT,
    game_id INT NOT NULL,
    game_day_id INT NOT NULL,
    day_number INT NOT NULL,
    team_id INT NOT NULL,
    revenue DECIMAL(15, 2) NOT NULL,
    cost DECIMAL(15, 2) NOT NULL,
    unsold_fee DECIMAL(15, 2) NOT NULL,
    interest_incurred DECIMAL(15, 2) NOT NULL,
    daily_profit DECIMAL(15, 2) NOT NULL,
    cumulative_profit DECIMAL(15, 2) NOT NULL,
    roi DECIMAL(10, 4) NOT NULL,
    closing_budget DECIMAL(15, 2) NOT NULL,
    closing_loan DECIMAL(15, 2) NOT NULL
)
```

**欄位**: 14個欄位（見上）

**⚠️ 冗餘設計**: 與 bids 表類似

**⚠️ cumulative_profit 重複**:
- game_participants.cumulative_profit
- daily_results.cumulative_profit

**評估**: daily_results 是歷史記錄，game_participants 是當前狀態，可接受

**狀態**: ✅ 可接受的冗餘設計

---

## 🔴 發現的嚴重問題

### 問題 1: games.phase 欄位不存在但被使用

**影響範圍**: 5 處程式碼

| 位置 | 程式碼 | 影響 |
|------|--------|------|
| Line 604 | `UPDATE games SET phase = "waiting"` | ❌ 創建遊戲時失敗 |
| Line 1144 | `UPDATE games SET phase = 'buying'` | ❌ 開始買入投標時失敗 |
| Line 1244 | `UPDATE games SET phase = ?` | ❌ 關閉買入投標時失敗 |
| Line 1317 | `UPDATE games SET phase = ?` | ❌ 開始賣出投標時失敗 |
| Line 1415 | `UPDATE games SET phase = ?` | ❌ 關閉賣出投標時失敗 |

**根本原因**:
- games 表設計時沒有 phase 欄位
- 狀態應該由 game_days.status 管理
- 程式碼錯誤地嘗試在 games 表維護 phase

**修復方案**:
1. **刪除所有 `UPDATE games SET phase = ?` 語句**
2. **只更新 game_days.status**
3. **API 從 game_days.status 讀取 phase**（已實現）

---

## ⚠️ 重複功能的參數

### 1. status 欄位重複

**games.status**:
- 值: 'pending', 'active', 'paused', 'finished'
- 用途: 遊戲整體狀態

**game_days.status**:
- 值: 'pending', 'buying_open', 'buying_closed', 'selling_open', 'selling_closed', 'settled'
- 用途: 每日的投標階段

**bids.status**:
- 值: 'pending', 'fulfilled', 'partial', 'failed'
- 用途: 投標成交狀態

**評估**:
- ✅ 三個 status 用途不同，雖然都叫 status 但語義清晰
- ⚠️ 都有 'pending' 值，可能造成混淆
- 建議: 可接受，但需要清楚文檔說明

---

### 2. cumulative_profit 重複

**game_participants.cumulative_profit**:
- 用途: 當前累積利潤
- 更新時機: 每次結算後更新

**daily_results.cumulative_profit**:
- 用途: 該天結束時的累積利潤（歷史記錄）
- 更新時機: 每日結算時寫入

**評估**: ✅ 可接受
- game_participants 是最新狀態
- daily_results 是歷史快照
- 兩者功能不同

---

### 3. day_number 冗餘

**game_days.day_number**: 主鍵的一部分

**bids.day_number**: 冗餘欄位
- 可以從 game_day_id JOIN 到 game_days 獲取
- 但為了查詢性能保留

**daily_results.day_number**: 冗餘欄位
- 同樣原因

**評估**: ✅ 可接受的性能優化

---

## 📝 API 回應格式檢查

### /api/admin/active-game

**返回欄位**:
```javascript
{
    // 原始 games 表欄位 (snake_case)
    id, game_name, current_day, total_days, status, ...

    // camelCase 副本
    gameName, currentDay, totalDays, ...

    // 計算欄位
    phase: game.day_status || 'pending',  // ✅ 從 game_days 讀取
    participantCount,

    // 嵌套物件
    currentDayData: { ... }
}
```

**狀態**: ✅ 正確

---

### /api/admin/games/:gameId/teams

**返回欄位**:
```javascript
[{
    // game_participants 表欄位
    id, game_id, team_id, current_budget, total_loan, ...

    // JOIN users 表
    username, team_name,

    // 計算欄位
    roi: (cumulative_profit / (initial_budget + total_loan_principal)) * 100
}]
```

**狀態**: ✅ 正確（已修復）

---

## 🔧 必須修復的問題清單

### 優先級 P0 (Critical - 立即修復)

1. ❌ **刪除所有 `UPDATE games SET phase = ?` 語句** (5處)
   - Line 604, 1144, 1244, 1317, 1415
   - 這些語句會失敗，因為欄位不存在
   - 只保留 game_days.status 更新

---

## ✅ 已修復的問題

1. ✅ ENUM 值不一致問題
   - 'waiting' → 'pending'
   - 'sell_closed' → 'selling_closed'
   - 'completed' → 'settled'

2. ✅ ROI 計算
   - API 動態計算 roi
   - 不依賴 game_participants.roi 欄位

3. ✅ phase 參數為 null
   - API 使用 `game.day_status || 'pending'`

4. ✅ camelCase 轉換
   - API 同時返回 snake_case 和 camelCase

---

## 📊 資料流程圖

```
創建遊戲
    ↓
games.status = 'active'        ✅ 正確
games.current_day = 1          ✅ 正確
games.phase = 'waiting'        ❌ 錯誤！欄位不存在
    ↓
創建 game_days 記錄
game_days.status = 'pending'   ✅ 正確
    ↓
API 返回
phase = game_days.status       ✅ 正確
```

---

## 🎯 修復建議

### 方案: 移除 games.phase 更新

**需要修改的地方** (5處):

1. **Line 604** - 創建遊戲
```javascript
// 修改前
'UPDATE games SET status = "active", phase = "waiting", current_day = 1 WHERE id = ?'

// 修改後
'UPDATE games SET status = "active", current_day = 1 WHERE id = ?'
```

2. **Line 1144** - 開始買入投標
```javascript
// 修改前
await pool.execute(
    'UPDATE games SET phase = ? WHERE id = ?',
    ['buying', gameId]
);

// 修改後
// 刪除這段代碼，只保留 game_days.status 更新
```

3. **Line 1244** - 關閉買入投標
```javascript
// 修改前
await pool.execute(
    'UPDATE games SET phase = ? WHERE id = ?',
    [...]
);

// 修改後
// 刪除這段代碼
```

4. **Line 1317** - 開始賣出投標
```javascript
// 修改前
await pool.execute(
    'UPDATE games SET phase = ? WHERE id = ?',
    [...]
);

// 修改後
// 刪除這段代碼
```

5. **Line 1415** - 關閉賣出投標
```javascript
// 修改前
await pool.execute(
    'UPDATE games SET phase = ? WHERE id = ?',
    [...]
);

// 修改後
// 刪除這段代碼
```

---

## 📋 總結

### 嚴重問題
- 🔴 games.phase 欄位不存在但被使用（5處）

### 可接受的設計
- ✅ status 欄位在多個表中（用途不同）
- ✅ cumulative_profit 重複（歷史 vs 當前）
- ✅ day_number 冗餘（性能優化）

### 已修復
- ✅ ENUM 值不一致
- ✅ ROI 計算
- ✅ camelCase 轉換

---

**報告完成日期**: 2025-01-26
**檢查狀態**: ✅ 完成
**待修復**: 1個嚴重問題（games.phase）
