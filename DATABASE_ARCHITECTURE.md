# 魚市場遊戲 - 資料庫架構標準文檔

## 設計原則

**資料庫為主 → 功能配合 → 介面顯示**

1. 資料庫定義是唯一真理來源
2. 所有程式碼必須嚴格遵守資料庫結構
3. ENUM 值必須完全一致
4. 不得有虛擬或不存在的欄位

---

## 核心資料表

### 1. users 表（用戶）

```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    team_name VARCHAR(255),
    role ENUM('admin', 'team') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**欄位說明**:
- `id`: 用戶唯一識別碼
- `username`: 登入帳號
- `password_hash`: 加密後的密碼
- `team_name`: 團隊名稱
- `role`: 用戶角色（admin=管理員, team=團隊）

---

### 2. games 表（遊戲）

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

**重要**:
- ❌ **沒有 `phase` 欄位** - 遊戲階段由 `game_days.status` 管理
- `status` 值: pending（待開始）, active（進行中）, paused（暫停）, finished（已結束）

---

### 3. game_days 表（遊戲天數）

```sql
CREATE TABLE game_days (
    id INT PRIMARY KEY AUTO_INCREMENT,
    game_id INT NOT NULL,
    day_number INT NOT NULL,
    fish_a_supply INT NOT NULL,
    fish_b_supply INT NOT NULL,
    fish_a_restaurant_budget DECIMAL(15, 2) NOT NULL,
    fish_b_restaurant_budget DECIMAL(15, 2) NOT NULL,
    status ENUM('pending', 'buying_open', 'buying_closed', 'selling_open', 'selling_closed', 'settled') DEFAULT 'pending',
    UNIQUE(game_id, day_number),
    FOREIGN KEY (game_id) REFERENCES games(id)
);
```

**status 欄位標準值** (必須嚴格遵守):
- `pending` - 等待開始（新創建的天數）
- `buying_open` - 買入投標開放中
- `buying_closed` - 買入投標已關閉
- `selling_open` - 賣出投標開放中
- `selling_closed` - 賣出投標已關閉
- `settled` - 每日結算完成

**狀態轉換流程**:
```
pending → buying_open → buying_closed → selling_open → selling_closed → settled
```

**⚠️ 嚴禁使用的值**:
- ❌ 'waiting' (舊版，已廢棄)
- ❌ 'buy_closed' (舊版，已廢棄)
- ❌ 'sell_closed' (舊版，已廢棄)
- ❌ 'completed' (舊版，已廢棄)

---

### 4. game_participants 表（遊戲參與者）

```sql
CREATE TABLE game_participants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    game_id INT NOT NULL,
    team_id INT NOT NULL,
    current_budget DECIMAL(15, 2) NOT NULL,
    total_loan DECIMAL(15, 2) DEFAULT 0.00,
    total_loan_principal DECIMAL(15, 2) DEFAULT 0.00,
    fish_a_inventory INT DEFAULT 0,
    fish_b_inventory INT DEFAULT 0,
    cumulative_profit DECIMAL(15, 2) DEFAULT 0.00,
    UNIQUE(game_id, team_id),
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (team_id) REFERENCES users(id)
);
```

**重要**:
- ❌ **沒有 `roi` 欄位** - ROI 由 API 動態計算
- ROI 計算公式: `(cumulative_profit / (initial_budget + total_loan_principal)) * 100`

---

### 5. bids 表（投標記錄）

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (game_day_id) REFERENCES game_days(id),
    FOREIGN KEY (team_id) REFERENCES users(id)
);
```

**欄位說明**:
- `game_id`: 遊戲ID（冗餘欄位，用於查詢優化）
- `game_day_id`: 關聯到 game_days.id
- `day_number`: 天數（冗餘欄位，用於查詢優化）
- `bid_type`: 投標類型（buy=買入, sell=賣出）
- `fish_type`: 魚類型（A, B）
- `status`: 投標狀態（pending=待處理, fulfilled=完全成交, partial=部分成交, failed=失敗）

**⚠️ 當前問題**: Railway 資料庫缺少 `game_id` 欄位需修復

---

### 6. daily_results 表（每日結算）

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
    closing_loan DECIMAL(15, 2) NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (game_day_id) REFERENCES game_days(id),
    FOREIGN KEY (team_id) REFERENCES users(id)
);
```

**欄位說明**:
- 這是歷史記錄表，保存每日結算的快照
- `cumulative_profit`: 該天結束時的累積利潤（快照）
- `roi`: 該天結束時的 ROI（快照）

---

## 資料完整性規則

### 1. ENUM 值一致性

**所有程式碼必須使用標準 ENUM 值**:

```javascript
// game_days.status 標準值
const GAME_DAY_STATUS = {
    PENDING: 'pending',
    BUYING_OPEN: 'buying_open',
    BUYING_CLOSED: 'buying_closed',
    SELLING_OPEN: 'selling_open',
    SELLING_CLOSED: 'selling_closed',
    SETTLED: 'settled'
};

// games.status 標準值
const GAME_STATUS = {
    PENDING: 'pending',
    ACTIVE: 'active',
    PAUSED: 'paused',
    FINISHED: 'finished'
};

// bids.bid_type 標準值
const BID_TYPE = {
    BUY: 'buy',
    SELL: 'sell'
};

// bids.status 標準值
const BID_STATUS = {
    PENDING: 'pending',
    FULFILLED: 'fulfilled',
    PARTIAL: 'partial',
    FAILED: 'failed'
};
```

### 2. 禁止使用虛擬欄位

❌ 禁止在程式碼中更新不存在的欄位:
- `UPDATE games SET phase = ?` ← games 表沒有 phase 欄位

✅ 正確做法:
- 使用 `game_days.status` 管理遊戲階段
- API 從 `game_days.status` 讀取並映射到 `phase` 回傳給前端

### 3. 計算欄位處理

對於不存在於資料庫但需要回傳給前端的欄位，在 API 層計算：

```javascript
// ROI 計算 (game_participants 沒有 roi 欄位)
const roi = (cumulative_profit / (initial_budget + total_loan_principal)) * 100;

// Phase 映射 (games 沒有 phase 欄位)
const phase = game_days.status || 'pending';
```

---

## 當前需要修復的問題

### 優先級 P0 (Critical)

1. **game_days.status ENUM 不一致**
   - Railway 資料庫可能還使用舊的 ENUM 定義
   - 需執行 ALTER TABLE 更新為標準值

2. **bids 表缺少 game_id 欄位**
   - 需執行 ALTER TABLE 添加欄位

### 修復 SQL

```sql
-- 1. 更新 game_days.status ENUM
ALTER TABLE game_days
MODIFY COLUMN status ENUM('pending', 'buying_open', 'buying_closed', 'selling_open', 'selling_closed', 'settled') DEFAULT 'pending';

-- 2. 添加 bids.game_id 欄位
ALTER TABLE bids
ADD COLUMN game_id INT NOT NULL AFTER id,
ADD FOREIGN KEY (game_id) REFERENCES games(id);

-- 3. 填充 bids.game_id 數據（從 game_days 獲取）
UPDATE bids b
JOIN game_days gd ON b.game_day_id = gd.id
SET b.game_id = gd.game_id;
```

---

## API 回應格式標準

### 前端期待的參數格式

前端使用 **camelCase**，資料庫使用 **snake_case**，API 需要同時提供：

```javascript
// API 回應範例
{
    // 原始資料庫欄位 (snake_case)
    game_name: "測試遊戲",
    current_day: 1,
    total_days: 7,

    // camelCase 副本（前端使用）
    gameName: "測試遊戲",
    currentDay: 1,
    totalDays: 7,

    // 計算/映射欄位
    phase: "pending",  // 從 game_days.status 映射
    roi: 15.5          // 動態計算
}
```

---

**文檔版本**: 1.0
**建立日期**: 2025-12-01
**狀態**: 標準架構定義

