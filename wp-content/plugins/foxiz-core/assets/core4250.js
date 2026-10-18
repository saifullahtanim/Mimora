/** FOXIZ_CORE_SCRIPT */
var FOXIZ_CORE_SCRIPT = (function (Module, $) {
    "use strict";

    Module.init = function () {
        this.yesStorage = this.isStorageAvailable();
        this._body = $('body');
        this.themeSettings = foxizCoreParams || {};
        this.darkModeID = this.themeSettings.darkModeID || 'RubyDarkMode';
        this.mSiteID = this.themeSettings.mSiteID || null;
        this.isCMode = document.body.classList.contains("is-cmode");
        this.personalizeUID = this.getUserUUID();
        this.initDarkModeCookie();
        this.switchDarkMode();
        this.noteToggle();
        this.passwordToggle();
        this.emailToDownload();
    }

    /**
     * generate UUID
     * @returns {string}
     */
    Module.generateUUID = function () {
        const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < 7; i++) {
            const randomIndex = Math.floor(Math.random() * alphabet.length);
            id += alphabet[randomIndex];
        }
        return id;
    }

    /**
     * set cookies
     * @param name
     * @param value
     * @param days
     */
    Module.setCookie = function (name, value, days = 60) {

        const date = new Date();
        date.setTime(date.getTime() + Math.round(days * 24 * 60 * 60 * 1000));

        const expires = '; expires=' + date.toUTCString();
        const cookieDomain = this.themeSettings.cookieDomain || '';
        const cookiePath = this.themeSettings.cookiePath || '/';

        document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=' + cookiePath + '; domain=' + cookieDomain;
    }

    /**
     * get cookie
     * @param name
     * @returns {string|null}
     */
    Module.getCookie = function (name) {
        const nameEQ = name + '=';
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i];
            while (cookie.charAt(0) == ' ') cookie = cookie.substring(1, cookie.length);
            if (cookie.indexOf(nameEQ) == 0) return decodeURIComponent(cookie.substring(nameEQ.length, cookie.length));
        }
        return null;
    }

    /**
     * delete cookies
     * @param name
     */
    Module.deleteCookie = function (name) {
        const cookieDomain = this.themeSettings.cookieDomain || '';
        const cookiePath = this.themeSettings.cookiePath || '/';
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=' + cookiePath + '; domain=' + cookieDomain;
    }

    /**
     *
     * @returns {boolean}
     */
    Module.isStorageAvailable = function () {
        let storage;
        try {
            storage = window['localStorage'];
            storage.setItem('__rbStorageSet', 'x');
            storage.removeItem('__rbStorageSet');
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * set localStorage
     * @param key
     * @param data
     */
    Module.setStorage = function (key, data) {
        this.yesStorage && localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
    }

    /**
     * get localStorage
     * @param key
     * @param defaultValue
     * @returns {any}
     */
    Module.getStorage = function (key, defaultValue) {
        if (!this.yesStorage) return null;
        const data = localStorage.getItem(key);
        if (data === null) return defaultValue;
        try {
            return JSON.parse(data);
        } catch (e) {
            return data;
        }
    }

    /**
     * delelte localStorage
     * @param key
     */
    Module.deleteStorage = function (key) {
        this.yesStorage && localStorage.removeItem(key);
    }

    /**
     * create UUID
     * @returns {string|*}
     */
    Module.getUserUUID = function () {

        let uuid;
        if (this.getCookie('RBUUID')) {
            uuid = this.getCookie('RBUUID');
        } else {
            uuid = this.getStorage('RBUUID', null);
            if (null === uuid) {
                uuid = this.generateUUID();
                this.setStorage('RBUUID', uuid);
                this.themeSettings.yesPersonalized && this.setCookie('personalize_sync', 'yes', 1);
            }
            this.themeSettings.yesPersonalized && this.setCookie('RBUUID', uuid);
        }

        if (this.mSiteID) {
            uuid = this.mSiteID + uuid;
        }

        return uuid;
    }

    Module.initDarkModeCookie = function () {
        if (this.isCMode && !this.getCookie(this.darkModeID)) {
            this.setCookie(this.darkModeID, document.body.getAttribute('data-theme'));
        }
    }

    Module.setDarkModeCookie = function (name, value) {
        if (this.isCMode) {
            this.setCookie(name, value);
        }
    }

    Module.switchDarkMode = function () {
        const self = this;
        const toggleSelector = '.dark-mode-toggle';
        const iconDefault = $('.mode-icon-default');
        const iconDark = $('.mode-icon-dark');

        $(toggleSelector).off('click').on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const target = $(this);
            if (!target.hasClass('triggered')) {
                target.addClass('triggered');
            }

            const useStorage = !self.isCMode && self.yesStorage;
            const currentMode = useStorage
                ? self.getStorage(self.darkModeID)
                : document.body.getAttribute('data-theme');

            const isDark = currentMode === 'dark';
            const nextMode = isDark ? 'default' : 'dark';

            if (useStorage) {
                self.setStorage(self.darkModeID, nextMode);
            }
            self.setDarkModeCookie(self.darkModeID, nextMode);
            self._body.attr('data-theme', nextMode).addClass('switch-smooth');

            iconDefault.toggleClass('activated', nextMode === 'default');
            iconDark.toggleClass('activated', nextMode === 'dark');
        });
    };


    /** share action */
    Module.shareTrigger = function () {

        $('a.share-trigger').off('click').on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.open($(this).attr('href'), '_blank', 'width=600, height=350');
            return false;
        });

        const copyButton = $('a.copy-trigger');
        if (navigator.clipboard) {
            copyButton.off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const target = $(this);
                const link = target.data('link');
                const copied = target.data('copied');
                if (link) {
                    navigator.clipboard.writeText(link).then(
                        function () {
                            $('body').find('.tipsy-inner').html((copied));
                        }).catch(function () {
                    });
                }
            });
        } else {
            copyButton.hide();
        }

        const shareButton = $('a.native-share-trigger');
        if (navigator.share) {
            shareButton.on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const target = $(this);
                const link = target.data('link');
                const title = target.data('ptitle');
                navigator.share({
                    title: title,
                    url: link
                })
            });
        } else {
            shareButton.hide();
        }
    };

    /** single infinite load */
    Module.loadGoogleAds = function (response) {
        const googleAds = $(response).find('.adsbygoogle');
        if (typeof window.adsbygoogle !== 'undefined' && googleAds.length) {
            var adsbygoogle;
            googleAds.each(function () {
                (adsbygoogle = window.adsbygoogle || []).push({});
            });
        }
    }

    Module.loadInstagram = function (response) {
        let instEmbed = $(response).find('.instagram-media');
        if ('undefined' !== typeof window.instgrm) {
            window.instgrm.Embeds.process();
        } else if (instEmbed.length && 'undefined' === typeof window.instgrm) {
            const embedJS = document.createElement('script');
            embedJS.src = 'https://www.instagram.com/embed.js';
            embedJS.onload = function () {
                window.instgrm.Embeds.process();
            };
            this._body.append(embedJS);
        }
    }

    Module.loadTwttr = function () {
        if (typeof twttr !== 'undefined' && typeof twttr.widgets !== 'undefined') {
            twttr.ready(function (twttr) {
                twttr.widgets.load();
            });
        }
    }

    Module.updateGA = function (article) {
        const gaURL = article.postURL.replace(/https?:\/\/[^\/]+/i, '');
        if (typeof _gaq !== 'undefined' && _gaq !== null) {
            _gaq.push(['_trackPageview', gaURL]);
        }
        if (typeof ga !== 'undefined' && ga !== null) {
            ga('send', 'pageview', gaURL);
        }
        if (typeof __gaTracker !== 'undefined' && __gaTracker !== null) {
            __gaTracker('send', 'pageview', gaURL);
        }

        if (window.googletag && googletag.pubadsReady) {
            googletag.pubads().refresh();
        }
    }

    Module.noteToggle = function () {
        $('.yes-toggle > .note-header').on('click', function () {
            let wrapper = $(this).parent();
            let timing = wrapper.hasClass('is-inline') ? 0 : 300;

            wrapper.toggleClass('explain');
            wrapper.find('.note-content').slideToggle(timing);
        });
    }

    Module.passwordToggle = function () {
        $('.rb-password-toggle').on('click', function () {
            const $this = $(this);
            const $input = $this.prev('input');
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

    Module.isValidEmail = function (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    Module.emailToDownload = function () {
        const self = this;

        $('.download-form').each(function () {
            const form = $(this);
            const acceptTermsCheckbox = form.find('input[name="acceptTerms"]');
            const submitButton = form.find('input[type="submit"]');
            const noticeText = form.find('.notice-text');

            if (acceptTermsCheckbox.length > 0) {
                acceptTermsCheckbox.change(function () {
                    submitButton.prop('disabled', !this.checked);
                });
            }

            form.submit(function (event) {
                event.preventDefault();

                const emailInput = form.find('input[name="EMAIL"]');
                const email = emailInput.val();
                const label = form.find('input[type="submit"]').val();
                noticeText.empty();

                if (!self.isValidEmail(email)) {
                    const errorNotice = 'Please enter a valid email address.';
                    noticeText.text(errorNotice);
                    return;
                }

                const wrapper = form.parents('.gb-download');
                wrapper.addClass('submitting');

                $.ajax({
                    url: self.themeSettings.ajaxurl || null,
                    method: 'POST',
                    data: form.serialize(),
                    success: function (response) {
                        const fileURL = response.file;
                        if (fileURL) {
                            const link = document.createElement('a');
                            link.href = fileURL;
                            link.setAttribute('download', '');
                            link.click();
                            const newContent = `<div class="fallback-info">${response.message}</div><a href="${response.file}" download="" rel="nofollow" class="is-btn gb-download-btn fallback-download-btn">${label}</a>`;
                            form.replaceWith(newContent);
                        } else {
                            noticeText.text(response.message);
                        }
                        wrapper.removeClass('submitting');
                    }
                });
            });
        });
    };

    return Module;

}(FOXIZ_CORE_SCRIPT || {}, jQuery));

jQuery(document).ready(function () {
    FOXIZ_CORE_SCRIPT.init();
});

jQuery(window).on('load', function () {
    FOXIZ_CORE_SCRIPT.shareTrigger();
});