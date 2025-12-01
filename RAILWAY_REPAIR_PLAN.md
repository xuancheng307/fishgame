# Railway 資料庫修復計畫

**建立日期**: 2025-12-01
**修復原則**: 以 Railway 資料庫為唯一真理來源
**修復策略**: 資料庫 → 後端程式碼 → 前端介面

---

## 一、問題診斷總結

### 1.1 Railway 資料庫實際架構（已確認）

透過診斷 API 確認 Railway 生產環境的實際架構：

**games 表**（26 個欄位）：
- ✅ 使用 `name` VARCHAR(100) - **不是** `game_name`
- ✅ **有** `phase` 欄位 - ENUM('waiting','buying','buying_closed','selling','selling_closed','settling','day_ended')
- ✅ **有** `status` 欄位 - ENUM('pending','active','paused','finished','force_ended')
- ✅ 包含完整的遊戲參數欄位（利率、價格、時長等）

**game_days 表**：
- status ENUM: 'pending', 'buying_open', 'buying_closed', 'selling_open', 'selling_closed', 'settled'

**bids 表**：
- ✅ **有** game_id 欄位

**當前數據狀態**：
- users: 13 筆
- games: 30 筆
- game_days: 25 筆（已標準化）
- game_participants: 52 筆
- bids: 0 筆 ⚠️
- daily_results: 32 筆

### 1.2 問題清單

#### 🔴 嚴重錯誤（導致功能失敗）

**問題 1: 錯誤刪除 UPDATE games SET phase 語句**
- **影響**: 遊戲階段狀態無法正確更新
- **根本原因**: 誤以為 games.phase 欄位不存在
- **受影響功能**: 創建遊戲、開始/關閉買入、開始/關閉賣出
- **位置**: 5 處（Commit a3c2034）

**問題 2: 使用 game_name 而非 name**
- **影響**: 所有遊戲名稱相關查詢失敗
- **受影響位置**: server.js 8 處，check_database_data.js 2 處
- **具體錯誤**: "Unknown column 'game_name' in 'field list'"

**問題 3: CREATE TABLE 定義與 Railway 不符**
- **影響**: 誤導開發者，造成架構理解錯誤
- **問題**: 使用 game_name，缺少 26 個欄位中的大部分

#### ⚠️ 中等問題（可能影響功能）

**問題 4: 架構自動修復邏輯**
- **位置**: server.js Lines 300-376
- **問題**: 基於錯誤假設添加的修復邏輯
- **需要檢查**:
  - game_days.status 修復（這部分可能正確）
  - bids.game_id 添加（這部分可能正確）

**問題 5: bids 表無數據**
- **狀態**: 0 筆記錄
- **需要調查**: 數據是否遺失？還是正常狀態？

---

## 二、修復計畫

### 階段 1: 程式碼修正（不改資料庫）

#### 1.1 修復 server.js 的 game_name 使用

**位置與修正**：

1. **Line 155** - CREATE TABLE 定義
   ```sql
   -- 錯誤:
   game_name VARCHAR(255) NOT NULL,

   -- 修正為:
   name VARCHAR(100),
   ```

2. **Line 436** - SELECT 查詢
   ```javascript
   // 錯誤:
   'SELECT game_name FROM games WHERE id = ?'

   // 修正為:
   'SELECT name FROM games WHERE id = ?'
   ```

3. **Line 472** - 屬性賦值
   ```javascript
   // 錯誤:
   gameName: games[0].game_name

   // 修正為:
   gameName: games[0].name
   ```

4. **Lines 791, 857, 1677, 1734, 1881** - 同樣的屬性賦值錯誤
   ```javascript
   // 全部改為:
   gameName: xxx.name
   ```

#### 1.2 恢復被刪除的 UPDATE games SET phase 語句

**5 處需要恢復的代碼**：

1. **Line ~604** - 創建遊戲
   ```javascript
   // 錯誤（當前）:
   'UPDATE games SET status = "active", current_day = 1 WHERE id = ?'

   // 修正為:
   'UPDATE games SET status = "active", phase = "waiting", current_day = 1 WHERE id = ?'
   ```

2. **Line ~1144** - 開始買入投標（需要添加）
   ```javascript
   // 在 UPDATE game_days 之後添加:
   await pool.execute(
       'UPDATE games SET phase = ? WHERE id = ?',
       ['buying', gameId]
   );
   ```

3. **Line ~1244** - 關閉買入投標（需要添加）
   ```javascript
   // 在 UPDATE game_days 之後添加:
   await pool.execute(
       'UPDATE games SET phase = ? WHERE id = ?',
       ['buying_closed', gameId]
   );
   ```

4. **Line ~1317** - 開始賣出投標（需要添加）
   ```javascript
   // 在 UPDATE game_days 之後添加:
   await pool.execute(
       'UPDATE games SET phase = ? WHERE id = ?',
       ['selling', gameId]
   );
   ```

5. **Line ~1415** - 關閉賣出投標（需要添加）
   ```javascript
   // 在 UPDATE game_days 之後添加:
   await pool.execute(
       'UPDATE games SET phase = ? WHERE id = ?',
       ['selling_closed', gameId]
   );
   ```

#### 1.3 修復 CREATE TABLE games 定義

需要完整對照 Railway 實際架構，添加所有缺失的欄位：

```sql
CREATE TABLE IF NOT EXISTS games (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),                         -- ✅ 修正
    description TEXT,                          -- ✅ 添加
    status ENUM('pending', 'active', 'paused', 'finished', 'force_ended'),
    phase ENUM('waiting', 'buying', 'buying_closed', 'selling', 'selling_closed', 'settling', 'day_ended'),  -- ✅ 添加
    total_days INT,
    current_day INT,
    num_teams INT,
    initial_budget DECIMAL(12, 2),             -- ✅ 修正精度
    daily_interest_rate DECIMAL(5, 4),         -- ✅ 添加
    loan_interest_rate DECIMAL(5, 4),          -- ✅ 添加
    max_loan_ratio DECIMAL(5, 2),              -- ✅ 添加
    unsold_fee_per_kg DECIMAL(10, 2),          -- ✅ 添加
    fixed_unsold_ratio DECIMAL(5, 2),          -- ✅ 添加
    distributor_floor_price_a DECIMAL(10, 2),  -- ✅ 添加
    distributor_floor_price_b DECIMAL(10, 2),  -- ✅ 添加
    target_price_a DECIMAL(10, 2),             -- ✅ 添加
    target_price_b DECIMAL(10, 2),             -- ✅ 添加
    buying_duration INT,
    selling_duration INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    team_names JSON,                           -- ✅ 添加
    is_force_ended TINYINT(1),                 -- ✅ 添加
    force_ended_at TIMESTAMP,                  -- ✅ 添加
    force_end_day INT                          -- ✅ 添加
);
```

#### 1.4 修復 check_database_data.js

**2 處需要修正**：

1. **Line 239**:
   ```javascript
   // 錯誤:
   g.game_name,

   // 修正為:
   g.name,
   ```

2. **Line 256**:
   ```javascript
   // 錯誤:
   console.log(`\n  遊戲 #${game.id}: ${game.game_name}`);

   // 修正為:
   console.log(`\n  遊戲 #${game.id}: ${game.name}`);
   ```

#### 1.5 驗證所有 ENUM 值

**games.status** - ✅ 已確認正確:
- 'pending', 'active', 'paused', 'finished', 'force_ended'

**games.phase** - ✅ 已確認正確:
- 'waiting', 'buying', 'buying_closed', 'selling', 'selling_closed', 'settling', 'day_ended'

**game_days.status** - ✅ 已標準化:
- 'pending', 'buying_open', 'buying_closed', 'selling_open', 'selling_closed', 'settled'

**bids.bid_type** - 需要驗證:
- 'buy', 'sell'

**bids.fish_type** - 需要驗證:
- 'A', 'B'

**bids.status** - 需要驗證:
- 'pending', 'fulfilled', 'partial', 'failed'

#### 1.6 審查架構自動修復邏輯

**Lines 300-376** 需要檢查：

**保留的部分**：
- game_days.status ENUM 標準化（已驗證有效）
- bids.game_id 欄位添加（已確認存在）

**需要移除的部分**：
- 無（目前邏輯基本正確，但需要添加錯誤處理）

**建議優化**：
- 添加更詳細的日誌
- 避免在每次啟動時都執行（添加檢查條件）

### 階段 2: 測試驗證

#### 2.1 測試遊戲創建
- 創建新遊戲
- 驗證 games.phase = 'waiting'
- 驗證 games.name 正確儲存

#### 2.2 測試完整遊戲流程
1. 創建遊戲 → phase: waiting
2. 開始買入 → phase: buying
3. 關閉買入 → phase: buying_closed
4. 開始賣出 → phase: selling
5. 關閉賣出 → phase: selling_closed
6. 結算 → phase: settling
7. 結束當日 → phase: day_ended

#### 2.3 測試數據完整性
- 驗證所有 API 返回正確的 gameName（從 name 欄位）
- 驗證 phase 狀態正確同步
- 驗證 game_days.status 與 games.phase 協調

### 階段 3: 部署與監控

#### 3.1 部署步驟
1. 提交所有修正
2. 推送到 GitHub
3. Railway 自動部署
4. 監控部署日誌

#### 3.2 監控重點
- 檢查是否有 "Unknown column 'game_name'" 錯誤
- 檢查 phase 更新是否成功
- 檢查遊戲創建是否正常

---

## 三、預期成果

### 3.1 修復後的狀態
- ✅ 所有程式碼使用 `name` 而非 `game_name`
- ✅ games.phase 正確更新於各個階段
- ✅ CREATE TABLE 定義與 Railway 完全一致
- ✅ 遊戲創建功能恢復正常
- ✅ 完整遊戲流程可以順利執行

### 3.2 避免未來問題
- DATABASE_ARCHITECTURE.md 已更新為 Railway 實際架構
- 移除了錯誤的審計報告
- 建立以資料庫為準的開發原則

---

## 四、修復優先順序

### 🔴 高優先級（立即修復）
1. ✅ 更新 DATABASE_ARCHITECTURE.md（已完成）
2. ⏳ 修復 game_name → name（8 + 2 處）
3. ⏳ 恢復 UPDATE games SET phase（5 處）

### 🟡 中優先級（盡快修復）
4. ⏳ 修復 CREATE TABLE games 定義
5. ⏳ 驗證所有 ENUM 值

### 🟢 低優先級（後續優化）
6. ⏳ 優化架構自動修復邏輯
7. ⏳ 調查 bids 表無數據問題

---

## 五、執行檢查清單

- [x] 檢查 Railway 資料庫實際架構
- [x] 識別所有與 Railway 架構不符的程式碼
- [ ] 修復 server.js 中的 game_name 使用（8 處）
- [ ] 修復 check_database_data.js 中的 game_name 使用（2 處）
- [ ] 恢復 5 個 UPDATE games SET phase 語句
- [ ] 修復 CREATE TABLE games 定義
- [ ] 驗證所有 ENUM 值與 Railway 一致
- [ ] 審查並優化架構自動修復邏輯
- [ ] 測試遊戲創建功能
- [ ] 測試完整遊戲流程
- [ ] 部署到 Railway
- [ ] 監控生產環境運行狀態

---

**重要提醒**:
1. 本次修復**不應修改 Railway 資料庫結構**
2. 所有修改僅針對程式碼，使其符合 Railway 實際架構
3. Railway 資料庫是唯一真理來源
