-- 確保滯銷費預設值為 $10/kg（與 defaultGameParameters 一致）
-- 執行日期: 2025-01-19

-- 修改 games 表的 unsold_fee_per_kg 欄位預設值
ALTER TABLE `games`
MODIFY COLUMN `unsold_fee_per_kg` decimal(10,2) NOT NULL DEFAULT 10.00;
