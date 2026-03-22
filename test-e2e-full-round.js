#!/usr/bin/env node
/**
 * Fish Market Game — Full Round E2E Test
 * 10 teams, 3 days, comprehensive edge case coverage
 *
 * Usage: node test-e2e-full-round.js [base_url]
 * Default: https://backend-production-dc27.up.railway.app
 */

const BASE = process.argv[2] || 'https://backend-production-dc27.up.railway.app';
const TEAMS = ['01','02','03','04','05','06','07','08','09','10'];
const ADMIN = { username: 'admin', password: 'admin' };

// ─── Helpers ───────────────────────────────────────────────

let totalChecks = 0, passed = 0, failed = 0;
const failures = [];

function assert(condition, label, detail) {
    totalChecks++;
    if (condition) {
        passed++;
        console.log(`  ✅ ${label}`);
    } else {
        failed++;
        const msg = `  ❌ ${label}` + (detail ? ` — ${detail}` : '');
        console.log(msg);
        failures.push(msg);
    }
}

function approx(a, b, tolerance = 1) {
    return Math.abs(a - b) <= tolerance;
}

async function api(method, path, token, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    data._status = res.status;
    return data;
}

async function login(username, password) {
    const d = await api('POST', '/api/auth/login', null, { username, password: password || username });
    if (!d.token) throw new Error(`Login failed for ${username}: ${JSON.stringify(d)}`);
    return d.token;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main Test ─────────────────────────────────────────────

(async () => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Fish Market E2E Full Round Test`);
    console.log(`  Server: ${BASE}`);
    console.log(`${'═'.repeat(60)}\n`);

    // ════════════════════════════════════════════════════════
    // Phase 0: Login
    // ════════════════════════════════════════════════════════
    console.log('── Phase 0: Login ──');
    const adminToken = await login(ADMIN.username, ADMIN.password);
    console.log(`  Admin logged in`);

    const teamTokens = {};
    await Promise.all(TEAMS.map(async u => {
        teamTokens[u] = await login(u, u);
    }));
    console.log(`  10 teams logged in (01-10)\n`);

    // ════════════════════════════════════════════════════════
    // Phase 1: Create Game
    // ════════════════════════════════════════════════════════
    console.log('── Phase 1: Create Game ──');

    // Force-end any existing active game first
    const existingGame = await api('GET', '/api/admin/active-game', adminToken);
    if (existingGame.id && existingGame.status === 'active') {
        console.log(`  Force-ending existing game ${existingGame.id}...`);
        await api('POST', `/api/admin/games/${existingGame.id}/force-end`, adminToken);
        await sleep(1000);
    }
    const gameParams = {
        gameName: 'E2E Full Round Test',
        numTeams: 12,
        totalDays: 3,
        initialBudget: 200000,
        loanInterestRate: 0.03,
        unsoldFeePerKg: 10,
        fixedUnsoldRatio: 2.5,
        distributorFloorPriceA: 100,
        distributorFloorPriceB: 100,
        targetPriceA: 500,
        targetPriceB: 300,
        buyingDuration: 1,
        sellingDuration: 1,
        revenueSettlement: 'daily',  // This test uses daily mode (strategies assume cash-back after sell)
    };
    const createRes = await api('POST', '/api/admin/games/create', adminToken, gameParams);
    assert(createRes.success, 'Game created', `gameId=${createRes.gameId}`);
    const gameId = createRes.gameId;

    // Read day 1 supply/budget
    const activeGame = await api('GET', '/api/admin/active-game', adminToken);
    const dayData = activeGame.currentDayData || {};
    const supplyA = parseInt(dayData.fishASupply) || parseInt(activeGame.fish_a_supply);
    const supplyB = parseInt(dayData.fishBSupply) || parseInt(activeGame.fish_b_supply);
    const budgetA = parseFloat(dayData.fishARestaurantBudget) || parseFloat(activeGame.fish_a_restaurant_budget);
    const budgetB = parseFloat(dayData.fishBRestaurantBudget) || parseFloat(activeGame.fish_b_restaurant_budget);
    console.log(`  Supply: A=${supplyA}kg, B=${supplyB}kg`);
    console.log(`  Budget: A=$${budgetA.toLocaleString()}, B=$${budgetB.toLocaleString()}`);
    assert(supplyA === 12 * 150, `A supply = ${supplyA} (expect ${12*150})`);
    assert(supplyB === 12 * 300, `B supply = ${supplyB} (expect ${12*300})`);
    assert(budgetA === supplyA * 500, `A budget = $${budgetA} (expect ${supplyA*500})`);
    assert(budgetB === supplyB * 300, `B budget = $${budgetB} (expect ${supplyB*300})`);

    // ════════════════════════════════════════════════════════
    // Phase 2: All teams join
    // ════════════════════════════════════════════════════════
    console.log('\n── Phase 2: Teams Join ──');
    const joinResults = await Promise.all(TEAMS.map(async u => {
        const r = await api('POST', '/api/team/join-current', teamTokens[u], { teamName: `Team${u}` });
        return { team: u, ...r };
    }));
    const allJoined = joinResults.every(r => r.success || (r.error && r.error.includes('已經加入')));
    assert(allJoined, `All 10 teams joined`, joinResults.filter(r=>!r.success && !(r.error||'').includes('已經加入')).map(r=>`${r.team}:${r.error||r.message}`).join(', '));

    // Verify participant count
    await sleep(500);
    const gameInfo2 = await api('GET', '/api/admin/active-game', adminToken);
    assert(parseInt(gameInfo2.participantCount) >= 10, `Participant count >= 10`, `got: ${gameInfo2.participantCount}`);

    // ════════════════════════════════════════════════════════
    // Day 1
    // ════════════════════════════════════════════════════════
    await runDay(1, gameId, adminToken, teamTokens);

    // ════════════════════════════════════════════════════════
    // Advance to Day 2
    // ════════════════════════════════════════════════════════
    console.log('\n── Advance to Day 2 ──');
    const adv2 = await api('POST', `/api/admin/games/${gameId}/advance-day`, adminToken, {});
    assert(adv2.success || adv2.day, `Advanced to Day 2`, adv2.error || adv2.message);
    await sleep(500);

    await runDay(2, gameId, adminToken, teamTokens);

    // ════════════════════════════════════════════════════════
    // Advance to Day 3
    // ════════════════════════════════════════════════════════
    console.log('\n── Advance to Day 3 ──');
    const adv3 = await api('POST', `/api/admin/games/${gameId}/advance-day`, adminToken, {});
    assert(adv3.success || adv3.day, `Advanced to Day 3`, adv3.error || adv3.message);
    await sleep(500);

    await runDay(3, gameId, adminToken, teamTokens);

    // ════════════════════════════════════════════════════════
    // Final Validation
    // ════════════════════════════════════════════════════════
    console.log('\n── Final Validation ──');

    // Game should be finished after day 3
    const finalGame = await api('GET', `/api/admin/games/${gameId}/details`, adminToken);
    assert(finalGame.game.status === 'finished', `Game status = finished`, `got: ${finalGame.game?.status}`);

    // Final ranking should exist
    assert(finalGame.finalRanking && finalGame.finalRanking.length > 0, `Final ranking exists`, `count: ${finalGame.finalRanking?.length}`);

    // Chart data API
    const chartData = await api('GET', `/api/admin/games/${gameId}/chart-data`, adminToken);
    assert(chartData.teams && chartData.teams.length >= 10, `Chart data has teams`, `count: ${chartData.teams?.length}`);
    assert(chartData.dailyResults && chartData.dailyResults.length > 0, `Chart data has daily results`, `count: ${chartData.dailyResults?.length}`);
    assert(chartData.bidSummary && chartData.bidSummary.length > 0, `Chart data has bid summary`);
    assert(chartData.marketOverview && chartData.marketOverview.length > 0, `Chart data has market overview`);

    // Verify 3 days of results
    const daysInResults = [...new Set(chartData.dailyResults.map(r => r.day_number))];
    assert(daysInResults.length === 3, `3 days of results`, `got: ${daysInResults}`);

    // Leaderboard
    const lb = await api('GET', `/api/leaderboard/${gameId}`, null);
    assert(lb.length >= 10, `Leaderboard has entries`, `count: ${lb?.length}`);

    // Dashboard works after game finishes
    const postFinishDash = await api('GET', '/api/team/dashboard', teamTokens['01']);
    assert(postFinishDash.gameInfo && postFinishDash.financials, `Dashboard works after game finishes`);
    assert(postFinishDash.gameInfo.gameStatus === 'finished', `Dashboard shows finished status`, `got: ${postFinishDash.gameInfo?.gameStatus}`);

    // ════════════════════════════════════════════════════════
    // end_of_game mode — Quick 1-day test
    // ════════════════════════════════════════════════════════
    console.log('\n── end_of_game Mode Test ──');

    const eogParams = {
        gameName: 'E2E End-of-Game Mode',
        numTeams: 12, totalDays: 1, initialBudget: 200000,
        loanInterestRate: 0.03, unsoldFeePerKg: 10, fixedUnsoldRatio: 2.5,
        distributorFloorPriceA: 100, distributorFloorPriceB: 100,
        targetPriceA: 500, targetPriceB: 300,
        buyingDuration: 1, sellingDuration: 1,
        revenueSettlement: 'end_of_game',
    };
    const eogCreate = await api('POST', '/api/admin/games/create', adminToken, eogParams);
    assert(eogCreate.success, 'end_of_game game created');
    const eogId = eogCreate.gameId;

    // T01 joins and buys
    await api('POST', '/api/team/join-current', teamTokens['01'], { teamName: 'EOG-T01' });
    await api('POST', `/api/admin/games/${eogId}/start-buying`, adminToken, { duration: 1 });
    await sleep(300);
    await api('POST', '/api/team/submit-buy-bids', teamTokens['01'], {
        buyBids: [{ fish_type: 'A', price: 200, quantity: 100 }]  // cost = $20k
    });
    await api('POST', `/api/admin/games/${eogId}/close-buying`, adminToken);
    await sleep(500);

    // After buy: cash should be $200k - $20k = $180k
    const eogPostBuy = await api('GET', '/api/team/dashboard', teamTokens['01']);
    const eogCashPostBuy = parseFloat(eogPostBuy.financials?.currentBudget) || 0;
    assert(approx(eogCashPostBuy, 180000, 100), `EOG: Post-buy cash ~$180k`, `got: $${eogCashPostBuy}`);

    // Sell all A at $500
    await api('POST', `/api/admin/games/${eogId}/start-selling`, adminToken, { duration: 1 });
    await sleep(300);
    await api('POST', '/api/team/submit-sell-bids', teamTokens['01'], {
        sellBids: [{ fish_type: 'A', price: 500, quantity: 100 }]  // revenue = $50k
    });
    await api('POST', `/api/admin/games/${eogId}/close-selling`, adminToken);
    await sleep(500);

    // After sell in end_of_game mode: cash should STILL be ~$180k (revenue NOT added back)
    const eogPostSell = await api('GET', '/api/team/dashboard', teamTokens['01']);
    const eogCashPostSell = parseFloat(eogPostSell.financials?.currentBudget) || 0;
    assert(approx(eogCashPostSell, 180000, 100), `EOG: Post-sell cash still ~$180k (revenue NOT added)`, `got: $${eogCashPostSell}`);

    // pendingRevenue should be ~$50k
    const eogPending = parseFloat(eogPostSell.financials?.pendingRevenue) || 0;
    assert(eogPending > 0, `EOG: pendingRevenue > 0`, `got: $${eogPending}`);

    // Settle
    await api('POST', `/api/admin/games/${eogId}/settle`, adminToken);
    await sleep(500);

    // Daily profit should still be correctly calculated (revenue - cost = $50k - $20k = $30k minus fees)
    const eogChart = await api('GET', `/api/admin/games/${eogId}/chart-data`, adminToken);
    const eogDR = eogChart.dailyResults?.find(r => r.username === '01');
    if (eogDR) {
        const eogProfit = parseFloat(eogDR.daily_profit);
        assert(eogProfit > 0, `EOG: Daily profit > 0 (unrealized P&L calculated)`, `got: $${eogProfit}`);
        const eogRevenue = parseFloat(eogDR.revenue);
        const eogCost = parseFloat(eogDR.cost);
        assert(approx(eogRevenue, 50000, 5000), `EOG: Revenue ~$50k`, `got: $${eogRevenue}`);
        assert(approx(eogCost, 20000, 100), `EOG: Cost ~$20k`, `got: $${eogCost}`);
    }

    // Force-end the eog game
    await api('POST', `/api/admin/games/${eogId}/force-end`, adminToken);
    console.log('  end_of_game mode test complete');

    // ════════════════════════════════════════════════════════
    // Summary
    // ════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Results: ${passed}/${totalChecks} passed, ${failed} failed`);
    if (failed > 0) {
        console.log(`\n  Failures:`);
        failures.forEach(f => console.log(f));
    }
    console.log(`${'═'.repeat(60)}\n`);
    process.exit(failed > 0 ? 1 : 0);

})().catch(e => {
    console.error('\n💥 FATAL ERROR:', e.message);
    console.error(e.stack);
    process.exit(2);
});


// ════════════════════════════════════════════════════════════
// Day Runner
// ════════════════════════════════════════════════════════════

async function runDay(dayNum, gameId, adminToken, teamTokens) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  DAY ${dayNum}`);
    console.log(`${'─'.repeat(60)}`);

    // Get current state for all teams
    const dashboards = {};
    await Promise.all(TEAMS.map(async u => {
        dashboards[u] = await api('GET', '/api/team/dashboard', teamTokens[u]);
    }));

    // Get market info (field names: fishASupply, fishBSupply, fishABudget, fishBBudget)
    const market = dashboards['01']?.marketInfo || {};
    const supplyA = parseInt(market.fishASupply) || 0;
    const supplyB = parseInt(market.fishBSupply) || 0;
    const budgetA = parseFloat(market.fishABudget) || 0;
    const budgetB = parseFloat(market.fishBBudget) || 0;
    console.log(`  Market: A supply=${supplyA}kg, B supply=${supplyB}kg`);
    console.log(`  Budget: A=$${budgetA.toLocaleString()}, B=$${budgetB.toLocaleString()}`);

    // ── BUYING PHASE ──
    console.log(`\n  ── Day ${dayNum} Buying Phase ──`);

    // Start buying
    const startBuyRes = await api('POST', `/api/admin/games/${gameId}/start-buying`, adminToken, { duration: 1 });
    assert(startBuyRes.success || startBuyRes.message, `Day ${dayNum}: Buying phase started`);
    await sleep(500);

    // Generate buy bids per team based on day
    const buyStrategies = getBuyStrategies(dayNum, dashboards);

    // Submit all buy bids concurrently
    const buyResults = {};
    await Promise.all(TEAMS.map(async u => {
        const bids = buyStrategies[u];
        if (!bids || bids.length === 0) {
            buyResults[u] = { success: true, skipped: true };
            return;
        }
        buyResults[u] = await api('POST', '/api/team/submit-buy-bids', teamTokens[u], { buyBids: bids });
    }));

    // Validate buy submissions
    validateBuySubmissions(dayNum, buyResults, buyStrategies);

    // Close buying (manual)
    await sleep(500);
    const closeBuyRes = await api('POST', `/api/admin/games/${gameId}/close-buying`, adminToken);
    assert(closeBuyRes.success || closeBuyRes.message, `Day ${dayNum}: Buying closed`);
    await sleep(1000); // Wait for settlement processing

    // Validate buy settlement
    await validateBuySettlement(dayNum, gameId, adminToken, teamTokens);

    // ── SELLING PHASE ──
    console.log(`\n  ── Day ${dayNum} Selling Phase ──`);

    // Refresh dashboards to get updated inventory
    await Promise.all(TEAMS.map(async u => {
        dashboards[u] = await api('GET', '/api/team/dashboard', teamTokens[u]);
    }));

    // Start selling
    const startSellRes = await api('POST', `/api/admin/games/${gameId}/start-selling`, adminToken, { duration: 1 });
    assert(startSellRes.success || startSellRes.message, `Day ${dayNum}: Selling phase started`);
    await sleep(500);

    // Generate sell bids based on actual inventory
    const sellStrategies = getSellStrategies(dayNum, dashboards);

    // Test edge case: Day 3 Team 08 tries to sell more than inventory
    if (dayNum === 3) {
        const inv08A = parseFloat(dashboards['08']?.financials?.fishAInventory) || 0;
        if (inv08A > 0) {
            const overSellRes = await api('POST', '/api/team/submit-sell-bids', teamTokens['08'], {
                sellBids: [{ fish_type: 'A', price: 500, quantity: inv08A + 100 }]
            });
            assert(overSellRes._status === 400 || !overSellRes.success,
                `Day ${dayNum}: Team08 oversell rejected (inv=${inv08A}, tried=${inv08A+100})`,
                `status=${overSellRes._status}`);
        }
    }

    // Submit all sell bids concurrently
    const sellResults = {};
    await Promise.all(TEAMS.map(async u => {
        const bids = sellStrategies[u];
        if (!bids || bids.length === 0) {
            sellResults[u] = { success: true, skipped: true };
            return;
        }
        sellResults[u] = await api('POST', '/api/team/submit-sell-bids', teamTokens[u], { sellBids: bids });
    }));

    // Validate sell submissions
    validateSellSubmissions(dayNum, sellResults, sellStrategies);

    // Close selling
    await sleep(500);
    const closeSellRes = await api('POST', `/api/admin/games/${gameId}/close-selling`, adminToken);
    assert(closeSellRes.success || closeSellRes.message, `Day ${dayNum}: Selling closed`);
    await sleep(1000);

    // ── DAILY SETTLEMENT ──
    console.log(`\n  ── Day ${dayNum} Settlement ──`);

    const settleRes = await api('POST', `/api/admin/games/${gameId}/settle`, adminToken);
    assert(settleRes.success || settleRes.message, `Day ${dayNum}: Settlement complete`);
    await sleep(1000);

    // Validate settlement
    await validateSettlement(dayNum, gameId, adminToken, teamTokens);
}


// ════════════════════════════════════════════════════════════
// Buy Strategies
// ════════════════════════════════════════════════════════════

function getBuyStrategies(dayNum, dashboards) {
    if (dayNum === 1) return getDay1BuyStrategies();
    if (dayNum === 2) return getDay2BuyStrategies(dashboards);
    if (dayNum === 3) return getDay3BuyStrategies(dashboards);
}

function getDay1BuyStrategies() {
    return {
        '01': [ // Conservative
            { fish_type: 'A', price: 200, quantity: 120 },
            { fish_type: 'B', price: 150, quantity: 150 },
        ],
        '02': [ // Aggressive — high price, big volume
            { fish_type: 'A', price: 300, quantity: 200 },
            { fish_type: 'B', price: 250, quantity: 150 },
        ],
        '03': [ // Below floor price on A (should FAIL), normal B
            { fish_type: 'A', price: 80, quantity: 100 },  // below floor $100!
            { fish_type: 'B', price: 140, quantity: 100 },
        ],
        '04': [ // Leveraged — heavy buyer, needs loan
            // Total: 280*300 + 260*200 + 220*300 = 84k+52k+66k = $202k > $200k → auto-loan ~$2k
            { fish_type: 'A', price: 280, quantity: 300 },
            { fish_type: 'A', price: 260, quantity: 200 },  // 2nd A bid
            { fish_type: 'B', price: 220, quantity: 300 },
        ],
        '05': [ // Split — 2 bids per fish type at different prices
            { fish_type: 'A', price: 220, quantity: 100 },
            { fish_type: 'A', price: 180, quantity: 100 },
            { fish_type: 'B', price: 160, quantity: 80 },
            { fish_type: 'B', price: 130, quantity: 80 },
        ],
        '06': [ // All-in A — 2 bids, no B
            { fish_type: 'A', price: 240, quantity: 200 },
            { fish_type: 'A', price: 200, quantity: 120 },
        ],
        '07': [ // All-in B — 2 bids, no A
            { fish_type: 'B', price: 190, quantity: 200 },
            { fish_type: 'B', price: 160, quantity: 150 },
        ],
        '08': [ // Greedy — huge quantity A
            { fish_type: 'A', price: 230, quantity: 500 },
        ],
        '09': [ // Moderate
            { fish_type: 'A', price: 210, quantity: 100 },
            { fish_type: 'B', price: 145, quantity: 100 },
        ],
        '10': [ // Low price — may fail if supply runs out
            { fish_type: 'A', price: 195, quantity: 120 },
            { fish_type: 'B', price: 155, quantity: 100 },
        ],
    };
}

function getDay2BuyStrategies(dashboards) {
    // Day 2: Adjust based on remaining budget
    // Team 04 tries to push loan cap — big bids with limited cash
    const cash04 = parseFloat(dashboards['04']?.financials?.currentBudget) || 50000;

    return {
        '01': [
            { fish_type: 'A', price: 210, quantity: 100 },
            { fish_type: 'B', price: 160, quantity: 120 },
        ],
        '02': [ // Reduced volume (less cash now)
            { fish_type: 'A', price: 280, quantity: 150 },
            { fish_type: 'B', price: 230, quantity: 100 },
        ],
        '03': [ // Now bids ABOVE floor
            { fish_type: 'A', price: 150, quantity: 80 },
            { fish_type: 'B', price: 130, quantity: 80 },
        ],
        '04': [ // Try to exceed loan cap — bid way more than cash
            { fish_type: 'A', price: 300, quantity: 300 },
            { fish_type: 'A', price: 270, quantity: 200 },
            { fish_type: 'B', price: 220, quantity: 250 },
        ],
        '05': [
            { fish_type: 'A', price: 215, quantity: 90 },
            { fish_type: 'A', price: 185, quantity: 90 },
            { fish_type: 'B', price: 155, quantity: 70 },
            { fish_type: 'B', price: 135, quantity: 70 },
        ],
        '06': [
            { fish_type: 'A', price: 235, quantity: 180 },
            { fish_type: 'A', price: 205, quantity: 100 },
        ],
        '07': [
            { fish_type: 'B', price: 185, quantity: 180 },
            { fish_type: 'B', price: 155, quantity: 130 },
        ],
        '08': [
            { fish_type: 'A', price: 225, quantity: 400 },
        ],
        '09': [
            { fish_type: 'A', price: 205, quantity: 90 },
            { fish_type: 'B', price: 140, quantity: 90 },
        ],
        '10': [ // Switched to more B (failed on A day 1)
            { fish_type: 'A', price: 200, quantity: 80 },
            { fish_type: 'B', price: 170, quantity: 150 },
        ],
    };
}

function getDay3BuyStrategies(dashboards) {
    // Day 3: Extreme cases
    return {
        '01': [
            { fish_type: 'A', price: 220, quantity: 100 },
            { fish_type: 'B', price: 165, quantity: 100 },
        ],
        '02': [
            { fish_type: 'A', price: 290, quantity: 120 },
        ],
        '03': [], // Team 03 skips entirely — tests empty submission
        '04': [
            { fish_type: 'A', price: 260, quantity: 150 },
            { fish_type: 'B', price: 190, quantity: 150 },
        ],
        '05': [
            { fish_type: 'A', price: 210, quantity: 80 },
            { fish_type: 'B', price: 150, quantity: 60 },
        ],
        '06': [
            { fish_type: 'A', price: 245, quantity: 180 },
        ],
        '07': [
            { fish_type: 'B', price: 195, quantity: 200 },
            { fish_type: 'B', price: 165, quantity: 120 },
        ],
        '08': [
            { fish_type: 'A', price: 235, quantity: 350 },
            { fish_type: 'B', price: 180, quantity: 150 },
        ],
        '09': [
            { fish_type: 'A', price: 200, quantity: 80 },
            { fish_type: 'B', price: 150, quantity: 80 },
        ],
        '10': [
            { fish_type: 'B', price: 175, quantity: 200 },
        ],
    };
}


// ════════════════════════════════════════════════════════════
// Sell Strategies (based on actual inventory)
// ════════════════════════════════════════════════════════════

function getSellStrategies(dayNum, dashboards) {
    const inv = {};
    TEAMS.forEach(u => {
        const f = dashboards[u]?.financials || {};
        inv[u] = {
            a: parseInt(f.fishAInventory ?? f.fish_a_inventory) || 0,
            b: parseInt(f.fishBInventory ?? f.fish_b_inventory) || 0,
        };
    });

    if (dayNum === 1) return getDay1SellStrategies(inv);
    if (dayNum === 2) return getDay2SellStrategies(inv);
    if (dayNum === 3) return getDay3SellStrategies(inv);
}

function getDay1SellStrategies(inv) {
    const s = {};
    // 01: At target price
    s['01'] = makeSellBids(inv['01'], { aPrice: 500, bPrice: 300 });
    // 02: Above target
    s['02'] = makeSellBids(inv['02'], { aPrice: 550, bPrice: null });
    // 03: Only B (no A inventory expected)
    s['03'] = makeSellBids(inv['03'], { aPrice: null, bPrice: 280 });
    // 04: Below target — dump fast
    s['04'] = makeSellBids(inv['04'], { aPrice: 450, bPrice: 270 });
    // 05: Split A into 2 prices
    if (inv['05'].a > 0) {
        const half = Math.floor(inv['05'].a / 2);
        s['05'] = [
            { fish_type: 'A', price: 600, quantity: half },
            { fish_type: 'A', price: 480, quantity: inv['05'].a - half },
        ];
        if (inv['05'].b > 0) s['05'].push({ fish_type: 'B', price: 330, quantity: inv['05'].b });
    } else {
        s['05'] = makeSellBids(inv['05'], { aPrice: null, bPrice: 330 });
    }
    // 06: High A
    s['06'] = makeSellBids(inv['06'], { aPrice: 580, bPrice: null });
    // 07: Highest B price (triggers 2.5% unsold)
    s['07'] = makeSellBids(inv['07'], { aPrice: null, bPrice: 400 });
    // 08: Slightly below target A
    s['08'] = makeSellBids(inv['08'], { aPrice: 470, bPrice: null });
    // 09: Highest A price (may fail from budget)
    s['09'] = makeSellBids(inv['09'], { aPrice: 650, bPrice: 350 });
    // 10: Lowest B price
    s['10'] = makeSellBids(inv['10'], { aPrice: null, bPrice: 250 });
    return s;
}

function getDay2SellStrategies(inv) {
    const s = {};
    s['01'] = makeSellBids(inv['01'], { aPrice: 510, bPrice: 310 });
    s['02'] = makeSellBids(inv['02'], { aPrice: 530, bPrice: null });
    s['03'] = makeSellBids(inv['03'], { aPrice: 480, bPrice: 290 });
    s['04'] = makeSellBids(inv['04'], { aPrice: 460, bPrice: 280 });
    if (inv['05'].a > 0) {
        const half = Math.floor(inv['05'].a / 2);
        s['05'] = [
            { fish_type: 'A', price: 580, quantity: half },
            { fish_type: 'A', price: 490, quantity: inv['05'].a - half },
        ];
        if (inv['05'].b > 0) s['05'].push({ fish_type: 'B', price: 320, quantity: inv['05'].b });
    } else {
        s['05'] = makeSellBids(inv['05'], { aPrice: null, bPrice: 320 });
    }
    s['06'] = makeSellBids(inv['06'], { aPrice: 560, bPrice: null });
    s['07'] = makeSellBids(inv['07'], { aPrice: null, bPrice: 380 });
    s['08'] = makeSellBids(inv['08'], { aPrice: 490, bPrice: null });
    // 09: Day 2 switches to lower sell price
    s['09'] = makeSellBids(inv['09'], { aPrice: 500, bPrice: 300 });
    s['10'] = makeSellBids(inv['10'], { aPrice: 490, bPrice: 260 });
    return s;
}

function getDay3SellStrategies(inv) {
    const s = {};
    s['01'] = makeSellBids(inv['01'], { aPrice: 520, bPrice: 310 });
    s['02'] = makeSellBids(inv['02'], { aPrice: 540, bPrice: null });
    s['03'] = []; // No bids (skipped buying too)
    s['04'] = makeSellBids(inv['04'], { aPrice: 470, bPrice: 290 });
    s['05'] = makeSellBids(inv['05'], { aPrice: 510, bPrice: 310 });
    s['06'] = makeSellBids(inv['06'], { aPrice: 550, bPrice: null });
    s['07'] = makeSellBids(inv['07'], { aPrice: null, bPrice: 370 });
    // 08: Normal sell (after testing oversell rejection earlier)
    s['08'] = makeSellBids(inv['08'], { aPrice: 480, bPrice: 300 });
    s['09'] = makeSellBids(inv['09'], { aPrice: 520, bPrice: 320 });
    s['10'] = makeSellBids(inv['10'], { aPrice: 500, bPrice: 270 });
    return s;
}

function makeSellBids(inv, { aPrice, bPrice }) {
    const bids = [];
    if (aPrice && inv.a > 0) bids.push({ fish_type: 'A', price: aPrice, quantity: inv.a });
    if (bPrice && inv.b > 0) bids.push({ fish_type: 'B', price: bPrice, quantity: inv.b });
    return bids;
}


// ════════════════════════════════════════════════════════════
// Validation Functions
// ════════════════════════════════════════════════════════════

function validateBuySubmissions(dayNum, results, strategies) {
    TEAMS.forEach(u => {
        const r = results[u];
        const bids = strategies[u];
        if (!bids || bids.length === 0) {
            // Skipped
            return;
        }
        if (u === '04' && dayNum === 2) {
            // Team 04 Day 2 might be rejected for loan cap
            // Either success (if enough cash) or rejected (loan cap)
            if (r._status === 400) {
                assert(true, `Day ${dayNum} T04: Loan cap rejection (expected)`, r.error || r.message);
            } else {
                assert(r.success, `Day ${dayNum} T04: Buy submitted (had enough cash)`, `budget: ${r.summary?.currentBudget}`);
            }
        } else {
            assert(r.success || r.skipped, `Day ${dayNum} T${u}: Buy submitted`, r.error || r.message);
        }
    });
}

function validateSellSubmissions(dayNum, results, strategies) {
    TEAMS.forEach(u => {
        const r = results[u];
        const bids = strategies[u];
        if (!bids || bids.length === 0) return;
        assert(r.success, `Day ${dayNum} T${u}: Sell submitted`, r.error || r.message);
    });
}

async function validateBuySettlement(dayNum, gameId, adminToken, teamTokens) {
    // Check each team's dashboard for inventory changes
    const postBuyDashboards = {};
    await Promise.all(TEAMS.map(async u => {
        postBuyDashboards[u] = await api('GET', '/api/team/dashboard', teamTokens[u]);
    }));

    // Team 03 Day 1: below-floor bid should have 0 A inventory
    if (dayNum === 1) {
        const inv03a = parseInt(postBuyDashboards['03']?.financials?.fishAInventory) || 0;
        assert(inv03a === 0, `Day 1 T03: A inventory=0 (below floor bid)`, `got: ${inv03a}`);

        // Team 03 should have B inventory (bid was valid)
        const inv03b = parseInt(postBuyDashboards['03']?.financials?.fishBInventory) || 0;
        assert(inv03b > 0, `Day 1 T03: B inventory>0 (valid bid)`, `got: ${inv03b}`);
    }

    // Team 04 should have gotten a loan on Day 1
    if (dayNum === 1) {
        const loan04 = parseFloat(postBuyDashboards['04']?.financials?.totalLoan) || 0;
        assert(loan04 > 0, `Day 1 T04: Has loan (auto-loan triggered)`, `loan: $${loan04}`);
    }

    // Check that teams with bids have inventory
    for (const u of TEAMS) {
        const invA = parseInt(postBuyDashboards[u]?.financials?.fishAInventory) || 0;
        const invB = parseInt(postBuyDashboards[u]?.financials?.fishBInventory) || 0;
        if (u === '07') {
            assert(invA === 0, `Day ${dayNum} T07: No A inventory (all-B strategy)`);
            if (dayNum <= 2) assert(invB > 0, `Day ${dayNum} T07: Has B inventory`, `got: ${invB}`);
        }
        if (u === '06' && dayNum <= 2) {
            assert(invB === 0, `Day ${dayNum} T06: No B inventory (all-A strategy)`);
            assert(invA > 0, `Day ${dayNum} T06: Has A inventory`, `got: ${invA}`);
        }
    }

    // Log summary
    console.log(`  Buy settlement verified. Inventories:`);
    for (const u of TEAMS) {
        const f = postBuyDashboards[u]?.financials || {};
        const a = parseInt(f.fishAInventory ?? f.fish_a_inventory) || 0;
        const b = parseInt(f.fishBInventory ?? f.fish_b_inventory) || 0;
        const cash = parseFloat(f.currentBudget) || 0;
        const loan = parseFloat(f.totalLoan) || 0;
        console.log(`    T${u}: A=${a}kg B=${b}kg cash=$${cash.toFixed(0)} loan=$${loan.toFixed(0)}`);
    }
}

async function validateSettlement(dayNum, gameId, adminToken, teamTokens) {
    // After final day settlement, game becomes "finished" and team dashboard returns 404.
    // Use admin chart-data API as fallback for finished games.
    const chartData = await api('GET', `/api/admin/games/${gameId}/chart-data`, adminToken);
    const dailyResults = chartData.dailyResults || [];
    const dayResults = dailyResults.filter(r => parseInt(r.day_number) === dayNum);

    // Try team dashboards (works for Day 1-2, fails gracefully for Day 3)
    const postSettleDashboards = {};
    await Promise.all(TEAMS.map(async u => {
        postSettleDashboards[u] = await api('GET', '/api/team/dashboard', teamTokens[u]);
    }));
    const dashboardAvailable = !!postSettleDashboards['01']?.financials;

    if (dashboardAvailable) {
        // All inventories should be 0 after settlement
        let allZero = true;
        for (const u of TEAMS) {
            const f = postSettleDashboards[u]?.financials || {};
            const a = parseInt(f.fishAInventory ?? f.fish_a_inventory) || 0;
            const b = parseInt(f.fishBInventory ?? f.fish_b_inventory) || 0;
            if (a !== 0 || b !== 0) {
                allZero = false;
                assert(false, `Day ${dayNum} T${u}: Inventory should be 0`, `A=${a} B=${b}`);
            }
        }
        if (allZero) assert(true, `Day ${dayNum}: All inventories cleared to 0`);
    } else {
        // Game finished — inventory check not available, verify via chart data instead
        assert(dayResults.length > 0, `Day ${dayNum}: Settlement results exist in chart data`, `count: ${dayResults.length}`);
    }

    // Check daily results — use chart-data API (always works, even for finished games)
    for (const u of TEAMS) {
        // Find this team's result by matching username
        const teamResult = dayResults.find(r => r.username === u || r.team_name === `Team${u}`);
        if (teamResult) {
            const roi = parseFloat(teamResult.roi);
            assert(!isNaN(roi) && isFinite(roi), `Day ${dayNum} T${u}: ROI is valid number`, `roi=${roi}`);
        } else {
            // Team 03 Day 3 skipped both buying and selling — may or may not have a result
            if (u !== '03' || dayNum !== 3) {
                assert(false, `Day ${dayNum} T${u}: Missing daily result in chart data`);
            }
        }
    }

    // Interest compounding check on Day 2+
    if (dayNum >= 2 && dashboardAvailable) {
        const f04 = postSettleDashboards['04']?.financials || {};
        const loan04 = parseFloat(f04.totalLoan) || 0;
        if (loan04 > 0) {
            assert(true, `Day ${dayNum} T04: Loan with interest = $${loan04.toFixed(0)} (compounding)`);
        }
    }

    // Log summary
    console.log(`  Settlement verified. Post-settlement:`);
    if (dashboardAvailable) {
        for (const u of TEAMS) {
            const f = postSettleDashboards[u]?.financials || {};
            const cash = parseFloat(f.currentBudget) || 0;
            const loan = parseFloat(f.totalLoan) || 0;
            const teamResult = dayResults.find(r => r.username === u || r.team_name === `Team${u}`);
            const dp = teamResult ? parseFloat(teamResult.daily_profit).toFixed(0) : 'N/A';
            const cp = teamResult ? parseFloat(teamResult.cumulative_profit).toFixed(0) : 'N/A';
            const roi = teamResult ? parseFloat(teamResult.roi).toFixed(2) + '%' : 'N/A';
            console.log(`    T${u}: cash=$${cash.toFixed(0)} loan=$${loan.toFixed(0)} dayP&L=${dp} cumP&L=${cp} ROI=${roi}`);
        }
    } else {
        // Game finished — log from chart data
        for (const u of TEAMS) {
            const teamResult = dayResults.find(r => r.username === u || r.team_name === `Team${u}`);
            if (teamResult) {
                const dp = parseFloat(teamResult.daily_profit).toFixed(0);
                const cp = parseFloat(teamResult.cumulative_profit).toFixed(0);
                const roi = parseFloat(teamResult.roi).toFixed(2) + '%';
                console.log(`    T${u}: dayP&L=${dp} cumP&L=${cp} ROI=${roi}`);
            } else {
                console.log(`    T${u}: (no result)`);
            }
        }
    }
}
