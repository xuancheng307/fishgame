-- ===================================
-- Migration: 添加 team_names 欄位到 games 表
-- Date: 2025-01-18
-- MySQL 5.7 兼容版本（不支援 IF NOT EXISTS）
-- ===================================

USE fishmarket_game;

-- 注意：如果欄位已存在，此腳本會報錯
-- 執行前請先檢查欄位是否存在：
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = 'fishmarket_game' AND TABLE_NAME = 'games' AND COLUMN_NAME = 'team_names';

-- 添加 team_names 欄位
ALTER TABLE games
ADD COLUMN `team_names` json DEFAULT NULL
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
