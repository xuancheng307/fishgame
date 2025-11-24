-- Fix games.status ENUM to include 'finished' value
-- This fixes the "Data truncated for column 'status'" error when creating new games

USE fishmarket_game;

-- Modify the status column ENUM to include all necessary values
ALTER TABLE games MODIFY COLUMN status
    ENUM('pending', 'active', 'paused', 'finished', 'completed')
    DEFAULT 'pending';

-- Verify the change
SHOW COLUMNS FROM games WHERE Field = 'status';
