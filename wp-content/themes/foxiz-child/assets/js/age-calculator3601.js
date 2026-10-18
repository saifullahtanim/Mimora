(function () {
    'use strict';

    /* ============================================================
     * Zodiac data
     * ============================================================ */
    var ZODIAC = [
        { name: 'Capricorn',   glyph: '♑', start: { m: 12, d: 22 }, end: { m: 1,  d: 19 }, element: 'earth', planet: 'Saturn',  dateRange: 'Dec 22 – Jan 19' },
        { name: 'Aquarius',    glyph: '♒', start: { m: 1,  d: 20 }, end: { m: 2,  d: 18 }, element: 'air',   planet: 'Uranus',  dateRange: 'Jan 20 – Feb 18' },
        { name: 'Pisces',      glyph: '♓', start: { m: 2,  d: 19 }, end: { m: 3,  d: 20 }, element: 'water', planet: 'Neptune', dateRange: 'Feb 19 – Mar 20' },
        { name: 'Aries',       glyph: '♈', start: { m: 3,  d: 21 }, end: { m: 4,  d: 19 }, element: 'fire',  planet: 'Mars',    dateRange: 'Mar 21 – Apr 19' },
        { name: 'Taurus',      glyph: '♉', start: { m: 4,  d: 20 }, end: { m: 5,  d: 20 }, element: 'earth', planet: 'Venus',   dateRange: 'Apr 20 – May 20' },
        { name: 'Gemini',      glyph: '♊', start: { m: 5,  d: 21 }, end: { m: 6,  d: 20 }, element: 'air',   planet: 'Mercury', dateRange: 'May 21 – Jun 20' },
        { name: 'Cancer',      glyph: '♋', start: { m: 6,  d: 21 }, end: { m: 7,  d: 22 }, element: 'water', planet: 'Moon',    dateRange: 'Jun 21 – Jul 22' },
        { name: 'Leo',         glyph: '♌', start: { m: 7,  d: 23 }, end: { m: 8,  d: 22 }, element: 'fire',  planet: 'Sun',     dateRange: 'Jul 23 – Aug 22' },
        { name: 'Virgo',       glyph: '♍', start: { m: 8,  d: 23 }, end: { m: 9,  d: 22 }, element: 'earth', planet: 'Mercury', dateRange: 'Aug 23 – Sep 22' },
        { name: 'Libra',       glyph: '♎', start: { m: 9,  d: 23 }, end: { m: 10, d: 22 }, element: 'air',   planet: 'Venus',   dateRange: 'Sep 23 – Oct 22' },
        { name: 'Scorpio',     glyph: '♏', start: { m: 10, d: 23 }, end: { m: 11, d: 21 }, element: 'water', planet: 'Pluto',   dateRange: 'Oct 23 – Nov 21' },
        { name: 'Sagittarius', glyph: '♐', start: { m: 11, d: 22 }, end: { m: 12, d: 21 }, element: 'fire',  planet: 'Jupiter', dateRange: 'Nov 22 – Dec 21' }
    ];

    /* Constellation dot maps in 0..100 viewBox.
       Approximate, recognisable shapes — not astronomical accuracy. */
    var CONSTELLATIONS = {
        'Capricorn':   { points: [{x:20,y:40},{x:35,y:25},{x:55,y:35},{x:75,y:55},{x:60,y:75}], lines: [[0,1],[1,2],[2,3],[3,4]] },
        'Aquarius':    { points: [{x:15,y:50},{x:30,y:35},{x:45,y:50},{x:60,y:35},{x:75,y:50},{x:85,y:65}], lines: [[0,1],[1,2],[2,3],[3,4],[4,5]] },
        'Pisces':      { points: [{x:20,y:30},{x:35,y:45},{x:50,y:55},{x:65,y:45},{x:80,y:30},{x:50,y:80}], lines: [[0,1],[1,2],[2,3],[3,4],[2,5]] },
        'Aries':       { points: [{x:15,y:60},{x:35,y:45},{x:60,y:55},{x:80,y:35}], lines: [[0,1],[1,2],[2,3]] },
        'Taurus':      { points: [{x:20,y:30},{x:35,y:50},{x:55,y:35},{x:75,y:30},{x:45,y:75}], lines: [[0,1],[1,2],[2,3],[1,4]] },
        'Gemini':      { points: [{x:25,y:20},{x:30,y:55},{x:35,y:85},{x:60,y:25},{x:65,y:60},{x:70,y:90}], lines: [[0,1],[1,2],[3,4],[4,5],[1,4]] },
        'Cancer':      { points: [{x:30,y:30},{x:50,y:55},{x:70,y:30},{x:50,y:80}], lines: [[0,1],[1,2],[1,3]] },
        'Leo':         { points: [{x:20,y:40},{x:30,y:25},{x:45,y:25},{x:55,y:40},{x:75,y:60},{x:65,y:75}], lines: [[0,1],[1,2],[2,3],[3,4],[4,5]] },
        'Virgo':       { points: [{x:15,y:30},{x:30,y:55},{x:50,y:30},{x:65,y:55},{x:80,y:30}], lines: [[0,1],[1,2],[2,3],[3,4]] },
        'Libra':       { points: [{x:25,y:55},{x:50,y:30},{x:75,y:55},{x:50,y:80}], lines: [[0,1],[1,2],[0,2],[1,3]] },
        'Scorpio':     { points: [{x:20,y:20},{x:30,y:40},{x:45,y:55},{x:60,y:65},{x:75,y:60},{x:80,y:45}], lines: [[0,1],[1,2],[2,3],[3,4],[4,5]] },
        'Sagittarius': { points: [{x:20,y:55},{x:40,y:35},{x:55,y:50},{x:70,y:35},{x:80,y:55},{x:35,y:75}], lines: [[0,1],[1,2],[2,3],[3,4],[2,5]] }
    };

    var ELEMENT_GRADIENTS = {
        fire:  { from: '#ff7e3d', to: '#ff4d6d' },
        earth: { from: '#5a8a4b', to: '#84a05f' },
        air:   { from: '#7c3aed', to: '#3ba9ee' },
        water: { from: '#0d9488', to: '#3b82f6' }
    };

    var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    /* ============================================================
     * Pure helpers
     * ============================================================ */
    function isLeapYear(y) {
        return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    }

    function daysInMonth(year, monthZeroBased) {
        return new Date(year, monthZeroBased + 1, 0).getDate();
    }

    function diffYMD(dob, asOf) {
        var y = asOf.getFullYear() - dob.getFullYear();
        var m = asOf.getMonth()    - dob.getMonth();
        var d = asOf.getDate()     - dob.getDate();
        if (d < 0) {
            // borrow from the month that just ended (relative to asOf)
            var borrowMonth = asOf.getMonth() - 1;
            var borrowYear  = asOf.getFullYear();
            if (borrowMonth < 0) { borrowMonth = 11; borrowYear--; }
            d += daysInMonth(borrowYear, borrowMonth);
            m--;
        }
        if (m < 0) { m += 12; y--; }
        return { years: y, months: m, days: d };
    }

    function findZodiac(dob) {
        var month = dob.getMonth() + 1;
        var day   = dob.getDate();
        for (var i = 0; i < ZODIAC.length; i++) {
            var z = ZODIAC[i];
            // wrap-around case (Capricorn: Dec 22 – Jan 19)
            if (z.start.m > z.end.m) {
                if ((month === z.start.m && day >= z.start.d) ||
                    (month === z.end.m   && day <= z.end.d)) {
                    return z;
                }
            } else {
                if ((month === z.start.m && day >= z.start.d) ||
                    (month === z.end.m   && day <= z.end.d) ||
                    (month >  z.start.m  && month < z.end.m)) {
                    return z;
                }
            }
        }
        return ZODIAC[0];
    }

    function nextBirthday(dob, asOf) {
        var year = asOf.getFullYear();
        var bday = bdayForYear(dob, year);
        if (bday.getTime() < asOf.getTime()) {
            bday = bdayForYear(dob, year + 1);
        }
        var msPerDay = 1000 * 60 * 60 * 24;
        // strip times so the diff counts whole calendar days
        var a = new Date(asOf.getFullYear(),  asOf.getMonth(),  asOf.getDate());
        var b = new Date(bday.getFullYear(),  bday.getMonth(),  bday.getDate());
        var days = Math.round((b.getTime() - a.getTime()) / msPerDay);
        return { date: bday, days: days };
    }

    function bdayForYear(dob, year) {
        // Feb 29 → Feb 28 in non-leap years
        if (dob.getMonth() === 1 && dob.getDate() === 29 && !isLeapYear(year)) {
            return new Date(year, 1, 28);
        }
        return new Date(year, dob.getMonth(), dob.getDate());
    }

    function formatInt(n) {
        try { return n.toLocaleString(); } catch (e) { return String(n); }
    }

    function reducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /* ============================================================
     * Count-up animation
     * ============================================================ */
    var _animRaf = null;

    function animateNumbers(targets, els) {
        if (_animRaf) { cancelAnimationFrame(_animRaf); _animRaf = null; }

        if (reducedMotion()) {
            els.years.textContent  = targets.years;
            els.months.textContent = targets.months;
            els.days.textContent   = targets.days;
            return;
        }

        var duration = 1200;
        var start = performance.now();
        function step(now) {
            var t = Math.min(1, (now - start) / duration);
            var e = 1 - Math.pow(1 - t, 3);
            els.years.textContent  = Math.round(targets.years  * e);
            els.months.textContent = Math.round(targets.months * e);
            els.days.textContent   = Math.round(targets.days   * e);
            if (t < 1) {
                _animRaf = requestAnimationFrame(step);
            } else {
                _animRaf = null;
            }
        }
        _animRaf = requestAnimationFrame(step);
    }

    /* ============================================================
     * Constellation SVG render
     * ============================================================ */
    function renderConstellation(svgEl, signName) {
        var data = CONSTELLATIONS[signName];
        while (svgEl.firstChild) { svgEl.removeChild(svgEl.firstChild); }
        if (!data) return;

        var NS = 'http://www.w3.org/2000/svg';
        var i;

        for (i = 0; i < data.lines.length; i++) {
            var pair = data.lines[i];
            var p1 = data.points[pair[0]];
            var p2 = data.points[pair[1]];
            var line = document.createElementNS(NS, 'line');
            line.setAttribute('x1', p1.x);
            line.setAttribute('y1', p1.y);
            line.setAttribute('x2', p2.x);
            line.setAttribute('y2', p2.y);
            line.setAttribute('class', 'age-calculator-constellation-line');
            svgEl.appendChild(line);
        }

        for (i = 0; i < data.points.length; i++) {
            var p = data.points[i];
            var c = document.createElementNS(NS, 'circle');
            c.setAttribute('cx', p.x);
            c.setAttribute('cy', p.y);
            c.setAttribute('r', '0.9');
            c.setAttribute('class', 'age-calculator-constellation-dot');
            svgEl.appendChild(c);
        }
    }

    var MONTHS_LONG = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

    /* Custom dropdown component for the three DOB selectors.
       Builds a styled trigger + scrollable popup list inside `host`.
       Pure DOM, no library. Returns { getValue, setValue }. */
    function buildCustomDropdown(host, opts) {
        host.innerHTML = '';
        host.classList.add('age-calculator-dd');
        host.tabIndex = 0;
        host.setAttribute('role', 'button');
        host.setAttribute('aria-haspopup', 'listbox');
        host.setAttribute('aria-expanded', 'false');
        if (opts.ariaLabel) host.setAttribute('aria-label', opts.ariaLabel);

        var display = document.createElement('span');
        display.className = 'age-calculator-dd-display age-calculator-dd-display-placeholder';
        display.textContent = opts.placeholder || '';

        var chevron = document.createElement('span');
        chevron.className = 'age-calculator-dd-chevron';
        chevron.setAttribute('aria-hidden', 'true');

        var list = document.createElement('ul');
        list.className = 'age-calculator-dd-list';
        list.setAttribute('role', 'listbox');

        var currentValue = null;

        function setValue(val) {
            currentValue = val;
            var found = false;
            for (var i = 0; i < opts.items.length; i++) {
                if (opts.items[i].value === val) {
                    display.textContent = opts.items[i].label;
                    display.classList.remove('age-calculator-dd-display-placeholder');
                    found = true;
                    break;
                }
            }
            if (!found) {
                display.textContent = opts.placeholder || '';
                display.classList.add('age-calculator-dd-display-placeholder');
                currentValue = null;
            }
            var items = list.querySelectorAll('.age-calculator-dd-item');
            for (var j = 0; j < items.length; j++) {
                var sel = String(items[j].dataset.value) === String(val);
                items[j].classList.toggle('is-selected', sel);
                items[j].setAttribute('aria-selected', sel ? 'true' : 'false');
            }
        }

        function open() {
            host.classList.add('is-open');
            host.setAttribute('aria-expanded', 'true');
            var sel = list.querySelector('.is-selected');
            if (sel && sel.scrollIntoView) {
                try { sel.scrollIntoView({ block: 'nearest' }); } catch (_) {}
            }
        }
        function close() {
            host.classList.remove('is-open');
            host.setAttribute('aria-expanded', 'false');
        }
        function toggle() {
            if (host.classList.contains('is-open')) close(); else open();
        }

        for (var k = 0; k < opts.items.length; k++) {
            (function (item) {
                var li = document.createElement('li');
                li.className = 'age-calculator-dd-item';
                li.setAttribute('role', 'option');
                li.dataset.value = String(item.value);
                li.textContent = item.label;
                li.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    setValue(item.value);
                    close();
                    if (opts.onChange) opts.onChange(item.value);
                });
                list.appendChild(li);
            })(opts.items[k]);
        }

        host.appendChild(display);
        host.appendChild(chevron);
        host.appendChild(list);

        host.addEventListener('click', function (e) {
            e.stopPropagation();
            toggle();
        });

        document.addEventListener('mousedown', function (e) {
            if (!host.contains(e.target)) close();
        });

        host.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close();
            else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });

        return {
            getValue: function () { return currentValue; },
            setValue: setValue
        };
    }


    /* ============================================================
     * Confetti (only if today is the user's birthday)
     * ============================================================ */
    function fireConfetti(host) {
        if (reducedMotion()) return;
        var pieces = [];
        for (var i = 0; i < 30; i++) {
            var piece = document.createElement('span');
            piece.className = 'age-calculator-confetti-piece';
            piece.style.left = (Math.random() * 100) + '%';
            piece.style.background = 'hsl(' + Math.floor(Math.random() * 360) + ', 85%, 60%)';
            piece.style.animationDuration = (1000 + Math.random() * 600) + 'ms';
            piece.style.animationDelay = (Math.random() * 250) + 'ms';
            host.appendChild(piece);
            pieces.push(piece);
        }
        setTimeout(function () {
            for (var j = 0; j < pieces.length; j++) {
                if (pieces[j].parentNode) pieces[j].parentNode.removeChild(pieces[j]);
            }
        }, 2200);
    }

    /* ============================================================
     * Canvas card render (1080 × 1350)
     * ============================================================ */
    function renderCard(state) {
        var W = 1080;
        var H = 1350;
        var canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        var ctx = canvas.getContext('2d');

        var grad = ELEMENT_GRADIENTS[state.zodiac.element];
        var lg = ctx.createLinearGradient(0, 0, W, H);
        lg.addColorStop(0, grad.from);
        lg.addColorStop(1, grad.to);
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, W, H);

        // Constellation up top
        var cdata = CONSTELLATIONS[state.zodiac.name];
        if (cdata) {
            var cw = W * 0.72;
            var ch = H * 0.32;
            var ox = (W - cw) / 2;
            var oy = H * 0.07;
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            for (var i = 0; i < cdata.lines.length; i++) {
                var pa = cdata.points[cdata.lines[i][0]];
                var pb = cdata.points[cdata.lines[i][1]];
                ctx.beginPath();
                ctx.moveTo(ox + (pa.x / 100) * cw, oy + (pa.y / 100) * ch);
                ctx.lineTo(ox + (pb.x / 100) * cw, oy + (pb.y / 100) * ch);
                ctx.stroke();
            }
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(255,255,255,0.85)';
            ctx.shadowBlur = 14;
            for (var j = 0; j < cdata.points.length; j++) {
                var pt = cdata.points[j];
                ctx.beginPath();
                ctx.arc(ox + (pt.x / 100) * cw, oy + (pt.y / 100) * ch, 7, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // Glyph
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = '150px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 4;
        ctx.fillText(state.zodiac.glyph, W / 2, H * 0.54);
        ctx.restore();

        // Sign name (with letter-spacing by joining with thin spaces)
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 84px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var spaced = state.zodiac.name.toUpperCase().split('').join('  ');
        ctx.fillText(spaced, W / 2, H * 0.69);
        ctx.restore();

        // Age line
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 56px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var ageLine = state.age.years + ' YEARS  ·  ' + state.age.months + ' MONTHS  ·  ' + state.age.days + ' DAYS';
        ctx.fillText(ageLine, W / 2, H * 0.78);
        ctx.restore();

        // Element + ruling planet
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '500 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var sub = 'BORN UNDER ' + state.zodiac.element.toUpperCase() + '  ·  RULED BY ' + state.zodiac.planet.toUpperCase();
        ctx.fillText(sub, W / 2, H * 0.84);
        ctx.restore();

        // Footer wordmark
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '400 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('how7o.com/age-calculator', W / 2, H * 0.93);
        ctx.restore();

        return canvas;
    }

    function downloadCard(state) {
        var canvas = renderCard(state);
        canvas.toBlob(function (blob) {
            if (!blob) return;
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'age-' + state.zodiac.name.toLowerCase() + '-' + state.dob.getFullYear() + '.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }, 'image/png');
    }

    /* ============================================================
     * Main
     * ============================================================ */
    function init() {
        var dobMonthHost = document.getElementById('age-calculator-dob-month');
        var dobDayHost   = document.getElementById('age-calculator-dob-day');
        var dobYearHost  = document.getElementById('age-calculator-dob-year');
        var asofInput    = document.getElementById('age-calculator-asof');
        if (!dobMonthHost || !dobDayHost || !dobYearHost || !asofInput) return;

        var els = {
            years:   document.getElementById('age-calculator-years'),
            months:  document.getElementById('age-calculator-months'),
            days:    document.getElementById('age-calculator-days'),
            error:   document.getElementById('age-calculator-error'),
            zodiac:  document.getElementById('age-calculator-zodiac'),
            zglyph:  document.getElementById('age-calculator-zodiac-glyph'),
            zname:   document.getElementById('age-calculator-zodiac-name'),
            zmeta:   document.getElementById('age-calculator-zodiac-meta'),
            zsvg:    document.getElementById('age-calculator-zodiac-constellation'),
            sMonths: document.getElementById('age-calculator-stat-months'),
            sWeeks:  document.getElementById('age-calculator-stat-weeks'),
            sDays:   document.getElementById('age-calculator-stat-days'),
            sHours:  document.getElementById('age-calculator-stat-hours'),
            sMin:    document.getElementById('age-calculator-stat-minutes'),
            sSec:    document.getElementById('age-calculator-stat-seconds'),
            footnote:document.getElementById('age-calculator-footnote'),
            download:document.getElementById('age-calculator-download'),
            card:    document.querySelector('.age-calculator-tool-card')
        };

        var today = new Date();
        var todayStr = today.toISOString().slice(0, 10);
        asofInput.value = todayStr;

        // Build the three custom DOB dropdowns
        var monthItems = [];
        for (var mi = 0; mi < 12; mi++) monthItems.push({ value: mi, label: MONTHS_LONG[mi] });
        var dayItems = [];
        for (var di = 1; di <= 31; di++) dayItems.push({ value: di, label: String(di) });
        var yearItems = [];
        for (var yi = today.getFullYear(); yi >= 1900; yi--) yearItems.push({ value: yi, label: String(yi) });

        var monthDD = buildCustomDropdown(dobMonthHost, {
            items: monthItems, placeholder: 'Month',
            ariaLabel: 'Birth month',
            onChange: function () { calc(); }
        });
        var dayDD = buildCustomDropdown(dobDayHost, {
            items: dayItems, placeholder: 'Day',
            ariaLabel: 'Birth day',
            onChange: function () { calc(); }
        });
        var yearDD = buildCustomDropdown(dobYearHost, {
            items: yearItems, placeholder: 'Year',
            ariaLabel: 'Birth year',
            onChange: function () { calc(); }
        });

        // "As of" date — flatpickr calendar popup with a human-readable
        // display ("May 11, 2026") backed by an ISO value the calc reads.
        if (typeof window.flatpickr === 'function') {
            window.flatpickr(asofInput, {
                dateFormat: 'Y-m-d',
                altInput: true,
                altFormat: 'F j, Y',
                altInputClass: 'age-calculator-input-date flatpickr-input',
                defaultDate: todayStr,
                minDate: '1900-01-01',
                allowInput: true,
                disableMobile: true,
                onChange: function () { calc(); }
            });
        } else {
            asofInput.addEventListener('input', calc);
        }

        var lastState = null;
        var confettiFired = false;

        function setError(msg) {
            els.error.textContent = msg || '';
        }

        function getDob() {
            var m = monthDD.getValue();
            var d = dayDD.getValue();
            var y = yearDD.getValue();
            if (m === null || d === null || y === null) return null;
            var date = new Date(y, m, d);
            if (date.getMonth() !== m || date.getDate() !== d || date.getFullYear() !== y) {
                return null;
            }
            return date;
        }

        function calc() {
            setError('');
            var dob = getDob();
            if (!dob) {
                els.download.disabled = true;
                lastState = null;
                return;
            }
            var asofStr = asofInput.value || todayStr;
            var asof = new Date(asofStr + 'T00:00:00');

            if (isNaN(asof.getTime())) {
                setError('Please enter a valid "as of" date.');
                els.download.disabled = true;
                lastState = null;
                return;
            }
            if (dob.getTime() > asof.getTime()) {
                setError("That birthdate is after the 'as of' date — looks like you haven't been born yet 🙂");
                els.download.disabled = true;
                lastState = null;
                return;
            }

            var ymd = diffYMD(dob, asof);
            var msTotal = asof.getTime() - dob.getTime();
            var totalSec   = Math.floor(msTotal / 1000);
            var totalMin   = Math.floor(totalSec / 60);
            var totalHr    = Math.floor(totalMin / 60);
            var totalDay   = Math.floor(totalHr  / 24);
            var totalWeek  = Math.floor(totalDay / 7);
            var totalMonth = ymd.years * 12 + ymd.months;

            var zodiac = findZodiac(dob);
            var nb = nextBirthday(dob, asof);
            var bornWeekday = WEEKDAYS[dob.getDay()];
            var bdayWeekday = WEEKDAYS[nb.date.getDay()];

            lastState = { dob: dob, asof: asof, age: ymd, zodiac: zodiac };

            animateNumbers(ymd, { years: els.years, months: els.months, days: els.days });

            els.zglyph.textContent = zodiac.glyph;
            els.zname.textContent  = zodiac.name.toUpperCase();
            els.zmeta.textContent  = zodiac.element.toUpperCase() + ' · Ruled by ' + zodiac.planet + ' · ' + zodiac.dateRange;
            els.zodiac.dataset.element = zodiac.element;
            renderConstellation(els.zsvg, zodiac.name);

            els.sMonths.textContent = formatInt(totalMonth);
            els.sWeeks.textContent  = formatInt(totalWeek);
            els.sDays.textContent   = formatInt(totalDay);
            els.sHours.textContent  = formatInt(totalHr);
            els.sMin.textContent    = formatInt(totalMin);
            els.sSec.textContent    = formatInt(totalSec);

            var bdayPart;
            if (nb.days === 0) {
                bdayPart = 'Happy birthday! 🎉';
            } else {
                bdayPart = 'Next birthday in ' + formatInt(nb.days) + ' day' + (nb.days === 1 ? '' : 's') + ' (a ' + bdayWeekday + ')';
            }
            els.footnote.textContent = 'Born on a ' + bornWeekday + '  ·  ' + bdayPart;

            var grad = ELEMENT_GRADIENTS[zodiac.element];
            els.card.style.setProperty('--age-calculator-accent', grad.from);

            // Birthday confetti — only when the user's DOB matches today AND as-of is today
            var isBirthdayToday = (dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate() &&
                                   asof.getFullYear() === today.getFullYear() &&
                                   asof.getMonth() === today.getMonth() &&
                                   asof.getDate() === today.getDate());
            if (isBirthdayToday && !confettiFired) {
                confettiFired = true;
                fireConfetti(els.card);
            } else if (!isBirthdayToday) {
                confettiFired = false; // re-arm
            }

            els.download.disabled = false;
        }

        // (Dropdown changes already invoke calc() via their onChange callbacks.
        // Flatpickr on asofInput also wires its own onChange. If flatpickr
        // failed to load, the asofInput.addEventListener above handles it.)

        els.download.addEventListener('click', function () {
            if (lastState) downloadCard(lastState);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
