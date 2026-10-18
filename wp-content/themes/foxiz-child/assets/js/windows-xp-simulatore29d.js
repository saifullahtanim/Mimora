/* Windows XP Simulator
 *
 * Self-contained client-side simulator. No vendor dependencies.
 *
 * Module layout:
 *   1. Constants + helpers
 *   2. Audio cues
 *   3. Window Manager
 *   4. Apps registry
 *   5. App implementations:
 *        Notepad, Calculator, Paint, Internet Explorer, My Computer,
 *        Minesweeper, Solitaire, Generic info dialog
 *   6. Start menu + taskbar + clock
 *   7. Boot sequence + lifecycle (launch / exit)
 *   8. Wiring (icons, keyboard, context menus)
 */
(function () {
    'use strict';

    var overlay = document.getElementById('xpsimOverlay');
    if (!overlay) return;

    // ============================================================
    // 1. Constants and helpers
    // ============================================================
    var TASKBAR_H = 34;
    var WINDOW_OFFSET_STEP = 26;

    var $  = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

    function el(tag, props, children) {
        var node = document.createElement(tag);
        if (props) {
            for (var k in props) {
                if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
                if (k === 'class') node.className = props[k];
                else if (k === 'html') node.innerHTML = props[k];
                else if (k === 'text') node.textContent = props[k];
                else if (k === 'on') {
                    for (var ev in props[k]) node.addEventListener(ev, props[k][ev]);
                } else if (k === 'style') {
                    for (var s in props[k]) node.style[s] = props[k][s];
                } else if (k === 'data') {
                    for (var d in props[k]) node.dataset[d] = props[k][d];
                } else node.setAttribute(k, props[k]);
            }
        }
        if (children) {
            (Array.isArray(children) ? children : [children]).forEach(function (c) {
                if (c == null) return;
                node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
            });
        }
        return node;
    }

    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

    function iconClass(name) { return 'xpsim-icon-img xpsim-icon-' + name; }

    // ============================================================
    // 2. Audio cues — synthesized via Web Audio API (no external assets)
    // ============================================================
    var audioCtx = null;
    function getAudio() {
        if (audioCtx) return audioCtx;
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try { audioCtx = new Ctor(); } catch (e) { audioCtx = null; }
        return audioCtx;
    }
    function tone(freq, duration, type, gain) {
        var ctx = getAudio();
        if (!ctx) return;
        var osc = ctx.createOscillator();
        var amp = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        amp.gain.setValueAtTime(0, ctx.currentTime);
        amp.gain.linearRampToValueAtTime(gain || 0.18, ctx.currentTime + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(amp).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.05);
    }
    function playStartupChime() {
        // 4-note descending arpeggio reminiscent of XP startup cue
        var notes = [
            { f: 659.25, t: 0,    d: 0.34 }, // E5
            { f: 523.25, t: 0.18, d: 0.36 }, // C5
            { f: 392.00, t: 0.36, d: 0.40 }, // G4
            { f: 587.33, t: 0.54, d: 0.55 }  // D5
        ];
        var ctx = getAudio();
        if (!ctx) return;
        notes.forEach(function (n) {
            setTimeout(function () { tone(n.f, n.d, 'sine', 0.12); }, n.t * 1000);
        });
    }
    function playErrorDing() {
        tone(880, 0.08, 'square', 0.1);
        setTimeout(function () { tone(660, 0.18, 'square', 0.1); }, 90);
    }

    // ============================================================
    // 3. Window Manager
    // ============================================================
    var winHost      = $('#xpsimWindows');
    var taskbarTasks = $('#xpsimTaskbarTasks');

    var windows = {};   // id -> { id, el, taskEl, app, minimized, maximized, restore }
    var topZ    = 100;
    var nextWinId = 1;
    var openCount = 0;

    function bringToFront(id) {
        var w = windows[id];
        if (!w) return;
        topZ += 1;
        w.el.style.zIndex = topZ;
        Object.keys(windows).forEach(function (k) {
            windows[k].el.classList.toggle('is-inactive', k !== id);
            if (windows[k].taskEl) windows[k].taskEl.classList.toggle('is-active', k !== id ? false : true);
        });
        w.el.classList.remove('is-inactive');
        if (w.minimized) restoreWindow(id);
    }

    function makeWindow(opts) {
        // opts: { title, iconName, width, height, app: { mount(body, win), borderless? } }
        var id = 'win' + (nextWinId++);
        var borderless = !!(opts.app && opts.app.borderless);

        var winEl = el('div', {
            class: 'xpsim-window' + (borderless ? ' xpsim-window-borderless' : ''),
            'data-id': id
        });
        var initialW = opts.width || 480;
        var initialH = opts.height || 360;
        var hostBox = winHost.getBoundingClientRect();
        var maxX = Math.max(0, hostBox.width - initialW - 8);
        var maxY = Math.max(0, hostBox.height - initialH - 8);
        var x = clamp(40 + openCount * WINDOW_OFFSET_STEP, 0, maxX);
        var y = clamp(28 + openCount * WINDOW_OFFSET_STEP, 0, maxY);
        winEl.style.left   = x + 'px';
        winEl.style.top    = y + 'px';
        winEl.style.width  = initialW + 'px';
        winEl.style.height = initialH + 'px';
        openCount += 1;

        // Title bar (always built so taskbar/titleEl have a reference, but
        // not appended to the DOM in borderless mode)
        var iconSpan  = el('span', { class: 'xpsim-titlebar-icon ' + iconClass(opts.iconName || 'mycomputer') });
        var titleSpan = el('span', { class: 'xpsim-titlebar-title', text: opts.title || 'Window' });

        var btnMin = el('button', { class: 'xpsim-tb-btn xpsim-tb-min', type: 'button', 'aria-label': 'Minimize',
            html: '<svg viewBox="0 0 12 12"><line x1="2" y1="9" x2="10" y2="9"/></svg>' });
        var btnMax = el('button', { class: 'xpsim-tb-btn xpsim-tb-max', type: 'button', 'aria-label': 'Maximize',
            html: '<svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8"/></svg>' });
        var btnClose = el('button', { class: 'xpsim-tb-btn xpsim-tb-close', type: 'button', 'aria-label': 'Close',
            html: '<svg viewBox="0 0 12 12"><line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/></svg>' });

        var titleBtns = el('div', { class: 'xpsim-titlebar-buttons' }, [btnMin, btnMax, btnClose]);
        var titleBar  = el('div', { class: 'xpsim-titlebar' }, [iconSpan, titleSpan, titleBtns]);

        var body = el('div', { class: 'xpsim-window-body' });

        // Resize handles
        var handles = ['n','s','e','w','se','sw'].map(function (dir) {
            return el('div', { class: 'xpsim-resize xpsim-resize-' + dir, 'data-dir': dir });
        });

        if (!borderless) {
            winEl.appendChild(titleBar);
        }
        winEl.appendChild(body);
        if (!borderless) {
            handles.forEach(function (h) { winEl.appendChild(h); });
        }
        winHost.appendChild(winEl);

        var winObj = {
            id: id,
            el: winEl,
            titleEl: titleSpan,
            iconEl: iconSpan,
            title: opts.title || 'Window',
            iconName: opts.iconName || 'mycomputer',
            taskEl: null,
            app: opts.app,
            borderless: borderless,
            minimized: false,
            maximized: false,
            restore: { x: x, y: y, w: initialW, h: initialH }
        };
        windows[id] = winObj;

        // Drag — from the title bar normally, from the whole body in borderless mode
        // (mimics how Winamp lets you drag the player from anywhere on its skin).
        if (borderless) {
            setupDrag(body, winEl, winObj);
        } else {
            setupDrag(titleBar, winEl, winObj);
            handles.forEach(function (h) { setupResize(h, winEl, winObj); });
            btnMin.addEventListener('click', function (e) { e.stopPropagation(); minimizeWindow(id); });
            btnMax.addEventListener('click', function (e) { e.stopPropagation(); toggleMaximize(id); });
            btnClose.addEventListener('click', function (e) { e.stopPropagation(); closeWindow(id); });
            titleBar.addEventListener('dblclick', function () { toggleMaximize(id); });
        }

        winEl.addEventListener('mousedown', function () { bringToFront(id); });

        // Taskbar entry
        addTaskbarEntry(winObj);

        // Mount app — pass closeWindow handle so borderless apps can wire their own close button
        if (opts.app && typeof opts.app.mount === 'function') {
            opts.app.mount(body, winObj, function () { closeWindow(id); });
        }

        bringToFront(id);
        return winObj;
    }

    function setupDrag(handle, winEl, winObj) {
        var startX, startY, origX, origY;
        function onMove(e) {
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            var hostBox = winHost.getBoundingClientRect();
            var nx = clamp(origX + dx, -winEl.offsetWidth + 80, hostBox.width - 60);
            var ny = clamp(origY + dy, 0, hostBox.height - 32);
            winEl.style.left = nx + 'px';
            winEl.style.top  = ny + 'px';
        }
        function onUp() {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
        }
        handle.addEventListener('mousedown', function (e) {
            if (winObj.maximized) return;
            if (e.target.closest('.xpsim-titlebar-buttons')) return;
            startX = e.clientX; startY = e.clientY;
            origX  = winEl.offsetLeft; origY = winEl.offsetTop;
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    function setupResize(handle, winEl, winObj) {
        var dir = handle.dataset.dir;
        var startX, startY, origX, origY, origW, origH;
        function onMove(e) {
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            var nx = origX, ny = origY, nw = origW, nh = origH;
            if (dir.indexOf('e') !== -1) { nw = Math.max(220, origW + dx); }
            if (dir.indexOf('w') !== -1) { nw = Math.max(220, origW - dx); nx = origX + (origW - nw); }
            if (dir.indexOf('s') !== -1) { nh = Math.max(140, origH + dy); }
            if (dir.indexOf('n') !== -1) { nh = Math.max(140, origH - dy); ny = origY + (origH - nh); }
            winEl.style.left = nx + 'px';
            winEl.style.top  = ny + 'px';
            winEl.style.width  = nw + 'px';
            winEl.style.height = nh + 'px';
        }
        function onUp() {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
        }
        handle.addEventListener('mousedown', function (e) {
            if (winObj.maximized) return;
            e.stopPropagation();
            startX = e.clientX; startY = e.clientY;
            origX  = winEl.offsetLeft; origY = winEl.offsetTop;
            origW  = winEl.offsetWidth; origH = winEl.offsetHeight;
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    function minimizeWindow(id) {
        var w = windows[id];
        if (!w) return;
        w.minimized = true;
        w.el.classList.add('is-minimized');
        if (w.taskEl) w.taskEl.classList.remove('is-active');
    }

    function restoreWindow(id) {
        var w = windows[id];
        if (!w) return;
        w.minimized = false;
        w.el.classList.remove('is-minimized');
    }

    function toggleMaximize(id) {
        var w = windows[id];
        if (!w) return;
        if (!w.maximized) {
            w.restore = {
                x: w.el.offsetLeft, y: w.el.offsetTop,
                w: w.el.offsetWidth, h: w.el.offsetHeight
            };
            w.el.classList.add('is-maximized');
            w.el.style.left = '0';
            w.el.style.top  = '0';
            w.el.style.width  = '100%';
            w.el.style.height = '100%';
            w.maximized = true;
        } else {
            w.el.classList.remove('is-maximized');
            w.el.style.left = w.restore.x + 'px';
            w.el.style.top  = w.restore.y + 'px';
            w.el.style.width  = w.restore.w + 'px';
            w.el.style.height = w.restore.h + 'px';
            w.maximized = false;
        }
    }

    function closeWindow(id) {
        var w = windows[id];
        if (!w) return;
        if (w.app && typeof w.app.unmount === 'function') {
            try { w.app.unmount(); } catch (e) {}
        }
        if (w.el && w.el.parentNode) w.el.parentNode.removeChild(w.el);
        if (w.taskEl && w.taskEl.parentNode) w.taskEl.parentNode.removeChild(w.taskEl);
        delete windows[id];
    }

    function addTaskbarEntry(winObj) {
        var taskIcon = el('span', { class: 'xpsim-icon-img xpsim-icon-' + winObj.iconName });
        var labelText = (winObj.titleEl && winObj.titleEl.textContent) || winObj.title || 'Window';
        var taskLabel = el('span', { class: 'xpsim-task-label', text: labelText });
        var task = el('button', { class: 'xpsim-task is-active', type: 'button' }, [taskIcon, taskLabel]);
        task.addEventListener('click', function () {
            if (windows[winObj.id].minimized) {
                restoreWindow(winObj.id);
                bringToFront(winObj.id);
            } else if (parseInt(winObj.el.style.zIndex, 10) === topZ) {
                minimizeWindow(winObj.id);
            } else {
                bringToFront(winObj.id);
            }
        });
        taskbarTasks.appendChild(task);
        winObj.taskEl = task;
    }

    function setWindowTitle(winObj, title) {
        winObj.titleEl.textContent = title;
        if (winObj.taskEl) {
            var label = winObj.taskEl.querySelector('.xpsim-task-label');
            if (label) label.textContent = title;
        }
    }

    // ============================================================
    // 4. Apps registry
    // ============================================================
    var APPS = {};

    function openApp(key) {
        var def = APPS[key];
        if (!def) {
            return openApp('comingsoon-' + key);
        }
        if (def.singleton) {
            // If there is already a window of this app, focus it
            for (var id in windows) {
                if (windows[id].app && windows[id].app._key === key) {
                    bringToFront(id);
                    return windows[id];
                }
            }
        }
        return makeWindow({
            title: def.title,
            iconName: def.iconName,
            width: def.width,
            height: def.height,
            app: def.factory(key)
        });
    }

    // Generic "feature coming soon" dialog so unimplemented Start-menu items
    // give useful feedback instead of doing nothing.
    function comingSoonApp(featureName) {
        return {
            _key: 'comingsoon-' + featureName,
            mount: function (body) {
                var msg = el('div', { class: 'xpsim-dialog-text' }, [
                    el('p', { html: '<strong>' + featureName.charAt(0).toUpperCase() + featureName.slice(1).replace(/-/g, ' ') + '</strong> is on the roadmap.' }),
                    el('p', { text: 'This is a Windows XP simulator running entirely in your browser. Built-in apps with full functionality include Notepad, Calculator, Paint, Internet Explorer, My Computer, Minesweeper, and Solitaire. Try one of those for now.' })
                ]);
                var iconEl = el('div', { class: 'xpsim-dialog-icon' });
                var inner = el('div', { class: 'xpsim-dialog-body' }, [iconEl, msg]);
                var ok = el('button', { class: 'xpsim-dialog-btn', type: 'button', text: 'OK' });
                ok.addEventListener('click', function () {
                    var winId = body.closest('.xpsim-window').dataset.id;
                    closeWindow(winId);
                });
                var actions = el('div', { class: 'xpsim-dialog-actions' }, [ok]);
                body.appendChild(el('div', { class: 'xpsim-dialog' }, [inner, actions]));
                playErrorDing();
            }
        };
    }

    APPS['__comingsoon__'] = { title: 'Information', iconName: 'help', width: 400, height: 200,
        factory: function (key) { return comingSoonApp(key.replace('comingsoon-', '')); } };

    // Forward unknown keys to the coming-soon dialog
    var origOpen = openApp;
    openApp = function (key) {
        if (APPS[key]) return origOpen(key);
        APPS['comingsoon-' + key] = APPS['__comingsoon__'];
        return origOpen('comingsoon-' + key);
    };

    // ============================================================
    // 5. App implementations
    // ============================================================

    // ---------- Notepad ----------
    APPS['notepad'] = {
        title: 'Untitled - Notepad',
        iconName: 'notepad',
        width: 520,
        height: 380,
        factory: function () {
            return {
                _key: 'notepad',
                mount: function (body, winObj) {
                    var menubar = el('div', { class: 'xpsim-menubar' }, [
                        el('button', { class: 'xpsim-menubar-item', type: 'button', text: 'File' }),
                        el('button', { class: 'xpsim-menubar-item', type: 'button', text: 'Edit' }),
                        el('button', { class: 'xpsim-menubar-item', type: 'button', text: 'Format' }),
                        el('button', { class: 'xpsim-menubar-item', type: 'button', text: 'View' }),
                        el('button', { class: 'xpsim-menubar-item', type: 'button', text: 'Help' })
                    ]);
                    var ta = el('textarea', { class: 'xpsim-notepad', spellcheck: 'false' });
                    body.appendChild(menubar);
                    body.appendChild(ta);
                    setTimeout(function () { ta.focus(); }, 50);
                    ta.addEventListener('input', function () {
                        var firstLine = ta.value.split('\n')[0].trim().slice(0, 40);
                        setWindowTitle(winObj, (firstLine || 'Untitled') + ' - Notepad');
                    });
                }
            };
        }
    };

    // ---------- Calculator ----------
    APPS['calculator'] = {
        title: 'Calculator',
        iconName: 'calculator',
        width: 230,
        height: 280,
        factory: function () {
            return {
                _key: 'calculator',
                mount: function (body) {
                    var display = el('div', { class: 'xpsim-calc-display', text: '0' });
                    var grid = el('div', { class: 'xpsim-calc-grid' });
                    body.appendChild(el('div', { class: 'xpsim-calc' }, [display, grid]));

                    var state = { current: '0', previous: null, op: null, justEvaluated: false };

                    function update() { display.textContent = state.current; }
                    function inputDigit(d) {
                        if (state.justEvaluated) { state.current = '0'; state.justEvaluated = false; }
                        if (state.current === '0' && d !== '.') state.current = '';
                        if (d === '.' && state.current.indexOf('.') !== -1) return;
                        state.current += d;
                        update();
                    }
                    function clearAll() {
                        state.current = '0'; state.previous = null; state.op = null; state.justEvaluated = false;
                        update();
                    }
                    function clearEntry() { state.current = '0'; update(); }
                    function backspace() {
                        if (state.justEvaluated) return;
                        state.current = state.current.slice(0, -1) || '0';
                        update();
                    }
                    function setOp(op) {
                        if (state.previous != null && state.op && !state.justEvaluated) evaluate();
                        state.previous = state.current;
                        state.op = op;
                        state.current = '0';
                        state.justEvaluated = false;
                    }
                    function evaluate() {
                        if (state.previous == null || !state.op) return;
                        var a = parseFloat(state.previous);
                        var b = parseFloat(state.current);
                        var r = 0;
                        switch (state.op) {
                            case '+': r = a + b; break;
                            case '-': r = a - b; break;
                            case '*': r = a * b; break;
                            case '/': r = b === 0 ? NaN : a / b; break;
                        }
                        state.current = isNaN(r) ? 'Error' : String(parseFloat(r.toPrecision(12)));
                        state.previous = null; state.op = null;
                        state.justEvaluated = true;
                        update();
                    }
                    function negate() {
                        if (state.current === '0' || state.current === 'Error') return;
                        state.current = state.current.charAt(0) === '-' ? state.current.slice(1) : '-' + state.current;
                        update();
                    }
                    function reciprocal() {
                        var v = parseFloat(state.current);
                        state.current = v === 0 ? 'Error' : String(parseFloat((1 / v).toPrecision(12)));
                        state.justEvaluated = true;
                        update();
                    }
                    function sqrtBtn() {
                        var v = parseFloat(state.current);
                        state.current = v < 0 ? 'Error' : String(parseFloat(Math.sqrt(v).toPrecision(12)));
                        state.justEvaluated = true;
                        update();
                    }
                    function percent() {
                        if (state.previous == null) return;
                        var a = parseFloat(state.previous);
                        var b = parseFloat(state.current);
                        state.current = String(a * b / 100);
                        update();
                    }

                    var rows = [
                        [{l:'MC',c:'std',a:function(){}}, {l:'7',c:'',a:function(){inputDigit('7');}}, {l:'8',c:'',a:function(){inputDigit('8');}}, {l:'9',c:'',a:function(){inputDigit('9');}}, {l:'/',c:'op',a:function(){setOp('/');}}],
                        [{l:'MR',c:'std',a:function(){}}, {l:'4',c:'',a:function(){inputDigit('4');}}, {l:'5',c:'',a:function(){inputDigit('5');}}, {l:'6',c:'',a:function(){inputDigit('6');}}, {l:'*',c:'op',a:function(){setOp('*');}}],
                        [{l:'MS',c:'std',a:function(){}}, {l:'1',c:'',a:function(){inputDigit('1');}}, {l:'2',c:'',a:function(){inputDigit('2');}}, {l:'3',c:'',a:function(){inputDigit('3');}}, {l:'-',c:'op',a:function(){setOp('-');}}],
                        [{l:'M+',c:'std',a:function(){}}, {l:'0',c:'',a:function(){inputDigit('0');}}, {l:'.',c:'',a:function(){inputDigit('.');}}, {l:'±',c:'',a:negate}, {l:'+',c:'op',a:function(){setOp('+');}}],
                        [{l:'CE',c:'clear',a:clearEntry}, {l:'C',c:'clear',a:clearAll}, {l:'⌫',c:'clear',a:backspace}, {l:'%',c:'',a:percent}, {l:'=',c:'eq',a:evaluate}],
                        [{l:'sqrt',c:'',a:sqrtBtn}, {l:'1/x',c:'',a:reciprocal}, {l:'',c:'invisible',a:function(){}}, {l:'',c:'invisible',a:function(){}}, null]
                    ];

                    rows.forEach(function (row) {
                        row.forEach(function (cell) {
                            if (cell == null) return;
                            if (cell.c === 'invisible') {
                                grid.appendChild(el('span'));
                                return;
                            }
                            var btn = el('button', { class: 'xpsim-calc-btn' + (cell.c ? ' xpsim-calc-btn--' + cell.c : ''), type: 'button', text: cell.l });
                            btn.addEventListener('click', cell.a);
                            grid.appendChild(btn);
                        });
                    });
                }
            };
        }
    };

    // ---------- Paint ----------
    APPS['paint'] = {
        title: 'untitled - Paint',
        iconName: 'paint',
        width: 640,
        height: 460,
        factory: function () {
            return {
                _key: 'paint',
                mount: function (body) {
                    var TOOLS = [
                        { id: 'pencil', label: '✎' },
                        { id: 'brush',  label: '🖌' },
                        { id: 'eraser', label: '⌫' },
                        { id: 'line',   label: '╱' },
                        { id: 'rect',   label: '▢' },
                        { id: 'oval',   label: '⬭' },
                        { id: 'fill',   label: '⛁' },
                        { id: 'pick',   label: '◉' }
                    ];
                    var COLORS = [
                        '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c',
                        '#00a2e8', '#3f48cc', '#a349a4', '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9'
                    ];

                    var paint = el('div', { class: 'xpsim-paint' });
                    var tools = el('div', { class: 'xpsim-paint-tools' });
                    var canvasWrap = el('div', { class: 'xpsim-paint-canvas-wrap' });
                    var palette = el('div', { class: 'xpsim-paint-palette' });

                    var rightSide = el('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', minWidth: '0' } }, [canvasWrap, palette]);
                    paint.appendChild(tools);
                    paint.appendChild(rightSide);
                    body.appendChild(paint);

                    var canvas = document.createElement('canvas');
                    canvas.className = 'xpsim-paint-canvas';
                    canvas.width = 600;
                    canvas.height = 360;
                    var ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    canvasWrap.appendChild(canvas);

                    var state = {
                        tool: 'pencil',
                        color: '#000000',
                        bg: '#ffffff',
                        size: 2,
                        drawing: false,
                        startX: 0, startY: 0,
                        snapshot: null
                    };

                    TOOLS.forEach(function (t) {
                        var btn = el('button', { class: 'xpsim-paint-tool' + (t.id === state.tool ? ' is-active' : ''),
                            type: 'button', title: t.id, text: t.label, 'data-tool': t.id });
                        btn.addEventListener('click', function () {
                            state.tool = t.id;
                            $$('.xpsim-paint-tool', tools).forEach(function (b) { b.classList.toggle('is-active', b.dataset.tool === t.id); });
                        });
                        tools.appendChild(btn);
                    });

                    COLORS.forEach(function (c) {
                        var sw = el('button', { class: 'xpsim-paint-swatch' + (c === state.color ? ' is-active' : ''),
                            type: 'button', style: { background: c }, title: c, 'data-color': c });
                        sw.addEventListener('click', function () {
                            state.color = c;
                            $$('.xpsim-paint-swatch', palette).forEach(function (b) { b.classList.toggle('is-active', b.dataset.color === c); });
                        });
                        palette.appendChild(sw);
                    });

                    function pos(e) {
                        var rect = canvas.getBoundingClientRect();
                        return { x: (e.clientX - rect.left) * (canvas.width / rect.width),
                                 y: (e.clientY - rect.top)  * (canvas.height / rect.height) };
                    }

                    function start(e) {
                        var p = pos(e);
                        state.drawing = true;
                        state.startX = p.x; state.startY = p.y;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.lineWidth = state.tool === 'brush' ? 6 : (state.tool === 'eraser' ? 16 : 2);
                        ctx.strokeStyle = state.tool === 'eraser' ? state.bg : state.color;
                        ctx.fillStyle = state.color;

                        if (state.tool === 'pencil' || state.tool === 'brush' || state.tool === 'eraser') {
                            ctx.beginPath();
                            ctx.moveTo(p.x, p.y);
                        } else if (state.tool === 'line' || state.tool === 'rect' || state.tool === 'oval') {
                            state.snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        } else if (state.tool === 'fill') {
                            floodFill(p.x | 0, p.y | 0);
                            state.drawing = false;
                        } else if (state.tool === 'pick') {
                            var d = ctx.getImageData(p.x | 0, p.y | 0, 1, 1).data;
                            var hex = '#' + ('0' + d[0].toString(16)).slice(-2) + ('0' + d[1].toString(16)).slice(-2) + ('0' + d[2].toString(16)).slice(-2);
                            state.color = hex;
                            state.drawing = false;
                        }
                    }

                    function move(e) {
                        if (!state.drawing) return;
                        var p = pos(e);
                        if (state.tool === 'pencil' || state.tool === 'brush' || state.tool === 'eraser') {
                            ctx.lineTo(p.x, p.y);
                            ctx.stroke();
                        } else if (state.tool === 'line') {
                            ctx.putImageData(state.snapshot, 0, 0);
                            ctx.beginPath();
                            ctx.moveTo(state.startX, state.startY);
                            ctx.lineTo(p.x, p.y);
                            ctx.stroke();
                        } else if (state.tool === 'rect') {
                            ctx.putImageData(state.snapshot, 0, 0);
                            ctx.strokeRect(Math.min(state.startX, p.x), Math.min(state.startY, p.y),
                                Math.abs(p.x - state.startX), Math.abs(p.y - state.startY));
                        } else if (state.tool === 'oval') {
                            ctx.putImageData(state.snapshot, 0, 0);
                            ctx.beginPath();
                            ctx.ellipse((state.startX + p.x) / 2, (state.startY + p.y) / 2,
                                Math.abs(p.x - state.startX) / 2, Math.abs(p.y - state.startY) / 2,
                                0, 0, Math.PI * 2);
                            ctx.stroke();
                        }
                    }

                    function stop() { state.drawing = false; state.snapshot = null; }

                    function floodFill(x, y) {
                        var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        var data = imgData.data;
                        var w = canvas.width, h = canvas.height;
                        var idx = (y * w + x) * 4;
                        var target = [data[idx], data[idx+1], data[idx+2], data[idx+3]];
                        var fill = hexToRgba(state.color);
                        if (target[0] === fill[0] && target[1] === fill[1] && target[2] === fill[2]) return;
                        var stack = [[x, y]];
                        while (stack.length) {
                            var pt = stack.pop();
                            var px = pt[0], py = pt[1];
                            if (px < 0 || py < 0 || px >= w || py >= h) continue;
                            var i = (py * w + px) * 4;
                            if (data[i] !== target[0] || data[i+1] !== target[1] || data[i+2] !== target[2]) continue;
                            data[i] = fill[0]; data[i+1] = fill[1]; data[i+2] = fill[2]; data[i+3] = 255;
                            stack.push([px+1,py]); stack.push([px-1,py]); stack.push([px,py+1]); stack.push([px,py-1]);
                        }
                        ctx.putImageData(imgData, 0, 0);
                    }

                    function hexToRgba(hex) {
                        var n = hex.replace('#', '');
                        return [parseInt(n.substring(0,2),16), parseInt(n.substring(2,4),16), parseInt(n.substring(4,6),16), 255];
                    }

                    canvas.addEventListener('mousedown', start);
                    canvas.addEventListener('mousemove', move);
                    canvas.addEventListener('mouseup', stop);
                    canvas.addEventListener('mouseleave', stop);
                }
            };
        }
    };

    // ---------- Internet Explorer ----------
    APPS['ie'] = {
        title: 'Internet Explorer - IE7',
        iconName: 'ie',
        width: 880,
        height: 580,
        factory: function () {
            // Real Google 2010 logo PNG — same one geekprank serves at /images/guglimage.jpg
            // CSS for search input + buttons matches the 2010 Google look:
            //   - input: flat sharp-cornered rectangle, thin gray border, subtle inset shadow
            //   - buttons: tight rounded corners, soft gray gradient, gray border
            var GOOGLE_HOME = ''+
                '<div style="text-align:center; padding:34px 0 24px; font:13px Arial,sans-serif;">'+
                '<img src="' + IMG_BASE + 'guglimage.jpg' + '" alt="Google" style="display:block;margin:0 auto;width:275px;height:auto;">'+
                '<div style="margin:22px auto 0; max-width:560px; display:flex; gap:18px; align-items:flex-start; justify-content:center; padding:0 16px;">'+
                '<input class="xpsim-google-search" type="text" style="flex:1;max-width:400px;padding:5px 6px;font:13px Arial;border:1px solid #999;border-radius:0;height:28px;background:#fff;box-shadow:inset 0 1px 2px rgba(0,0,0,0.16);box-sizing:border-box;">'+
                '<div style="font:11px Arial;text-align:left;line-height:1.6;flex-shrink:0;"><a href="#" style="color:#0033cc;text-decoration:underline;">Advanced Search</a><br><a href="#" style="color:#0033cc;text-decoration:underline;">Language Tools</a></div>'+
                '</div>'+
                '<div style="margin-top:12px;">'+
                '<button class="xpsim-google-btn" type="button" style="padding:4px 14px;margin:0 3px;font:13px Arial;color:#000;border:1px solid #888;border-radius:2px;background:linear-gradient(180deg,#f7f7f7 0%, #ddd 100%);cursor:pointer;box-shadow:0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 1px rgba(0,0,0,0.08);">Google Search</button>'+
                '<button class="xpsim-google-btn" type="button" style="padding:4px 14px;margin:0 3px;font:13px Arial;color:#000;border:1px solid #888;border-radius:2px;background:linear-gradient(180deg,#f7f7f7 0%, #ddd 100%);cursor:pointer;box-shadow:0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 1px rgba(0,0,0,0.08);">I&apos;m Feeling Lucky</button>'+
                '</div>'+
                '<div style="margin-top:8px; font:11px Arial; color:#000;">'+
                '<span style="margin-right:6px;">Search:</span>'+
                '<label style="margin-right:14px;"><input type="radio" name="srch" checked style="vertical-align:-2px; margin:0 4px 0 0; width:13px; height:13px; accent-color:#2873e2;"> the web</label>'+
                '<label><input type="radio" name="srch" style="vertical-align:-2px; margin:0 4px 0 0; width:13px; height:13px; accent-color:#2873e2;"> pages from the UK</label>'+
                '</div>'+
                '<div style="margin-top:30px;font:12px Arial;">'+
                '<a href="#" style="color:#0033cc;text-decoration:underline;">Advertising&nbsp;Programmes</a> &nbsp;-&nbsp; '+
                '<a href="#" style="color:#0033cc;text-decoration:underline;">Business&nbsp;Solutions</a> &nbsp;-&nbsp; '+
                '<a href="#" style="color:#0033cc;text-decoration:underline;">About&nbsp;Google</a> &nbsp;-&nbsp; '+
                '<a href="#" style="color:#0033cc;text-decoration:underline;">Go&nbsp;to&nbsp;Google.com</a>'+
                '</div>'+
                '<div style="margin-top:4px;font:12px Arial;color:#000;">&copy;2010 - <a href="#" style="color:#0033cc;text-decoration:underline;">Privacy</a></div>'+
                '</div>';

            var PAGES = {
                'google.com': { title: 'Google', html: GOOGLE_HOME },
                'http://www.google.com/': { title: 'Google', html: GOOGLE_HOME },
                'msn.com': {
                    title: 'MSN.com',
                    html: '<div style="padding:14px 18px;font:13px Times New Roman;">'+
                        '<h1 style="color:#003399;font:bold 24px Arial;margin:0 0 12px;">Welcome to MSN</h1>'+
                        '<h2 style="font:bold 16px Arial;color:#003399;margin:18px 0 8px;">Top Headlines</h2>'+
                        '<ul><li><a href="msn.com/news">Markets close mixed as analysts watch retail data</a></li>'+
                        '<li><a href="msn.com/news">New study links sleep schedule to productivity</a></li></ul>'+
                        '<h2 style="font:bold 16px Arial;color:#003399;margin:18px 0 8px;">Search the web</h2>'+
                        '<p><a href="google.com">Google</a> &middot; <a href="yahoo.com">Yahoo!</a> &middot; <a href="bing.com">Bing</a></p></div>'
                },
                'msn.com/news': {
                    title: 'MSN News',
                    html: '<div style="padding:14px 18px;font:13px Times New Roman;">'+
                        '<h1 style="font:bold 22px Arial;">MSN News</h1>'+
                        '<p>Markets close mixed as analysts watch retail data. Coverage continues.</p>'+
                        '<p><a href="msn.com">&laquo; Back to MSN</a></p></div>'
                },
                'yahoo.com': {
                    title: 'Yahoo!',
                    html: '<div style="text-align:center;padding:60px 0;"><div style="font:bold 72px Arial;color:#7B0099;">Yahoo!</div><div style="margin:24px auto;max-width:480px;"><input type="text" style="width:100%;padding:6px;font-size:13px;"></div><p><a href="msn.com">Back to MSN</a></p></div>'
                },
                'bing.com': {
                    title: 'Bing',
                    html: '<div style="text-align:center;padding:60px 0;"><div style="font:bold 56px Segoe UI,Arial;color:#008373;">bing</div><div style="margin:24px auto;max-width:520px;"><input type="text" style="width:100%;padding:6px;font-size:13px;"></div><p><a href="msn.com">Back to MSN</a></p></div>'
                }
            };

            return {
                _key: 'ie',
                mount: function (body, winObj) {
                    var ie = el('div', { class: 'xpsim-ie' });

                    // ----- IE-specific chrome (different toolbar from Explorer) -----
                    // File menu with windowslogo on the right
                    var fileMenu = el('ul', { class: 'xpsim-filemenu xpsim-ie-filemenu' }, [
                        el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'File' })]),
                        el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'Edit' })]),
                        el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'View' })]),
                        el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'Favorites' })]),
                        el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'Tools' })]),
                        el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'Help' })]),
                        el('li', { class: 'xpsim-filemenu-item xpsim-ie-windowslogo' }, [
                            el('img', { src: IMG_BASE + 'windowslogo.png', alt: '' })
                        ])
                    ]);
                    ie.appendChild(fileMenu);

                    // IE toolbar (12 buttons + 2 separators) — uses ie1.png … ie12.png
                    function ieBtn(src, title) {
                        var a = el('a', { href: '#', title: title });
                        a.appendChild(el('img', { src: IMG_BASE + src, alt: title }));
                        a.addEventListener('click', function (e) { e.preventDefault(); });
                        return a;
                    }
                    function ieSep() {
                        return el('img', { class: 'xpsim-toolbar-sep', src: IMG_BASE + 'ie-sep.png', alt: '' });
                    }
                    var btnBack    = ieBtn('ie1.html', 'Back');
                    var btnFwd     = ieBtn('ie2.html', 'Forward');
                    var btnStop    = ieBtn('ie3.html', 'Stop');
                    var btnRefresh = ieBtn('ie4.html', 'Refresh');
                    var btnHome    = ieBtn('ie5.html', 'Home');
                    var btnSearch  = ieBtn('ie6.html', 'Search');
                    var btnFav     = ieBtn('ie7.html', 'Favorites');
                    var btnMedia   = ieBtn('ie8.html', 'Media');
                    var btnHist    = ieBtn('ie9.html', 'History');
                    var btnMail    = ieBtn('ie10.html', 'Mail');
                    var btnPrint   = ieBtn('ie11.html', 'Print');
                    var btnEdit    = ieBtn('ie12.html', 'Edit');
                    var toolbar = el('div', { class: 'xpsim-explorer-toolbar xpsim-ie-toolbar' }, [
                        btnBack, btnFwd, btnStop, btnRefresh, btnHome, ieSep(),
                        btnSearch, btnFav, btnMedia, btnHist, ieSep(),
                        btnMail, btnPrint, btnEdit
                    ]);
                    ie.appendChild(toolbar);

                    // Address bar — uses ie-addressbar-ico.png + Links indicator on right
                    var addressInput = el('input', { type: 'text', value: 'google.com' });
                    var inputWrap = el('div', { class: 'xpsim-addressbar-input-wrap' }, [
                        el('img', { src: IMG_BASE + 'ie-addressbar-ico.png', alt: '' }),
                        addressInput
                    ]);
                    var goBtn = el('button', { class: 'xpsim-greengo', type: 'button' });
                    goBtn.appendChild(el('img', { src: IMG_BASE + 'greenGo.png', alt: '' }));
                    goBtn.appendChild(document.createTextNode('Go'));
                    var ieLinks = el('div', { class: 'xpsim-ie-links' }, [
                        document.createTextNode('Links '),
                        el('img', { src: IMG_BASE + 'ieLinks.png', alt: '' })
                    ]);
                    var addressBar = el('div', { class: 'xpsim-addressbar' }, [
                        el('span', { class: 'xpsim-addressbar-label', text: 'Address' }),
                        inputWrap,
                        goBtn,
                        ieLinks
                    ]);
                    ie.appendChild(addressBar);

                    // Quick Links bar — Web | Images | Videos | etc.
                    var linksBar = el('div', { class: 'xpsim-ie-linksbar' });
                    [
                        ['Web', true], ['Images', false], ['Videos', false], ['Maps', false],
                        ['News', false], ['Shopping', false], ['Mail', false]
                    ].forEach(function (pair, i) {
                        var a = el('a', { href: '#' });
                        if (pair[1]) {
                            a.appendChild(el('strong', { text: pair[0] }));
                        } else {
                            a.textContent = pair[0];
                        }
                        a.addEventListener('click', function (e) { e.preventDefault(); });
                        linksBar.appendChild(a);
                        if (i < 6) linksBar.appendChild(document.createTextNode(' '));
                    });
                    var rightLinks = el('div', { class: 'xpsim-ie-linksbar-right' });
                    ['iGoogle', 'Search settings', 'Sign in'].forEach(function (txt) {
                        var a = el('a', { href: '#', text: txt });
                        a.addEventListener('click', function (e) { e.preventDefault(); });
                        rightLinks.appendChild(a);
                    });
                    linksBar.appendChild(rightLinks);
                    ie.appendChild(linksBar);

                    var content = el('div', { class: 'xpsim-ie-content' });
                    var statusbar = el('div', { class: 'xpsim-ie-statusbar', text: 'Done' });
                    ie.appendChild(content);
                    ie.appendChild(statusbar);
                    body.appendChild(ie);

                    // Navigation state. The toolbar buttons + address input + Go
                    // button were created above, in scope.
                    var history = ['google.com'];
                    var pointer = 0;

                    function navigate(url, pushHistory) {
                        url = (url || '').trim();
                        var page = PAGES[url] || PAGES[url.replace(/^https?:\/\/(www\.)?/, '')];
                        if (!page) {
                            content.innerHTML = '<div class="xpsim-ie-page" style="padding:24px;font:13px Times New Roman;">'+
                                '<h1 style="font:bold 24px Arial;color:#000;">The page cannot be displayed</h1>'+
                                '<p>The page you are looking for is currently unavailable. The Web site might be experiencing technical difficulties.</p>'+
                                '<p><a href="google.com">Try the home page</a></p></div>';
                            statusbar.textContent = 'Done';
                            addressInput.value = url;
                            setWindowTitle(winObj, 'Cannot find server - Microsoft Internet Explorer');
                            return;
                        }
                        statusbar.textContent = 'Opening ' + url + '...';
                        setTimeout(function () {
                            content.innerHTML = '<div class="xpsim-ie-page">' + page.html + '</div>';
                            addressInput.value = url;
                            setWindowTitle(winObj, page.title + ' - Microsoft Internet Explorer');
                            statusbar.textContent = 'Done';
                            $$('.xpsim-ie-page a', content).forEach(function (a) {
                                a.addEventListener('click', function (e) {
                                    var href = a.getAttribute('href');
                                    if (!href || href === '#') { e.preventDefault(); return; }
                                    e.preventDefault();
                                    navigate(href, true);
                                });
                            });
                            if (pushHistory) {
                                history = history.slice(0, pointer + 1);
                                history.push(url);
                                pointer = history.length - 1;
                            }
                        }, 120);
                    }

                    btnBack.addEventListener('click',    function (e) { e.preventDefault(); if (pointer > 0) { pointer -= 1; navigate(history[pointer], false); } });
                    btnFwd.addEventListener('click',     function (e) { e.preventDefault(); if (pointer < history.length - 1) { pointer += 1; navigate(history[pointer], false); } });
                    btnRefresh.addEventListener('click', function (e) { e.preventDefault(); navigate(history[pointer], false); });
                    btnHome.addEventListener('click',    function (e) { e.preventDefault(); navigate('google.com', true); });
                    btnStop.addEventListener('click',    function (e) { e.preventDefault(); statusbar.textContent = 'Done'; });
                    goBtn.addEventListener('click',      function () { navigate(addressInput.value, true); });
                    addressInput.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter') { navigate(addressInput.value, true); }
                    });

                    navigate('google.com', false);
                }
            };
        }
    };

    // ---------- Explorer chrome helper ----------
    // Builds the file menu, image-icon toolbar, and address bar that XP's
    // Explorer windows share. Returns an array of elements ready to prepend
    // to the explorer body. `addressValue` is what shows in the address input.
    var IMG_BASE = (function () {
        var s = document.querySelector('link[rel="stylesheet"][href*="windows-xp-simulator.css"]');
        if (s) {
            return s.href.replace(/\/css\/windows-xp-simulator\.css.*$/, '/images/winxp/');
        }
        return '/wp-content/themes/foxiz-child/assets/images/winxp/';
    })();

    function buildExplorerChrome(addressValue) {
        var fileMenu = el('ul', { class: 'xpsim-filemenu' }, [
            el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'File' })]),
            el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'Edit' })]),
            el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'View' })]),
            el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'Favorites' })]),
            el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'Tools' })]),
            el('li', { class: 'xpsim-filemenu-item' }, [el('button', { type: 'button', text: 'Help' })])
        ]);

        function btn(src, alt) {
            var a = el('a', { href: '#' });
            a.appendChild(el('img', { src: IMG_BASE + src, alt: alt }));
            a.addEventListener('click', function (e) { e.preventDefault(); });
            return a;
        }
        function sep() {
            return el('img', { class: 'xpsim-toolbar-sep', src: IMG_BASE + 'toolbar-sep.png', alt: '' });
        }

        var toolbar = el('div', { class: 'xpsim-explorer-toolbar' }, [
            btn('toolbar1.html', 'Back'),
            btn('toolbar2.html', 'Forward'),
            btn('toolbar3.html', 'Up'),
            sep(),
            btn('toolbar4.html', 'Search'),
            btn('toolbar5.html', 'Folders'),
            sep(),
            btn('toolbar6.html', 'Views')
        ]);

        var input = el('input', { type: 'text', value: addressValue || '' });
        var inputWrap = el('div', { class: 'xpsim-addressbar-input-wrap' }, [
            el('img', { src: IMG_BASE + 'pc-icon.png', alt: 'pc icon' }),
            input
        ]);
        var goBtn = el('button', { class: 'xpsim-greengo', type: 'button' });
        goBtn.appendChild(el('img', { src: IMG_BASE + 'greenGo.png', alt: '' }));
        goBtn.appendChild(document.createTextNode('Go'));

        var addressBar = el('div', { class: 'xpsim-addressbar' }, [
            el('span', { class: 'xpsim-addressbar-label', text: 'Address' }),
            inputWrap,
            goBtn
        ]);

        return [fileMenu, toolbar, addressBar];
    }

    // ---------- Winamp ----------
    APPS['winamp'] = {
        title: 'Winamp',
        iconName: 'winamp',
        width: 282,
        height: 354,
        factory: function () {
            // Track titles match geekprank's playlist exactly so they fit on
            // a single line in the 256px-wide playlist column.
            var SONGS = [
                { title: 'Asia Cruise - Selfish',  duration: '0:32' },
                { title: 'Messin Prod Kyle Beats', duration: '0:29' },
                { title: 'All The Time',           duration: '0:39' },
                { title: 'Sorry Ms Jackson',       duration: '0:26' },
                { title: 'Gotta Make a Move',      duration: '0:34' },
                { title: 'Aint My Fault',          duration: '0:39' }
            ];
            // Top "song title" field always shows the canonical track,
            // matching geekprank's hardcoded display text.
            var DISPLAY_TITLE = '3. KeysNKrates - All The Time';

            return {
                _key: 'winamp',
                borderless: true, // skin includes its own titlebar — no XP chrome
                _intervalId: null,
                mount: function (body, winObj, closeFn) {
                    var self = this;
                    var skin = el('div', { class: 'xpsim-winamp' });

                    // Close + minimize buttons positioned over Winamp's own
                    // titlebar area (top-right of skin). Both are tiny click
                    // targets matching real Winamp's window controls.
                    var winampClose = el('a', { class: 'xpsim-winamp-close', href: '#', 'aria-label': 'Close' });
                    winampClose.addEventListener('click', function (e) {
                        e.preventDefault();
                        if (typeof closeFn === 'function') closeFn();
                    });
                    skin.appendChild(winampClose);
                    var winampMin = el('a', { class: 'xpsim-winamp-min', href: '#', 'aria-label': 'Minimize' });
                    winampMin.addEventListener('click', function (e) {
                        e.preventDefault();
                        minimizeWindow(winObj.id);
                    });
                    skin.appendChild(winampMin);

                    var visualizer = el('div', { class: 'xpsim-winamp-visualizer' });
                    var songTitle  = el('div', { class: 'xpsim-winamp-title' });
                    var trackWrap  = el('div', { class: 'xpsim-winamp-track' }, [
                        el('div', { class: 'xpsim-winamp-trail' })
                    ]);
                    var trackTrail = trackWrap.firstChild;

                    function btn(id, label) {
                        var a = el('a', { href: '#', class: 'xpsim-winamp-btn xpsim-winamp-btn-' + id, title: label });
                        a.addEventListener('click', function (e) { e.preventDefault(); });
                        return a;
                    }
                    var btnPrev  = btn('prev',  'Previous');
                    var btnPlay  = btn('play',  'Play');
                    var btnPause = btn('pause', 'Pause');
                    var btnStop  = btn('stop',  'Stop');
                    var btnNext  = btn('next',  'Next');
                    var buttons = el('div', { class: 'xpsim-winamp-buttons' }, [btnPrev, btnPlay, btnPause, btnStop, btnNext]);

                    var playlistUl = el('ul');
                    var playlist = el('div', { class: 'xpsim-winamp-playlist' }, [playlistUl]);

                    skin.appendChild(visualizer);
                    skin.appendChild(songTitle);
                    skin.appendChild(trackWrap);
                    skin.appendChild(buttons);
                    skin.appendChild(playlist);
                    body.appendChild(skin);

                    var current = 2;       // default to "All The Time" like geekprank
                    var playing = false;
                    var trackPercent = 0;

                    function renderPlaylist() {
                        playlistUl.innerHTML = '';
                        SONGS.forEach(function (s, i) {
                            var li = el('li', {
                                class: i === current ? 'is-selected' : '',
                                'data-i': i
                            }, [
                                document.createTextNode((i + 1) + '. ' + s.title),
                                el('span', { text: s.duration })
                            ]);
                            li.addEventListener('click', function () {
                                current = i;
                                renderPlaylist();
                                updateTitle();
                            });
                            li.addEventListener('dblclick', function () {
                                current = i;
                                start();
                            });
                            playlistUl.appendChild(li);
                        });
                    }
                    function updateTitle() {
                        // Song title display always shows the canonical track
                        // string (matches geekprank's hardcoded display).
                        songTitle.textContent = DISPLAY_TITLE;
                    }
                    function setPlaying(val) {
                        playing = val;
                        skin.classList.toggle('is-playing', playing);
                        if (playing) {
                            self._intervalId = setInterval(function () {
                                trackPercent = (trackPercent + 0.6) % 100;
                                trackTrail.style.left = trackPercent.toFixed(2) + '%';
                            }, 200);
                        } else if (self._intervalId) {
                            clearInterval(self._intervalId);
                            self._intervalId = null;
                        }
                    }
                    function start() { setPlaying(true); }
                    function pause() { setPlaying(false); }
                    function stop()  { setPlaying(false); trackPercent = 0; trackTrail.style.left = '0%'; }
                    function prev()  { current = (current - 1 + SONGS.length) % SONGS.length; renderPlaylist(); updateTitle(); }
                    function next()  { current = (current + 1) % SONGS.length; renderPlaylist(); updateTitle(); }

                    btnPlay.addEventListener('click',  start);
                    btnPause.addEventListener('click', pause);
                    btnStop.addEventListener('click',  stop);
                    btnPrev.addEventListener('click',  prev);
                    btnNext.addEventListener('click',  next);

                    renderPlaylist();
                    updateTitle();
                },
                unmount: function () {
                    if (this._intervalId) {
                        clearInterval(this._intervalId);
                        this._intervalId = null;
                    }
                }
            };
        }
    };

    // ---------- My Computer ----------
    APPS['mycomputer'] = {
        title: 'My Computer',
        iconName: 'mycomputer',
        width: 640,
        height: 440,
        factory: function () {
            return {
                _key: 'mycomputer',
                mount: function (body) {
                    var explorer = el('div', { class: 'xpsim-explorer' });
                    var chrome = buildExplorerChrome('My Computer');
                    chrome.forEach(function (n) { explorer.appendChild(n); });

                    var sidebar = el('div', { class: 'xpsim-explorer-sidebar' }, [
                        el('h3', { text: 'System Tasks' }),
                        el('ul', null, [
                            el('li', null, [el('a', { text: 'View system information' })]),
                            el('li', null, [el('a', { text: 'Add or remove programs' })]),
                            el('li', null, [el('a', { text: 'Change a setting' })])
                        ]),
                        el('h3', { text: 'Other Places' }),
                        el('ul', null, [
                            el('li', null, [el('a', { text: 'My Network Places' })]),
                            el('li', null, [el('a', { text: 'My Documents', on: { click: function () { openApp('mydocs'); } } })]),
                            el('li', null, [el('a', { text: 'Shared Documents' })]),
                            el('li', null, [el('a', { text: 'Control Panel' })])
                        ])
                    ]);

                    var main = el('div', { class: 'xpsim-explorer-main' });

                    function makeItem(name, iconName, onOpen) {
                        var item = el('button', { class: 'xpsim-explorer-item', type: 'button' }, [
                            el('span', { class: iconClass(iconName) }),
                            el('span', { text: name })
                        ]);
                        item.addEventListener('dblclick', function () { onOpen && onOpen(); });
                        item.addEventListener('click', function () {
                            $$('.xpsim-explorer-item.is-selected', main).forEach(function (n) { n.classList.remove('is-selected'); });
                            item.classList.add('is-selected');
                        });
                        return item;
                    }

                    var sec1 = el('div', { class: 'xpsim-explorer-section' }, [
                        el('h4', { text: 'Files Stored on This Computer' }),
                        el('div', { class: 'xpsim-explorer-grid' }, [
                            makeItem('Shared Documents', 'mydocs'),
                            makeItem('User\'s Documents', 'mydocs', function () { openApp('mydocs'); })
                        ])
                    ]);

                    var sec2 = el('div', { class: 'xpsim-explorer-section' }, [
                        el('h4', { text: 'Hard Disk Drives' }),
                        el('div', { class: 'xpsim-explorer-grid' }, [
                            makeItem('Local Disk (C:)', 'mycomputer')
                        ])
                    ]);

                    var sec3 = el('div', { class: 'xpsim-explorer-section' }, [
                        el('h4', { text: 'Devices with Removable Storage' }),
                        el('div', { class: 'xpsim-explorer-grid' }, [
                            makeItem('3½ Floppy (A:)', 'mycomputer'),
                            makeItem('CD Drive (D:)', 'mycomputer')
                        ])
                    ]);

                    main.appendChild(sec1);
                    main.appendChild(sec2);
                    main.appendChild(sec3);

                    var statusbar = el('div', { class: 'xpsim-statusbar', text: '5 objects' });

                    explorer.appendChild(el('div', { class: 'xpsim-explorer-body' }, [sidebar, main]));
                    explorer.appendChild(statusbar);

                    body.appendChild(explorer);
                }
            };
        }
    };

    // ---------- My Documents ----------
    APPS['mydocs'] = {
        title: 'My Documents',
        iconName: 'mydocs',
        width: 600,
        height: 400,
        factory: function () {
            return {
                _key: 'mydocs',
                mount: function (body) {
                    var explorer = el('div', { class: 'xpsim-explorer' });
                    var chrome = buildExplorerChrome('My Documents');
                    chrome.forEach(function (n) { explorer.appendChild(n); });

                    var sidebar = el('div', { class: 'xpsim-explorer-sidebar' }, [
                        el('h3', { text: 'File and Folder Tasks' }),
                        el('ul', null, [
                            el('li', null, [el('a', { text: 'Make a new folder' })]),
                            el('li', null, [el('a', { text: 'Publish this folder to the Web' })]),
                            el('li', null, [el('a', { text: 'Share this folder' })])
                        ]),
                        el('h3', { text: 'Other Places' }),
                        el('ul', null, [
                            el('li', null, [el('a', { text: 'My Computer', on: { click: function () { openApp('mycomputer'); } } })]),
                            el('li', null, [el('a', { text: 'My Network Places' })])
                        ])
                    ]);

                    var main = el('div', { class: 'xpsim-explorer-main' });

                    function makeItem(name, iconName, onOpen) {
                        var item = el('button', { class: 'xpsim-explorer-item', type: 'button' }, [
                            el('span', { class: iconClass(iconName) }),
                            el('span', { text: name })
                        ]);
                        item.addEventListener('dblclick', function () { onOpen && onOpen(); });
                        return item;
                    }

                    var grid = el('div', { class: 'xpsim-explorer-grid' }, [
                        makeItem('My Music', 'mediaplayer'),
                        makeItem('My Pictures', 'paint'),
                        makeItem('My Videos', 'mediaplayer'),
                        makeItem('Welcome.txt', 'notepad', function () {
                            openApp('notepad');
                        }),
                        makeItem('Letter.txt', 'notepad'),
                        makeItem('Project Plan.txt', 'notepad')
                    ]);
                    main.appendChild(grid);

                    explorer.appendChild(el('div', { class: 'xpsim-explorer-body' }, [sidebar, main]));
                    body.appendChild(explorer);
                }
            };
        }
    };

    // ---------- Recycle Bin ----------
    APPS['recyclebin'] = {
        title: 'Recycle Bin',
        iconName: 'recyclebin',
        width: 540,
        height: 360,
        factory: function () {
            return {
                _key: 'recyclebin',
                mount: function (body) {
                    var explorer = el('div', { class: 'xpsim-explorer' });
                    var chrome = buildExplorerChrome('Recycle Bin');
                    chrome.forEach(function (n) { explorer.appendChild(n); });

                    var sidebar = el('div', { class: 'xpsim-explorer-sidebar' }, [
                        el('h3', { text: 'Recycle Bin Tasks' }),
                        el('ul', null, [
                            el('li', null, [el('a', { text: 'Empty the Recycle Bin' })]),
                            el('li', null, [el('a', { text: 'Restore all items' })])
                        ])
                    ]);
                    var main = el('div', { class: 'xpsim-explorer-main' });
                    main.appendChild(el('p', { style: { fontStyle: 'italic', color: '#666' }, text: 'The Recycle Bin is empty.' }));
                    explorer.appendChild(el('div', { class: 'xpsim-explorer-body' }, [sidebar, main]));
                    body.appendChild(explorer);
                }
            };
        }
    };

    // ---------- Minesweeper ----------
    APPS['minesweeper'] = {
        title: 'Minesweeper',
        iconName: 'paint',
        width: 220,
        height: 290,
        factory: function () {
            return {
                _key: 'minesweeper',
                mount: function (body) {
                    var ROWS = 9, COLS = 9, MINES = 10;
                    var board = [];
                    var revealed = [];
                    var flagged = [];
                    var firstClick = true;
                    var alive = true;
                    var won = false;
                    var startTime = 0;
                    var timerInterval = null;

                    var wrap = el('div', { class: 'xpsim-mine' });
                    var header = el('div', { class: 'xpsim-mine-header' });
                    var counter = el('div', { class: 'xpsim-mine-counter', text: pad3(MINES) });
                    var face = el('button', { class: 'xpsim-mine-face', type: 'button', text: '🙂' });
                    var timer = el('div', { class: 'xpsim-mine-counter', text: '000' });
                    header.appendChild(counter);
                    header.appendChild(face);
                    header.appendChild(timer);
                    wrap.appendChild(header);

                    var grid = el('div', { class: 'xpsim-mine-grid', style: { gridTemplateColumns: 'repeat(' + COLS + ', 18px)' } });
                    wrap.appendChild(grid);
                    body.appendChild(wrap);

                    function pad3(n) { return ('00' + n).slice(-3); }

                    function reset() {
                        board = []; revealed = []; flagged = [];
                        for (var r = 0; r < ROWS; r++) {
                            var row = [], rrev = [], rflag = [];
                            for (var c = 0; c < COLS; c++) { row.push(0); rrev.push(false); rflag.push(false); }
                            board.push(row); revealed.push(rrev); flagged.push(rflag);
                        }
                        firstClick = true; alive = true; won = false;
                        face.textContent = '🙂';
                        counter.textContent = pad3(MINES);
                        timer.textContent = '000';
                        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
                        renderGrid();
                    }

                    function placeMines(safeR, safeC) {
                        var placed = 0;
                        while (placed < MINES) {
                            var r = Math.floor(Math.random() * ROWS);
                            var c = Math.floor(Math.random() * COLS);
                            if (board[r][c] === -1) continue;
                            if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
                            board[r][c] = -1;
                            placed += 1;
                        }
                        for (var rr = 0; rr < ROWS; rr++) {
                            for (var cc = 0; cc < COLS; cc++) {
                                if (board[rr][cc] === -1) continue;
                                var n = 0;
                                for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
                                    var nr = rr + dr, nc = cc + dc;
                                    if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
                                    if (board[nr][nc] === -1) n += 1;
                                }
                                board[rr][cc] = n;
                            }
                        }
                    }

                    function renderGrid() {
                        grid.innerHTML = '';
                        for (var r = 0; r < ROWS; r++) {
                            for (var c = 0; c < COLS; c++) {
                                (function (rr, cc) {
                                    var cell = el('button', { class: 'xpsim-mine-cell', type: 'button' });
                                    cell.dataset.r = rr; cell.dataset.c = cc;
                                    if (revealed[rr][cc]) {
                                        cell.classList.add('is-revealed');
                                        if (board[rr][cc] === -1) {
                                            cell.classList.add('is-mine');
                                            cell.textContent = '💣';
                                        } else if (board[rr][cc] > 0) {
                                            cell.textContent = board[rr][cc];
                                            cell.dataset.n = board[rr][cc];
                                        }
                                    } else if (flagged[rr][cc]) {
                                        cell.textContent = '⚑';
                                    }
                                    cell.addEventListener('click', function () { reveal(rr, cc); });
                                    cell.addEventListener('contextmenu', function (e) { e.preventDefault(); toggleFlag(rr, cc); });
                                    grid.appendChild(cell);
                                })(r, c);
                            }
                        }
                    }

                    function reveal(r, c) {
                        if (!alive || won) return;
                        if (revealed[r][c] || flagged[r][c]) return;
                        if (firstClick) {
                            placeMines(r, c);
                            firstClick = false;
                            startTime = Date.now();
                            timerInterval = setInterval(function () {
                                var s = Math.min(999, Math.floor((Date.now() - startTime) / 1000));
                                timer.textContent = pad3(s);
                            }, 250);
                        }
                        revealed[r][c] = true;
                        if (board[r][c] === -1) {
                            alive = false;
                            face.textContent = '😵';
                            // Reveal all mines
                            for (var rr = 0; rr < ROWS; rr++) for (var cc = 0; cc < COLS; cc++) {
                                if (board[rr][cc] === -1) revealed[rr][cc] = true;
                            }
                            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
                            renderGrid();
                            playErrorDing();
                            return;
                        }
                        if (board[r][c] === 0) {
                            for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
                                var nr = r + dr, nc = c + dc;
                                if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
                                if (!revealed[nr][nc]) reveal(nr, nc);
                            }
                        }
                        checkWin();
                        renderGrid();
                    }

                    function toggleFlag(r, c) {
                        if (!alive || won) return;
                        if (revealed[r][c]) return;
                        flagged[r][c] = !flagged[r][c];
                        var fc = 0;
                        for (var rr = 0; rr < ROWS; rr++) for (var cc = 0; cc < COLS; cc++) if (flagged[rr][cc]) fc += 1;
                        counter.textContent = pad3(MINES - fc);
                        renderGrid();
                    }

                    function checkWin() {
                        var unrevealed = 0;
                        for (var rr = 0; rr < ROWS; rr++) for (var cc = 0; cc < COLS; cc++) {
                            if (!revealed[rr][cc] && board[rr][cc] !== -1) unrevealed += 1;
                        }
                        if (unrevealed === 0) {
                            won = true; alive = false;
                            face.textContent = '😎';
                            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
                        }
                    }

                    face.addEventListener('click', reset);
                    reset();
                }
            };
        }
    };

    // ---------- Solitaire (Klondike, simplified — drag-free, click-based)  ----------
    APPS['solitaire'] = {
        title: 'Solitaire',
        iconName: 'paint',
        width: 720,
        height: 520,
        factory: function () {
            return {
                _key: 'solitaire',
                mount: function (body) {
                    var SUITS = ['♠','♥','♦','♣'];
                    var REDS  = { '♥': true, '♦': true };
                    var RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
                    function rankValue(r) { return RANKS.indexOf(r); }

                    var sol = el('div', { class: 'xpsim-sol' });
                    var top = el('div', { class: 'xpsim-sol-top' });
                    var stockPile = el('div', { class: 'xpsim-sol-pile', 'data-pile': 'stock' });
                    var wastePile = el('div', { class: 'xpsim-sol-pile', 'data-pile': 'waste' });
                    var foundationsWrap = el('div', { class: 'xpsim-sol-foundations' });
                    var foundationPiles = [];
                    for (var i = 0; i < 4; i++) {
                        var f = el('div', { class: 'xpsim-sol-pile', 'data-pile': 'found-' + i });
                        f.dataset.suit = SUITS[i];
                        foundationsWrap.appendChild(f);
                        foundationPiles.push(f);
                    }
                    top.appendChild(stockPile);
                    top.appendChild(wastePile);
                    top.appendChild(foundationsWrap);
                    sol.appendChild(top);

                    var tableauWrap = el('div', { class: 'xpsim-sol-tableau' });
                    var tableauPiles = [];
                    for (var t = 0; t < 7; t++) {
                        var tp = el('div', { class: 'xpsim-sol-pile', 'data-pile': 'tab-' + t,
                            style: { height: '320px' } });
                        tableauWrap.appendChild(tp);
                        tableauPiles.push(tp);
                    }
                    sol.appendChild(tableauWrap);

                    var status = el('div', { class: 'xpsim-sol-status', text: 'Click the stock to deal. Aces start the foundations. Build down by alternating colour in the tableau, build up by suit in the foundations.' });
                    sol.appendChild(status);
                    body.appendChild(sol);

                    var state = { stock: [], waste: [], found: [[],[],[],[]], tab: [[],[],[],[],[],[],[]], selected: null };

                    function buildDeck() {
                        var d = [];
                        for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) {
                            d.push({ suit: SUITS[s], rank: RANKS[r], faceUp: false });
                        }
                        for (var i = d.length - 1; i > 0; i--) {
                            var j = Math.floor(Math.random() * (i + 1));
                            var tmp = d[i]; d[i] = d[j]; d[j] = tmp;
                        }
                        return d;
                    }

                    function deal() {
                        var deck = buildDeck();
                        for (var col = 0; col < 7; col++) {
                            for (var k = 0; k <= col; k++) {
                                var card = deck.pop();
                                card.faceUp = (k === col);
                                state.tab[col].push(card);
                            }
                        }
                        state.stock = deck;
                        state.waste = [];
                        state.found = [[],[],[],[]];
                        state.selected = null;
                        render();
                    }

                    function render() {
                        // Stock
                        stockPile.innerHTML = '';
                        if (state.stock.length) {
                            stockPile.appendChild(makeCardEl({ faceUp: false }, 0));
                        } else {
                            stockPile.innerHTML = '<div style="color:#fff;font-size:9px;text-align:center;padding-top:38px;opacity:0.6;">↻</div>';
                        }
                        // Waste
                        wastePile.innerHTML = '';
                        if (state.waste.length) {
                            var w = state.waste[state.waste.length - 1];
                            var wEl = makeCardEl(w, 0);
                            wEl.addEventListener('click', function (e) {
                                e.stopPropagation();
                                selectCard({ from: 'waste', index: state.waste.length - 1 });
                            });
                            wastePile.appendChild(wEl);
                        }
                        // Foundations
                        foundationPiles.forEach(function (fp, idx) {
                            fp.innerHTML = '';
                            var pile = state.found[idx];
                            if (pile.length) {
                                var c = pile[pile.length - 1];
                                fp.appendChild(makeCardEl(c, 0));
                            } else {
                                fp.innerHTML = '<div style="color:#fff;font-size:18px;text-align:center;padding-top:34px;opacity:0.5;">' + SUITS[idx] + '</div>';
                            }
                            fp.onclick = function () {
                                if (state.selected) tryMoveToFoundation(idx);
                            };
                        });
                        // Tableau
                        tableauPiles.forEach(function (tp, col) {
                            tp.innerHTML = '';
                            state.tab[col].forEach(function (card, k) {
                                var cEl = makeCardEl(card, k * 22);
                                cEl.addEventListener('click', function (e) {
                                    e.stopPropagation();
                                    if (!card.faceUp) {
                                        if (k === state.tab[col].length - 1) {
                                            card.faceUp = true;
                                            render();
                                        }
                                        return;
                                    }
                                    selectCard({ from: 'tab', col: col, index: k });
                                });
                                tp.appendChild(cEl);
                            });
                            tp.onclick = function () {
                                if (state.selected) tryMoveToTableau(col);
                            };
                        });
                        updateSelectionVisual();
                        if (checkWin()) status.textContent = '🎉 You won!';
                    }

                    function makeCardEl(card, top) {
                        var c = el('div', { class: 'xpsim-sol-card' + (card.faceUp ? '' : ' is-back'),
                            style: { top: top + 'px', left: '0' } });
                        if (card.faceUp) {
                            c.classList.add(REDS[card.suit] ? 'is-red' : 'is-black');
                            var rank = el('span', { class: 'xpsim-sol-card-rank', text: card.rank });
                            var suit = el('span', { class: 'xpsim-sol-card-suit', text: card.suit });
                            c.appendChild(rank);
                            c.appendChild(suit);
                        }
                        return c;
                    }

                    function selectCard(sel) {
                        state.selected = sel;
                        updateSelectionVisual();
                    }

                    function updateSelectionVisual() {
                        $$('.xpsim-sol-card', sol).forEach(function (n) { n.style.outline = ''; });
                        if (!state.selected) return;
                        var src;
                        if (state.selected.from === 'waste') {
                            src = wastePile.querySelector('.xpsim-sol-card');
                        } else if (state.selected.from === 'tab') {
                            src = tableauPiles[state.selected.col].children[state.selected.index];
                        }
                        if (src) src.style.outline = '2px solid #ffeb3b';
                    }

                    function getSelectedStack() {
                        if (!state.selected) return null;
                        if (state.selected.from === 'waste') {
                            return [state.waste[state.waste.length - 1]];
                        }
                        return state.tab[state.selected.col].slice(state.selected.index);
                    }

                    function clearSelectionFrom() {
                        if (!state.selected) return;
                        if (state.selected.from === 'waste') {
                            state.waste.pop();
                        } else if (state.selected.from === 'tab') {
                            state.tab[state.selected.col] = state.tab[state.selected.col].slice(0, state.selected.index);
                            // Flip the new top card if needed
                            var rem = state.tab[state.selected.col];
                            if (rem.length && !rem[rem.length - 1].faceUp) rem[rem.length - 1].faceUp = true;
                        }
                        state.selected = null;
                    }

                    function tryMoveToFoundation(idx) {
                        var stack = getSelectedStack();
                        if (!stack || stack.length !== 1) { state.selected = null; render(); return; }
                        var card = stack[0];
                        if (card.suit !== SUITS[idx]) { state.selected = null; render(); return; }
                        var f = state.found[idx];
                        if ((f.length === 0 && card.rank === 'A') ||
                            (f.length > 0 && rankValue(card.rank) === rankValue(f[f.length-1].rank) + 1)) {
                            f.push(card);
                            clearSelectionFrom();
                        } else {
                            state.selected = null;
                        }
                        render();
                    }

                    function tryMoveToTableau(col) {
                        var stack = getSelectedStack();
                        if (!stack) { state.selected = null; render(); return; }
                        var card = stack[0];
                        var dest = state.tab[col];
                        var ok = false;
                        if (dest.length === 0) {
                            ok = (card.rank === 'K');
                        } else {
                            var top = dest[dest.length - 1];
                            if (top.faceUp && REDS[top.suit] !== REDS[card.suit] && rankValue(top.rank) === rankValue(card.rank) + 1) {
                                ok = true;
                            }
                        }
                        if (ok) {
                            stack.forEach(function (c) { dest.push(c); });
                            clearSelectionFrom();
                        } else {
                            state.selected = null;
                        }
                        render();
                    }

                    function checkWin() {
                        return state.found.every(function (p) { return p.length === 13; });
                    }

                    stockPile.addEventListener('click', function () {
                        if (state.stock.length) {
                            var c = state.stock.pop();
                            c.faceUp = true;
                            state.waste.push(c);
                        } else {
                            // Recycle waste back into stock
                            while (state.waste.length) {
                                var ww = state.waste.pop();
                                ww.faceUp = false;
                                state.stock.push(ww);
                            }
                        }
                        state.selected = null;
                        render();
                    });

                    deal();
                }
            };
        }
    };

    // ============================================================
    // 6. Start menu + taskbar + clock
    // ============================================================
    var startBtn   = $('#xpsimStartBtn');
    var startMenu  = $('#xpsimStartMenu');
    var clockEl    = $('#xpsimClock');

    function tickClock() {
        var d = new Date();
        var h = d.getHours();
        var m = d.getMinutes();
        var ampm = h < 12 ? 'AM' : 'PM';
        h = h % 12 || 12;
        clockEl.textContent = h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }
    setInterval(tickClock, 30000);
    tickClock();

    function toggleStart() {
        var open = startMenu.classList.toggle('is-open');
        startBtn.classList.toggle('is-active', open);
        startMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    function closeStart() {
        startMenu.classList.remove('is-open');
        startBtn.classList.remove('is-active');
        startMenu.setAttribute('aria-hidden', 'true');
    }

    startBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleStart(); });
    document.addEventListener('click', function (e) {
        if (!overlay.classList.contains('is-active')) return;
        if (startMenu.contains(e.target) || startBtn.contains(e.target)) return;
        closeStart();
    });

    $$('.xpsim-startmenu-item', startMenu).forEach(function (item) {
        item.addEventListener('click', function () {
            var appKey = item.dataset.app;
            closeStart();
            openApp(appKey);
        });
    });

    // Quick Launch tray — clicking an icon opens the corresponding app.
    // The "desktop" icon minimizes all open windows ("Show Desktop").
    $$('.xpsim-quick').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var appKey = btn.dataset.app;
            if (appKey === 'desktop') {
                Object.keys(windows).forEach(function (id) {
                    if (!windows[id].minimized) minimizeWindow(id);
                });
                return;
            }
            openApp(appKey);
        });
    });

    $('#xpsimShutdown').addEventListener('click', function () {
        closeStart();
        exitSimulator();
    });
    $('#xpsimLogoff').addEventListener('click', function () {
        closeStart();
        exitSimulator();
    });

    // ============================================================
    // 7. Boot sequence + lifecycle
    // ============================================================
    var bootEl    = $('#xpsimBoot');
    var desktopEl = $('#xpsimDesktop');
    var launchBtn = $('#xpsimLaunch');

    function showBoot() {
        bootEl.classList.remove('is-fading');
        bootEl.style.display = 'flex';
        setTimeout(function () {
            bootEl.classList.add('is-fading');
            setTimeout(function () {
                bootEl.style.display = 'none';
                desktopEl.classList.add('is-visible');
                desktopEl.setAttribute('aria-hidden', 'false');
                playStartupChime();
            }, 600);
        }, 2400);
    }

    function launchSimulator() {
        overlay.classList.add('is-active');
        overlay.setAttribute('aria-hidden', 'false');
        // Reset state
        Object.keys(windows).forEach(closeWindow);
        openCount = 0;
        desktopEl.classList.remove('is-visible');
        // Try fullscreen
        if (overlay.requestFullscreen) {
            overlay.requestFullscreen().catch(function () { /* user can press F11 */ });
        }
        showBoot();
    }

    function exitSimulator() {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(function () {});
        }
        overlay.classList.remove('is-active');
        overlay.setAttribute('aria-hidden', 'true');
    }

    launchBtn.addEventListener('click', launchSimulator);

    document.addEventListener('keydown', function (e) {
        if (!overlay.classList.contains('is-active')) return;
        if (e.key === 'Escape') {
            // If a window is the topmost, close it; otherwise exit.
            var top = null, topZi = -1;
            Object.keys(windows).forEach(function (id) {
                var z = parseInt(windows[id].el.style.zIndex || '0', 10);
                if (z > topZi) { topZi = z; top = id; }
            });
            if (top) {
                closeWindow(top);
            } else {
                exitSimulator();
            }
        }
    });

    document.addEventListener('fullscreenchange', function () {
        if (!document.fullscreenElement && overlay.classList.contains('is-active')) {
            // User pressed Esc to exit fullscreen — exit the simulator too
            overlay.classList.remove('is-active');
            overlay.setAttribute('aria-hidden', 'true');
        }
    });

    // ============================================================
    // 8. Wiring (desktop icons, context menu, app keys)
    // ============================================================
    $$('.xpsim-icon', $('#xpsimIcons')).forEach(function (btn) {
        btn.addEventListener('dblclick', function () {
            var app = btn.dataset.app;
            openApp(app);
        });
        btn.addEventListener('click', function () {
            $$('.xpsim-icon', $('#xpsimIcons')).forEach(function (b) { b.classList.toggle('is-selected', b === btn); });
        });
    });

    // Click on empty desktop deselects icons
    desktopEl.addEventListener('click', function (e) {
        if (e.target === desktopEl) {
            $$('.xpsim-icon', $('#xpsimIcons')).forEach(function (b) { b.classList.remove('is-selected'); });
        }
    });

    // Right-click context menu on desktop
    var ctxMenu = el('div', { class: 'xpsim-ctxmenu', id: 'xpsimCtxMenu' }, [
        el('button', { type: 'button', text: 'Arrange Icons By' }),
        el('button', { type: 'button', text: 'Refresh' }),
        el('hr'),
        el('button', { type: 'button', text: 'Paste' }),
        el('button', { type: 'button', text: 'Paste Shortcut' }),
        el('hr'),
        el('button', { type: 'button', text: 'New' }),
        el('hr'),
        el('button', { type: 'button', text: 'Properties' })
    ]);
    desktopEl.appendChild(ctxMenu);

    desktopEl.addEventListener('contextmenu', function (e) {
        if (e.target.closest('.xpsim-window') || e.target.closest('.xpsim-taskbar') || e.target.closest('.xpsim-startmenu')) return;
        e.preventDefault();
        var rect = desktopEl.getBoundingClientRect();
        ctxMenu.style.left = (e.clientX - rect.left) + 'px';
        ctxMenu.style.top  = (e.clientY - rect.top) + 'px';
        ctxMenu.classList.add('is-open');
    });

    document.addEventListener('click', function () { ctxMenu.classList.remove('is-open'); });
    $$('button', ctxMenu).forEach(function (b) { b.addEventListener('click', function () { ctxMenu.classList.remove('is-open'); }); });

    // Programmatic shortcuts to open apps from outside (Start menu wiring above)
    window.xpsimOpen = openApp;

})();
