-- seed_demo_game.sql
-- 建立示範遊戲資料（依照現行 games schema）

INSERT INTO games
  (name, description, status, phase, total_days, current_day, num_teams,
   initial_budget, daily_interest_rate, loan_interest_rate, max_loan_ratio,
   unsold_fee_per_kg, fixed_unsold_ratio,
   distributor_floor_price_a, distributor_floor_price_b,
   target_price_a, target_price_b,
   buying_duration, selling_duration,
   created_at)
VALUES
  ('示範遊戲', '範例：7天，預算100萬，日利率3%，滯銷每公斤$10，固定滯銷2.5%。', 'active', 'waiting', 7, 0, 10,
   1000000, 0.03, 0.03, 0.50,
   10.00, 2.50,
   100.00, 80.00,
   150.00, 120.00,
   7, 4,
   NOW())
ON DUPLICATE KEY UPDATE
  description=VALUES(description),
  status='active',
  phase='waiting',
  total_days=VALUES(total_days),
  current_day=VALUES(current_day),
  num_teams=VALUES(num_teams),
  initial_budget=VALUES(initial_budget),
  daily_interest_rate=VALUES(daily_interest_rate),
  loan_interest_rate=VALUES(loan_interest_rate),
  max_loan_ratio=VALUES(max_loan_ratio),
  unsold_fee_per_kg=VALUES(unsold_fee_per_kg),
  fixed_unsold_ratio=VALUES(fixed_unsold_ratio),
  distributor_floor_price_a=VALUES(distributor_floor_price_a),
  distributor_floor_price_b=VALUES(distributor_floor_price_b),
  target_price_a=VALUES(target_price_a),
  target_price_b=VALUES(target_price_b),
  buying_duration=VALUES(buying_duration),
  selling_duration=VALUES(selling_duration);
