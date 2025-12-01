# 🚨 資料庫 Schema 嚴重不一致問題報告

## 檢查日期
2025-01-26

---

## ❌ 核心問題

**程式碼與資料庫 ENUM 定義嚴重不一致**

### 資料庫 ENUM 定義 (server.js:200)

```sql
CREATE TABLE IF NOT EXISTS game_days (
    ...
    status ENUM('pending', 'buying_open', 'buying_closed', 'selling_open', 'selling_closed', 'settled')
        DEFAULT 'pending',
    ...
)
```

**允許的值**: pending, buying_open, buying_closed, selling_open, selling_closed, settled

---

## 🔴 程式碼使用的非法值

### 1. 'waiting' - 未定義但被使用 (4處)

| 位置 | 程式碼 | 用途 |
|------|--------|------|
| Line 624 | `VALUES (?, 1, ?, ?, ?, ?, 'waiting')` | 創建第1天記錄 |
| Line 1047 | `VALUES (?, ?, ?, ?, ?, ?, 'waiting')` | 推進天數創建新記錄 |
| Line 1128 | `else if (dayStatus !== 'waiting')` | 檢查狀態條件 |
| Line 1416 | `['waiting', gameId]` | 更新狀態為 waiting |

### 2. 'sell_closed' - 未定義但被使用 (6處)

| 位置 | 程式碼 | 用途 |
|------|--------|------|
| Line 964 | `currentDayRecord[0].status !== 'sell_closed'` | 檢查是否可推進天數 |
| Line 1124 | `else if (dayStatus === 'sell_closed')` | 狀態檢查 |
| Line 1327 | `['sell_closed', currentDay[0].id]` | 關閉賣出投標 |
| Line 1411 | `['sell_closed', currentDay[0].id]` | 關閉賣出投標 |
| Line 1465 | `if (currentDay[0].status !== 'sell_closed')` | 結算前檢查 |

**注意**: ENUM 中有 'selling_closed' 而非 'sell_closed'！

### 3. 'completed' - 未定義但被使用 (4處)

| 位置 | 程式碼 | 用途 |
|------|--------|------|
| Line 965 | `currentDayRecord[0].status !== 'completed'` | 檢查是否可推進天數 |
| Line 1126 | `else if (dayStatus === 'completed')` | 狀態檢查 |
| Line 1461 | `if (currentDay[0].status === 'completed')` | 檢查是否已結算 |
| Line 1478 | `['completed', currentDay[0].id]` | 標記結算完成 |

---

## 📊 正確的狀態轉換流程應該是

```
pending (新天數)
    ↓
buying_open (開始買入投標)
    ↓
buying_closed (關閉買入投標)
    ↓
selling_open (開始賣出投標)
    ↓
selling_closed (關閉賣出投標)
    ↓
settled (每日結算完成)
    ↓
[推進到下一天] → pending
```

---

## 🔧 必須修復的問題

### 方案 1: 更新程式碼以匹配資料庫 ENUM (推薦)

**需要修改**:
1. 將所有 `'waiting'` 改為 `'pending'`
2. 將所有 `'sell_closed'` 改為 `'selling_closed'`
3. 將所有 `'completed'` 改為 `'settled'`

### 方案 2: 更新資料庫 ENUM 以匹配程式碼

```sql
ALTER TABLE game_days
MODIFY COLUMN status ENUM(
    'waiting',          -- 新增
    'pending',
    'buying_open',
    'buying_closed',
    'selling_open',
    'sell_closed',      -- 新增(取代 selling_closed)
    'selling_closed',   -- 保留以相容
    'completed',        -- 新增
    'settled'
) DEFAULT 'waiting';
```

**不推薦原因**: 增加複雜度，有重複值

---

## 🎯 推薦修復方案

**選擇方案 1**: 修改程式碼以匹配現有 ENUM

### 需要的修改

#### 1. 創建天數時 (Line 624, 1047)
```javascript
// 修改前
VALUES (?, ?, ?, ?, ?, ?, 'waiting')

// 修改後
VALUES (?, ?, ?, ?, ?, ?, 'pending')
```

#### 2. 關閉賣出投標 (Line 1327, 1411)
```javascript
// 修改前
['sell_closed', currentDay[0].id]

// 修改後
['selling_closed', currentDay[0].id]
```

#### 3. 結算完成 (Line 1478)
```javascript
// 修改前
['completed', currentDay[0].id]

// 修改後
['settled', currentDay[0].id]
```

#### 4. 狀態檢查 (Line 964-965, 1124-1126, 1128, 1461, 1465)
```javascript
// 修改前
dayStatus !== 'waiting'
dayStatus === 'sell_closed'
dayStatus === 'completed'
status === 'completed'
status !== 'sell_closed'

// 修改後
dayStatus !== 'pending'
dayStatus === 'selling_closed'
dayStatus === 'settled'
status === 'settled'
status !== 'selling_closed'
```

#### 5. 重置狀態 (Line 1416)
```javascript
// 修改前
['waiting', gameId]

// 修改後
['pending', gameId]
```

---

## ⚠️ 前端影響分析

### admin.html phaseMapping 需要更新

當前映射 (admin.html:903-913):
```javascript
const phaseMapping = {
    'pending': 'pending',
    'buying_open': 'buying',
    'buying_closed': 'buying_closed',
    'selling_open': 'selling',
    'selling_closed': 'selling_closed',
    'settled': 'settled',
    // 舊版相容
    'buy_ended': 'buying_closed',
    'sell_ended': 'selling_closed'
};
```

**問題**:
- 映射中沒有 'waiting' → 如果 phase 是 'waiting' 會 fallback 到原值
- 'sell_closed' 沒有映射 → 如果 phase 是 'sell_closed' 會 fallback 到原值

**修復後不需要改動**:
- 因為所有值都會改為 ENUM 中的標準值

---

## 🔍 為什麼按鈕不顯示？

### 當前狀況分析

1. **創建新天數時** (advance-day API):
   ```javascript
   status = 'waiting'  // ❌ 不在 ENUM 中
   ```

2. **MySQL 處理非法 ENUM 值**:
   - 可能轉換為空字串 `''`
   - 可能使用第一個值 `'pending'`
   - 可能報錯（嚴格模式）

3. **API 返回**:
   ```javascript
   phase: game.day_status || 'pending'
   ```
   - 如果 day_status 是 `''` → phase = 'pending' ✅
   - 如果 day_status 是 'waiting' → phase = 'waiting' ❌

4. **前端 phaseMapping**:
   ```javascript
   const phase = phaseMapping['waiting'] || 'waiting';
   // 'waiting' 不在 mapping 中，保持為 'waiting'
   ```

5. **按鈕生成邏輯**:
   ```javascript
   if (phase === 'pending') { /* 顯示開始買入按鈕 */ }
   // phase 是 'waiting'，條件不符合，沒有按鈕顯示 ❌
   ```

---

## 🚀 立即行動計劃

1. ✅ **確認 Railway 資料庫實際狀態值**
   - 檢查現有記錄中 game_days.status 的實際值
   - 確認是否有非法值被保存

2. ✅ **修改程式碼統一使用 ENUM 值**
   - 全域替換 'waiting' → 'pending'
   - 全域替換 'sell_closed' → 'selling_closed'
   - 全域替換 'completed' → 'settled'

3. ✅ **測試狀態轉換流程**
   - 創建遊戲 → 推進到第1天 → 開始買入 → 關閉買入 → 開始賣出 → 關閉賣出 → 結算

4. ✅ **清理資料庫中的非法值** (如果有)
   ```sql
   UPDATE game_days SET status = 'pending' WHERE status = 'waiting';
   UPDATE game_days SET status = 'selling_closed' WHERE status = 'sell_closed';
   UPDATE game_days SET status = 'settled' WHERE status = 'completed';
   ```

---

## 📝 總結

**根本原因**: 程式碼與資料庫 schema 定義完全脫節

**嚴重程度**: 🔴 Critical - 導致按鈕無法顯示，遊戲無法正常運作

**影響範圍**:
- 推進天數功能
- 買入/賣出投標狀態管理
- 每日結算流程
- 管理員控制面板按鈕顯示

**必須立即修復**: 是

---

**報告完成日期**: 2025-01-26
**問題狀態**: 🔴 待修復
**優先級**: P0 (最高)
