# Revenue Settlement Mode + Dashboard Fix

## Goal
Add toggle for revenue settlement timing (daily vs end-of-game), default end-of-game. Fix dashboard returning empty after game finishes.

## Done When
- Game creation has "收益結算方式" toggle (日結 / 遊戲結束後結算)
- In end-of-game mode: sell revenue does NOT go back to current_budget
- Daily profit calculation UNCHANGED (unrealized P&L, same formula both modes)
- Team dashboard shows `pendingRevenue` so players see their earned revenue
- Dashboard API returns data for finished games (not just active)
- E2E test passes for both modes

## Scope
- Files that WILL be modified:
  - `backend/server.js` — schema, processSellBids, dashboard API, game creation
  - `admin.html` — game creation form toggle
  - `simple-team.html` — display pending revenue
  - `test-e2e-full-round.js` — test end-of-game mode
- Files that MUST NOT be touched:
  - `i18n.js`, `login.html`, `index.html`, `game-instructions.html`

## Principles
- Only ONE place needs conditional logic: processSellBids line 3033
- enhancedDailySettlement UNCHANGED (profit = revenue - cost - fees - interest, from bids)
- processBuyBids UNCHANGED (reads current_budget which is now lower — correct)
- Loan cap logic UNCHANGED (teams hit cap sooner — intended)
- No revenue added back at game end (ROI is what matters for ranking)

## TODO
- [x] 0. Update requirement docs (遊戲完整說明.md, DATABASE_ARCHITECTURE.md, SYSTEM_FRAMEWORK.md)
- [ ] 1. Add `revenue_settlement` column to games table (schema in server.js)
- [ ] 2. Update game creation API to accept `revenueSettlement` param
- [ ] 3. Modify processSellBids: skip `current_budget += revenue` when mode = 'end_of_game'
- [ ] 4. Add `pendingRevenue` to dashboard API response
- [ ] 5. Fix dashboard API: return data for finished games too
- [ ] 6. Admin.html: add toggle in game creation form
- [ ] 7. Simple-team.html: show pending revenue when > 0
- [ ] 8. Update E2E test and run

## Decision Log
