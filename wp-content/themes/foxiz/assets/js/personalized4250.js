/**  FOXIZ_PERSONALIZE */
var FOXIZ_PERSONALIZE = (function (Module, $) {
        'use strict';

        Module.initParams = function () {

            this.yesStorage = this.isStorageAvailable();
            this.ajaxURL = typeof foxizCoreParams !== 'undefined' ? foxizCoreParams.ajaxurl || '' : '';
            this.syncTimeout = 0.5; //12 hours
            this.personalizeUID =
                (typeof FOXIZ_CORE_SCRIPT !== "undefined" && FOXIZ_CORE_SCRIPT.personalizeUID !== undefined)
                    ? FOXIZ_CORE_SCRIPT.personalizeUID
                    : 'u0';
            this._body = $('body');
            this.isProgress = false;
            this.checkPersonalize();

            this.personalizePopup = $('#bookmark-notification');
            this.yesPopup = this.personalizePopup.length || false;

            this.followPopupTemplate = $('#follow-notification-template').html();
            this.savedPopupTemplate = $('#bookmark-notification-template').html();

            if ('ask_login' === this.pesonalizeMode) {
                this.bookmarkToggleTemplate = $('#bookmark-ask-login-template').html();
                this.followToggleTemplate = $('#follow-ask-login-template').html();
            } else {
                this.bookmarkToggleTemplate = $('#bookmark-toggle-template').html();
                this.followToggleTemplate = $('#follow-toggle-template').html();
            }
        }

        Module.init = function () {

            this.initParams();

            if (FOXIZ_CORE_SCRIPT.getCookie('personalize_sync') || this.syncInterval()) {
                this.syncPersonalizeData();
            } else {
                this.syncPersonalizeLayout();
            }
            this.keepPersonalizePopup();
            this.readingListTemplate();
            this.bookmarkToggle();
            this.followCategoryToggle();
            this.followWriterToggle();
        }

        Module.getSavedKey = function (id) {
            return this.personalizeUID + '-saved-' + id;
        }

        Module.getCategoryFollowKey = function (id) {
            return this.personalizeUID + '-cat-' + id;
        }

        Module.getWriterFollowKey = function (id) {
            return this.personalizeUID + '-writer-' + id;
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

        /** Sync bookmarks for logged-in user across devices. */
        Module.syncInterval = function () {

            const isLogged = FOXIZ_CORE_SCRIPT.getCookie('u_logged');
            const syncTimeout = !FOXIZ_CORE_SCRIPT.getCookie('syncTimeout');

            return isLogged && syncTimeout;
        }

        /**
         * check checkPersonalize
         */
        Module.checkPersonalize = function () {
            this.pesonalizeMode = 'yes';
            let setting = 'all';
            const isLogged = FOXIZ_CORE_SCRIPT.getCookie('u_logged');
            if (this._body.hasClass('personalized-logged-only')) {
                setting = 'logged';
            } else if (this._body.hasClass('personalized-ask-login')) {
                setting = 'login';
            }
            if (!isLogged) {
                if ('login' === setting) {
                    this.pesonalizeMode = 'ask_login';
                } else if ('logged' === setting) {
                    this.pesonalizeMode = 'no';
                }
            }
        };

        /** saved a post */
        Module.bookmarkToggle = function () {

            const self = this;
            self._body.on('click', '.bookmark-trigger', function (e) {

                e.preventDefault();
                e.stopPropagation();

                const target = $(this);
                const pid = target.data('pid');

                if (!pid || self.isProgress) {
                    return false;
                }

                self.isProgress = true;
                clearTimeout(self.personalizeTimeout);
                target.addClass('in-progress');

                const storageKey = self.getSavedKey(pid);
                let savedPopupTemplate = self.savedPopupTemplate;

                let type = 'save';
                if (target.hasClass('bookmarked')) {
                    type = 'remove';
                }

                $.ajax({
                    type: 'POST',
                    url: self.ajaxURL,
                    data: {
                        action: 'rbbookmark',
                        pid: pid,
                        type: type,
                        uuid: self.personalizeUID
                    },

                    success: function (response) {

                        response = JSON.parse(JSON.stringify(response));
                        if ('save' === type) {
                            $('.bookmark-trigger[data-pid=' + pid + ']').css('opacity', 0).addClass('bookmarked').animate({opacity: 1}, 250);
                            self.setStorage(storageKey, '1');
                            if (self.yesPopup) {
                                savedPopupTemplate = savedPopupTemplate.replace('{{classes}}', 'added');
                            }
                        } else {
                            $('.bookmark-trigger[data-pid=' + pid + ']').css('opacity', 0).removeClass('bookmarked').animate({opacity: 1}, 250);
                            self.deleteStorage(storageKey);
                            if (self.yesPopup) {
                                savedPopupTemplate = savedPopupTemplate.replace('{{classes}}', 'removed');
                            }
                        }

                        target.removeClass('in-progress');
                        self.isProgress = false;

                        if (self.yesPopup) {
                            savedPopupTemplate = savedPopupTemplate
                                .replace('{{image}}', response.image)
                                .replace('{{title}}', response.title)
                                .replace('{{description}}', response.description);

                            clearTimeout(self.personalizeTimeout);
                            self.personalizePopup.empty();
                            self.personalizePopup.append(savedPopupTemplate);
                            self.personalizePopup.fadeIn(300);

                            self.personalizeTimeout = setTimeout(function () {
                                self.personalizePopup.fadeOut(600);
                            }, 2000);
                        }
                    }
                });
            });
        }

        /** follow category */
        Module.followCategoryToggle = function () {

            if ('no' === this.pesonalizeMode) {
                return;
            }

            const self = this;
            self._body.on('click', '.follow-trigger[data-cid]', function (e) {

                e.preventDefault();
                e.stopPropagation();

                var target = $(this);
                var cid = target.data('cid');

                if (!cid || self.isProgress) {
                    return false;
                }

                self.isProgress = true;
                clearTimeout(self.personalizeTimeout);
                target.addClass('in-progress');

                const storageKey = self.getCategoryFollowKey(cid);
                let followPopupTemplate = self.followPopupTemplate;
                const catName = target.data('name');

                let type = 'follow';
                if (target.hasClass('followed')) {
                    type = 'unfollow';
                }

                $.ajax({
                    type: 'POST',
                    url: self.ajaxURL,
                    data: {
                        uuid: self.personalizeUID,
                        action: 'rb_follow_category',
                        cid: cid,
                        type: type,
                    },
                    success: function (response) {
                        response = JSON.parse(JSON.stringify(response));
                        if ('follow' === type) {
                            $('.follow-trigger[data-cid=' + cid + ']').css('opacity', 0).addClass('followed').animate({opacity: 1}, 150);
                            self.setStorage(storageKey, '1');
                            if (self.yesPopup) {
                                followPopupTemplate = followPopupTemplate.replace('{{classes}}', 'added');
                            }
                        } else {
                            $('.follow-trigger[data-cid=' + cid + ']').css('opacity', 0).removeClass('followed').animate({opacity: 1}, 150);
                            self.deleteStorage(storageKey);
                            if (self.yesPopup) {
                                followPopupTemplate = followPopupTemplate.replace('{{classes}}', 'removed');
                            }
                        }

                        target.removeClass('in-progress');
                        self.isProgress = false;

                        if (self.yesPopup) {
                            followPopupTemplate = followPopupTemplate
                                .replace('{{description}}', response.description)
                                .replace('{{name}}', catName);

                            clearTimeout(self.personalizeTimeout);
                            self.personalizePopup.empty();
                            self.personalizePopup.append(followPopupTemplate);
                            self.personalizePopup.fadeIn(300);
                            self.personalizeTimeout = setTimeout(function () {
                                self.personalizePopup.fadeOut(600);
                            }, 2000);
                        }
                    }
                });
            });
        }

        /** follow writer */
        Module.followWriterToggle = function () {

            if ('no' === this.pesonalizeMode) {
                return;
            }

            const self = this;
            self._body.on('click', '.follow-trigger[data-uid]', function (e) {

                e.preventDefault();
                e.stopPropagation();

                var target = $(this);
                var uid = target.data('uid');

                if (!uid || self.isProgress) {
                    return false;
                }

                self.isProgress = true;
                clearTimeout(self.personalizeTimeout);
                target.addClass('in-progress');

                const storageKey = self.getWriterFollowKey(uid);
                let followPopupTemplate = self.followPopupTemplate;
                const authName = target.data('name');

                let type = 'follow';
                if (target.hasClass('followed')) {
                    type = 'unfollow';
                }

                $.ajax({
                    type: 'POST',
                    url: self.ajaxURL,
                    data: {
                        uuid: self.personalizeUID,
                        action: 'rb_follow_writer',
                        uid: uid,
                        type: type,
                    },
                    success: function (response) {

                        response = JSON.parse(JSON.stringify(response));

                        if ('follow' === type) {
                            $('.follow-trigger[data-uid=' + uid + ']').css('opacity', 0).addClass('followed').animate({opacity: 1}, 150);
                            self.setStorage(storageKey, '1');
                            if (self.yesPopup) {
                                followPopupTemplate = followPopupTemplate.replace('{{classes}}', 'added');
                            }
                        } else {
                            $('.follow-trigger[data-uid=' + uid + ']').css('opacity', 0).removeClass('followed').animate({opacity: 1}, 150);
                            self.deleteStorage(storageKey);
                            if (self.yesPopup) {
                                followPopupTemplate = followPopupTemplate.replace('{{classes}}', 'removed');
                            }
                        }

                        target.removeClass('in-progress');
                        self.isProgress = false;

                        if (self.yesPopup) {
                            followPopupTemplate = followPopupTemplate
                                .replace('{{description}}', response.description)
                                .replace('{{name}}', authName);

                            clearTimeout(self.personalizeTimeout);
                            self.personalizePopup.empty();
                            self.personalizePopup.append(followPopupTemplate);
                            self.personalizePopup.fadeIn(300);
                            self.personalizeTimeout = setTimeout(function () {
                                self.personalizePopup.fadeOut(600);
                            }, 2000);
                        }
                    }
                });
            });
        }

        /** keep notification */
        Module.keepPersonalizePopup = function () {

            const self = this;
            if (self.personalizePopup.length > 0) {
                self.personalizePopup.on({
                    mouseenter: function () {
                        clearTimeout(self.personalizeTimeout);
                    },
                    mouseleave: function () {
                        self.personalizeTimeout = setTimeout(function () {
                            self.personalizePopup.fadeOut(600);
                        }, 1200);
                    }
                });
            }
        }

        /** sync layouts */
        Module.syncPersonalizeLayout = function () {

            if ('no' === this.pesonalizeMode) {
                return;
            }

            this.isProgress = true;
            this.syncLayoutBookmarks();
            this.syncLayoutCategories();
            this.syncLayoutWitters();
            this.isProgress = false;
        }

        Module.syncLayoutBookmarks = function () {

            const self = this;
            const bookmarks = document.querySelectorAll('.rb-bookmark[data-pid]');

            bookmarks.forEach((bookmark) => {
                if (bookmark.classList.contains('loaded')) {
                    return;
                }
                bookmark.insertAdjacentHTML('beforeend', self.bookmarkToggleTemplate);
                if ('yes' === self.pesonalizeMode) {
                    const storageKey = self.getSavedKey(bookmark.getAttribute('data-pid'));
                    const bookmarked = self.getStorage(storageKey) == 1;
                    if (bookmarked) {
                        bookmark.classList.add('bookmarked');
                    } else {
                        bookmark.classList.remove('bookmarked');
                    }
                } else {
                    bookmark.classList.remove('bookmark-trigger');
                }
                bookmark.classList.add('loaded');
            });
        }

        Module.syncLayoutCategories = function () {

            const self = this;
            const catFollows = document.querySelectorAll('.rb-follow[data-cid]');

            catFollows.forEach((cat) => {
                if (cat.classList.contains('loaded')) {
                    return;
                }
                cat.insertAdjacentHTML('beforeend', self.followToggleTemplate);
                if ('yes' === self.pesonalizeMode) {
                    const storageKey = self.getCategoryFollowKey(cat.getAttribute('data-cid'));
                    const bookmarked = self.getStorage(storageKey) == 1;
                    if (bookmarked) {
                        cat.classList.add('followed');
                    } else {
                        cat.classList.remove('followed');
                    }
                } else {
                    cat.classList.remove('follow-trigger');
                }
                cat.classList.add('loaded');
            });
        }

        Module.syncLayoutWitters = function () {

            const self = this;
            const writerFollows = document.querySelectorAll('.rb-follow[data-uid]');

            writerFollows.forEach((writer) => {
                if (writer.classList.contains('loaded')) {
                    return;
                }
                writer.insertAdjacentHTML('beforeend', self.followToggleTemplate);
                if ('yes' === self.pesonalizeMode) {
                    const storageKey = self.getWriterFollowKey(writer.getAttribute('data-uid'));
                    const bookmarked = self.getStorage(storageKey) == 1;
                    if (bookmarked) {
                        writer.classList.add('followed');
                    } else {
                        writer.classList.remove('followed');
                    }
                } else {
                    writer.classList.remove('follow-trigger');
                }
                writer.classList.add('loaded');
            });
        }

        Module.syncPersonalizeData = function () {

            const self = this;
            const blankSavedKey = self.getSavedKey('');
            const blankCatKey = self.getCategoryFollowKey('');
            const blankWriterKey = self.getWriterFollowKey('');
            let i, id;

            FOXIZ_CORE_SCRIPT.setCookie('personalize_sync', '');
            FOXIZ_CORE_SCRIPT.setCookie('syncTimeout', '1', self.syncTimeout);

            $.ajax({
                type: 'POST',
                url: self.ajaxURL,
                data: {
                    action: 'rbpersonalizedata',
                },
                success: function (response) {
                    response = JSON.parse(JSON.stringify(response));

                    if (self.yesStorage) {
                        for (i = 0; i < localStorage.length; i++) {
                            var key = localStorage.key(i);
                            if (key.includes(blankSavedKey) || key.includes(blankCatKey) || key.includes(blankWriterKey)) {
                                self.deleteStorage(key);
                            }
                        }

                        if (response.bookmarks && response.bookmarks.length > 0) {
                            for (i = 0; i < response.bookmarks.length; i++) {
                                id = response.bookmarks[i];
                                self.setStorage(self.getSavedKey(id), '1');
                            }
                        }

                        if (response.categories && response.categories.length > 0) {
                            for (i = 0; i < response.categories.length; i++) {
                                id = response.categories[i];
                                self.setStorage(self.getCategoryFollowKey(id), '1');
                            }
                        }

                        if (response.writers && response.writers.length > 0) {
                            for (i = 0; i < response.writers.length; i++) {
                                id = response.writers[i];
                                self.setStorage(self.getWriterFollowKey(id), '1');
                            }
                        }
                    }
                    self.isProgress = false;
                    self.syncPersonalizeLayout();
                }
            });
        }

        /** for reading list template  */
        Module.readingListTemplate = function () {

            const self = this;
            const mySaved = $('#my-saved');
            const myCategories = $('#my-categories');
            const myWriters = $('#my-writers');
            const myRecommended = $('#my-recommended');

            if (mySaved.length < 1) {
                return false;
            }
            self.isProgress = true;
            $.ajax({
                type: 'POST',
                url: self.ajaxURL,
                data: {
                    action: 'rbreadinglist'
                },
                success: function (response) {

                    response = JSON.parse(JSON.stringify(response));

                    if ('no' === self.pesonalizeMode) {
                        mySaved.hide().html(response.saved).fadeIn(250);
                        $(".interest-section").remove();
                        $("#my-recommended").remove();
                        return false;
                    } else {
                        mySaved.hide().html(response.saved).fadeIn(250);
                    }

                    if (myCategories.length > 0) {
                        myCategories.hide().html(response.categories).fadeIn(250);
                    }
                    if (myWriters.length > 0) {
                        myWriters.html(response.writers).fadeIn(250);
                    }

                    if (myRecommended.length > 0) {
                        myRecommended.hide().html(response.recommended).fadeIn(250);
                    }

                    self.isProgress = false;
                    Waypoint.refreshAll();

                    setTimeout(function () {
                        self.syncPersonalizeLayout();
                    }, 1)
                }
            });
        }

        return Module;

    }(FOXIZ_PERSONALIZE || {}, jQuery)
)

/** init */
jQuery(document).ready(function ($) {
    FOXIZ_PERSONALIZE.init();
});