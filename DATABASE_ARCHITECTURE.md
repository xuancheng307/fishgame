# 魚市場遊戲 - Railway 資料庫實際架構文檔

**⚠️ 重要：本文檔記錄 Railway 生產環境的實際資料庫架構**

最後更新：2025-12-01
資料來源：Railway 生產資料庫診斷 API

---

## 設計原則

**Railway 資料庫為唯一真理來源**

1. 所有程式碼必須嚴格遵守 Railway 資料庫結構
2. ENUM 值必須完全一致
3. 欄位名稱以 Railway 實際欄位為準

---

## 核心資料表

### 1. games 表（遊戲）- Railway 實際架構

```sql
CREATE TABLE games (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),                    -- ⚠️ 注意：是 name 不是 game_name
    description TEXT,
    status ENUM('pending', 'active', 'paused', 'finished', 'force_ended'),
    phase ENUM('waiting', 'buying', 'buying_closed', 'selling', 'selling_closed', 'settling', 'day_ended'),  -- ✅ 此欄位存在
    total_days INT,
    current_day INT,
    num_teams INT,
    initial_budget DECIMAL(12, 2),
    daily_interest_rate DECIMAL(5, 4),
    loan_interest_rate DECIMAL(5, 4),
    max_loan_ratio DECIMAL(5, 2),
    unsold_fee_per_kg DECIMAL(10, 2),
    fixed_unsold_ratio DECIMAL(5, 2),
    distributor_floor_price_a DECIMAL(10, 2),
    distributor_floor_price_b DECIMAL(10, 2),
    target_price_a DECIMAL(10, 2),
    target_price_b DECIMAL(10, 2),
    buying_duration INT,
    selling_duration INT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    team_names JSON,
    is_force_ended TINYINT(1),
    force_ended_at TIMESTAMP,
    force_end_day INT
);
```

**重要欄位說明**:
- ✅ **phase 欄位存在** - 用於管理遊戲當前階段
- `name` 不是 `game_name` - 所有代碼必須使用 `name`
- `status` 管理遊戲整體狀態
- `phase` 管理遊戲當前階段（等待、買入、賣出等）

**status ENUM 值**:
- `pending` - 待開始
- `active` - 進行中
- `paused` - 暫停
- `finished` - 已結束
- `force_ended` - 強制結束

**phase ENUM 值**:
- `waiting` - 等待開始
- `buying` - 買入階段
- `buying_closed` - 買入已關閉
- `selling` - 賣出階段
- `selling_closed` - 賣出已關閉
- `settling` - 結算中
- `day_ended` - 當日結束

---

### 2. game_days 表（遊戲天數）

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

**status 欄位標準值** (已修復為標準值):
- `pending` - 等待開始
- `buying_open` - 買入投標開放中
- `buying_closed` - 買入投標已關閉
- `selling_open` - 賣出投標開放中
- `selling_closed` - 賣出投標已關閉
- `settled` - 每日結算完成

**狀態轉換流程**:
```
pending → buying_open → buying_closed → selling_open → selling_closed → settled
```

---

### 3. bids 表（投標記錄）

```sql
CREATE TABLE bids (
    id INT PRIMARY KEY AUTO_INCREMENT,
    game_id INT NOT NULL,                 -- ✅ 此欄位已存在
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
- ✅ `game_id` 欄位已添加（冗餘欄位，用於查詢優化）
- `game_day_id`: 關聯到 game_days.id
- `day_number`: 天數（冗餘欄位，用於查詢優化）

---

### 4. users 表（用戶）

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

---

### 5. game_participants 表（遊戲參與者）

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

**注意**: ROI 由 API 動態計算，不存儲在資料庫

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

---

## 當前資料統計 (2025-12-01)

| 表名 | 記錄數 |
|------|--------|
| users | 13 |
| games | 30 |
| game_days | 25 |
| game_participants | 52 |
| bids | 0 |
| daily_results | 32 |

---

## 重要提醒

### ✅ 正確的欄位名稱
- games 表使用 `name` **不是** `game_name`
- games 表**有** `phase` 欄位
- bids 表**有** `game_id` 欄位

### ✅ 正確的 ENUM 值
- games.status: 包含 `force_ended`
- games.phase: 使用 `waiting`, `buying`, `buying_closed`, `selling`, `selling_closed`, `settling`, `day_ended`
- game_days.status: 使用 `pending`, `buying_open`, `buying_closed`, `selling_open`, `selling_closed`, `settled`

### ⚠️ 代碼注意事項
- 所有查詢 games 表的代碼必須使用 `name` 欄位
- 可以使用 `UPDATE games SET phase = ?` 更新階段
- 不要嘗試 ALTER TABLE 修改已存在的表結構

---

**文檔版本**: 2.0 (基於 Railway 實際架構)
**建立日期**: 2025-12-01
**資料來源**: Railway 生產資料庫
**狀態**: Railway 實際架構定義
