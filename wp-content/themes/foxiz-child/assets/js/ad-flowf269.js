/**
 * Ad Flow — Global countdown injection.
 *
 * Loaded on every page. Checks sessionStorage for an active ad session.
 * If present, injects two inline countdown timers and a continue button.
 *
 * Flow per page:
 *   1. Check sessionStorage for 'how7o_ad_session'
 *   2. AJAX GET session-status to validate + get countdown config
 *   3. Verify user is on the expected page (redirect if not)
 *   4. Inject 1st countdown before seo-content section + auto-scroll to it
 *   5. When 1st countdown finishes, show a "Continue" button
 *   6. Click Continue → inject 2nd countdown before FAQ section + auto-scroll
 *   7. When 2nd countdown finishes, show final "Continue" button
 *   8. Click Continue → AJAX POST complete-step → redirect to next page or final URL
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'how7o_ad_session';
    var API_BASE    = how7oAdFlow.restUrl;
    var HOME_URL    = how7oAdFlow.homeUrl;

    var sessionId = sessionStorage.getItem(STORAGE_KEY);
    if (!sessionId) {
        return;
    }

    // ── Fetch session status ────────────────────────────────

    fetch(API_BASE + 'how7o/v1/session-status?session_id=' + encodeURIComponent(sessionId) + '&_=' + Date.now(), { cache: 'no-store' })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data.status !== 'ok') {
                sessionStorage.removeItem(STORAGE_KEY);
                return;
            }

            // Verify user is on the correct page.
            var currentPath  = window.location.pathname.replace(/\/+$/, '');
            var expectedPath = (data.expected_page || '').replace(/\/+$/, '');

            if (expectedPath && currentPath !== expectedPath) {
                window.location.href = expectedPath;
                return;
            }

            startAdFlow(data);
        })
        .catch(function () {
            sessionStorage.removeItem(STORAGE_KEY);
        });

    // ── Main ad flow logic ──────────────────────────────────

    function startAdFlow(session) {
        var duration    = session.countdown_duration || 20;
        var currentStep = session.current_step;
        var totalSteps  = session.total_steps;

        // Find injection targets.
        var seoSection = findSection('seo-content');
        var faqSection = findSection('faq');

        if (!seoSection && !faqSection) {
            // Can't find sections — skip ad flow on this page.
            return;
        }

        var target1 = seoSection || faqSection;
        var hasSecondPhase = (faqSection && faqSection !== target1);
        var totalParts = hasSecondPhase ? 2 : 1;

        // Phase 1: First countdown.
        var countdown1 = createCountdownEl(duration, currentStep + 1, totalSteps, 1, totalParts);
        target1.parentNode.insertBefore(countdown1, target1);
        scrollToEl(countdown1);

        runCountdown(countdown1, duration, function () {
            if (hasSecondPhase) {
                // Show intermediate Continue button to advance to phase 2.
                showContinueButton(countdown1, 'Continue', function () {
                    var countdown2 = createCountdownEl(duration, currentStep + 1, totalSteps, 2, totalParts);
                    faqSection.parentNode.insertBefore(countdown2, faqSection);
                    scrollToEl(countdown2);

                    runCountdown(countdown2, duration, function () {
                        showContinueButton(countdown2, 'Continue', function () {
                            completeStep();
                        });
                    });
                });
            } else {
                // Only one section — final button completes the step.
                showContinueButton(countdown1, 'Continue', function () {
                    completeStep();
                });
            }
        });
    }

    // ── Smooth-scroll an element into view ──────────────────

    function scrollToEl(el) {
        // Slight delay so the layout settles before scrolling.
        setTimeout(function () {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    }

    // ── Find a section by class suffix ──────────────────────

    function findSection(suffix) {
        var sections = document.querySelectorAll('section');
        for (var i = 0; i < sections.length; i++) {
            var cls = sections[i].className || '';
            if (cls.match(new RegExp('(^|\\s)\\S+-' + suffix + '(\\s|$)')) ||
                cls.match(new RegExp('(^|\\s)prank-page-' + suffix + '(\\s|$)')) ||
                cls.match(new RegExp('(^|\\s)prank-' + suffix + '(\\s|$)'))) {
                return sections[i];
            }
        }
        return null;
    }

    // ── Create countdown element ────────────────────────────

    function createCountdownEl(duration, stepNum, totalSteps, phase, totalParts) {
        var wrap = document.createElement('div');
        wrap.className = 'how7o-ad-countdown';

        var text = document.createElement('p');
        text.className = 'how7o-ad-countdown-text';
        text.textContent = 'Please wait while we prepare your content...';

        var timer = document.createElement('div');
        timer.className = 'how7o-ad-countdown-timer';
        timer.textContent = duration;

        var stepInfo = document.createElement('p');
        stepInfo.className = 'how7o-ad-step-info';
        stepInfo.textContent = 'Step ' + stepNum + ' of ' + totalSteps + ' \u2022 Part ' + phase + ' of ' + totalParts;

        wrap.appendChild(text);
        wrap.appendChild(timer);
        wrap.appendChild(stepInfo);

        return wrap;
    }

    // ── Run countdown animation ─────────────────────────────

    function runCountdown(el, duration, onComplete) {
        var timerEl   = el.querySelector('.how7o-ad-countdown-timer');
        var remaining = duration;

        var interval = setInterval(function () {
            remaining--;
            timerEl.textContent = remaining;

            if (remaining <= 0) {
                clearInterval(interval);
                timerEl.textContent = '\u2713';
                timerEl.classList.add('done');
                onComplete();
            }
        }, 1000);
    }

    // ── Show continue button ────────────────────────────────

    function showContinueButton(afterEl, label, onClick) {
        var wrap = document.createElement('div');
        wrap.className = 'how7o-ad-continue-wrap';

        var btn = document.createElement('button');
        btn.className = 'how7o-ad-continue-btn';
        btn.textContent = label;
        btn.type = 'button';

        wrap.appendChild(btn);

        afterEl.parentNode.insertBefore(wrap, afterEl.nextSibling);
        scrollToEl(wrap);

        btn.addEventListener('click', function () {
            btn.disabled = true;
            btn.textContent = 'Please wait...';
            wrap.parentNode.removeChild(wrap);
            onClick();
        });
    }

    // ── Complete step via API ────────────────────────────────

    function completeStep() {
        fetch(API_BASE + 'how7o/v1/complete-step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data.status === 'ok') {
                if (data.final_url) {
                    // All steps done — redirect to pixibb.
                    sessionStorage.removeItem(STORAGE_KEY);
                    window.location.href = data.final_url;
                } else if (data.next_url) {
                    // More steps — go to next page.
                    window.location.href = data.next_url;
                }
            } else {
                // Error — clear session, go home.
                sessionStorage.removeItem(STORAGE_KEY);
                window.location.href = HOME_URL;
            }
        })
        .catch(function () {
            sessionStorage.removeItem(STORAGE_KEY);
            window.location.href = HOME_URL;
        });
    }
})();
