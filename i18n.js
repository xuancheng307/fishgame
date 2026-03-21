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
        'st.bids.title': 'Today\'s Bids',
        'st.bids.buy': 'Buy Bids',
        'st.bids.sell': 'Sell Bids',
        'st.bids.fish': 'Fish',
        'st.bids.price': 'Price',
        'st.bids.qty': 'Qty',
        'st.bids.filled': 'Filled',
        'st.bids.status': 'Status',

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
        'idx.login.start': 'Login to Start Playing'
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
