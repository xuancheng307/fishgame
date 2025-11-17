# Railway 免費部署流程（後端 + MySQL）

前提：已安裝 Git、Node.js 20+、MySQL 客戶端、Railway CLI，並已登入 `railway login`。

## 1. 準備程式碼與 GitHub
1. 確認 `.gitignore` 已忽略 `node_modules/`、`.env`。
2. 在 `backend/` 填好 `.env.example`（實際 `.env` 不要上傳）。
3. 初始化並推送到 GitHub：
   ```powershell
   git init
   git add .
   git commit -m "Initial import"
   git branch -M main
   git remote add origin <你的 GitHub URL>
   git push -u origin main
   ```

## 2. 建立 Railway 專案與 MySQL
1. 網頁或 CLI 新建 Project。
2. Add Plugin → MySQL，取得 `MYSQLHOST/MYSQLPORT/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE`。

## 3. 匯入資料表與種子
在專案根目錄 PowerShell 執行（將 `...` 替換為實際值）：
```powershell
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p<MYSQLPASSWORD> <MYSQLDATABASE> < .\SQL\complete_database_structure.sql
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p<MYSQLPASSWORD> <MYSQLDATABASE> < .\SQL\seed_users.sql
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p<MYSQLPASSWORD> <MYSQLDATABASE> < .\SQL\seed_demo_game.sql
```
`-p` 後面不留空格。

## 4. 部署後端服務
1. Railway → New Service → Deploy from GitHub → 選步驟 1 的 repo。
2. Build command: `cd backend && npm install`
3. Start command: `cd backend && node server.js`
4. 設定 Variables（在該 Service 裡）：
   - `DB_HOST`=`MYSQLHOST`
   - `DB_PORT`=`MYSQLPORT`
   - `DB_USER`=`MYSQLUSER`
   - `DB_PASSWORD`=`MYSQLPASSWORD`
   - `DB_NAME`=`MYSQLDATABASE`
   - `JWT_SECRET`=隨機長字串
   - `NODE_ENV`=`production`
   - `PORT` 留空，Railway 會提供。

## 5. 驗證
1. 等部署成功，Railway 會顯示公開網址（例 `https://xxx.up.railway.app`）。
2. 用瀏覽器打開 `https://xxx.up.railway.app/login.html` 或 `.../admin.html`。
3. 測試登入、建立遊戲、多人連線。

## 6. 給學生使用
把公開網址（非 localhost）直接丟給同學，他們用任何有網路的裝置連即可。***
