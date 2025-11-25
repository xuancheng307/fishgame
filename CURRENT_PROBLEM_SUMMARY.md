# 魚市場遊戲 - 當前問題總結

## 🚨 主要問題
**登入失敗**：用戶嘗試登入時顯示「帳號或密碼錯誤」，但：
- ✅ 資料庫密碼已驗證正確（直接測試成功）
- ❌ Railway 日誌**完全沒有**收到任何登入請求

**結論**：這不是後端密碼驗證問題，而是前端請求根本沒有到達伺服器。

---

## 📍 部署資訊

- **Railway URL**: https://backend-production-dc27.up.railway.app
- **登入頁面**: https://backend-production-dc27.up.railway.app/login.html
- **Git 版本**: `0b282b8` (已推送並部署)
- **資料庫**: Railway MySQL (`hopper.proxy.rlwy.net:17950`)

---

## ✅ 已完成的修復

### 1. 資料庫連接池問題（已修復）
- **原問題**: `Can't add new command when connection is in closed state`
- **原因**: 使用單一全域 `db` 連接，閒置後被關閉
- **修復**:
  - 將所有 `db.execute()` 改為 `pool.execute()` (90 處)
  - `initDatabase()` 正確釋放連接
  - 添加自動重試邏輯到 `pool.execute()`
- **驗證**: `backend/server.js` 中 0 處 `db.execute`，121 處 `pool.execute`

### 2. 文件編碼損壞（已修復）
- **問題**: 中文字符損壞成 "?�"（840+ 處）
- **修復**: 從乾淨備份重建，使用自動化腳本應用修正
- **驗證**: 當前 0 處損壞字符

### 3. 資料庫密碼（已修復並驗證）
- **執行**: `fix_admin_password.js` 直接更新 Railway 資料庫
- **結果**:
  - ✅ admin / 123
  - ✅ 01-12 / (各自的編號)
- **驗證**: 執行 `direct_login_test.js` 直接對資料庫測試 → **密碼匹配成功**

### 4. 靜態文件路徑（已修復）
- **問題**: `Cannot GET /admin.html`
- **修復**: 將 `express.static` 路徑從 `../frontend` 改為 `..`
- **驗證**: 登入頁面現在可以訪問

---

## ❌ 當前未解決的問題

### 核心問題：登入請求沒有到達伺服器

**症狀**:
1. 用戶在 https://backend-production-dc27.up.railway.app/login.html 輸入帳密
2. 點擊登入按鈕
3. 顯示：「登入失敗：帳號或密碼錯誤」
4. **但 Railway 日誌中完全沒有任何 `/api/auth/login` 的請求記錄**

**這代表**:
- 不是密碼錯誤（因為請求根本沒到後端）
- 不是資料庫問題（因為查詢沒有執行）
- 可能是：
  - 前端 JavaScript 沒有執行
  - API URL 配置錯誤
  - CORS 問題
  - 網路請求失敗但沒有錯誤提示

---

## 🔍 建議的調試步驟（按順序）

### 第 1 步：檢查 Network（最關鍵）

在 https://backend-production-dc27.up.railway.app/login.html：

1. 打開 DevTools → **Network** 標籤
2. 輸入 `admin` / `123`，點擊登入
3. **檢查**:
   ```
   ❓ Request URL 是什麼？
      ✅ 應該是：https://backend-production-dc27.up.railway.app/api/auth/login
      ❌ 如果是：http://localhost:3000/api/auth/login → 前端配置錯誤

   ❓ 請求有發出嗎？
      ✅ 看到 /api/auth/login 請求
      ❌ 沒有任何請求 → JavaScript 沒執行

   ❓ 狀態碼是什麼？
      - 401：後端收到，密碼驗證失敗（但我們測試過密碼是對的）
      - 404：URL 路徑錯誤
      - CORS error：跨域問題
      - Failed / (cancelled)：請求根本沒發出
   ```

### 第 2 步：檢查 Console

在 **Console** 標籤：

1. 重新整理頁面，檢查是否有 JavaScript 錯誤
2. 在 `login.html` 的登入函數開頭添加：
   ```javascript
   async function login(e) {
       e.preventDefault();
       console.log('[DEBUG] login() 被呼叫');
       console.log('[DEBUG] username:', username.value);
       console.log('[DEBUG] API_BASE:', API_BASE);
       // ... 原有代碼
   }
   ```
3. 點擊登入，檢查：
   ```
   ✅ 有看到 "[DEBUG] login() 被呼叫" → JS 有執行
   ❌ 沒有任何 log → form 可能純 HTML submit，沒有被 JS 接管
   ```

### 第 3 步：改進錯誤提示

修改前端錯誤處理，區分不同錯誤類型：

```javascript
// 在 fetch 之後
console.log('[DEBUG] Response status:', response.status);

if (response.status === 401) {
    alert('帳號或密碼錯誤（後端驗證失敗）');
} else if (!response.ok) {
    alert(`伺服器錯誤：HTTP ${response.status}`);
}

// 在 catch 區塊
catch (error) {
    console.error('[DEBUG] Fetch error:', error);
    alert('網路連線失敗或請求未發送');
}
```

這樣可以分辨：
- **401**: 後端收到請求但密碼驗證失敗
- **其他 HTTP 錯誤**: 伺服器問題
- **Catch 錯誤**: 網路問題 / URL 錯誤 / CORS

### 第 4 步：只有在請求到達後端後才檢查後端

**僅當** Railway logs 顯示有 `/api/auth/login` 請求時，才需要檢查：
- 資料庫連接是否正確
- bcrypt 比對邏輯
- JWT 生成

---

## 📁 相關文件

### 後端主文件
- `backend/server.js` - 主伺服器文件（已修復連接池）

### 前端文件（需要檢查）
- `login.html` - 登入頁面
- 檢查點：
  - 第 107 行：`const API_BASE = '/api';`
  - 第 119 行：登入請求 URL
  - Form submit 事件綁定

### 測試腳本
- `backend/fix_admin_password.js` - 已執行，密碼已更新
- `backend/direct_login_test.js` - 已執行，驗證密碼正確

---

## 🎯 關鍵疑問

1. **前端登入請求的完整 URL 是什麼？**
   - 預期：`https://backend-production-dc27.up.railway.app/api/auth/login`
   - 實際：？（需要在 Network 標籤確認）

2. **請求有實際發出嗎？**
   - 預期：在 Network 標籤看到請求
   - 實際：？（用戶報告 Console 無任何資訊）

3. **JavaScript 有執行嗎？**
   - 預期：Console 有 log
   - 實際：用戶報告「按了登入以後也沒有」→ 可能 JS 根本沒跑

---

## 💡 最可能的原因（推測）

基於「Railway logs 沒有請求」+「Console 沒有資訊」，最可能是：

### 假設 A: Form 純 HTML Submit
- `<form>` 沒有 `addEventListener`，或 `e.preventDefault()` 失效
- 點擊登入 → 瀏覽器直接 POST（可能到錯誤的 URL）
- JavaScript `login()` 函數根本沒執行

**驗證方法**：檢查 `login.html` 的 form 綁定

### 假設 B: API_BASE 配置錯誤
- `const API_BASE = '/api'` 在某些情況下可能解析成相對路徑
- 如果頁面在 `/login.html`，請求可能打到 `/login.html/api/auth/login`（404）

**驗證方法**：在 Console 執行 `console.log(API_BASE)`

### 假設 C: CORS 問題
- 如果前端和後端在不同域名，可能被 CORS 阻擋
- 但通常會在 Console 看到 CORS 錯誤

**驗證方法**：檢查 Console 是否有紅色 CORS 錯誤

---

## 🔗 測試連結

**請用這個 URL 測試**：
```
https://backend-production-dc27.up.railway.app/login.html
```

**預期的 API 端點**：
```
POST https://backend-production-dc27.up.railway.app/api/auth/login
Content-Type: application/json
Body: {"username": "admin", "password": "123"}
```

**可以用 curl 直接測試後端**：
```bash
curl -X POST https://backend-production-dc27.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123"}'
```

如果 curl 成功返回 token，證明後端完全正常，問題 100% 在前端。

---

## 📞 需要的資訊

為了進一步診斷，需要：

1. **DevTools Network 標籤截圖**
   - 點擊登入後的完整 Network 記錄
   - 特別是 Request URL 和 Status

2. **DevTools Console 標籤截圖**
   - 包含任何錯誤訊息
   - 或「完全沒有任何輸出」的截圖

3. **curl 測試結果**
   - 執行上面的 curl 命令
   - 貼上完整回應

---

## 📝 總結

- ✅ **後端邏輯正確**：資料庫密碼驗證測試通過
- ✅ **部署成功**：最新代碼已在 Railway 運行
- ✅ **靜態文件可訪問**：login.html 可以打開
- ❌ **前端請求未到達後端**：Railway logs 無任何登入請求
- 🔍 **下一步**：檢查 Network 標籤確認請求 URL 和狀態

**關鍵**：在檢查資料庫或後端邏輯之前，必須先確認前端請求有實際發送到正確的 URL。
