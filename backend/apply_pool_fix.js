// 對乾淨的原始文件應用連接池修正
const fs = require('fs');
const path = require('path');

const originalPath = path.join(__dirname, 'server.js.original');
const outputPath = path.join(__dirname, 'server.js');

let content = fs.readFileSync(originalPath, 'utf8');

console.log('應用連接池修正...');

// 1. 移除 let db; 保留 let pool;
content = content.replace(/let db;\s*let pool;/g, 'let pool;');
console.log('✓ 移除 db 變量聲明');

// 2. 修改 initDatabase 函數中獲取連接的部分
// 從: db = await pool.getConnection();
// 到: connection = await pool.getConnection();
content = content.replace(
    /(\s+)db = await pool\.getConnection\(\);/g,
    '$1connection = await pool.getConnection();'
);
console.log('✓ 修改 initDatabase 中的連接獲取');

// 3. 在 initDatabase 末尾添加 connection.release()
const initDbEnd = content.match(/(async function initDatabase\(\) \{[\s\S]*?)(    \} catch \(error\))/);
if (initDbEnd && !initDbEnd[1].includes('connection.release()')) {
    content = content.replace(
        /(    }\s*)(    \} catch \(error\) \{\s*console\.error\('資料庫初始化失敗:')/,
        `$1\n        // 釋放連接回連接池\n        connection.release();\n        console.log('資料庫初始化完成');\n\n$2`
    );
    console.log('✓ 添加 connection.release()');
}

// 4. 在 initDatabase 開頭聲明 connection
content = content.replace(
    /(async function initDatabase\(\) \{\s*)(try \{)/,
    '$1let connection;\n    $2'
);
console.log('✓ 添加 connection 變量聲明');

// 5. 添加 DB_PORT 支援
content = content.replace(
    /(pool = mysql\.createPool\(\{\s*host:[\s\S]*?database:[\s\S]*?),(\s*charset:)/,
    '$1,\n            port: process.env.DB_PORT || 3306,$2'
);
console.log('✓ 添加 DB_PORT 支援');

// 6. 添加 keepAlive 支援
content = content.replace(
    /(connectionLimit: \d+,\s*queueLimit: \d+)/,
    '$1,\n            enableKeepAlive: true,\n            keepAliveInitialDelay: 0'
);
console.log('✓ 添加 keepAlive 支援');

// 7. 將 initDatabase 中的 db.execute 改為 connection.execute
content = content.replace(
    /(async function initDatabase\(\)[\s\S]*?)(    \} catch \(error\))/,
    (match) => {
        return match.replace(/await db\.execute\(/g, 'await connection.execute(');
    }
);
console.log('✓ 修改 initDatabase 中的 db.execute');

// 8. 將所有其他的 db.execute 改為 pool.execute
content = content.replace(/await db\.execute\(/g, 'await pool.execute(');
content = content.replace(/await db\.query\(/g, 'await pool.query(');
console.log('✓ 將所有 db.execute 改為 pool.execute');

// 9. 修改學生帳號數量從 10 改為 12
content = content.replace(
    /\/\/ 自動建立10個學生帳號（01-10）\s*for \(let i = 1; i <= 10; i\+\+\)/,
    '// 自動建立12個學生帳號（01-12）\n        for (let i = 1; i <= 12; i++)'
);
console.log('✓ 修改學生帳號數量為 12');

// 寫入修正後的內容
fs.writeFileSync(outputPath, content, 'utf8');

console.log('\n✅ 所有修正已應用');
console.log(`✅ 修正後的文件已寫入: ${outputPath}`);

// 驗證
const poolCount = (content.match(/pool\.execute\(/g) || []).length;
const dbCount = (content.match(/\bdb\.execute\(/g) || []).length;
console.log(`\n驗證:`);
console.log(`  pool.execute 使用次數: ${poolCount}`);
console.log(`  db.execute 殘留次數: ${dbCount}`);
console.log(`  檔案大小: ${content.length} 字節`);
