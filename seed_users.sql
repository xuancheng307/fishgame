-- D:\徐景輝\魚市場遊戲3\seed_users.sql
-- 建立 admin 與 10 個學生（01..10）
-- 只設定 username / role / plain_password（password_hash 留空）

ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password VARCHAR(64) NULL;

INSERT INTO users (username, role, plain_password)
VALUES 
  ('admin', 'admin', '123'),
  ('01', 'team', '01'),
  ('02', 'team', '02'),
  ('03', 'team', '03'),
  ('04', 'team', '04'),
  ('05', 'team', '05'),
  ('06', 'team', '06'),
  ('07', 'team', '07'),
  ('08', 'team', '08'),
  ('09', 'team', '09'),
  ('10', 'team', '10')
ON DUPLICATE KEY UPDATE
  role=VALUES(role),
  plain_password=VALUES(plain_password);