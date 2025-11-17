-- D:\徐景輝\魚市場遊戲3\seed_demo_game.sql
-- 一個預設遊戲（建好但不強制進入 Day1；你也可以直接用 Admin 頁面建立）

INSERT INTO games
  (game_name, initial_budget, loan_interest_rate, unsold_fee_per_kg, fixed_unsold_ratio,
   distributor_floor_price_a, distributor_floor_price_b, target_price_a, target_price_b,
   total_days, num_teams, status, phase, current_day, created_at)
VALUES
  ('課堂示範場', 1000000, 0.03, 10, 2.50,
   100, 100, 500, 300,
   7, 10, 'active', 'waiting', 0, NOW())
ON DUPLICATE KEY UPDATE
  initial_budget=VALUES(initial_budget),
  loan_interest_rate=VALUES(loan_interest_rate),
  unsold_fee_per_kg=VALUES(unsold_fee_per_kg),
  fixed_unsold_ratio=VALUES(fixed_unsold_ratio),
  distributor_floor_price_a=VALUES(distributor_floor_price_a),
  distributor_floor_price_b=VALUES(distributor_floor_price_b),
  target_price_a=VALUES(target_price_a),
  target_price_b=VALUES(target_price_b),
  total_days=VALUES(total_days),
  num_teams=VALUES(num_teams),
  status='active',
  phase='waiting';