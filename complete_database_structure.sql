-- ===================================
-- 魚市場遊戲資料庫完整結構
-- Fish Market Game Database Structure
-- ===================================

CREATE DATABASE IF NOT EXISTS fishmarket_game 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE fishmarket_game;

-- ===================================
-- 1. 使用者相關表格 (User Tables)
-- ===================================

-- users 表：所有使用者基礎資料
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `plain_password` varchar(50) DEFAULT NULL COMMENT '明文密碼(教學用)',
  `team_name` varchar(100) DEFAULT NULL COMMENT '隊伍名稱(顯示用)',
  `role` enum('admin','team') NOT NULL DEFAULT 'team',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================
-- 2. 遊戲核心表格 (Game Core Tables)
-- ===================================

-- games 表：遊戲主表
CREATE TABLE IF NOT EXISTS `games` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text,
  `status` enum('pending','active','completed') NOT NULL DEFAULT 'pending',
  `phase` enum('waiting','buying','selling','settling','day_ended') DEFAULT 'waiting',
  `total_days` int(11) NOT NULL DEFAULT 7,
  `current_day` int(11) NOT NULL DEFAULT 0,
  `num_teams` int(11) NOT NULL DEFAULT 10 COMMENT '參與隊伍數量',
  `team_names` json DEFAULT NULL COMMENT '隊伍名稱映射 {teamId: displayName}',
  `initial_budget` decimal(12,2) NOT NULL DEFAULT 1000000.00,
  `daily_interest_rate` decimal(5,4) NOT NULL DEFAULT 0.0300,
  `loan_interest_rate` decimal(5,4) NOT NULL DEFAULT 0.0300 COMMENT '貸款利率(兼容欄位)',
  `max_loan_ratio` decimal(5,2) NOT NULL DEFAULT 0.50,
  `unsold_fee_per_kg` decimal(10,2) NOT NULL DEFAULT 10.00,
  `fixed_unsold_ratio` decimal(5,2) NOT NULL DEFAULT 2.50 COMMENT '固定滯銷比例(%)',
  `distributor_floor_price_a` decimal(10,2) NOT NULL DEFAULT 100.00 COMMENT 'A級魚總代理底價',
  `distributor_floor_price_b` decimal(10,2) NOT NULL DEFAULT 80.00 COMMENT 'B級魚總代理底價',
  `target_price_a` decimal(10,2) NOT NULL DEFAULT 150.00 COMMENT 'A級魚目標價格',
  `target_price_b` decimal(10,2) NOT NULL DEFAULT 120.00 COMMENT 'B級魚目標價格',
  `buying_duration` int(11) NOT NULL DEFAULT 7 COMMENT '買入階段時間(分鐘)',
  `selling_duration` int(11) NOT NULL DEFAULT 4 COMMENT '賣出階段時間(分鐘)',
  `is_force_ended` tinyint(1) DEFAULT 0 COMMENT '是否強制結束',
  `force_ended_at` timestamp NULL DEFAULT NULL COMMENT '強制結束時間',
  `force_end_day` int(11) DEFAULT NULL COMMENT '強制結束於第幾天',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_phase` (`phase`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- game_days 表：每日遊戲資料
CREATE TABLE IF NOT EXISTS `game_days` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `game_id` int(11) NOT NULL,
  `day_number` int(11) NOT NULL,
  `status` enum('pending','waiting','buying_open','buying_closed','selling_open','selling_closed','settling','settled','completed') NOT NULL DEFAULT 'pending',
  `fish_a_supply` int(11) NOT NULL DEFAULT 0,
  `fish_b_supply` int(11) NOT NULL DEFAULT 0,
  `fish_a_restaurant_budget` decimal(12,2) NOT NULL DEFAULT 0.00,
  `fish_b_restaurant_budget` decimal(12,2) NOT NULL DEFAULT 0.00,
  `buy_start_time` datetime DEFAULT NULL,
  `buy_end_time` datetime DEFAULT NULL,
  `sell_start_time` datetime DEFAULT NULL,
  `sell_end_time` datetime DEFAULT NULL,
  `settle_time` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_game_day` (`game_id`,`day_number`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_game_days_game` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- game_participants 表：遊戲參與者
CREATE TABLE IF NOT EXISTS `game_participants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `game_id` int(11) NOT NULL,
  `team_id` int(11) NOT NULL,
  `team_name` varchar(100) DEFAULT NULL,
  `current_budget` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_loan` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_loan_principal` decimal(12,2) NOT NULL DEFAULT 0.00,
  `fish_a_inventory` int(11) NOT NULL DEFAULT 0,
  `fish_b_inventory` int(11) NOT NULL DEFAULT 0,
  `cumulative_profit` decimal(12,2) NOT NULL DEFAULT 0.00,
  `roi` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `status` enum('active','bankrupt','withdrawn') NOT NULL DEFAULT 'active',
  `joined_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_game_team` (`game_id`,`team_id`),
  KEY `idx_team` (`team_id`),
  KEY `idx_roi` (`roi` DESC),
  CONSTRAINT `fk_participants_game` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_participants_team` FOREIGN KEY (`team_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================
-- 3. 交易相關表格 (Trading Tables)
-- ===================================

-- bids 表：統一投標表
CREATE TABLE IF NOT EXISTS `bids` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `game_day_id` int(11) NOT NULL,
  `team_id` int(11) NOT NULL,
  `bid_type` enum('buy','sell') NOT NULL,
  `fish_type` enum('A','B') NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `quantity_submitted` int(11) NOT NULL,
  `quantity_fulfilled` int(11) DEFAULT 0,
  `status` enum('pending','fulfilled','partial','failed') NOT NULL DEFAULT 'pending',
  `price_index` int(11) DEFAULT NULL COMMENT '價位索引(0或1)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_game_day` (`game_day_id`),
  KEY `idx_team` (`team_id`),
  KEY `idx_bids_day_type_price` (`game_day_id`,`bid_type`,`price`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `fk_bids_day` FOREIGN KEY (`game_day_id`) REFERENCES `game_days` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bids_team` FOREIGN KEY (`team_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- transactions 表：交易記錄
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `game_id` int(11) NOT NULL,
  `game_day_id` int(11) NOT NULL,
  `day_number` int(11) NOT NULL,
  `team_id` int(11) NOT NULL,
  `transaction_type` enum('buy','sell','loan','interest','unsold_fee','initial_budget') NOT NULL,
  `fish_type` enum('A','B') DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL COMMENT '單價',
  `price_per_unit` decimal(10,2) DEFAULT NULL COMMENT '單價(兼容欄位)',
  `total_amount` decimal(12,2) NOT NULL,
  `balance_after` decimal(12,2) DEFAULT NULL,
  `description` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_game_day_team` (`game_day_id`,`team_id`,`transaction_type`),
  KEY `idx_team` (`team_id`),
  KEY `idx_type` (`transaction_type`),
  KEY `idx_game` (`game_id`),
  CONSTRAINT `fk_tx_game` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tx_day` FOREIGN KEY (`game_day_id`) REFERENCES `game_days` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tx_team` FOREIGN KEY (`team_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================
-- 4. 結果與記錄表格 (Results & Logs)
-- ===================================

-- daily_results 表：每日結算結果
CREATE TABLE IF NOT EXISTS `daily_results` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `game_id` int(11) NOT NULL,
  `game_day_id` int(11) NOT NULL,
  `team_id` int(11) NOT NULL,
  `day_number` int(11) NOT NULL,
  `starting_cash` decimal(12,2) NOT NULL DEFAULT 0.00,
  `ending_cash` decimal(12,2) NOT NULL DEFAULT 0.00,
  `closing_budget` decimal(12,2) DEFAULT 0.00 COMMENT '結算後預算(兼容欄位)',
  `starting_loan` decimal(12,2) NOT NULL DEFAULT 0.00,
  `ending_loan` decimal(12,2) NOT NULL DEFAULT 0.00,
  `closing_loan` decimal(12,2) DEFAULT 0.00 COMMENT '結算後貸款(兼容欄位)',
  `fish_a_bought` int(11) DEFAULT 0,
  `fish_a_sold` int(11) DEFAULT 0,
  `fish_a_unsold` int(11) DEFAULT 0,
  `fish_b_bought` int(11) DEFAULT 0,
  `fish_b_sold` int(11) DEFAULT 0,
  `fish_b_unsold` int(11) DEFAULT 0,
  `buy_cost` decimal(12,2) DEFAULT 0.00,
  `cost` decimal(12,2) DEFAULT 0.00 COMMENT '成本(兼容欄位)',
  `sell_revenue` decimal(12,2) DEFAULT 0.00,
  `revenue` decimal(12,2) DEFAULT 0.00 COMMENT '收入(兼容欄位)',
  `unsold_fee` decimal(12,2) DEFAULT 0.00,
  `interest_paid` decimal(12,2) DEFAULT 0.00,
  `interest_incurred` decimal(12,2) DEFAULT 0.00 COMMENT '利息支出(兼容欄位)',
  `daily_profit` decimal(12,2) DEFAULT 0.00,
  `cumulative_profit` decimal(12,2) DEFAULT 0.00,
  `roi` decimal(10,4) DEFAULT 0.0000,
  `rank` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_daily` (`game_day_id`,`team_id`),
  KEY `idx_team` (`team_id`),
  KEY `idx_day` (`day_number`),
  KEY `idx_roi` (`roi` DESC),
  KEY `idx_game` (`game_id`),
  CONSTRAINT `fk_results_game` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_results_day` FOREIGN KEY (`game_day_id`) REFERENCES `game_days` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_results_team` FOREIGN KEY (`team_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- game_logs 表：遊戲操作日誌
CREATE TABLE IF NOT EXISTS `game_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `game_id` int(11) NOT NULL,
  `day_number` int(11) DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `actor_type` enum('admin','team','system') NOT NULL,
  `details` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_game` (`game_id`),
  KEY `idx_action` (`action`),
  KEY `idx_actor` (`actor_id`),
  CONSTRAINT `fk_logs_game` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================
-- 5. 索引優化 (Performance Indexes)
-- ===================================

-- 為常用查詢添加複合索引
ALTER TABLE `bids` 
  ADD INDEX `idx_bids_composite` (`game_day_id`, `bid_type`, `fish_type`, `price` DESC, `created_at` ASC);

ALTER TABLE `transactions`
  ADD INDEX `idx_tx_composite` (`game_day_id`, `team_id`, `transaction_type`, `created_at`);

ALTER TABLE `game_participants`
  ADD INDEX `idx_participants_game_roi` (`game_id`, `roi` DESC);

-- ===================================
-- 6. 初始資料 (Initial Data)
-- ===================================

-- 插入管理員帳號
INSERT INTO `users` (`username`, `password_hash`, `plain_password`, `role`) VALUES
('admin', '$2b$10$YourHashHere', '123', 'admin')
ON DUPLICATE KEY UPDATE `plain_password` = '123';

-- 插入學生帳號 (01-10)
INSERT INTO `users` (`username`, `password_hash`, `plain_password`, `role`) VALUES
('01', '$2b$10$YourHashHere', '01', 'team'),
('02', '$2b$10$YourHashHere', '02', 'team'),
('03', '$2b$10$YourHashHere', '03', 'team'),
('04', '$2b$10$YourHashHere', '04', 'team'),
('05', '$2b$10$YourHashHere', '05', 'team'),
('06', '$2b$10$YourHashHere', '06', 'team'),
('07', '$2b$10$YourHashHere', '07', 'team'),
('08', '$2b$10$YourHashHere', '08', 'team'),
('09', '$2b$10$YourHashHere', '09', 'team'),
('10', '$2b$10$YourHashHere', '10', 'team')
ON DUPLICATE KEY UPDATE `plain_password` = VALUES(`plain_password`);

-- ===================================
-- 完成
-- ===================================
