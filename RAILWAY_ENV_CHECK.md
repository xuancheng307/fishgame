# Railway 環境變數配置檢查

## 🔍 問題診斷

**錯誤**: `Can't add new command when connection is in closed state`

**可能原因**:
1. ❌ Railway 服務環境變數配置錯誤
2. ❌ Railway 部署還未完成（使用舊版本代碼）
3. ❌ 缺少 `DB_PORT` 環境變數

---

## ✅ 必要的環境變數

請到 **Railway Dashboard** → 你的後端服務 → **Variables** 標籤，確認以下環境變數：

### 資料庫連線變數

```bash
DB_HOST=hopper.proxy.rlwy.net
DB_PORT=17950                          # ⚠️ 重要！必須設定
DB_USER=root
DB_PASSWORD=vkgxXBmSVyomZFHjWMAOMZupViBgqkYw
DB_NAME=fishmarket_game
```

### 應用程式變數

```bash
JWT_SECRET=fishgame-railway-secret     # 或任何隨機長字串
NODE_ENV=production
PORT=                                   # 留空，Railway 會自動提供
```

---

## 🚨 常見錯誤

### 錯誤 1: 缺少 DB_PORT
**症狀**: 連接失敗或連接到錯誤的數據庫
**解決**: 添加 `DB_PORT=17950`

### 錯誤 2: 使用內部連線 URL
**症狀**: 服務無法連接到 MySQL
**解決**: 使用公開連線資訊（hopper.proxy.rlwy.net:17950）

### 錯誤 3: 部署未完成
**症狀**: 仍然出現舊版本的錯誤
**解決**: 等待部署完成（查看 Deployments 標籤）

---

## 📋 檢查步驟

### 步驟 1: 檢查部署狀態

1. 進入 **Railway Dashboard**
2. 選擇你的後端服務
3. 點擊 **Deployments** 標籤
4. 確認最新的部署：
   - ✅ 狀態應該是 "Success"（綠色）
   - ✅ 提交訊息應該是 "fix: 修正資料庫連接管理..."
   - ✅ 時間應該是最近幾分鐘

**如果部署失敗**:
- 查看 **Build Logs** 和 **Deploy Logs**
- 檢查是否有錯誤訊息

### 步驟 2: 檢查環境變數

1. 點擊 **Variables** 標籤
2. 確認所有上述變數都已設定
3. **特別注意 `DB_PORT=17950`** 是否存在

**如果缺少變數**:
- 點擊 "New Variable"
- 輸入變數名稱和值
- 點擊 "Add"
- 服務會自動重新部署

### 步驟 3: 查看運行日誌

1. 點擊 **Logs** 標籤（或 View Logs）
2. 查找啟動訊息：
   ```
   資料庫連接成功
   資料庫初始化完成
   Server running on port XXXXX
   ```

**如果看到錯誤**:
- `ECONNREFUSED`: 連線資訊錯誤，檢查環境變數
- `Access denied`: 密碼錯誤
- `Unknown database`: 資料庫名稱錯誤

### 步驟 4: 測試服務

1. 複製 Railway 提供的公開 URL（例如 `https://xxx.up.railway.app`）
2. 在瀏覽器打開 `https://xxx.up.railway.app/admin.html`
3. 登入後嘗試創建遊戲

---

## 🔧 快速修復方案

### 方案 A: 完整環境變數設定（推薦）

複製以下內容，逐一添加到 Railway Variables：

```
DB_HOST=hopper.proxy.rlwy.net
DB_PORT=17950
DB_USER=root
DB_PASSWORD=vkgxXBmSVyomZFHjWMAOMZupViBgqkYw
DB_NAME=fishmarket_game
JWT_SECRET=fishgame-railway-secret-$(openssl rand -hex 16)
NODE_ENV=production
```

### 方案 B: 使用 Railway 的 MySQL 變數引用

如果 Railway MySQL Plugin 提供了以下變數：
- `MYSQLHOST`
- `MYSQLPORT`
- `MYSQLUSER`
- `MYSQLPASSWORD`
- `MYSQLDATABASE`

可以這樣設定（使用變數引用）：
```
DB_HOST=${{MYSQLHOST}}
DB_PORT=${{MYSQLPORT}}
DB_USER=${{MYSQLUSER}}
DB_PASSWORD=${{MYSQLPASSWORD}}
DB_NAME=${{MYSQLDATABASE}}
JWT_SECRET=fishgame-railway-secret
NODE_ENV=production
```

---

## 🎯 驗證部署成功

部署成功後，在 Logs 中應該看到：

```log
✓ Database connection pool created
✓ 資料庫連接成功
✓ 資料庫初始化完成
✓ Server running on port 3000
```

**不應該看到**:
- ❌ `ECONNREFUSED`
- ❌ `connection is in closed state`
- ❌ `Access denied`
- ❌ `Unknown database`

---

## 📞 如果問題仍然存在

1. **確認 Railway 部署時間**
   - 從推送到完成通常需要 2-3 分鐘
   - 請等待 "Success" 狀態

2. **手動觸發重新部署**
   - 在 Deployments 標籤點擊最新部署
   - 點擊 "Redeploy"

3. **檢查 Railway 日誌**
   - 複製完整的錯誤日誌
   - 查找具體的錯誤訊息

4. **本地測試**
   - 使用 `backend/test_railway_connection.js` 測試連接
   - 確認從本地可以連接到 Railway MySQL

---

## 📊 當前狀態確認

- ✅ 本地測試連接成功（剛才測試通過）
- ✅ Railway MySQL 運行正常
- ✅ 資料庫結構完整
- ⏳ 等待確認：Railway 服務部署狀態
- ⏳ 等待確認：Railway 環境變數配置

請檢查上述步驟，並告訴我：
1. Railway 部署狀態如何？（Success/Failed/Building）
2. 環境變數中是否有 `DB_PORT=17950`？
3. Logs 中顯示什麼錯誤訊息？
