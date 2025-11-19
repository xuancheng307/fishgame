-- ===================================
-- Migration: 添加 team_names 欄位到 games 表
-- Date: 2025-01-18
-- Description: 支持隊伍自訂名稱功能
-- ===================================

USE fishmarket_game;

-- 檢查欄位是否已存在（MySQL 8.0+ 支援 IF NOT EXISTS）
-- 對於舊版本 MySQL，如果欄位已存在會報錯，可忽略

ALTER TABLE games
ADD COLUMN IF NOT EXISTS `team_names` json DEFAULT NULL
COMMENT '隊伍名稱映射 {teamId: displayName}'
AFTER `num_teams`;

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
  AND COLUMN_NAME = 'team_names';

-- 預期輸出:
-- COLUMN_NAME  | DATA_TYPE | IS_NULLABLE | COLUMN_DEFAULT | COLUMN_COMMENT
-- team_names   | json      | YES         | NULL           | 隊伍名稱映射 {teamId: displayName}
