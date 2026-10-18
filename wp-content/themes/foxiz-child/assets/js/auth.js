/**
 * Mimora Authentication & EmailJS Confirmation System
 * Handles Login, Registration, Forgot Password, Email Confirmation Screen, and Resend Email
 */
(function ($) {
    'use strict';

    const STORAGE_KEY = 'mimora_current_user';

    // Helper: Get currently logged in user
    function getCurrentUser() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    // Helper: Set currently logged in user
    function setCurrentUser(user) {
        if (!user) {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        }
        updateNavbarState();
    }

    // Helper: Show alert banner inside card
    function showAlert(container, message, isError = false) {
        if (!container) return;
        const $el = $(container);
        $el.stop(true, true).hide();
        $el.removeClass('mimora-alert-success mimora-alert-error')
            .addClass(isError ? 'mimora-alert-error' : 'mimora-alert-success')
            .html(`
                <span class="mimora-alert-icon">${isError ? '⚠️' : '✓'}</span>
                <span class="mimora-alert-text">${message}</span>
            `)
            .fadeIn(200);
    }

    function clearAlert(container) {
        if (container) {
            $(container).hide().empty();
        }
    }

    // Update the header navbar to show logged-in user
    function updateNavbarState() {
        const user = getCurrentUser();
        const $loginHolders = $('.wnav-holder.widget-h-login, .mobile-collapse .mobile-login-wrap');
        
        if (!$loginHolders.length) return;

        if (user) {
            const initial = (user.name || user.username || 'U').charAt(0).toUpperCase();
            const displayName = user.name || user.username || 'User';

            const avatarHtml = user.avatar
                ? `<img src="${user.avatar}" class="mimora-user-avatar-img" alt="${displayName}" title="${displayName}">`
                : `<span class="mimora-user-avatar" title="${displayName}">${initial}</span>`;

            $('.widget-h-login').html(`
                <div class="mimora-user-menu-trigger" data-title="${displayName}" style="display:inline-flex; align-items:center; cursor:pointer;">
                    ${avatarHtml}
                </div>
                <div class="mimora-user-dropdown" style="display:none;">
                    <div class="mimora-user-dropdown-header">
                        <strong>${displayName}</strong>
                        <small>@${user.username || 'user'}</small>
                    </div>
                    <div class="mimora-user-dropdown-divider"></div>
                    <a href="/profile/" class="mimora-user-dropdown-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span>Profile & Settings</span>
                    </a>
                    <div class="mimora-user-dropdown-divider"></div>
                    <a href="#" class="mimora-user-logout-btn">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        <span>Log Out</span>
                    </a>
                </div>
            `);

            // Logout click handler
            $('.mimora-user-logout-btn').off('click').on('click', function (e) {
                e.preventDefault();
                setCurrentUser(null);
                window.location.reload();
            });

            // Toggle dropdown
            $('.mimora-user-menu-trigger').off('click').on('click', function (e) {
                e.stopPropagation();
                $(this).next('.mimora-user-dropdown').fadeToggle(150);
            });

            $(document).on('click', function () {
                $('.mimora-user-dropdown').fadeOut(150);
            });
        }
    }

    // Setup Password Toggles
    function initPasswordToggles() {
        $(document).on('click', '.rb-password-toggle', function () {
            const $this = $(this);
            const $input = $this.siblings('input');
            const $icon = $this.find('i');

            if ($input.attr('type') === 'password') {
                $input.attr('type', 'text');
                $icon.removeClass('rbi-show').addClass('rbi-hide');
            } else {
                $input.attr('type', 'password');
                $icon.removeClass('rbi-hide').addClass('rbi-show');
            }
        });
    }

    // Render the Email Confirmation Card (Matches user's screenshot 1:1)
    function renderConfirmationScreen(targetContainer, { email, title, message, type = 'activation' }) {
        const headingText = title || (type === 'reset' ? 'Password Reset Email Sent' : 'Email Confirmation Required');
        const defaultMsg = type === 'reset'
            ? `We sent the password reset link to <strong style="color:var(--body-fcolor, #0f172a); font-weight:700;">${email}</strong>. Check your inbox to reset your password. If the email is not in your inbox, please check the Spam folder. Thank you.`
            : `We sent the email to <strong style="color:var(--body-fcolor, #0f172a); font-weight:700;">${email}</strong>. Check your inbox to activate the account. If the confirmation email is not in your inbox, please check the Spam. Thank you.`;

        const html = `
            <div class="email-confirm-card" style="text-align: center; padding: 10px 5px 5px;">
                <div class="confirm-icon" style="margin-bottom: 22px;">
                    <div style="width: 64px; height: 64px; margin: 0 auto; border-radius: 18px; background: rgba(72, 140, 191, 0.12); display: flex; align-items: center; justify-content: center; color: var(--g-color, #488cbf);">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                    </div>
                </div>
                <h2 class="confirm-heading" style="font-size: 26px; font-weight: 800; color: var(--h1-fcolor, #1e293b); margin-bottom: 14px; line-height: 1.25;">
                    ${headingText}
                </h2>
                <p class="confirm-text" style="font-size: 15px; line-height: 1.6; color: #64748b; margin-bottom: 26px;">
                    ${message || defaultMsg}
                </p>
                <button type="button" class="button button-primary resend-email-btn" data-email="${email}" data-type="${type}" style="width: 100%; height: 46px; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 12 12 8 8 12"></polyline><line x1="12" y1="16" x2="12" y2="8"></line></svg>
                    <span class="resend-text">Resend Email</span>
                </button>
                <div style="margin-top: 20px;">
                    <a href="#" class="back-to-login-link" style="color: var(--g-color, #488cbf); font-weight: 600; font-size: 14px; text-decoration: none;">← Back to Log In</a>
                </div>
            </div>
        `;

        $(targetContainer).html(html);
    }

    // Setup Modal Toggle between Login, Signup, Forgot Password, and Confirmation
    function initModalToggles() {
        // When opening the login popup fresh from navbar
        $(document).on('click', '.login-toggle', function () {
            $('#auth-modal-title').text('Welcome Back!');
            $('#auth-modal-subtitle').text('Sign in to your account');
            clearAlert('#auth-modal-alert');
            $('#modal-signup-view').hide();
            $('#modal-forgot-view').hide();
            $('#modal-confirm-view').hide();
            $('.login-popup-header').show();
            $('#modal-login-view').show();
        });

        // Switch to Sign Up
        $(document).on('click', '#rb-switch-to-signup', function (e) {
            e.preventDefault();
            $('#auth-modal-title').text('Create Account');
            $('#auth-modal-subtitle').text('Join Mimora for free');
            clearAlert('#auth-modal-alert');
            $('#modal-login-view, #modal-forgot-view, #modal-confirm-view').hide();
            $('.login-popup-header').show();
            $('#modal-signup-view').stop(true, true).fadeIn(150);
        });

        // Switch to Log In
        $(document).on('click', '#rb-switch-to-login, .back-to-login-link', function (e) {
            e.preventDefault();
            $('#auth-modal-title').text('Welcome Back!');
            $('#auth-modal-subtitle').text('Sign in to your account');
            clearAlert('#auth-modal-alert');
            $('#modal-signup-view, #modal-forgot-view, #modal-confirm-view').hide();
            $('.login-popup-header').show();
            $('#modal-login-view').stop(true, true).fadeIn(150);
        });

        // Switch to Forgot Password
        $(document).on('click', '.lostpassw-link', function (e) {
            e.preventDefault();
            $('#auth-modal-title').text('Reset Password');
            $('#auth-modal-subtitle').text('Enter your email to receive a password reset link');
            clearAlert('#auth-modal-alert');
            $('#modal-login-view, #modal-signup-view, #modal-confirm-view').hide();
            $('.login-popup-header').show();
            $('#modal-forgot-view').stop(true, true).fadeIn(150);
        });

        // Resend Email Button Handler
        $(document).on('click', '.resend-email-btn', async function (e) {
            e.preventDefault();
            const btn = $(this);
            const email = btn.attr('data-email');
            const type = btn.attr('data-type') || 'activation';

            if (btn.prop('disabled')) return;

            btn.prop('disabled', true);
            const originalHtml = btn.html();
            btn.html('<span>Sending...</span>');

            try {
                const response = await fetch('/api/resend-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, type })
                });

                const data = await response.json();
                if (data.success) {
                    btn.html('<span>✓ Email Resent! Check Inbox/Spam</span>');
                    setTimeout(() => {
                        btn.prop('disabled', false).html(originalHtml);
                    }, 4000);
                } else {
                    btn.html('<span>⚠️ ' + (data.message || 'Failed to resend') + '</span>');
                    setTimeout(() => {
                        btn.prop('disabled', false).html(originalHtml);
                    }, 3000);
                }
            } catch (err) {
                console.error('Resend error:', err);
                btn.html('<span>⚠️ Connection error</span>');
                setTimeout(() => {
                    btn.prop('disabled', false).html(originalHtml);
                }, 3000);
            }
        });
    }

    // Setup Signup Handler (With Email Confirmation Message)
    function initSignupForms() {
        $(document).on('submit', '#popup-signup-form, #page-signup-form', async function (e) {
            e.preventDefault();
            const form = $(this);
            const isPage = form.attr('id') === 'page-signup-form';
            const alertBox = isPage ? '#page-signup-alert' : '#auth-modal-alert';
            const submitBtn = form.find('input[type="submit"]');

            const name = form.find('input[name="name"]').val() || '';
            const username = (form.find('input[name="username"]').val() || '').trim();
            const email = (form.find('input[name="email"]').val() || '').trim();
            const password = form.find('input[name="password"]').val() || '';
            const confirmPass = form.find('input[name="confirm_password"]').val();

            // Client Validation
            if (!username || !email || !password) {
                showAlert(alertBox, 'Please fill in all required fields.', true);
                return;
            }

            if (confirmPass !== undefined && confirmPass !== password) {
                showAlert(alertBox, 'Passwords do not match. Please check again.', true);
                return;
            }

            if (password.length < 6) {
                showAlert(alertBox, 'Password must be at least 6 characters long.', true);
                return;
            }

            // UI state: loading
            submitBtn.prop('disabled', true).val('Creating Account & Sending Email...');
            clearAlert(alertBox);

            try {
                const response = await fetch('/api/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, username, email, password })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    form[0].reset();

                    if (!isPage) {
                        // In modal: hide header and show Email Confirmation Card
                        $('.login-popup-header').hide();
                        $('#modal-signup-view, #modal-login-view, #modal-forgot-view').hide();
                        $('#modal-confirm-view').stop(true, true).fadeIn(150);
                        renderConfirmationScreen('#modal-confirm-view', {
                            email: email,
                            type: 'activation'
                        });
                    } else {
                        // On signup page: swap card content to Email Confirmation Card
                        $('.mimora-auth-page-card .logo-popup').html(`
                            <div id="page-confirm-view"></div>
                        `);
                        renderConfirmationScreen('#page-confirm-view', {
                            email: email,
                            type: 'activation'
                        });
                    }
                } else {
                    showAlert(alertBox, data.message || 'Could not create account.', true);
                }
            } catch (err) {
                console.error('Signup error:', err);
                showAlert(alertBox, 'Connection error. Please ensure server is running.', true);
            } finally {
                submitBtn.prop('disabled', false).val('Create Account');
            }
        });
    }

    // Render Recover Password Form (Matches user's Screen 1)
    function renderRecoverForm(targetContainer) {
        const html = `
            <div class="recover-form-card" style="padding: 5px 5px 15px;">
                <div style="margin-bottom: 18px;">
                    <img src="/wp-content/uploads/2026/01/logo.png" alt="Mimora" style="height:32px; width:auto; display:block;">
                </div>
                <h2 style="font-size: 28px; font-weight: 800; color: var(--h1-fcolor, #1e293b); margin-bottom: 22px; line-height: 1.2;">Recover Your Password</h2>
                <div id="modal-forgot-alert" class="mimora-auth-alert" style="display:none;"></div>
                <form id="popup-forgot-form" action="#" method="post">
                    <div style="margin-bottom: 22px;">
                        <label class="rb-login-label" style="font-weight: 600; font-size: 14px; margin-bottom: 8px; display:block; color:#475569;">
                            Your Email <span style="color:#ef4444;">*</span>
                        </label>
                        <input type="email" name="forgot_email" required="required" autocomplete="email" placeholder="you@example.com" class="input" style="width:100%; height:46px; border:1.5px solid #e2e8f0; border-radius:6px; padding:0 14px;" />
                    </div>
                    <button type="submit" class="button button-primary" style="width: 100%; height: 46px; border-radius: 6px; font-weight: 700; font-size: 15px; background:#3b5998; border:none; color:#fff; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12 11 15 16 9"></polyline></svg>
                        <span>Send Instructions</span>
                    </button>
                </form>
                <div style="margin-top: 22px; text-align: center;">
                    <a href="#" class="back-to-login-link" style="color: #3b5998; font-weight: 600; font-size: 14px; text-decoration: none;">← Back to Log In</a>
                </div>
            </div>
        `;
        $(targetContainer).html(html).show();
    }

    // Render Recover Sent Confirmation (Matches user's Screen 2)
    function renderRecoverSentScreen(targetContainer) {
        const html = `
            <div class="recover-sent-card" style="padding: 10px 5px 15px;">
                <div style="margin-bottom: 18px;">
                    <img src="/wp-content/uploads/2026/01/logo.png" alt="Mimora" style="height:32px; width:auto; display:block;">
                </div>
                <h2 style="font-size: 28px; font-weight: 800; color: var(--h1-fcolor, #1e293b); margin-bottom: 20px; line-height: 1.25;">Recover Your Password</h2>
                <p style="font-size: 15.5px; line-height: 1.65; color: #475569; margin-bottom: 25px;">
                    If we find an eligible account associated with that address, we will send an email to the address containing further instructions to recover your password.
                </p>
                <div style="margin-top: 25px; text-align: center;">
                    <a href="#" class="back-to-login-link" style="color: #3b5998; font-weight: 600; font-size: 14px; text-decoration: none;">← Back to Log In</a>
                </div>
            </div>
        `;
        $(targetContainer).html(html).show();
    }

    // Setup Forgot Password Handler
    function initForgotPasswordForms() {
        // When clicking "Lost your password?" link in login modal
        $(document).on('click', '.lostpassw-link', function (e) {
            e.preventDefault();
            $('.login-popup-header').hide();
            $('#modal-login-view, #modal-signup-view, #modal-confirm-view').hide();
            $('#modal-forgot-view').stop(true, true).fadeIn(150);
            renderRecoverForm('#modal-forgot-view');
        });

        $(document).on('submit', '#popup-forgot-form, #page-forgot-form', async function (e) {
            e.preventDefault();
            const form = $(this);
            const isPage = form.attr('id') === 'page-forgot-form';
            const alertBox = isPage ? '#page-forgot-alert' : '#modal-forgot-alert';
            const submitBtn = form.find('button[type="submit"], input[type="submit"]');

            const email = (form.find('input[name="forgot_email"]').val() || '').trim();

            if (!email) {
                showAlert(alertBox, 'Please enter your account email address.', true);
                return;
            }

            submitBtn.prop('disabled', true).html('<span>Sending Instructions...</span>');
            clearAlert(alertBox);

            try {
                const response = await fetch('/api/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                // Transition to Screen 2
                if (!isPage) {
                    $('.login-popup-header').hide();
                    $('#modal-signup-view, #modal-login-view').hide();
                    renderRecoverSentScreen('#modal-forgot-view');
                } else {
                    renderRecoverSentScreen('.mimora-auth-page-card .logo-popup');
                }
            } catch (err) {
                console.error('Forgot password error:', err);
                if (!isPage) {
                    renderRecoverSentScreen('#modal-forgot-view');
                } else {
                    renderRecoverSentScreen('.mimora-auth-page-card .logo-popup');
                }
            }
        });
    }

    // Setup Login Handler
    function initLoginForms() {
        $(document).on('submit', '#popup-form, #page-login-form', async function (e) {
            e.preventDefault();
            const form = $(this);
            const isPage = form.attr('id') === 'page-login-form';
            const alertBox = isPage ? '#page-login-alert' : '#auth-modal-alert';
            const submitBtn = form.find('input[type="submit"]');

            const log = (form.find('input[name="log"]').val() || '').trim();
            const pwd = form.find('input[name="pwd"]').val() || '';

            if (!log || !pwd) {
                showAlert(alertBox, 'Please enter both your username/email and password.', true);
                return;
            }

            submitBtn.prop('disabled', true).val('Signing in...');
            clearAlert(alertBox);

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ log, pwd })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    showAlert(alertBox, 'Welcome back! Login successful.', false);
                    setCurrentUser(data.user);

                    setTimeout(() => {
                        if (!isPage && $.magnificPopup) {
                            $.magnificPopup.close();
                        } else if (isPage) {
                            window.location.href = '/';
                        }
                    }, 800);
                } else {
                    showAlert(alertBox, data.message || 'Invalid login credentials.', true);
                }
            } catch (err) {
                console.error('Login error:', err);
                showAlert(alertBox, 'Connection error. Please try again.', true);
            } finally {
                submitBtn.prop('disabled', false).val('Log In');
            }
        });
    }

    // Auto-open Login Popup if coming from Email Verification or Password Reset
    function checkUrlAuthActions() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const isVerified = urlParams.get('verified') === '1';
            const isResetSuccess = urlParams.get('reset_success') === '1';
            const verifyError = urlParams.get('verified_error');
            const verifiedEmail = urlParams.get('email') || '';

            if (isVerified || isResetSuccess || verifyError) {
                if (window.history && window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }

                setTimeout(() => {
                    const $loginBtn = $('.login-toggle').first();
                    if ($loginBtn.length) {
                        $loginBtn.trigger('click');
                    } else if ($.magnificPopup && $('#rb-user-popup-form').length) {
                        $.magnificPopup.open({
                            items: { src: '#rb-user-popup-form' },
                            type: 'inline',
                            mainClass: 'rb-popup-center',
                            closeMarkup: '<span class="close-popup-btn mfp-close"><span class="close-icon"></span></span>'
                        });
                    }

                    $('#modal-signup-view, #modal-forgot-view, #modal-confirm-view').hide();
                    $('.login-popup-header').show();
                    $('#modal-login-view').show();

                    if (isVerified) {
                        $('#auth-modal-title').text('Email Verified!');
                        $('#auth-modal-subtitle').text('Your account is active. Please log in.');
                        showAlert('#auth-modal-alert', 'Email verified successfully! You can now log in.', false);
                        if (verifiedEmail) {
                            $('#popup-form input[name="log"]').val(verifiedEmail);
                            setTimeout(() => {
                                $('#popup-form input[name="pwd"]').focus();
                            }, 350);
                        }
                    } else if (isResetSuccess) {
                        $('#auth-modal-title').text('Password Reset!');
                        $('#auth-modal-subtitle').text('Please sign in with your new password.');
                        showAlert('#auth-modal-alert', 'Password has been updated! Please log in.', false);
                        if (verifiedEmail) {
                            $('#popup-form input[name="log"]').val(verifiedEmail);
                            setTimeout(() => {
                                $('#popup-form input[name="pwd"]').focus();
                            }, 350);
                        }
                    } else if (verifyError) {
                        showAlert('#auth-modal-alert', 'Verification link is invalid or has expired.', true);
                    }
                }, 250);
            }
        } catch (e) {
            console.warn('checkUrlAuthActions error:', e);
        }
    }

    // DOM Ready initialization
    $(document).ready(function () {
        initPasswordToggles();
        initModalToggles();
        initSignupForms();
        initForgotPasswordForms();
        initLoginForms();
        updateNavbarState();
        checkUrlAuthActions();
    });

})(jQuery);
