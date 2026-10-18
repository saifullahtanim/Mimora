/* Fake Windows XP Crash Prank
 *
 * Flow:
 *   1. User clicks the page's Launch button → enters fullscreen, mounts
 *      the XP simulator (boot animation), then auto-opens 3 apps so the
 *      desktop reads "in use".
 *   2. Any system-level click (close button, Start button, taskbar, empty
 *      desktop, desktop icon) triggers the crash overlay:
 *         reboot (XP boot logo) → install missing → BSOD.
 *   3. Clicks INSIDE an open window's body don't trigger — only chrome /
 *      desktop clicks do, so the prank feels real (you can type in
 *      Notepad, scroll My Computer, etc., without breaking it).
 *   4. ESC at any time exits.
 */
(function () {
    'use strict';

    var crashOverlay = document.getElementById('xpcrashOverlay');
    var launchBtn    = document.getElementById('xpcrashLaunch');
    var xpOverlay    = document.getElementById('xpsimOverlay');
    var xpLaunch     = document.getElementById('xpsimLaunch');

    if (!crashOverlay || !launchBtn || !xpOverlay) return;

    var crashing = false;
    var launched = false;
    var cdsearchTimer = null;
    var formatProgressTimer = null;
    var awaitingBootdeviceKey = false;
    var awaitingFinalKey      = false;

    function showStage(name) {
        var stages = crashOverlay.querySelectorAll('.xpcrash-stage');
        for (var i = 0; i < stages.length; i++) {
            stages[i].classList.toggle('is-visible', stages[i].dataset.stage === name);
        }
        crashOverlay.dataset.stage = name;
    }

    function startCdsearchDots() {
        var dotsEl = document.getElementById('xpcrashCdsearchDots');
        if (!dotsEl) return;
        var count = 0;
        if (cdsearchTimer) clearInterval(cdsearchTimer);
        cdsearchTimer = setInterval(function () {
            count = (count + 1) % 7; // 0..6 dots, then wraps
            dotsEl.textContent = new Array(count + 1).join('.');
        }, 450);
    }

    function stopCdsearchDots() {
        if (cdsearchTimer) {
            clearInterval(cdsearchTimer);
            cdsearchTimer = null;
        }
    }

    // ----- Format-stage animation -----
    function runFormatSequence() {
        var warning  = document.getElementById('xpcrashFormatWarning');
        var fdisk    = document.getElementById('xpcrashFormatFdisk');
        var barFill  = document.getElementById('xpcrashFormatBarFill');
        var pctEl    = document.getElementById('xpcrashFormatPct');
        if (!warning || !fdisk || !barFill || !pctEl) return;

        // Reset (in case user retriggered)
        warning.classList.remove('is-shown');
        fdisk.classList.remove('is-shown');
        barFill.style.width = '0%';
        pctEl.textContent = '0';

        // After 1.5s of just "C:\", show warning + start the format bar.
        setTimeout(function () {
            if (!crashing) return;
            warning.classList.add('is-shown');

            var pct = 0;
            if (formatProgressTimer) clearInterval(formatProgressTimer);
            formatProgressTimer = setInterval(function () {
                if (!crashing) {
                    clearInterval(formatProgressTimer);
                    formatProgressTimer = null;
                    return;
                }
                // Random small increment so the bar feels organic.
                pct += Math.random() * 3 + 1;
                if (pct >= 100) {
                    pct = 100;
                    clearInterval(formatProgressTimer);
                    formatProgressTimer = null;
                    barFill.style.width = '100%';
                    pctEl.textContent = '100';
                    // Show FDISK options after a beat, then arm the
                    // "press any key" handoff to the prank reveal.
                    setTimeout(function () {
                        if (!crashing) return;
                        fdisk.classList.add('is-shown');
                        awaitingFinalKey = true;
                    }, 700);
                    return;
                }
                barFill.style.width = pct.toFixed(1) + '%';
                pctEl.textContent = Math.floor(pct);
            }, 220);
        }, 1500);
    }

    function stopFormatSequence() {
        if (formatProgressTimer) {
            clearInterval(formatProgressTimer);
            formatProgressTimer = null;
        }
    }

    function showPrankReveal() {
        awaitingFinalKey = false;
        stopFormatSequence();
        showStage('prank');
    }

    function startCrash() {
        if (crashing) return;
        crashing = true;
        // The simulator runs in fullscreen on #xpsimOverlay — only that
        // element renders. Move the crash overlay INSIDE it so it shows
        // up while fullscreen is active.
        if (crashOverlay.parentNode !== xpOverlay) {
            xpOverlay.appendChild(crashOverlay);
        }
        crashOverlay.classList.add('is-active');
        crashOverlay.setAttribute('aria-hidden', 'false');

        // Stage 1: BSOD (system crashes immediately on the trigger)
        showStage('bsod');

        // Stage 2 (after ~4s): Dell BIOS post (computer rebooting)
        setTimeout(function () {
            if (!crashing) return;
            showStage('dell');

            // Stage 3 (after ~3s on Dell): CD/DVD search with animated dots
            setTimeout(function () {
                if (!crashing) return;
                showStage('cdsearch');
                startCdsearchDots();

                // Stage 4 (after ~4s of searching): HP "Boot Device Not Found"
                // — waits for the user to click the "Start The Last Known
                // Good Configuration" button before advancing.
                setTimeout(function () {
                    if (!crashing) return;
                    stopCdsearchDots();
                    showStage('bootdevice');
                    awaitingBootdeviceKey = true;
                }, 4000);
            }, 3000);
        }, 4000);
    }

    function launch() {
        if (launched) return;
        launched = true;

        // Trigger XP simulator: clicks the (hidden) xpsimLaunch button so the
        // simulator's existing handler fires (boot screen → desktop).
        if (xpLaunch) xpLaunch.click();

        // After the simulator desktop is up (boot animation is ~3s), open
        // a few apps so the screen reads "in use".
        setTimeout(function () {
            if (typeof window.xpsimOpen === 'function') {
                window.xpsimOpen('mycomputer');
                setTimeout(function () { window.xpsimOpen('notepad'); }, 250);
                setTimeout(function () { window.xpsimOpen('ie'); },      500);
            }
        }, 3300);
    }

    launchBtn.addEventListener('click', launch);

    // Crash trigger: hook clicks at the document level. We trigger when the
    // user clicks something at the OS chrome level (close button, start
    // button, desktop background, taskbar entry, desktop icon, quick launch),
    // but NOT when they click inside a window's body content.
    document.addEventListener('click', function (e) {
        // Once the crash flow is underway, the user is keyboard-driven —
        // ignore further clicks until ESC resets things.
        if (crashing) return;

        if (!launched) return;
        if (!xpOverlay.classList.contains('is-active')) return;

        var t = e.target;

        // Triggering selectors — clicking any of these starts the crash.
        if (
            t.closest('.xpsim-tb-close') ||      // window close button
            t.closest('.xpsim-tb-min')   ||      // window minimize
            t.closest('.xpsim-tb-max')   ||      // window maximize
            t.closest('.xpsim-startbtn') ||      // start button
            t.closest('.xpsim-task')     ||      // taskbar app entry
            t.closest('.xpsim-quick')    ||      // quick launch icon
            t.closest('.xpsim-icon')     ||      // desktop icon
            t.closest('.xpsim-systray')  ||      // system tray
            t.closest('.xpsim-startmenu-item')   // start menu item
        ) {
            // Slight delay so the simulator's own click handler can run
            // (so the user momentarily sees the X button depress, etc.).
            setTimeout(startCrash, 80);
            return;
        }

        // Click on the empty desktop area also triggers
        var desktopHit = t.closest('#xpsimDesktop');
        var insideWin  = t.closest('.xpsim-window');
        var inMenu     = t.closest('.xpsim-startmenu') || t.closest('.xpsim-taskbar');
        if (desktopHit && !insideWin && !inMenu) {
            setTimeout(startCrash, 80);
        }
    }, true); // capture so we run before the simulator's own handlers if needed

    // ESC exits the whole prank. Any other key, while the FDISK options
    // are showing, advances to the "just a prank" reveal screen.
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var anyActive = crashOverlay.classList.contains('is-active') ||
                            xpOverlay.classList.contains('is-active');
            if (!anyActive) return;

            e.preventDefault();
            resetPrank();
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(function () {});
            }
            return;
        }

        // "Boot Device Not Found" → press Enter to start last known good
        // configuration → CMD prompt + format sequence.
        if (awaitingBootdeviceKey && e.key === 'Enter') {
            e.preventDefault();
            awaitingBootdeviceKey = false;
            showStage('format');
            runFormatSequence();
            return;
        }

        // "Press any key to continue" handoff out of FDISK → prank reveal.
        if (awaitingFinalKey) {
            e.preventDefault();
            showPrankReveal();
        }
    });

    // If the user exits fullscreen, drop both overlays
    document.addEventListener('fullscreenchange', function () {
        if (!document.fullscreenElement) {
            resetPrank();
        }
    });

    function resetPrank() {
        crashing = false;
        launched = false;
        awaitingBootdeviceKey = false;
        awaitingFinalKey      = false;
        stopCdsearchDots();
        stopFormatSequence();
        crashOverlay.classList.remove('is-active');
        crashOverlay.setAttribute('aria-hidden', 'true');
        xpOverlay.classList.remove('is-active');
        xpOverlay.setAttribute('aria-hidden', 'true');
        showStage('bsod');
    }
})();
