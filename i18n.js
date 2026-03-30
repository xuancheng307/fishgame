// i18n.js — Bilingual (EN/中) support for Fish Market Game
// Pure display layer: only changes text content, never touches game logic.
(function () {
    var en = {
        // ===== simple-team.html =====
        'st.title': 'Fish Market Game',
        'st.instructions': 'Instructions',
        'st.logout': 'Logout',
        'st.join.title': 'Join Game',
        'st.join.desc': 'Enter your team name and join the current game',
        'st.join.btn': 'Join Game',
        'st.status.title': 'Game Status',
        'st.finance.title': 'My Finances',
        'st.buy.title': 'Buy Bids',
        'st.sell.title': 'Sell Bids',
        'st.fishA': 'Grade A Fish',
        'st.fishB': 'Grade B Fish',
        'st.bid1': 'Bid 1',
        'st.bid2': 'Bid 2',
        'st.btn.buy': 'Submit Buy Bids',
        'st.btn.sell': 'Submit Sell Bids',
        'st.results.title': 'Daily Results',
        'st.results.empty': 'No settlement data yet',
        // Dynamic labels
        'st.label.game': 'Game',
        'st.label.day': 'Current Day',
        'st.label.phase': 'Phase',
        'st.label.cash': 'Cash',
        'st.label.loan': 'Loan',
        'st.label.invA': 'Grade A Inventory',
        'st.label.invB': 'Grade B Inventory',
        'st.dayN': 'Day {n}',
        // Phase names
        'st.phase.pending': 'Waiting',
        'st.phase.buying_open': 'Buying Phase',
        'st.phase.buying_closed': 'Buy Settled',
        'st.phase.selling_open': 'Selling Phase',
        'st.phase.selling_closed': 'Sell Settled',
        'st.phase.settled': 'Daily Settlement Done',
        // Market / inventory info
        'st.supply': 'Supply: Grade A <b>{a} kg</b>, Grade B <b>{b} kg</b>',
        'st.budget': 'Restaurant Budget: A <b>${a}</b>, B <b>${b}</b>',
        'st.yourCash': 'Your Cash: <b>${a}</b>',
        'st.inventory': 'Your Inventory: Grade A <b>{a} kg</b>, Grade B <b>{b} kg</b>',
        // Table headers
        'st.th.day': 'Day',
        'st.th.revenue': 'Revenue',
        'st.th.cost': 'Cost',
        'st.th.unsold': 'Unsold Fee',
        'st.th.interest': 'Interest',
        'st.th.daily': 'Daily P/L',
        'st.th.cum': 'Cum. P/L',
        'st.th.roi': 'ROI',
        // Placeholders
        'st.ph.price': 'Price',
        'st.ph.qty': 'Quantity (kg)',
        'st.ph.priceOpt': 'Price (optional)',
        'st.ph.teamName': 'Team name (optional)',
        // Bid history
        'st.bids.title': 'Bid History',
        'st.bids.buy': 'Buy Bids',
        'st.bids.sell': 'Sell Bids',
        'st.bids.fish': 'Fish',
        'st.bids.price': 'Price',
        'st.bids.qty': 'Qty',
        'st.bids.filled': 'Filled',
        'st.bids.status': 'Status',
        // Leaderboard
        'st.leaderboard.title': 'Leaderboard',
        'st.lb.team': 'Team',
        'st.lb.profit': 'Profit',
        // Change password
        'st.changepw.btn': 'Password',
        'st.changepw.title': 'Change Password',
        'st.changepw.ph': 'Enter new password',
        'st.changepw.ph2': 'Confirm new password',
        'st.changepw.cancel': 'Cancel',
        'st.changepw.submit': 'Confirm',

        // ===== login.html =====
        'login.title': 'Fish Market Game',
        'login.username': 'Username',
        'login.password': 'Password',
        'login.btn': 'Login',
        'login.ph.user': 'Username (01-12 or admin)',
        'login.ph.pass': 'Enter password',
        'login.hint': '<strong>Test accounts:</strong><br>Student: 01, 02, ... 10<br>Password: same as username (01/01, 02/02)<br><br>Admin: admin<br>Admin password: admin',

        // ===== game-instructions.html =====
        'gi.hero.title': 'Fish Market Game',
        'gi.hero.sub': 'Play as a fish wholesaler \u2014 buy low, sell high, earn the best ROI!',
        'gi.tldr': 'Buy fish from boats at <strong>low prices</strong>, sell to restaurants at <strong>high prices</strong>. After 7 days, the team with the <strong>highest ROI wins</strong>.',
        'gi.role.title': 'Your Role',
        'gi.role.desc': 'You are a <strong>fish wholesaler (middleman)</strong>. Every day you do two things:',
        'gi.role.am.title': 'Morning: Buy from boats',
        'gi.role.am.desc': 'Higher bids get filled first, but cost more. Market has Grade A (premium) and Grade B (standard) fish.',
        'gi.role.pm.title': 'Afternoon: Sell to restaurants',
        'gi.role.pm.desc': 'Lower asks get filled first, but selling too cheap means less profit. Restaurants have limited budgets; unsold fish incurs disposal fees.',
        'gi.flow.title': 'Daily Flow (6 Steps)',
        'gi.flow.1.t': 'Teacher announces market conditions',
        'gi.flow.1.d': "Today's fish supply and restaurant budgets",
        'gi.flow.2.t': 'Buy bidding (~7 min)',
        'gi.flow.2.d': 'Enter fish type, price, quantity, then submit your bid',
        'gi.flow.3.t': 'System settles buys',
        'gi.flow.3.d': 'Highest bidders fill first; when supply runs out, remaining bids fail',
        'gi.flow.4.t': 'Sell bidding (~4 min)',
        'gi.flow.4.d': 'Enter your selling price and quantity, then submit',
        'gi.flow.5.t': 'System settles sells',
        'gi.flow.5.d': 'Lowest asks fill first; when restaurant budget runs out, remaining asks fail',
        'gi.flow.6.t': 'Daily settlement',
        'gi.flow.6.d': 'Calculate profit, deduct interest & unsold fees, update leaderboard',
        'gi.ex.title': 'Simple Example',
        'gi.ex.desc': '3 teams trading the same batch of fish \u2014 follow the numbers:',
        'gi.ex.buy.title': 'Morning Buy \u2014 highest bidder fills first (supply: 200kg)',
        'gi.ex.th.team': 'Team',
        'gi.ex.th.bid': 'Bid',
        'gi.ex.th.want': 'Want',
        'gi.ex.th.result': 'Result',
        'gi.ex.buy.you': 'You',
        'gi.ex.buy.r1': 'Got 100kg, spent $20,000',
        'gi.ex.buy.r2': 'Got 100kg, spent $15,000',
        'gi.ex.buy.r3': 'Supply exhausted, got 0kg',
        'gi.ex.sell.title': 'Afternoon Sell \u2014 lowest ask fills first (budget: $60,000)',
        'gi.ex.th.ask': 'Ask',
        'gi.ex.sell.r1': 'All sold, earned $30,000 (lowest price first)',
        'gi.ex.sell.r2': 'Only sold 75kg (budget left: $30,000)',
        'gi.ex.sell.detail': 'You sold 75kg for $30,000, remaining 25kg unsold \u2192 disposal fee 25 \u00d7 $10 = $250',
        'gi.ex.sell.profit': '<strong>Today\'s profit = $30,000 \u2212 $20,000 \u2212 $250 = <span style="color:#15803d">+$9,750</span></strong>',
        'gi.sell.warn': '<strong>Two major selling risks:</strong><br>\u2460 <strong>Budget exhausted</strong> \u2014 restaurants stop buying once budget runs out; higher-priced sellers may fail<br>\u2461 <strong>Highest-price forced unsold</strong> \u2014 the highest-priced seller has 2.5% quantity automatically marked unsold, even if budget remains',
        'gi.rules.title': 'Key Rules',
        'gi.rules.loan.t': 'Not enough cash? Auto loan',
        'gi.rules.loan.d': 'When bid exceeds cash, system auto-lends. Max = 50% of initial capital.',
        'gi.rules.int.t': 'Loans have interest',
        'gi.rules.int.d': 'Daily rate 3%. Borrow $100,000 \u2192 owe $3,000 more next day. Compounds!',
        'gi.rules.carry.t': "Fish doesn't keep overnight",
        'gi.rules.carry.d': 'Inventory resets to zero daily. Unsold fish costs $10/kg disposal fee.',
        'gi.rules.high.t': 'Highest price is risky',
        'gi.rules.high.d': 'When selling, highest-priced seller has 2.5% forced unsold (latest bidders deducted first).',
        'gi.rules.tip': '<strong>Bidding tip:</strong> You can submit 2 different prices per fish type (4 bids total) to spread risk. E.g., Grade A: $200 \u00d7 80kg + $250 \u00d7 40kg.',
        'gi.roi.title': 'How to Win?',
        'gi.roi.desc': 'At game end, the team with the <strong>highest ROI (Return on Investment) wins</strong>:',
        'gi.roi.formula': 'ROI = Cumulative Profit \u00f7 (Initial Capital + Loan Principal) \u00d7 100%',
        'gi.roi.daily': 'Daily Profit = Sales Revenue \u2212 Purchase Cost \u2212 Unsold Fees \u2212 Loan Interest',
        'gi.roi.warn': '<strong>Note:</strong> The more you borrow, the larger the denominator, making ROI harder to increase. Loans are not free!',

        // ===== index.html =====
        'idx.login.btn': 'Go to Login',
        'idx.howto.title': 'How to Play?',
        'idx.howto.1.t': 'Log in with your account',
        'idx.howto.1.d': 'Username = your team number (01\u201312), default password = username',
        'idx.howto.2.t': 'Join the game',
        'idx.howto.2.d': 'Click "Join Game" to enter the teacher\'s game session; you can set a team name',
        'idx.howto.3.t': 'Wait for bidding to open',
        'idx.howto.3.d': 'A countdown timer appears on screen; fill in price and quantity before time runs out',
        'idx.howto.4.t': 'View results',
        'idx.howto.4.d': 'After each phase, you can see trade results and current rankings',
        'idx.ready': 'Ready?',
        'idx.login.start': 'Login to Start Playing',

        // ===== admin.html — static =====
        'ad.title': 'Fish Market Game - Admin Console',
        'ad.subtitle': 'Game management and monitoring',
        'ad.btn.resetPw': 'Reset All Passwords',
        'ad.btn.logout': 'Logout',
        'ad.tab.intro': 'Game Instructions',
        'ad.tab.create': 'Create Game',
        'ad.tab.control': 'Game Control',
        'ad.tab.bids': 'Bid Results',
        'ad.tab.stats': 'Daily Stats',
        'ad.tab.charts': 'Charts',
        'ad.tab.history': 'Game History',
        'ad.tab.qr': 'QR Code',
        'ad.intro.title': 'Game Instructions',
        // Create game form
        'ad.create.title': 'Create New Game',
        'ad.create.gameName': 'Game Name',
        'ad.create.ph.gameName': 'Enter game name',
        'ad.create.totalDays': 'Total Days',
        'ad.create.numTeams': 'Number of Teams',
        'ad.create.initBudget': 'Initial Budget ($)',
        'ad.create.loanRate': 'Daily Loan Interest Rate (%)',
        'ad.create.unsoldFee': 'Unsold Fee ($/kg)',
        'ad.create.targetA': 'Grade A Target Price ($)',
        'ad.create.targetB': 'Grade B Target Price ($)',
        'ad.create.unsoldRatio': 'Fixed Unsold Ratio',
        'ad.create.buyDur': 'Buy Phase Duration (min)',
        'ad.create.sellDur': 'Sell Phase Duration (min)',
        'ad.create.randomness': 'Enable Daily Randomness',
        'ad.create.randomHint': 'When enabled, daily supply and restaurant budgets will fluctuate randomly',
        'ad.create.settlement': 'Revenue Settlement Mode',
        'ad.create.settleEnd': 'End of Game (default)',
        'ad.create.settleDaily': 'Daily Settlement',
        'ad.create.settleHint': 'End of Game: sell revenue is held until game ends. Daily: sell revenue returns to cash pool immediately.',
        'ad.create.submit': 'Create Game',
        // Game control panel
        'ad.ctrl.title': 'Game Control Panel',
        'ad.gc.title': 'Game Control',
        'ad.gc.gameId': 'Game ID',
        'ad.gc.status': 'Game Status',
        'ad.gc.phase': 'Current Phase',
        'ad.gc.progress': 'Progress',
        'ad.gc.teams': 'Teams Joined',
        'ad.gc.initBudget': 'Initial Budget',
        'ad.gc.loanRate': 'Loan Daily Rate',
        'ad.gc.unsoldFee': 'Unsold Fee',
        'ad.gc.unsoldRatio': 'Fixed Unsold %',
        'ad.gc.ops': 'Game Operations',
        'ad.gc.marketParams': 'Market Parameters',
        'ad.gc.dayN': 'Day',
        'ad.gc.dayUnit': '',
        'ad.gc.supplyA': 'Grade A Supply',
        'ad.gc.supplyB': 'Grade B Supply',
        'ad.gc.budgetA': 'Grade A Restaurant Budget',
        'ad.gc.budgetB': 'Grade B Restaurant Budget',
        'ad.gc.teamOverview': 'Team Overview',
        'ad.gc.th.team': 'Team',
        'ad.gc.th.cash': 'Current Cash',
        'ad.gc.th.loan': 'Total Loan',
        'ad.gc.th.invA': 'Grade A Inv.',
        'ad.gc.th.invB': 'Grade B Inv.',
        'ad.gc.th.cumProfit': 'Cum. Profit',
        'ad.gc.gameEnded': 'Game has ended',
        'ad.gc.btn.startBuy': '\uD83D\uDED2 Start Buy Bidding',
        'ad.gc.btn.closeBuy': '\u23F9 Close Buy Bidding',
        'ad.gc.btn.startSell': '\uD83D\uDCB0 Start Sell Bidding',
        'ad.gc.btn.reopenBuy': '\uD83D\uDD04 Reopen Buy Bidding',
        'ad.gc.btn.closeSell': '\u23F9 Close Sell Bidding',
        'ad.gc.btn.settle': '\uD83D\uDCCA Run Daily Settlement',
        'ad.gc.btn.reopenSell': '\uD83D\uDD04 Reopen Sell Bidding',
        'ad.gc.btn.advance': '\u27A1\uFE0F Advance to Next Day',
        'ad.gc.allDone': '\uD83C\uDF89 All days completed! You can end the game.',
        'ad.gc.btn.forceEnd': '\u26A0\uFE0F Force End Game',
        // No active game
        'ad.noGame.title': 'No active game found',
        'ad.noGame.desc': 'Please create a new game first.',
        'ad.noGame.btn': 'Go to Create Game',
        // Game creation result
        'ad.created.title': '\u2705 Game Created Successfully!',
        'ad.created.id': 'Game ID:',
        'ad.created.name': 'Game Name:',
        'ad.created.link': 'Game Link:',
        'ad.created.ip': 'Server IP:',
        'ad.created.ctrl': '\uD83C\uDFAE Control This Game',
        'ad.created.copy': '\uD83D\uDCCB Copy Game Link',
        // Bidding results
        'ad.bids.title': 'Bid Results',
        'ad.bids.selDay': 'Select Day',
        'ad.bids.phDay': 'Choose a day',
        'ad.bids.selType': 'Bid Type',
        'ad.bids.typeAll': 'All Bids',
        'ad.bids.typeBuy': 'Buy Bids',
        'ad.bids.typeSell': 'Sell Bids',
        'ad.bids.query': 'Query Results',
        'ad.bids.empty': 'Select a day to view bid results',
        // Daily stats
        'ad.stats.title': 'Daily Statistics',
        'ad.stats.selDay': 'Select Day',
        'ad.stats.phDay': 'Choose a day',
        'ad.stats.query': 'View Stats',
        'ad.stats.empty': 'Select a day to view daily stats',
        'ad.ds.noData': 'No statistics for this day yet',
        'ad.ds.dayN': 'Day',
        'ad.ds.dayUnit': '',
        'ad.ds.report': 'Daily Statistics Report',
        'ad.ds.params': 'Market Parameters:',
        'ad.ds.supplyA': 'Grade A Supply:',
        'ad.ds.supplyB': 'Grade B Supply:',
        'ad.ds.budgetA': 'Grade A Rest. Budget:',
        'ad.ds.budgetB': 'Grade B Rest. Budget:',
        'ad.ds.th.rank': 'Rank',
        'ad.ds.th.team': 'Team',
        'ad.ds.th.openCash': 'Opening Cash',
        'ad.ds.th.closeCash': 'Closing Cash',
        'ad.ds.th.cost': 'Buy Cost',
        'ad.ds.th.revenue': 'Sell Revenue',
        'ad.ds.th.unsold': 'Unsold Fee',
        'ad.ds.th.interest': 'Interest',
        'ad.ds.th.dailyPL': 'Daily P/L',
        'ad.ds.th.cumPL': 'Cum. P/L',
        'ad.ds.summary': 'Market Summary',
        'ad.ds.totalRevenue': 'Total Revenue',
        'ad.ds.totalCost': 'Total Cost',
        'ad.ds.totalPL': 'Market Total P/L',
        'ad.ds.teamCount': 'Teams',
        // Charts
        'ad.chart.title': '\uD83D\uDCC9 Charts',
        'ad.chart.hint': 'Requires settled game data to display charts',
        'ad.chart.roi': '\uD83D\uDCC8 ROI Trend',
        'ad.chart.roiHint': 'Teaching Q: Whose strategy is most stable? Where did the lead change?',
        'ad.chart.pl': '\uD83D\uDCB0 P/L Structure',
        'ad.chart.plHint': 'Teaching Q: Where did the money go? Why the loss?',
        'ad.chart.selDay': 'Select Day:',
        'ad.chart.spread': '\uD83D\uDD04 Buy/Sell Spread Analysis',
        'ad.chart.spreadHint': 'Teaching Q: Overpaid? Undersold? Spread = Gross Margin',
        'ad.chart.day': 'Day:',
        'ad.chart.fish': 'Fish:',
        'ad.chart.fishAll': 'All',
        'ad.chart.fishA': 'Grade A',
        'ad.chart.fishB': 'Grade B',
        'ad.chart.market': '\u2694\uFE0F Market Competition',
        'ad.chart.marketHint': 'Teaching Q: How competitive is the market? How many got nothing?',
        // Game history
        'ad.hist.title': 'Game History',
        'ad.hist.reload': '\uD83D\uDD04 Reload',
        'ad.hist.export': '\uD83D\uDCE4 Export Data',
        'ad.loading': 'Loading...',
        'ad.hist.empty': 'No game records yet',
        'ad.hist.th.id': 'Game ID',
        'ad.hist.th.name': 'Game Name',
        'ad.hist.th.status': 'Status',
        'ad.hist.th.progress': 'Progress',
        'ad.hist.th.teams': 'Teams',
        'ad.hist.th.created': 'Created',
        'ad.hist.th.actions': 'Actions',
        'ad.hist.details': 'View Details',
        'ad.hist.control': 'Control Game',
        // QR Code
        'ad.qr.title': '\uD83D\uDCF1 Student Login QR Code',
        'ad.qr.ipLabel': 'Server IP Address:',
        'ad.qr.detecting': 'Detecting...',
        'ad.qr.urlLabel': 'Student Login URL:',
        'ad.qr.refresh': '\uD83D\uDD04 Refresh',
        'ad.qr.download': '\uD83D\uDCE5 Download QR Code',
        'ad.qr.instructions': '<strong>Instructions:</strong><br>1. Students scan the QR code above with their phone<br>2. The login page opens automatically<br>3. Enter username and password to join the game',

        // ===== game-history.html =====
        'gh.close': '\u2190 Close',
        'gh.title': '\uD83D\uDCCA Game History',
        'gh.subtitle': 'View all completed and in-progress games',
        'gh.filter.status': 'Game Status',
        'gh.filter.allStatus': 'All',
        'gh.filter.active': 'In Progress',
        'gh.filter.finished': 'Finished',
        'gh.filter.name': 'Game Name',
        'gh.filter.phName': 'Search game name',
        'gh.filter.dateRange': 'Date Range',
        'gh.filter.dateTo': 'To',
        'gh.filter.search': '\uD83D\uDD0D Search',
        'gh.filter.clear': 'Clear',
        'gh.loading': 'Loading game history...',
        'gh.noData.title': '\uD83D\uDCDD No game records',
        'gh.noData.desc': 'No games yet. Start your first game!',
        'gh.card.id': 'Game ID:',
        'gh.card.teams': 'Teams:',
        'gh.card.totalDays': 'Total Days:',
        'gh.card.curDay': 'Current Day:',
        'gh.card.startDate': 'Start Date:',
        'gh.card.endDate': 'End Date:',
        'gh.card.ranking': '\uD83C\uDFC6 Final Ranking (Top 3)',
        'gh.card.noRank': 'No ranking data',
        'gh.page.prev': '\u00AB Previous',
        'gh.page.next': 'Next \u00BB'
    };

    var lang = localStorage.getItem('i18n_lang') || 'zh';
    var originals = new WeakMap();
    var _applying = false;
    var _lastApply = 0;
    var _debounce;

    function apply() {
        _applying = true;

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            // Backup original on first encounter
            if (!originals.has(el)) originals.set(el, el.innerHTML);

            if (lang === 'en' && en[key]) {
                var val = en[key];
                // Replace {name} with data-val-name attribute
                val = val.replace(/\{(\w+)\}/g, function (_, name) {
                    return el.getAttribute('data-val-' + name) || '';
                });
                // Replace ${name} with data-val-name attribute (for currency)
                val = val.replace(/\$\{(\w+)\}/g, function (_, name) {
                    return '$' + (el.getAttribute('data-val-' + name) || '');
                });
                el.innerHTML = val;
            } else if (lang === 'zh') {
                var orig = originals.get(el);
                if (orig !== undefined) el.innerHTML = orig;
            }
        });

        // Placeholders
        document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-ph');
            if (!el.hasAttribute('data-orig-ph')) {
                el.setAttribute('data-orig-ph', el.placeholder);
            }
            if (lang === 'en' && en[key]) {
                el.placeholder = en[key];
            } else if (lang === 'zh') {
                el.placeholder = el.getAttribute('data-orig-ph') || '';
            }
        });

        // Update toggle button text
        var btn = document.getElementById('langToggle');
        if (btn) btn.textContent = (lang === 'zh') ? 'EN' : '\u4e2d';

        _applying = false;
        _lastApply = Date.now();
    }

    function toggle() {
        lang = (lang === 'zh') ? 'en' : 'zh';
        localStorage.setItem('i18n_lang', lang);
        apply();
    }

    // MutationObserver for dynamic content (with loop guard)
    var ob = new MutationObserver(function () {
        if (_applying || lang === 'zh') return;
        if (Date.now() - _lastApply < 300) return;
        clearTimeout(_debounce);
        _debounce = setTimeout(apply, 120);
    });

    document.addEventListener('DOMContentLoaded', function () {
        ob.observe(document.body, { childList: true, subtree: true });
        apply();
    });

    // Public API
    window.toggleLang = toggle;
    window.applyI18n = apply;
})();
