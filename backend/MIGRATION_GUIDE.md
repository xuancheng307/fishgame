# Railway 資料庫遷移指南

## 問題摘要
發現 `daily_results` 表缺少 `roi` 欄位，導致結算功能無法運作。

## 解決方案

### 方案 A: 使用 Railway CLI (推薦)
在本地執行以下命令連接到 Railway 並執行 SQL：

```bash
cd backend
railway run node add_roi_column.js
```

### 方案 B: 手動 SQL 執行
如果方案 A 無法使用，請通過 Railway Dashboard 直接執行 SQL：

```sql
-- 檢查 roi 欄位是否存在
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'daily_results'
  AND COLUMN_NAME = 'roi';

-- 如果不存在，執行以下語句添加欄位
ALTER TABLE daily_results
ADD COLUMN roi DECIMAL(10, 4) NOT NULL DEFAULT 0
AFTER cumulative_profit;

-- 驗證欄位已添加
DESCRIBE daily_results;
```

## 驗證步驟

1. 確認欄位已添加：
```bash
railway run bash -c "node -e \"const mysql = require('mysql2/promise'); require('dotenv').config({ path: '.env.railway' }); (async () => { const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME }); const [cols] = await conn.execute('DESCRIBE daily_results'); console.log(cols); await conn.end(); })();\""
```

2. 測試結算功能：
```bash
node test_settle_only.js
```

## 完成部署
修復完成後，執行：
```bash
git add .
git commit -m "fix: 添加 daily_results.roi 欄位並實現 bid-summary API"
git push
railway up
```
