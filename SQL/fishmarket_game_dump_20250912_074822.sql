-- MySQL dump 10.13  Distrib 9.2.0, for Win64 (x86_64)
--
-- Host: localhost    Database: fishmarket_game
-- ------------------------------------------------------
-- Server version	9.2.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admins`
--

DROP TABLE IF EXISTS `admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admins`
--

LOCK TABLES `admins` WRITE;
/*!40000 ALTER TABLE `admins` DISABLE KEYS */;
INSERT INTO `admins` VALUES (1,'admin','$2b$10$QlOU5IR7x3whyFJ7mdpr2unGtJ6Zm3rCVktW7JTFbuQfwsiewv9/K','2025-09-08 07:20:44');
/*!40000 ALTER TABLE `admins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bids`
--

DROP TABLE IF EXISTS `bids`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `game_id` int DEFAULT '0',
  `game_day_id` int NOT NULL,
  `day_number` int DEFAULT '0',
  `team_id` int NOT NULL,
  `bid_type` enum('buy','sell') COLLATE utf8mb4_unicode_ci NOT NULL,
  `fish_type` enum('A','B') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `quantity_submitted` int NOT NULL,
  `quantity_fulfilled` int DEFAULT '0',
  `status` enum('pending','fulfilled','partial','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bids_game_day` (`game_day_id`),
  KEY `idx_bids_team_type` (`team_id`,`bid_type`),
  KEY `idx_bids_status` (`status`),
  KEY `idx_game_bids` (`game_id`,`day_number`),
  KEY `idx_bids_day_type_price` (`game_day_id`,`bid_type`,`price`),
  KEY `idx_bids_team` (`team_id`),
  CONSTRAINT `bids_ibfk_1` FOREIGN KEY (`game_day_id`) REFERENCES `game_days` (`id`),
  CONSTRAINT `bids_ibfk_2` FOREIGN KEY (`team_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_bids_game` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bids`
--

LOCK TABLES `bids` WRITE;
/*!40000 ALTER TABLE `bids` DISABLE KEYS */;
/*!40000 ALTER TABLE `bids` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `buy_bids`
--

DROP TABLE IF EXISTS `buy_bids`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `buy_bids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `day_id` int NOT NULL,
  `team_id` int NOT NULL,
  `fish_type` char(1) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `quantity` int NOT NULL,
  `status` enum('pending','fulfilled','partial','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `fulfilled_quantity` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `team_id` (`team_id`),
  KEY `idx_day_team` (`day_id`,`team_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `buy_bids_ibfk_1` FOREIGN KEY (`day_id`) REFERENCES `game_days` (`id`) ON DELETE CASCADE,
  CONSTRAINT `buy_bids_ibfk_2` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `buy_bids`
--

LOCK TABLES `buy_bids` WRITE;
/*!40000 ALTER TABLE `buy_bids` DISABLE KEYS */;
/*!40000 ALTER TABLE `buy_bids` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `daily_results`
--

DROP TABLE IF EXISTS `daily_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `game_id` int DEFAULT '0',
  `game_day_id` int NOT NULL,
  `day_number` int DEFAULT '0',
  `team_id` int NOT NULL,
  `revenue` decimal(15,2) NOT NULL,
  `cost` decimal(15,2) NOT NULL,
  `unsold_fee` decimal(15,2) NOT NULL,
  `interest_incurred` decimal(15,2) NOT NULL,
  `daily_profit` decimal(15,2) NOT NULL,
  `cumulative_profit` decimal(15,2) NOT NULL,
  `roi` decimal(10,4) DEFAULT '0.0000',
  `closing_budget` decimal(15,2) NOT NULL,
  `closing_loan` decimal(15,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `game_day_id` (`game_day_id`,`team_id`),
  UNIQUE KEY `uq_daily` (`game_day_id`,`team_id`),
  KEY `team_id` (`team_id`),
  KEY `idx_results_game_day` (`game_day_id`),
  KEY `idx_game_day` (`game_id`,`day_number`),
  CONSTRAINT `daily_results_ibfk_1` FOREIGN KEY (`game_day_id`) REFERENCES `game_days` (`id`),
  CONSTRAINT `daily_results_ibfk_2` FOREIGN KEY (`team_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_daily_results_game` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `daily_results`
--

LOCK TABLES `daily_results` WRITE;
/*!40000 ALTER TABLE `daily_results` DISABLE KEYS */;
/*!40000 ALTER TABLE `daily_results` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `game_days`
--

DROP TABLE IF EXISTS `game_days`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `game_days` (
  `id` int NOT NULL AUTO_INCREMENT,
  `game_id` int DEFAULT NULL,
  `day_number` int NOT NULL,
  `fish_a_supply` int NOT NULL,
  `fish_b_supply` int NOT NULL,
  `fish_a_restaurant_budget` decimal(15,2) NOT NULL,
  `fish_b_restaurant_budget` decimal(15,2) NOT NULL,
  `status` enum('pending','buying_open','buying_closed','selling_open','selling_closed','settled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `start_time` datetime DEFAULT NULL,
  `end_time` datetime DEFAULT NULL,
  `buy_start_time` datetime DEFAULT NULL COMMENT '買入開始時間',
  `buy_end_time` datetime DEFAULT NULL COMMENT '買入結束時間',
  `sell_start_time` datetime DEFAULT NULL COMMENT '賣出開始時間',
  `sell_end_time` datetime DEFAULT NULL COMMENT '賣出結束時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `game_id` (`game_id`,`day_number`),
  KEY `idx_game_days_lookup` (`game_id`,`day_number`),
  KEY `idx_game_days_time` (`buy_end_time`,`sell_end_time`),
  CONSTRAINT `game_days_ibfk_1` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `game_days`
--

LOCK TABLES `game_days` WRITE;
/*!40000 ALTER TABLE `game_days` DISABLE KEYS */;
INSERT INTO `game_days` VALUES (1,1,1,1000,2000,500000.00,500000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(2,1,2,1222,3997,650000.00,550000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(3,1,3,2079,3344,550000.00,750000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(4,1,4,2315,4965,600000.00,600000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(5,1,5,2158,4337,450000.00,450000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(6,1,6,1414,4629,750000.00,500000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(7,1,7,1546,3131,800000.00,800000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(8,2,1,1798,3430,300000.00,450000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(9,2,2,1209,3950,350000.00,450000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(10,2,3,1966,3126,300000.00,550000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(11,3,1,1032,2073,200000.00,250000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(12,3,2,729,2377,200000.00,250000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(13,4,1,1800,3600,270000.00,432000.00,'selling_open','2025-09-08 18:17:48','2025-09-08 18:22:48',NULL,NULL,NULL,NULL),(14,5,1,1800,3600,270000.00,432000.00,'buying_open','2025-09-08 18:17:48','2025-09-08 18:22:48',NULL,NULL,NULL,NULL),(15,6,1,1800,3600,270000.00,432000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(16,7,1,1800,3600,270000.00,432000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(17,8,1,1800,3600,270000.00,432000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(18,9,1,1800,3600,270000.00,432000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(19,10,1,1050,2100,525000.00,630000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(20,11,1,1800,3600,900000.00,1080000.00,'buying_open','2025-09-10 04:47:47','2025-09-10 04:54:47',NULL,NULL,NULL,NULL),(21,12,1,1800,3600,900000.00,1080000.00,'buying_open',NULL,NULL,NULL,NULL,NULL,NULL),(22,13,1,1800,3600,270000.00,432000.00,'buying_open',NULL,NULL,NULL,NULL,NULL,NULL),(23,14,1,1800,3600,270000.00,432000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(24,15,1,1200,2400,216000.00,336000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(25,16,1,1200,2400,216000.00,336000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(26,17,1,1200,2400,600000.00,720000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(27,18,1,600,1200,90000.00,144000.00,'pending',NULL,NULL,NULL,NULL,NULL,NULL),(28,19,1,1200,2400,600000.00,720000.00,'buying_open',NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `game_days` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `game_logs`
--

DROP TABLE IF EXISTS `game_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `game_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `game_id` int DEFAULT NULL,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `game_id` (`game_id`),
  CONSTRAINT `game_logs_ibfk_1` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `game_logs`
--

LOCK TABLES `game_logs` WRITE;
/*!40000 ALTER TABLE `game_logs` DISABLE KEYS */;
INSERT INTO `game_logs` VALUES (1,4,'force_ended','Game was forcefully ended by admin','2025-09-07 18:42:50');
/*!40000 ALTER TABLE `game_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `game_participants`
--

DROP TABLE IF EXISTS `game_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `game_participants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `game_id` int DEFAULT NULL,
  `team_id` int DEFAULT NULL,
  `current_budget` decimal(15,2) NOT NULL,
  `total_loan` decimal(15,2) DEFAULT '0.00',
  `total_loan_principal` decimal(15,2) DEFAULT '0.00',
  `fish_a_inventory` int DEFAULT '0',
  `fish_b_inventory` int DEFAULT '0',
  `cumulative_profit` decimal(15,2) DEFAULT '0.00',
  `current_day` int DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `game_id` (`game_id`,`team_id`),
  KEY `team_id` (`team_id`),
  CONSTRAINT `game_participants_ibfk_1` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`),
  CONSTRAINT `game_participants_ibfk_2` FOREIGN KEY (`team_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `game_participants`
--

LOCK TABLES `game_participants` WRITE;
/*!40000 ALTER TABLE `game_participants` DISABLE KEYS */;
INSERT INTO `game_participants` VALUES (1,2,2,1000000.00,0.00,0.00,0,0,0.00,1),(2,2,3,1000000.00,0.00,0.00,0,0,0.00,1),(3,2,4,1000000.00,0.00,0.00,0,0,0.00,1),(4,2,5,1000000.00,0.00,0.00,0,0,0.00,1),(5,2,6,1000000.00,0.00,0.00,0,0,0.00,1),(6,2,7,1000000.00,0.00,0.00,0,0,0.00,1),(7,2,8,1000000.00,0.00,0.00,0,0,0.00,1),(8,2,9,1000000.00,0.00,0.00,0,0,0.00,1),(9,2,10,1000000.00,0.00,0.00,0,0,0.00,1),(10,2,11,1000000.00,0.00,0.00,0,0,0.00,1),(11,2,12,1000000.00,0.00,0.00,0,0,0.00,1),(12,2,13,1000000.00,0.00,0.00,0,0,0.00,1),(13,3,2,1000000.00,0.00,0.00,0,0,0.00,1),(14,3,3,1000000.00,0.00,0.00,0,0,0.00,1),(15,3,4,1000000.00,0.00,0.00,0,0,0.00,1),(16,3,5,1000000.00,0.00,0.00,0,0,0.00,1),(17,3,6,1000000.00,0.00,0.00,0,0,0.00,1),(18,3,7,1000000.00,0.00,0.00,0,0,0.00,1),(19,3,8,1000000.00,0.00,0.00,0,0,0.00,1),(20,4,8,1000000.00,0.00,0.00,0,0,0.00,1),(21,5,8,1000000.00,0.00,0.00,0,0,0.00,1),(22,5,2,1000000.00,0.00,0.00,0,0,0.00,1),(23,11,2,1000000.00,0.00,0.00,0,0,0.00,1),(24,11,8,1000000.00,0.00,0.00,0,0,0.00,1),(25,13,2,1000000.00,0.00,0.00,0,0,0.00,1),(26,16,2,1200000.00,0.00,0.00,0,0,0.00,1),(27,19,2,1000000.00,0.00,0.00,0,0,0.00,1);
/*!40000 ALTER TABLE `game_participants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `games`
--

DROP TABLE IF EXISTS `games`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `games` (
  `id` int NOT NULL AUTO_INCREMENT,
  `game_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `initial_budget` decimal(15,2) NOT NULL,
  `loan_interest_rate` decimal(5,4) NOT NULL DEFAULT '0.0300',
  `unsold_fee_per_kg` decimal(10,2) NOT NULL DEFAULT '10.00',
  `fixed_unsold_ratio` decimal(5,2) NOT NULL DEFAULT '2.50' COMMENT '固定滯銷比例(%)，預設2.5',
  `distributor_floor_price_a` decimal(10,2) DEFAULT '100.00',
  `distributor_floor_price_b` decimal(10,2) DEFAULT '100.00',
  `target_price_a` decimal(10,2) NOT NULL,
  `target_price_b` decimal(10,2) NOT NULL,
  `status` enum('pending','active','paused','finished','force_ended') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `current_day` int DEFAULT '0',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `num_teams` int NOT NULL DEFAULT '12',
  `total_days` int DEFAULT '7',
  `paused_at` datetime DEFAULT NULL,
  `force_ended_at` datetime DEFAULT NULL,
  `force_end_day` int DEFAULT NULL,
  `phase` enum('waiting','buying','buy_closed','selling','sell_closed','settling') COLLATE utf8mb4_unicode_ci DEFAULT 'waiting' COMMENT '當前進行階段',
  `current_countdown` int DEFAULT NULL COMMENT '暫停時的剩餘秒數',
  `team_names` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_game_status_phase` (`status`,`phase`),
  KEY `idx_game_current_day` (`current_day`),
  CONSTRAINT `games_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `games`
--

LOCK TABLES `games` WRITE;
/*!40000 ALTER TABLE `games` DISABLE KEYS */;
INSERT INTO `games` VALUES (1,'250907',1000000.00,0.0300,10.00,2.50,100.00,100.00,300.00,150.00,'finished',7,1,'2025-09-06 16:29:43',12,7,NULL,NULL,NULL,'waiting',NULL,'{\"1\": \"第1組\", \"2\": \"第2組\", \"3\": \"第3組\", \"4\": \"第4組\", \"5\": \"第5組\", \"6\": \"第6組\", \"7\": \"第7組\", \"8\": \"第8組\", \"9\": \"第9組\", \"10\": \"第10組\", \"11\": \"第11組\", \"12\": \"第12組\"}'),(2,'123123',1000000.00,0.0300,10.00,2.50,100.00,100.00,150.00,120.00,'finished',3,1,'2025-09-06 17:28:31',12,7,NULL,NULL,NULL,'waiting',NULL,'{\"1\": \"第1組\", \"2\": \"第2組\", \"3\": \"第3組\", \"4\": \"第4組\", \"5\": \"第5組\", \"6\": \"第6組\", \"7\": \"第7組\", \"8\": \"第8組\", \"9\": \"第9組\", \"10\": \"第10組\", \"11\": \"第11組\", \"12\": \"第12組\"}'),(3,'123123123',1000000.00,0.0300,10.00,2.50,100.00,100.00,150.00,120.00,'finished',2,1,'2025-09-06 18:45:19',7,7,NULL,NULL,NULL,'waiting',NULL,'{\"1\": \"第1組\", \"2\": \"第2組\", \"3\": \"第3組\", \"4\": \"第4組\", \"5\": \"第5組\", \"6\": \"第6組\", \"7\": \"第7組\", \"8\": \"第8組\", \"9\": \"第9組\", \"10\": \"第10組\", \"11\": \"第11組\", \"12\": \"第12組\"}'),(4,'123123',1000000.00,0.0300,10.00,2.50,100.00,100.00,150.00,120.00,'finished',1,NULL,'2025-09-07 17:37:55',12,7,NULL,NULL,NULL,'waiting',NULL,'{\"1\": \"第1組\", \"2\": \"第2組\", \"3\": \"第3組\", \"4\": \"第4組\", \"5\": \"第5組\", \"6\": \"第6組\", \"7\": \"第7組\", \"8\": \"第8組\", \"9\": \"第9組\", \"10\": \"第10組\", \"11\": \"第11組\", \"12\": \"第12組\"}'),(5,'123',1000000.00,0.0300,10.00,2.50,100.00,100.00,150.00,120.00,'finished',1,NULL,'2025-09-07 18:43:03',12,7,NULL,NULL,NULL,'waiting',NULL,'{\"1\": \"第1組\", \"2\": \"第2組\", \"3\": \"第3組\", \"4\": \"第4組\", \"5\": \"第5組\", \"6\": \"第6組\", \"7\": \"第7組\", \"8\": \"第8組\", \"9\": \"第9組\", \"10\": \"第10組\", \"11\": \"第11組\", \"12\": \"第12組\"}'),(6,'25090901',1000000.00,0.0300,10.00,2.50,100.00,100.00,150.00,120.00,'finished',1,NULL,'2025-09-09 13:36:08',12,7,NULL,NULL,NULL,'waiting',NULL,NULL),(7,'123',1000000.00,0.0300,10.00,2.50,100.00,100.00,150.00,120.00,'finished',1,NULL,'2025-09-09 16:31:56',12,7,NULL,NULL,NULL,'waiting',NULL,NULL),(8,'091001',1000000.00,3.0000,10.00,2.50,100.00,100.00,150.00,120.00,'finished',1,NULL,'2025-09-09 16:45:15',12,7,NULL,NULL,NULL,'waiting',NULL,NULL),(9,'091001',1000000.00,3.0000,10.00,2.50,100.00,100.00,150.00,120.00,'finished',1,NULL,'2025-09-09 16:47:29',12,7,NULL,NULL,NULL,'waiting',NULL,NULL),(10,'123',1000000.00,3.0000,10.00,2.50,100.00,100.00,500.00,300.00,'finished',1,NULL,'2025-09-09 20:28:19',7,7,NULL,NULL,NULL,'waiting',NULL,NULL),(11,'123456',1000000.00,3.0000,10.00,2.50,100.00,100.00,500.00,300.00,'finished',1,NULL,'2025-09-09 20:38:27',12,7,NULL,NULL,NULL,'waiting',NULL,NULL),(12,'課堂場',1000000.00,0.0300,10.00,2.50,100.00,100.00,500.00,300.00,'finished',1,NULL,'2025-09-11 21:05:08',12,7,NULL,NULL,NULL,'waiting',NULL,NULL),(13,'????',1000000.00,0.0300,10.00,2.50,100.00,100.00,150.00,120.00,'finished',1,NULL,'2025-09-11 21:12:53',12,7,NULL,NULL,NULL,'waiting',NULL,'{\"1\": \"第1組\"}'),(14,'????',1000000.00,0.0300,10.00,2.50,100.00,100.00,150.00,120.00,'finished',1,NULL,'2025-09-11 21:21:31',12,7,NULL,NULL,NULL,'waiting',NULL,NULL),(15,'管理員參數顯示測試',1200000.00,0.0400,15.00,3.00,120.00,110.00,180.00,140.00,'finished',1,NULL,'2025-09-11 22:15:41',8,5,NULL,NULL,NULL,'waiting',NULL,NULL),(16,'管理員參數顯示測試',1200000.00,0.0400,15.00,3.00,120.00,110.00,180.00,140.00,'finished',1,NULL,'2025-09-11 22:16:11',8,5,NULL,NULL,NULL,'waiting',NULL,'{\"1\": \"第1組\"}'),(17,'課堂場',1000000.00,0.0300,10.00,2.50,100.00,100.00,500.00,300.00,'finished',1,NULL,'2025-09-11 22:20:02',8,7,NULL,NULL,NULL,'waiting',NULL,NULL),(18,'連線資訊測試遊戲',500000.00,0.0300,10.00,2.00,100.00,90.00,150.00,120.00,'finished',1,NULL,'2025-09-11 22:25:23',4,3,NULL,NULL,NULL,'waiting',NULL,NULL),(19,'課堂場',1000000.00,0.0300,10.00,2.50,100.00,100.00,500.00,300.00,'active',1,NULL,'2025-09-11 22:26:32',8,7,NULL,NULL,NULL,'waiting',NULL,'{\"1\": \"第1組\"}');
/*!40000 ALTER TABLE `games` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sell_bids`
--

DROP TABLE IF EXISTS `sell_bids`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sell_bids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `day_id` int NOT NULL,
  `team_id` int NOT NULL,
  `fish_type` char(1) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `quantity` int NOT NULL,
  `status` enum('pending','fulfilled','partial','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `fulfilled_quantity` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `team_id` (`team_id`),
  KEY `idx_day_team` (`day_id`,`team_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `sell_bids_ibfk_1` FOREIGN KEY (`day_id`) REFERENCES `game_days` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sell_bids_ibfk_2` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sell_bids`
--

LOCK TABLES `sell_bids` WRITE;
/*!40000 ALTER TABLE `sell_bids` DISABLE KEYS */;
/*!40000 ALTER TABLE `sell_bids` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teams`
--

DROP TABLE IF EXISTS `teams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teams` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `team_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teams`
--

LOCK TABLES `teams` WRITE;
/*!40000 ALTER TABLE `teams` DISABLE KEYS */;
INSERT INTO `teams` VALUES (1,'01','$2b$10$C8EglkUBrsMqfB8AIfpM3.J5etpyw56D5345CbbDcBJFR9fjcPUFG','第1組','2025-09-08 07:20:44'),(2,'02','$2b$10$sCHCMuDP.5Mxg4ADaN3WCup1pcV3DrMRKXIxCHIEeuWDFZ1tMv3QG','第2組','2025-09-08 07:20:44'),(3,'03','$2b$10$DHQ/Z4Azh3.F/CBI9dqVSOiQltwnvSN8Ve5IPEvVcF5qFa.qrjI0a','第3組','2025-09-08 07:20:44'),(4,'04','$2b$10$Yb.llQJBdJduT5MfZ6QqT.0tpgL0kv/olcvThw1L0s1jkPMKagJhO','第4組','2025-09-08 07:20:44'),(5,'05','$2b$10$dDiAC6s88lgt/Wglwr8Ur.D646w4GgKBUUPm3i8r/49LWvrMqkOb6','第5組','2025-09-08 07:20:44'),(6,'06','$2b$10$EKcA7qfg7KwoZS.YrHukwei8ujJ5/Ch4c6HfXbYpu6IPYU3p4zm6q','第6組','2025-09-08 07:20:44'),(7,'07','$2b$10$LMrsMD9LMUze4NSQHLOfF.moXLFeakONJiO7GV6nea/vtiklqH..2','第7組','2025-09-08 07:20:44'),(8,'08','$2b$10$2ESB7FEdFSi1McYjZyB7G.AwuF2.CTLP33AUnGU6pMfLrdgtqM0t6','第8組','2025-09-08 07:20:44'),(9,'09','$2b$10$xkMpk8azXcGYS4sF7/.xx.q8R1TosygoPA07hUZvupi2ad3/NmwOK','第9組','2025-09-08 07:20:44'),(10,'10','$2b$10$ctdy.tQE7XGkhKdgdLffdu5AUyBN/Ua6zEhczM.e0xaASgbrp3tsC','第10組','2025-09-08 07:20:44'),(11,'11','$2b$10$kJ02E/nmamOO59gYsLHQl.97hmRWFNVP0jdDjyQq9JIL2AX./Snn6','第11組','2025-09-08 07:20:44'),(12,'12','$2b$10$il7pgmBy5mmqW0V0aR0zC.Lmj1wvD8hN7TRFC/YtBdxLqb0yncBnu','第12組','2025-09-08 07:20:44');
/*!40000 ALTER TABLE `teams` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `game_id` int NOT NULL,
  `game_day_id` int NOT NULL,
  `day_number` int NOT NULL,
  `team_id` int NOT NULL,
  `transaction_type` enum('buy','sell') COLLATE utf8mb4_unicode_ci NOT NULL,
  `fish_type` enum('A','B') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `quantity` int NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `bid_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `bid_id` (`bid_id`),
  KEY `idx_game_transactions` (`game_id`,`day_number`),
  KEY `idx_team_transactions` (`team_id`,`game_id`),
  KEY `idx_day_transactions` (`game_day_id`),
  KEY `idx_transaction_type` (`transaction_type`,`fish_type`),
  KEY `idx_tx_game_day_team` (`game_day_id`,`team_id`,`transaction_type`),
  CONSTRAINT `transactions_ibfk_1` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE,
  CONSTRAINT `transactions_ibfk_2` FOREIGN KEY (`game_day_id`) REFERENCES `game_days` (`id`) ON DELETE CASCADE,
  CONSTRAINT `transactions_ibfk_3` FOREIGN KEY (`team_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `transactions_ibfk_4` FOREIGN KEY (`bid_id`) REFERENCES `bids` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transactions`
--

LOCK TABLES `transactions` WRITE;
/*!40000 ALTER TABLE `transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plain_password` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '明文密碼，教學用',
  `team_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('admin','team') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_ingame` tinyint(1) DEFAULT '0' COMMENT '是否正在遊戲中',
  `current_game_id` int DEFAULT NULL COMMENT '當前參與的遊戲ID',
  `last_active` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最後活動時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_users_current_game` (`current_game_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','$2b$10$vOdB.TZgX1rsy79Lrw6A3uFRz1BzoXebl077XPXq3.WDL7HVx4jHm','123',NULL,'admin','2025-09-06 16:23:41',0,NULL,'2025-09-11 20:21:33'),(2,'01','$2b$10$5jtyEblCCmIG4Y3WIeDh1e99W7MC.CaLgou6AqwyAX.Ls0u5CtgkC','01','第1組','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 21:13:29'),(3,'02','$2b$10$xkyNyn3R9UVQgntG83Opcub4JqDCqOMKfL9UnMZ2k/1WNFMJu/tAe','02','團隊02','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33'),(4,'03','$2b$10$9jY8lrQOQYN8kpJDvSoE1.09pVJNeW6erm0LKj3Es3iOGsyE/.piC','03','團隊03','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33'),(5,'04','$2b$10$Xj3S7E0k/j2r/QTqVqPHeuBj1wmqpSW0zOWRCaYLvIViQt5fdoswu','04','團隊04','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33'),(6,'05','$2b$10$JXq9dcSSraXiUJmWLY9Ez.oZst4Iugpk.NDwDaBG7WjYhkPWqvARu','05','團隊05','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33'),(7,'06','$2b$10$CG2hY3veXjsqn6fM.5TboOabA17uML1wKGlmTjjUsOx4HBftEJwbu','06','團隊06','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33'),(8,'07','$2b$10$Ip57nPkd037wb/.bGVzKkuL5MQpPFkMnsqJe2PUMuJzyf540Vi7se','07','團隊07','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33'),(9,'08','$2b$10$vGk.u6GDzMrQFQL/bofqoenhtf2qT0pVKkxKm/uZZLIV4vNQOM.5.','08','團隊08','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33'),(10,'09','$2b$10$Mci.1S7pGoNrdeVHO6sR3eCRI61.it4ven8shDD3AQJKcC3hRiMq2','09','團隊09','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33'),(11,'10','$2b$10$h9Lwe1PK0sW1z1wTzFLL.un3RUnLd3jZQCDdBS8BfVCClVA7tTCSu','10','團隊10','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33'),(12,'11','$2b$10$8WNkRaikpNzREyAt47dKfuXs.weWwwYHlWXlMtMTJtcCrYO.oMmYK','11','團隊11','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33'),(13,'12','$2b$10$1ikULkGPVmKDheflJygkwepVWnuP6Q6zPv2WSmNyRz68nYM9yI3Ca','12','團隊12','team','2025-09-06 16:26:16',0,NULL,'2025-09-11 20:21:33');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `v_team_rankings`
--

DROP TABLE IF EXISTS `v_team_rankings`;
/*!50001 DROP VIEW IF EXISTS `v_team_rankings`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_team_rankings` AS SELECT 
 1 AS `game_id`,
 1 AS `day_number`,
 1 AS `team_id`,
 1 AS `team_name`,
 1 AS `initial_budget`,
 1 AS `cumulative_profit`,
 1 AS `closing_loan`,
 1 AS `roi`,
 1 AS `ranking`*/;
SET character_set_client = @saved_cs_client;

--
-- Dumping routines for database 'fishmarket_game'
--

--
-- Final view structure for view `v_team_rankings`
--

/*!50001 DROP VIEW IF EXISTS `v_team_rankings`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_team_rankings` AS select `gd`.`game_id` AS `game_id`,`gd`.`day_number` AS `day_number`,`dr`.`team_id` AS `team_id`,`u`.`team_name` AS `team_name`,`g`.`initial_budget` AS `initial_budget`,`dr`.`cumulative_profit` AS `cumulative_profit`,`dr`.`closing_loan` AS `closing_loan`,round((case when ((`g`.`initial_budget` + ifnull(`dr`.`closing_loan`,0)) = 0) then 0 else ((`dr`.`cumulative_profit` / (`g`.`initial_budget` + ifnull(`dr`.`closing_loan`,0))) * 100) end),2) AS `roi`,rank() OVER (PARTITION BY `gd`.`game_id`,`gd`.`day_number` ORDER BY (case when ((`g`.`initial_budget` + ifnull(`dr`.`closing_loan`,0)) = 0) then -(999999) else (`dr`.`cumulative_profit` / (`g`.`initial_budget` + ifnull(`dr`.`closing_loan`,0))) end) desc )  AS `ranking` from (((`daily_results` `dr` join `game_days` `gd` on((`dr`.`game_day_id` = `gd`.`id`))) join `games` `g` on((`gd`.`game_id` = `g`.`id`))) join `users` `u` on((`dr`.`team_id` = `u`.`id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-12  7:48:23
