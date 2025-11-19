-- ===================================
-- Migration: 添加強制結束相關欄位
-- Date: 2025-01-18
-- Description: 支持強制結束遊戲功能
-- ===================================

USE fishmarket_game;

-- 添加強制結束標記和時間記錄欄位
ALTER TABLE games
ADD COLUMN IF NOT EXISTS `is_force_ended` BOOLEAN DEFAULT FALSE
COMMENT '是否強制結束',
ADD COLUMN IF NOT EXISTS `force_ended_at` TIMESTAMP NULL
COMMENT '強制結束時間',
ADD COLUMN IF NOT EXISTS `force_end_day` INT NULL
COMMENT '強制結束於第幾天';

-- 驗證欄位已添加
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fishmarket_game'
  AND TABLE_NAME = 'games'
  AND COLUMN_NAME IN ('is_force_ended', 'force_ended_at', 'force_end_day')
ORDER BY COLUMN_NAME;

-- 預期輸出:
-- COLUMN_NAME      | DATA_TYPE | IS_NULLABLE | COLUMN_DEFAULT | COLUMN_COMMENT
-- force_end_day    | int       | YES         | NULL           | 強制結束於第幾天
-- force_ended_at   | timestamp | YES         | NULL           | 強制結束時間
-- is_force_ended   | tinyint   | YES         | 0              | 是否強制結束
