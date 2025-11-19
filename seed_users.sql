
INSERT INTO users (username, role, plain_password, team_name)
VALUES 
  ('admin', 'admin', '123', '管理員'),
  ('01', 'team', '01', '第01組'),
  ('02', 'team', '02', '第02組'),
  ('03', 'team', '03', '第03組'),
  ('04', 'team', '04', '第04組'),
  ('05', 'team', '05', '第05組'),
  ('06', 'team', '06', '第06組'),
  ('07', 'team', '07', '第07組'),
  ('08', 'team', '08', '第08組'),
  ('09', 'team', '09', '第09組'),
  ('10', 'team', '10', '第10組')
ON DUPLICATE KEY UPDATE
  role=VALUES(role),
  plain_password=VALUES(plain_password),
  team_name=VALUES(team_name);
