/**  FOXIZ MAN SCRIPT */
var FOXIZ_MAIN_SCRIPT = (function (Module, $) {
        'use strict';

        Module.initParams = function () {
            this.yesStorage = this.isStorageAvailable();
            this.themeSettings = typeof foxizParams !== 'undefined' ? foxizParams : {};
            this.galleriesData = typeof foxizGalleriesData !== 'undefined' ? foxizGalleriesData : {};
            this.ajaxURL = typeof foxizCoreParams !== 'undefined' ? foxizCoreParams.ajaxurl || '' : '';
            this.ajaxData = {};
            this.siteAccessFlag = false;
            this._document = $(document);
            this._body = $('body');
            this._window = $(window);
            this.html = $('html, body');
            this.outerHTML = $('html');
            this.iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent);
            this.wPoint = {};
            this.sticky = {};
            this.eSticky = {};
            this.YTPlayers = {};
            this.articleData = [];
            this.readIndicatorPercent = 0;
            this.isProgress = false;
            this.readIndicator = $('#reading-progress');
            this.popupNewsletterEl = $('#rb-popup-newsletter');

            this.personalizeUID = (typeof FOXIZ_CORE_SCRIPT !== "undefined" && FOXIZ_CORE_SCRIPT.personalizeUID !== undefined)
                ? FOXIZ_CORE_SCRIPT.personalizeUID
                : 'u0';
        }

        Module.init = function () {
            this.initParams();
            this.syncLayoutLike();
            this.topSpacing();
            this.siteAccessDetector();
            this.headerDropdown();
            this.mobileCollapse();
            this.initSubMenuPos();
            this.privacyTrigger();
            this.popupNewsletter();
            this.documentClick();
            this.backTop();
            this.readIndicatorInit();
            this.fontResizer();
            this.breakingNews();
            this.sequentialGalleryDisplay();
            this.sliders();
            this.carousels();
            this.liveSearch();
            this.personalizeBlocks();
            this.personalizeCategories();
            this.likeToggle();
            this.singleInfiniteLoadNext();
            this.loginPopup();
            this.popupTemplate();
            this.loadYoutubeIframe();
            this.browserResize();
            this.footerSlideUp();
            this.cartNotification();
            this.newsNotification();
            this.tocToggle();
            this.delayLoad();
            this.showPostComment();
            this.replyReview();
            this.paginationNextPrev();
            this.paginationLoadMore();
            this.paginationInfinite();
            this.productQuantity();
            this.readingCollect();
            this.liveBlog();
            this.neededReloadFuncs();
        }

        Module.neededReloadFuncs = function () {
            this.hoverTipsy();
            this.scrollToComment();
            this.usersRating();
            this.singleGallery();
            this.floatingVideo();
            this.videoPreview();
            this.floatingVideoRemove();
            this.scrollTableContent();
            this.singleScrollRefresh();
            this.playerAutoPlay();
            this.hoverEffects();
            this.highlightShares();
            this.galleryLightbox();
            this.singleFeaturedLightbox();
            this.accordion();
            this.resIframeClassic();
            this.taxBasedAccordion();
            this.scrollBarSlider();
        }

        Module.reInitAll = function () {

            this._window.trigger('load');
            this.syncLayoutLike();
            if (typeof FOXIZ_PERSONALIZE !== 'undefined') {
                FOXIZ_PERSONALIZE.syncPersonalizeLayout();
            }
            if (typeof RB_REACTION !== 'undefined') {
                RB_REACTION.syncReactLayout();
            }
            this.neededReloadFuncs();
            Waypoint.refreshAll();
        }

        /** sync layout & reload features */
        Module.reloadBlockFunc = function () {
            this._window.trigger('load');

            if (typeof FOXIZ_PERSONALIZE !== 'undefined') {
                FOXIZ_PERSONALIZE.syncLayoutBookmarks();
            }
            this.syncLayoutLike();
            this.videoPreview();
            this.hoverTipsy();
            Waypoint.refreshAll();
        }

        Module.initElementor = function () {
            if ('undefined' !== typeof initDarkMode && !FOXIZ_MAIN_SCRIPT.editorDarkModeInit) {
                FOXIZ_MAIN_SCRIPT.editorDarkModeInit = true;
                initDarkMode();
            }
            FOXIZ_MAIN_SCRIPT.breakingNews();
            FOXIZ_MAIN_SCRIPT.carousels();
            FOXIZ_MAIN_SCRIPT.sliders();
        }

        Module.isRTL = function () {
            return this._body.hasClass('rtl');
        }

        Module.animationFrame = function (callback) {
            const func = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                window.webkitRequestAnimationFrame || this.animationFrameFallback
            func.call(window, callback)
        }

        Module.animationFrameFallback = function (callback) {
            window.setTimeout(callback, 1000 / 60)
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
         *
         * @param id
         * @param value
         * @param ttl
         * @constructor
         */
        Module.SetTTLStorage = function (id, value, ttl) {
            const data = {
                value: value,
                ttl: Date.now() + ttl * 3600000
            };

            this.setStorage(id, data);
        }

        /**
         *
         * @param id
         * @returns {null|*}
         */
        Module.getTTLStorage = function (id) {

            const data = this.getStorage(id);
            if (data && Date.now() <= data.ttl) {
                return data.value;
            }
            this.deleteStorage(id);
            return null;
        };

        /** on load */
        Module.delayLoad = function () {
            const self = this;
            setTimeout(function () {
                self.stickyNavBar();
                self.stickyHeaderBuilder();
            }, 100)
        }

        /** resize */
        Module.browserResize = function () {
            const self = this;

            self._window.on('resize', function () {
                self.topSpacing();
                self.calcSubMenuPos();
            })
        }

        /* ================================ HEADERS ================================ */
        Module.hoverTipsy = function () {

            if (!$.fn.rbTipsy) {
                return false;
            }

            this._body.find('[data-copy]').rbTipsy({
                title: 'data-copy',
                fade: true,
                opacity: 1,
                trigger: 'hover',
                gravity: 's'
            });

            if (window.innerWidth > 1024) {
                this._body.find('#site-header [data-title]').rbTipsy({
                    title: 'data-title',
                    fade: true,
                    opacity: 1,
                    trigger: 'hover',
                    gravity: 'n'
                });

                this._body.find('.site-wrap [data-title]').rbTipsy({
                    title: 'data-title',
                    fade: true,
                    opacity: 1,
                    trigger: 'hover',
                    gravity: 's'
                });
            }
        }

        /** font resizer */
        Module.fontResizer = function () {
            const self = this;
            let size = self.yesStorage ? sessionStorage.getItem('rubyResizerStep') : 1;

            self._body.on('click', '.font-resizer-trigger', function (e) {
                e.preventDefault();
                e.stopPropagation();
                size++;
                if (3 < size) {
                    size = 1;
                    self._body.removeClass('medium-entry-size big-entry-size')
                } else {
                    if (2 == size) {
                        self._body.addClass('medium-entry-size').removeClass('big-entry-size');
                    } else {
                        self._body.addClass('big-entry-size').removeClass('medium-entry-size')
                    }
                }

                self.yesStorage && sessionStorage.setItem('rubyResizerStep', size);
            });
        }

        /** hover */
        Module.hoverEffects = function () {
            const selectors = $('.effect-fadeout');

            if (selectors.length === 0) {
                return;
            }
            selectors.off('mouseenter mouseleave').on('mouseenter', function (e) {
                e.stopPropagation();
                const target = $(this);
                if (!target.hasClass('activated')) {
                    target.addClass('activated');
                }
            }).on('mouseleave', function () {
                $(this).removeClass('activated');
            });
        }

        Module.videoPreview = function () {
            let playPromise;

            $('.preview-trigger').on('mouseenter', function () {
                const target = $(this);
                const wrap = target.find('.preview-video');
                if (!wrap.hasClass('video-added')) {
                    const video = '<video preload="auto" muted loop><source src="' + wrap.data('source') + '" type="' + wrap.data('type') + '"></video>';
                    wrap.append(video).addClass('video-added');
                }
                target.addClass('show-preview');
                wrap.css('z-index', 3);
                const el = target.find('video')[0];
                if (el) {
                    playPromise = el.play();
                }
            }).on('mouseleave', function () {
                const target = $(this);
                target.find('.preview-video').css('z-index', 1);
                const el = target.find('video')[0];
                if (el && playPromise !== undefined) {
                    playPromise.then(_ => {
                        el.pause();
                    }).catch();
                }
            });
        }

        Module.playerAutoPlay = function () {
            const self = this;
            const items = $('.is-autoplay');
            const nonResIframe = $('.entry-content > iframe');

            if (items != null && items.length > 0) {
                items.each(function () {
                    const el = $(this);
                    if (!el.hasClass('is-loaded')) {
                        self.wPoint['iframe'] = new Waypoint({
                            element: el,
                            handler: function () {
                                const iframe = el.find('iframe');
                                self.initAutoPlay(iframe);
                                el.addClass('is-loaded');
                                this.destroy();
                            },
                            offset: '60%'
                        });
                    }
                })
            }

            if (nonResIframe != null && nonResIframe.length > 0) {
                nonResIframe.each(function () {
                    const el = $(this);
                    if (!el.hasClass('is-loaded')) {
                        const iURL = el.attr('src');
                        if (iURL.indexOf('youtube.com') > 0 || iURL.indexOf('youtu.be') > 0 || iURL.indexOf('vimeo.com') > 0) {
                            el.wrap('<div class="rb-ires is-loaded"></div>');
                        }
                    }
                })
            }
        }

        Module.initAutoPlay = function (item) {
            if (item.length > 0 && undefined !== item[0]) {
                const src = item[0].src;
                if (src.indexOf('?') > -1) {
                    item[0].src += "&autoplay=1";
                } else {
                    item[0].src += "?autoplay=1";
                }
            }
        }

        Module.tocToggle = function () {
            this._document.on('click', '.toc-toggle', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const target = $(this);
                const content = target.parents('.ruby-table-contents').find('.toc-content');
                content.toggle(200);
                target.toggleClass('activate');
            });
        };

        /** Header JS functions */
        Module.headerDropdown = function () {

            const self = this;
            $('.more-trigger').on('click', function (e) {

                e.preventDefault();
                e.stopPropagation();

                /** re calc menu  */
                self.calcSubMenuPos();

                const target = $(this);
                const holder = target.parents('.header-wrap').find('.more-section-outer');

                if (!holder.hasClass('dropdown-activated')) {
                    self._body.find('.dropdown-activated').removeClass('dropdown-activated');
                    holder.addClass('dropdown-activated');
                } else {
                    holder.removeClass('dropdown-activated');
                }
                if (target.hasClass('search-btn')) {
                    setTimeout(function () {
                        holder.find('input[type="text"]').focus()
                    }, 150);
                }

                return false;
            });

            /** search trigger */
            $('.search-trigger').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const holder = $(this).parent('.header-dropdown-outer');
                if (!holder.hasClass('dropdown-activated')) {
                    self._body.find('.dropdown-activated').removeClass('dropdown-activated');
                    holder.addClass('dropdown-activated');
                    setTimeout(function () {
                        holder.find('input[type="text"]').focus()
                    }, 150);
                } else {
                    holder.removeClass('dropdown-activated');
                }
                return false;
            });

            /** header dropdown */
            $('.dropdown-trigger').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const holder = $(this).parent('.header-dropdown-outer');
                if (!holder.hasClass('dropdown-activated')) {
                    self._body.find('.dropdown-activated').removeClass('dropdown-activated');
                    holder.addClass('dropdown-activated');
                } else {
                    holder.removeClass('dropdown-activated');
                }
            });
        }

        Module.topSpacing = function () {
            const self = this;
            if (self._body.hasClass('top-spacing')) {
                const height = $('.top-site-ad').outerHeight();
                $('.site-outer').css('margin-top', height);
            }
        }

        /** outside click */
        Module.documentClick = function () {

            const self = this;
            const wrapper = $('.more-section-outer, .header-dropdown-outer, .mobile-collapse, .mfp-wrap');
            const inlineSearchForm = $('.is-form-layout');

            document.addEventListener('click', function (e) {

                if (!wrapper.is(e.target) && wrapper.has(e.target).length === 0) {
                    wrapper.removeClass('dropdown-activated');
                    self.outerHTML.removeClass('collapse-activated');
                }

                if (!inlineSearchForm.is(e.target) && inlineSearchForm.has(e.target).length === 0) {
                    inlineSearchForm.find('.live-search-response').fadeOut(500);
                }
            });
        }

        /** calc mega menu position */
        Module.initSubMenuPos = function () {
            const self = this;
            let trigger = false;

            /** add delay to ensure image loaded */
            setTimeout(function () {
                self.calcSubMenuPos();
            }, 1000);

            /** re calc when hovering */
            $('.menu-has-child-mega').on('mouseenter', function () {
                if (!trigger) {
                    self.calcSubMenuPos();
                }
                trigger = true;
            })
        }

        Module.calcSubMenuPos = function () {

            if (window.outerWidth < 1025) {
                return false;
            }

            const self = this;
            const megaParents = $('.menu-has-child-mega');
            const headerWrapper = $('#site-header');

            /** for mega wide */
            if (megaParents.length > 0) {
                megaParents.each(function () {
                    const item = $(this);
                    item.find('.mega-dropdown').css({
                        'width': self._body.width(),
                        'left': -item.offset().left,
                    });
                    item.addClass('mega-menu-loaded')
                })
            }

            /** sub-menu left right direction */
            if (headerWrapper.length > 0) {

                let headerLeftOffset = headerWrapper.offset().left;
                let headerWidth = headerWrapper.width();
                let headerRightOffset = headerLeftOffset + headerWidth;

                const flexDropdown = $('.flex-dropdown');

                /** sub menu direction */
                const subElements = $('ul.sub-menu');
                if (subElements.length > 0) {
                    subElements.each(function () {
                        const item = $(this);
                        let itemLeftOffset = item.offset().left;
                        let itemRightOffset = itemLeftOffset + item.width() + 100;
                        if (itemRightOffset > headerRightOffset) {
                            item.addClass('left-direction');
                        }
                    })
                }

                /** calc dropdown flex width */
                if (flexDropdown.length > 0) {
                    flexDropdown.each(function () {
                        const item = $(this);
                        const parentItem = item.parent();
                        if (parentItem.hasClass('is-child-wide') || item.hasClass('mega-has-left')) {
                            return;
                        }
                        const itemWidth = item.width();
                        const itemHalfWidth = itemWidth / 2;
                        const parentItemOffset = parentItem.offset().left;
                        const parentHalfWidth = parentItem.width() / 2;
                        const parentItemCenterOffset = parentItemOffset + parentHalfWidth;
                        const rightSpacing = headerRightOffset - parentItemCenterOffset;
                        const leftSpacing = parentItemCenterOffset - headerLeftOffset;

                        if (itemWidth >= headerWidth) {
                            item.css({
                                'width': headerWidth - 2,
                                'left': -parentItemOffset
                            });
                        } else if (itemHalfWidth > rightSpacing) {
                            item.css({
                                'right': -rightSpacing + parentHalfWidth + 1,
                                'left': 'auto',
                            });
                        } else if (itemHalfWidth > leftSpacing) {
                            item.css({
                                'left': -leftSpacing + parentHalfWidth + 1,
                                'right': 'auto',
                            });
                        } else {
                            item.css({
                                'right': 'auto',
                                'left': -itemHalfWidth + parentHalfWidth,
                            });
                        }
                    });
                }
            }
        }

        /**
         *
         * @returns {boolean}
         */
        Module.stickyNavBar = function () {

            const self = this;

            /** turn off sticky on editor mode */
            if (self._body.hasClass('elementor-editor-active')) {
                return false;
            }

            self.sticky.section = $('#sticky-holder');
            self.sticky.outer = $('#navbar-outer');

            if ((!self._body.hasClass('is-mstick') && !self._body.hasClass('yes-tstick')) || self.sticky.outer.length < 1 || self.sticky.section.length < 1) {
                return false;
            }

            self.sticky.smartSticky = !!self._body.hasClass('is-smart-sticky');
            self.sticky.isSticky = false;
            self.sticky.lastScroll = 0;

            if (self._body.hasClass('yes-tstick')) {
                self.sticky.isTitleSticky = true;
            } else {
                self.sticky.isTitleSticky = 0;
            }

            self.sticky.additionalOffset = 200;
            if (window.innerWidth > 1024) {
                if (self.sticky.isTitleSticky) {
                    self.sticky.additionalOffset = 450;
                } else {
                    self.sticky.additionalOffset = 0;
                }
            }

            if (self._body.hasClass('admin-bar')) {
                self.sticky.adminBarSpacing = 32;
            } else {
                self.sticky.adminBarSpacing = 0;
            }

            self.sticky.topOffset = self.sticky.section.offset().top;
            self.sticky.stickySectionHeight = self.sticky.section.outerHeight();

            self.sticky.outer.css('min-height', self.sticky.outer.outerHeight());
            self.sticky.activatePos = self.sticky.topOffset + 1 + self.sticky.stickySectionHeight + self.sticky.additionalOffset;
            self.sticky.deactivePos = self.sticky.topOffset - self.sticky.adminBarSpacing + self.sticky.additionalOffset;

            if (window.addEventListener) {
                if (self.sticky.smartSticky) {
                    window.addEventListener('scroll', function () {
                        self.animationFrame(self.initSmartStickyNavBar.bind(self));
                    }, false);
                } else {
                    window.addEventListener('scroll', function () {
                        self.animationFrame(self.initStickyNavBar.bind(self));
                    }, false);
                }
            }

            self._window.on('unstickMenu', function () {
                self.sticky.outer.css('min-height', self.sticky.outer.outerHeight());
                self.sticky.stickySectionHeight = self.sticky.section.outerHeight();
                self.sticky.topOffset = self.sticky.section.offset().top;
                self.sticky.activatePos = self.sticky.topOffset + 1 + self.sticky.stickySectionHeight + self.sticky.additionalOffset;
                self.sticky.deactivePos = self.sticky.topOffset - self.sticky.adminBarSpacing + self.sticky.additionalOffset;
            });
        }

        Module.initStickyNavBar = function () {
            const self = this;
            const scroll = self._window.scrollTop();

            if (!self.sticky.isSticky && scroll > self.sticky.activatePos) {
                self.sticky.isSticky = true;
                self._body.addClass('stick-animated sticky-on');
                self.sticky.stickAnimatedTimeout = setTimeout(function () {
                    self._body.removeClass('stick-animated');
                }, 200);
            } else if (self.sticky.isSticky && scroll <= self.sticky.deactivePos) {
                self.sticky.isSticky = false;
                self._body.removeClass('sticky-on stick-animated');
                self._window.trigger('unstickMenu');
            }
        }

        Module.initSmartStickyNavBar = function () {
            const self = this;
            const scroll = self._window.scrollTop();

            if (!self.sticky.isSticky && scroll > self.sticky.activatePos && scroll < self.sticky.lastScroll) {
                self.sticky.isSticky = true;
                self._body.addClass('stick-animated sticky-on');
                self.sticky.stickAnimatedTimeout = setTimeout(function () {
                    self._body.removeClass('stick-animated');
                }, 200);
            } else if (self.sticky.isSticky && (scroll <= self.sticky.deactivePos || scroll > self.sticky.lastScroll)) {
                self.sticky.isSticky = false;
                self._body.removeClass('sticky-on stick-animated');
                if (scroll <= self.sticky.deactivePos) {
                    self._window.trigger('unstickESection');
                }
            }
            self.sticky.lastScroll = scroll;
        }

        /** header sticky template */
        Module.stickyHeaderBuilder = function () {

            const self = this;

            /** turn off sticky on editor mode */
            if (self._body.hasClass('elementor-editor-active')) {
                return false;
            }

            let stickySection = $('.header-template .e-section-sticky').first();
            const hasTitleSticky = $('body.single-post #s-title-sticky').first();

            if (stickySection.length < 1) {
                return false;
            }

            if (hasTitleSticky.length > 0) {
                self._body.addClass('yes-tstick');
                self.eSticky.isTitleSticky = true;
            } else {
                self.eSticky.isTitleSticky = 0;
            }

            self.eSticky.additionalOffset = 200;
            if (window.innerWidth > 1024) {
                if (self.eSticky.isTitleSticky) {
                    self.eSticky.additionalOffset = 450;
                } else {
                    self.eSticky.additionalOffset = 0;
                }
            }

            self.eSticky.smartSticky = !!stickySection.hasClass('is-smart-sticky');

            /** mobile sticky for header template */
            if (window.innerWidth <= 1024) {
                stickySection.removeClass('e-section-sticky');
                stickySection = $('#header-template-holder').addClass('e-section-sticky');
            }

            self.eSticky.section = stickySection;
            self.eSticky.outer = stickySection.parent();

            self.eSticky.adminBarSpacing = 0;
            self.eSticky.isSticky = false;
            self.eSticky.lastScroll = 0;
            self.eSticky.stickySectionHeight = stickySection.outerHeight();
            self.eSticky.topOffset = stickySection.offset().top;

            /** set min height */
            if (self._body.hasClass('admin-bar')) {
                self.eSticky.adminBarSpacing = 32;
            }
            self.eSticky.outer.css('min-height', self.eSticky.outer.outerHeight());
            self.eSticky.activatePos = self.eSticky.topOffset + 1 + self.eSticky.stickySectionHeight + self.eSticky.additionalOffset;
            self.eSticky.deactivePos = self.eSticky.topOffset - self.eSticky.adminBarSpacing + self.eSticky.additionalOffset;

            if (window.addEventListener) {
                if (self.eSticky.smartSticky) {
                    window.addEventListener('scroll', function () {
                        self.animationFrame(self.initSmartStickyESection.bind(self));
                    }, false);
                } else {
                    window.addEventListener('scroll', function () {
                        self.animationFrame(self.initStickyESection.bind(self));
                    }, false);
                }
            }

            /** re-calc height values */
            self._window.on('unstickESection', function () {
                self.eSticky.outer.css('min-height', self.eSticky.outer.outerHeight());
                self.eSticky.stickySectionHeight = self.eSticky.section.outerHeight();
                self.eSticky.topOffset = self.eSticky.section.offset().top;
                self.eSticky.activatePos = self.eSticky.topOffset + 1 + self.eSticky.stickySectionHeight + self.eSticky.additionalOffset;
                self.eSticky.deactivePos = self.eSticky.topOffset - self.eSticky.adminBarSpacing + self.eSticky.additionalOffset;
            });
        }

        Module.initStickyESection = function () {
            const self = this;
            const scroll = self._window.scrollTop();
            if (!self.eSticky.isSticky && scroll > self.eSticky.activatePos) {
                self.eSticky.isSticky = true;
                self._body.addClass('stick-animated sticky-on');
                self.eSticky.stickAnimatedTimeout = setTimeout(function () {
                    self._body.removeClass('stick-animated');
                }, 200);
            } else if (self.eSticky.isSticky && scroll <= self.eSticky.deactivePos) {
                self.eSticky.isSticky = false;
                self._body.removeClass('sticky-on stick-animated');
                self._window.trigger('unstickESection');
            }
        }

        Module.initSmartStickyESection = function () {
            const self = this;
            const scroll = self._window.scrollTop();

            if (!self.eSticky.isSticky && scroll > self.eSticky.activatePos && scroll < self.eSticky.lastScroll) {
                self.eSticky.isSticky = true;
                self._body.addClass('stick-animated sticky-on');
                self.eSticky.stickAnimatedTimeout = setTimeout(function () {
                    self._body.removeClass('stick-animated');
                }, 200);
            } else if (self.eSticky.isSticky && (scroll <= self.eSticky.deactivePos || scroll > self.eSticky.lastScroll)) {
                self.eSticky.isSticky = false;
                self._body.removeClass('sticky-on stick-animated');
                if (scroll <= self.eSticky.deactivePos) {
                    self._window.trigger('unstickESection');
                }
            }

            self.eSticky.lastScroll = scroll;
        }

        /** mobileCollapse */
        Module.mobileCollapse = function () {
            const self = this;
            const $mobileMenuTrigger = $('.mobile-menu-trigger');
            const $outerHTML = self.outerHTML;
            const $mobileSearchForm = $outerHTML.find('.mobile-search-form input[type="text"]');

            $mobileMenuTrigger.on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const target = $(this);

                if (target.hasClass('mobile-search-icon')) {
                    setTimeout(function () {
                        $mobileSearchForm.focus();
                    }, 100);
                }

                const isCollapseActivated = $outerHTML.hasClass('collapse-activated');
                $outerHTML.toggleClass('collapse-activated', !isCollapseActivated);
            });
        }

        /**
         * privacy trigger
         */
        Module.privacyTrigger = function () {
            const self = this;
            $('#privacy-trigger').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.setStorage('RubyPrivacyAllowed', '1');
                $('#rb-privacy').slideUp(200, function () {
                    $(this).remove();
                });
                return false;
            });
        }

        /** back top */
        Module.backTop = function () {
            if (this._body.hasClass('is-backtop')) {
                $().UItoTop({
                    text: '<i class="rbi rbi-darrow-top"></i>',
                });
            }
        }

        /** login popup */
        Module.loginPopup = function () {

            const self = this;
            const form = $('#rb-user-popup-form');
            if (form.length < 1) {
                return false;
            }
            this._document.on('click', '.login-toggle', (e) => {
                e.preventDefault();
                e.stopPropagation();
                $.magnificPopup.open({
                    type: 'inline',
                    preloader: false,
                    removalDelay: 400,
                    showCloseBtn: true,
                    closeBtnInside: true,
                    closeOnBgClick: false,
                    items: {
                        src: form,
                        type: 'inline'
                    },
                    mainClass: 'rb-popup-center',
                    closeMarkup: '<span class="close-popup-btn mfp-close"><span class="close-icon"></span></span>',
                    fixedBgPos: true,
                    fixedContentPos: true,
                    callbacks: {open: () => self.reloadCaptchaPopups()}
                });
            });
        };

        /** popup template blocks */
        Module.popupTemplate = function () {

            const templateCache = {};
            this._document.on('click', '.popup-trigger-btn', (e) => {

                e.preventDefault();
                e.stopPropagation();

                const target = $(e.target);
                const templateID = target.data('trigger') || '';
                const position = target.data('position') || '';

                if (!templateCache[templateID]) {
                    const template = $(`#tmpl-${templateID}`);
                    if (template.length === 0) {
                        return;
                    }
                    templateCache[templateID] = template.html();
                }
                $.magnificPopup.open({
                    type: 'inline',
                    preloader: false,
                    removalDelay: 400,
                    showCloseBtn: true,
                    closeBtnInside: true,
                    closeOnBgClick: true,
                    allowHTMLInTemplate: true,
                    items: {
                        src: templateCache[templateID],
                        type: 'inline'
                    },
                    mainClass: `is-template-popup popup-${templateID} ${position}`,
                    closeMarkup: '<span class="close-popup-btn mfp-close"><span class="close-icon"></span></span>',
                    fixedBgPos: true,
                    fixedContentPos: true,
                    callbacks: {open: () => self.reloadCaptchaPopups()},
                });
            });
        };

        /** newsletter */
        Module.popupNewsletter = function () {

            const self = this;
            if (self.popupNewsletterEl.length > 0) {
                const display = self.popupNewsletterEl.data('display');
                self.newsletterExpired = self.popupNewsletterEl.data('expired');
                self.newsletterDisplayOffset = self.popupNewsletterEl.data('offset');
                const delay = self.popupNewsletterEl.data('delay');
                const oldExpired = self.getStorage('RubyNewsletterExpired');

                if (self.newsletterExpired === 0) {
                    self.deleteStorage('RubyNewsletter');
                }

                if (!oldExpired || self.newsletterExpired !== oldExpired) {
                    self.setStorage('RubyNewsletterExpired', self.newsletterExpired);
                    self.deleteStorage('RubyNewsletter');
                }

                if (!self.getTTLStorage('RubyNewsletter')) {
                    if (!display || 'scroll' === display) {
                        if (window.addEventListener) {
                            window.addEventListener('scroll', function () {
                                self.animationFrame(self.scrollPopupNewsletter.bind(self));
                            }, false);
                        }
                    } else {
                        setTimeout(function () {
                            self.popupNewsletterInit();
                        }, delay);
                    }
                }
            }
        }

        Module.scrollPopupNewsletter = function () {
            const self = this;
            if (!self.newsletterPopupFlag && self._window.scrollTop() > self.newsletterDisplayOffset) {
                self.newsletterPopupFlag = true;
                self.popupNewsletterInit();
            }
        }

        Module.popupNewsletterInit = function () {

            const self = this;
            if (self.siteAccessFlag) {
                return;
            }

            if (!self.popupNewsletterEl.hasClass('is-pos-fixed')) {
                $.magnificPopup.open({
                    type: 'inline',
                    preloader: false,
                    closeBtnInside: true,
                    removalDelay: 400,
                    showCloseBtn: true,
                    closeOnBgClick: false,
                    disableOn: 1024,
                    items: {
                        src: '#rb-popup-newsletter',
                        type: 'inline'
                    },
                    mainClass: 'rb-popup-center',
                    fixedBgPos: true,
                    fixedContentPos: true,
                    closeMarkup: '<span class="close-popup-btn mfp-close"><span class="close-icon"></span></span>',
                    callbacks: {
                        open: () => self.reloadCaptchaPopups(),
                        close: function () {
                            if (self.siteAccessFlag) {
                                return;
                            }
                            self.SetTTLStorage('RubyNewsletter', 1, self.newsletterExpired * 24);
                        }
                    }
                });
            } else {
                self.popupNewsletterEl.removeClass('is-hidden');
                setTimeout(() => {
                    self.popupNewsletterEl.addClass('yes-show');
                }, 10);
                const closeBtn = self.popupNewsletterEl.find('.close-popup-btn');
                closeBtn.on('click', function () {
                    self.SetTTLStorage('RubyNewsletter', 1, self.newsletterExpired * 24);
                    self.popupNewsletterEl.removeClass('yes-show');
                    setTimeout(() => {
                        self.popupNewsletterEl.addClass('is-hidden');
                    }, 400);
                });
            }
        }

        /** footer slide up */
        Module.footerSlideUp = function () {
            const target = $('#footer-slideup');
            if (target.length > 0) {
                const self = this;
                self.footerSlideUpExpired = target.data('expired');
                const delay = target.data('delay');
                const oldExpired = self.getStorage('footerSlideUpExpired');
                if (!oldExpired || self.footerSlideUpExpired != oldExpired) {
                    self.setStorage('footerSlideUpExpired', self.footerSlideUpExpired);
                    self.deleteStorage('footerSlideUp');
                }
                if (!self.getTTLStorage('footerSlideUp')) {
                    setTimeout(function () {
                        self.footerSlideUpInit();
                    }, delay);
                }
                /** show hide toggle */
                setTimeout(function () {
                    self.footerSlideUpToggle();
                }, delay);
            }
        }

        Module.footerSlideUpToggle = function () {
            const self = this;
            $('.slideup-toggle').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.footerSlideUpInit();
                return false;
            });
        }

        Module.footerSlideUpInit = function () {
            if (this._body.hasClass('yes-f-slideup')) {
                this._body.removeClass('yes-f-slideup');
                this.SetTTLStorage('footerSlideUp', 1, this.footerSlideUpExpired * 24);
            } else {
                this._body.addClass('yes-f-slideup');
                this.deleteStorage('footerSlideUp');
            }
        }

        /** youtube iframe */
        Module.loadYoutubeIframe = function () {

            const self = this;
            const blockPlaylist = $('.yt-playlist');
            if (blockPlaylist.length > 0) {
                const tag = document.createElement('script');
                tag.src = "http://www.youtube.com/iframe_api";
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            }

            window.onYouTubeIframeAPIReady = function () {
                $('.yt-playlist').each(function () {
                    const target = $(this);
                    const iframe = target.find('.yt-player');
                    const videoID = target.data('id');
                    const blockID = target.data('block');
                    self.YTPlayers[blockID] = new YT.Player(iframe.get(0), {
                        height: '540',
                        width: '960',
                        videoId: videoID,
                        events: {
                            'onReady': self.videoPlayToggle,
                            'onStateChange': self.videoPlayToggle
                        }
                    });
                });

                $('.plist-item').on('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();

                    const target = $(this);
                    const wrapper = target.closest('.yt-playlist');
                    const currentBlockID = wrapper.data('block');
                    const videoID = target.data('id');
                    const title = target.find('.plist-item-title').text();
                    const meta = target.data('index');

                    Object.keys(self.YTPlayers).forEach(function (id) {
                        self.YTPlayers[id].pauseVideo();
                    });
                    self.YTPlayers[currentBlockID].loadVideoById({
                        'videoId': videoID
                    });

                    wrapper.find('.yt-trigger').addClass('is-playing');
                    wrapper.find('.play-title').hide().text(title).fadeIn(200);
                    wrapper.find('.video-index').text(meta);
                });
            }
        }

        Module.videoPlayToggle = function () {

            const players = FOXIZ_MAIN_SCRIPT.YTPlayers;

            $('.yt-trigger').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const target = $(this);
                const currentBlockID = target.closest('.yt-playlist').data('block');
                const currentState = players[currentBlockID].getPlayerState();
                const isPlaying = [1, 3].includes(currentState);
                if (!isPlaying) {
                    players[currentBlockID].playVideo();
                    target.addClass('is-playing');
                } else {
                    players[currentBlockID].pauseVideo();
                    target.removeClass('is-playing');
                }
            });
        }

        /** Comment scripts */
        Module.showPostComment = function () {
            const self = this;

            this._document.on('click', '.smeta-sec .meta-comment', function (e) {
                e.stopPropagation();
                const commentBtn = $('.show-post-comment');
                if (commentBtn.length > 0) {
                    self.html.animate({scrollTop: commentBtn.offset().top}, 300);
                    commentBtn.trigger('click');
                }
            });

            this._document.on('click', '.show-post-comment', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const target = $(this);
                const wrap = target.parent();

                target.fadeOut(200, function () {
                    target.remove();
                    wrap.find('.is-invisible').removeClass('is-invisible');
                    wrap.next('.comment-holder').removeClass('is-hidden');
                })
            });
        }

        /** table scroll */
        Module.scrollTableContent = function () {

            const self = this;
            const behavior = self._body.hasClass('toc-smooth') ? 'smooth' : 'instant';

            self._document.on('click', '.anchor-link', function (e) {
                e.stopPropagation();

                const targetClass = $(this).data('index');
                if (!targetClass) return;

                let $scrollElement = $(`.${targetClass}`);

                // if target not found, search inside its parent .s-ct
                if (!$scrollElement.length) {
                    const $parentContainer = $(this).closest('.s-ct');
                    if ($parentContainer.length) {
                        $scrollElement = $parentContainer.find('.restrict-box, .continue-reading-btn').first();
                    }
                }

                if (!$scrollElement.length) return;

                setTimeout(() => {
                    window.scrollTo({
                        top: $scrollElement.offset().top,
                        behavior: behavior,
                    });
                }, 10);
            });
        };

        /** scroll to comment  */
        Module.scrollToComment = function () {
            const self = this;
            const hash = window.location.hash;
            if (hash === '#respond' || hash.startsWith('#comment')) {
                const commentBtn = $('.show-post-comment').first();
                if (commentBtn.length === 0) {
                    return;
                }
                self.html.animate({scrollTop: commentBtn.offset().top - 200}, 400);
                commentBtn.trigger('click');
            }
        }

        Module.replyReview = function () {
            this._document.on('click', '.comment-reply-link', function () {
                const target = $(this);
                const wrapper = target.parents('.rb-reviews-area');
                const cancelLink = $('#cancel-comment-reply-link');
                if (wrapper.length > 0) {
                    wrapper.find('.rb-form-rating').addClass('is-hidden');
                    cancelLink.on('click', function () {
                        wrapper.find('.rb-form-rating').removeClass('is-hidden');
                    });
                }
            });
        }

        /** user rating */
        Module.usersRating = function () {
            const self = this;
            const reviewsForm = self._body.find('.rb-reviews-form');
            if (reviewsForm.length > 0) {
                reviewsForm.each(function () {
                    const reviewForm = $(this);
                    if (!reviewForm.hasClass('is-loaded')) {
                        reviewForm.addClass('is-loaded');
                        const ratingForm = reviewForm.find('.rb-form-rating');
                        const selection = reviewForm.find('.rb-rating-selection');
                        const text = reviewForm.find('.rating-alert').html();
                        let ratingValue = null;

                        selection.val('');
                        selection.hide();
                        selection.before(
                            '<div class="rb-review-stars">\
                                <span>\
                                    <a class="star" data-rating="1" href="#"><i class="rbi rbi-star-o"></i></a>\
                                    <a class="star" data-rating="2" href="#"><i class="rbi rbi-star-o"></i></a>\
                                    <a class="star" data-rating="3" href="#"><i class="rbi rbi-star-o"></i></a>\
                                    <a class="star" data-rating="4" href="#"><i class="rbi rbi-star-o"></i></a>\
                                    <a class="star" data-rating="5" href="#"><i class="rbi rbi-star-o"></i></a>\
                                </span>\
                            </div>'
                        );

                        ratingForm.on('click', 'a.star', function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            const star = $(this);
                            ratingValue = star.data('rating');
                            star.siblings('a').removeClass('active');
                            star.addClass('active');
                            ratingForm.addClass('selected');
                        });

                        reviewForm.on('click', '#respond #submit', function () {
                            selection.val(ratingValue);
                            if (!selection.val()) {
                                window.alert(text);
                                return false;
                            }
                        });
                    }
                });
            }
        }

        /**
         *
         * @returns {boolean}
         */
        Module.readIndicatorInit = function () {

            const self = this;
            if (!self._body.hasClass('single') || self.readIndicator.length < 1) {
                return false;
            }

            let content = $('.entry-content').first();
            if (!content.length) return false;

            self.indicatorTop = content.offset().top;
            self.indicatorHeight = content.outerHeight(true) - self._window.height();
            /** delay for load images */
            setTimeout(function () {
                self.indicatorTop = content.offset().top;
                self.indicatorHeight = content.outerHeight(true) - self._window.height();
            }, 1000)

            if (window.addEventListener) {
                window.addEventListener('scroll', function () {
                    self.animationFrame(self.readIndicatorCalc.bind(self));
                }, false);
            }
        }

        Module.readIndicatorCalc = function () {
            const self = this;
            const scroll = self._window.scrollTop();
            self.readIndicatorPercent = Math.min(((scroll - self.indicatorTop) / self.indicatorHeight) * 100, 100);
            if (self.readIndicatorPercent <= 100) {
                self.readIndicator.css('width', self.readIndicatorPercent + '%');
            }
        }

        /** breaking news */
        Module.breakingNews = function () {
            const self = this;
            const breakingNews = $('.breaking-news-slider')

            if (breakingNews.length < 1) {
                return false;
            }

            breakingNews.each(function () {
                const el = $(this);
                let params = {
                    slidesPerView: 1,
                    loop: true,
                }
                if (el.data('play')) {
                    params.autoplay = {
                        delay: el.data('speed') || self.themeSettings.sliderSpeed,
                        stopOnLastSlide: false,
                        disableOnInteraction: self.isElementorEditor ? true : (window.outerWidth < 1025),
                        pauseOnMouseEnter: true
                    };
                }
                params.navigation = {
                    nextEl: el.find('.breaking-news-next')[0],
                    prevEl: el.find('.breaking-news-prev')[0]
                }
                new RBSwiper(this, params);
            });
        }

        /** overlay slider */
        Module.sliders = function () {

            const self = this;
            const sliders = $('.post-slider');
            if (sliders.length < 1) {
                return false;
            }

            sliders.each(function () {
                const slider = $(this);
                let params = {
                    grabCursor: true,
                    allowTouchMove: true,
                    effect: self.themeSettings.sliderEffect,
                    loop: true,
                }
                if (slider.data('play')) {
                    params.autoplay = {
                        delay: slider.data('speed') || self.themeSettings.sliderSpeed,
                        stopOnLastSlide: true,
                        disableOnInteraction: self.isElementorEditor ? true : (window.outerWidth < 1025),
                        pauseOnMouseEnter: true
                    };
                }

                params.pagination = {
                    el: slider.find('.slider-pagination')[0],
                    clickable: true,
                };

                params.navigation = {
                    nextEl: slider.find('.slider-next')[0],
                    prevEl: slider.find('.slider-prev')[0]
                }
                new RBSwiper(this, params);
            });
        }

        /** carousel blocks */
        Module.carousels = function () {
            const self = this;
            const carousels = $('.post-carousel');
            if (carousels.length < 1) {
                return false;
            }
            carousels.each(function () {
                const carousel = $(this);
                let params = {
                    grabCursor: true,
                    allowTouchMove: true,
                    freeMode: false,
                    loop: true
                }
                params.slidesPerView = carousel.data('mcol');
                params.spaceBetween = carousel.data('mgap');
                params.centeredSlides = carousel.data('centered');

                params.navigation = {
                    nextEl: carousel.find('.slider-next')[0],
                    prevEl: carousel.find('.slider-prev')[0]
                }
                if (carousel.find('.slider-pagination')[0]) {
                    params.pagination = {
                        el: carousel.find('.slider-pagination')[0],
                        type: 'bullets',
                        clickable: true,
                    };
                }

                if (carousel.data('play')) {
                    params.autoplay = {
                        delay: carousel.data('speed') || self.themeSettings.sliderSpeed,
                        stopOnLastSlide: false,
                        disableOnInteraction: self.isElementorEditor ? true : (window.outerWidth < 1025),
                        pauseOnMouseEnter: true
                    };
                }

                if (carousel.data('fmode')) {
                    params.freeMode = true;
                }
                params.breakpoints = {
                    768: {
                        slidesPerView: carousel.data('tcol'),
                        spaceBetween: carousel.data('tgap')
                    },
                    1025: {
                        slidesPerView: carousel.data('col'),
                        spaceBetween: carousel.data('gap')
                    },
                    1500: {
                        slidesPerView: carousel.data('wcol'),
                        spaceBetween: carousel.data('gap')
                    }
                };
                params.on = {
                    afterInit: function (swiper) {
                        const wrap = $(swiper.$wrapperEl);
                        $(swiper.$wrapperEl).find('.p-box').css('height', wrap.height());
                    },
                    resize: function (swiper) {
                        const wrap = $(swiper.$wrapperEl);
                        $(swiper.$wrapperEl).find('.p-box').css('height', wrap.height());
                    },
                };

                new RBSwiper(this, params);
            });
        }

        /* ================================ SINGLE GALLERY ================================ */
        Module.singleGallery = function () {

            const self = this;
            const gallerySections = self._body.find('.featured-gallery-wrap');
            if (gallerySections.length === 0) {
                return;
            }

            gallerySections.each(function () {
                const section = $(this);
                if (!section.hasClass('is-loaded')) {
                    const index = section.data('gallery');
                    const sliderEl = section.find('.gallery-slider').attr('id');
                    const sliderNavEl = section.find('.gallery-slider-nav').attr('id');
                    const carouselEl = section.find('.gallery-carousel').attr('id');
                    const coverflowEL = section.find('.gallery-coverflow').attr('id');

                    if (sliderEl && sliderNavEl) {

                        const navEl = $('#' + sliderNavEl);
                        const navSlidesCount = navEl.find('.swiper-slide').length;
                        const shouldLoopNav = navSlidesCount >= 6;
                        const viewSlides = Math.min(navSlidesCount, 6);

                        if (!shouldLoopNav) {
                            navEl.css('max-width', `${navSlidesCount * 125}px`);
                        }

                        const galleryNav = new RBSwiper('#' + sliderNavEl, {
                            spaceBetween: 15,
                            slidesPerView: viewSlides,
                            freeMode: self.themeSettings.sliderFMode,
                            grabCursor: true,
                            loop: shouldLoopNav,
                            watchSlidesVisibility: shouldLoopNav,
                            watchSlidesProgress: true,
                            on: {
                                init: function () {
                                    $(this.$wrapperEl).removeClass('pre-load');
                                },
                            },
                        });

                        const gallerySlider = new RBSwiper('#' + sliderEl, {
                            spaceBetween: 0,
                            grabCursor: true,
                            loop: true,
                            pagination: {
                                el: '.swiper-pagination-' + index,
                                type: 'progressbar',
                                clickable: true,
                            },
                            on: {
                                init: function () {
                                    section.addClass('is-loaded');
                                },
                            },
                            thumbs: {
                                swiper: galleryNav
                            }
                        });

                        gallerySlider.on('slideChange', function () {
                            const index = this.activeIndex;
                            if (index) {
                                const label = $(this.$el).next().find('.current-slider-count');
                                label.fadeOut(0, function () {
                                    $(this).html(index <= label.data('total') ? index : 1).fadeIn(50);
                                });
                            }
                        });
                    }

                    if ('undefined' !== typeof carouselEl) {
                        new RBSwiper('#' + carouselEl, {
                            spaceBetween: 20,
                            slidesPerView: 'auto',
                            freeMode: self.themeSettings.sliderFMode,
                            loop: false,
                            grabCursor: true,
                            scrollbar: {
                                el: '.swiper-scrollbar-' + index,
                                hide: true,
                            },
                            on: {
                                init: function () {
                                    $(this.$wrapperEl).removeClass('pre-load');
                                    section.addClass('is-loaded');
                                },
                            },
                        });
                    }

                    if ('undefined' !== typeof coverflowEL) {
                        new RBSwiper('#' + coverflowEL, {
                            effect: "coverflow",
                            grabCursor: true,
                            centeredSlides: true,
                            slidesPerView: 1.2,
                            coverflowEffect: {
                                rotate: 50,
                                stretch: 0,
                                depth: 250,
                                modifier: 1,
                                slideShadows: true,
                            },
                            breakpoints: {
                                768: {
                                    slidesPerView: 3
                                }
                            },
                            on: {
                                init: function () {
                                    $(this.$wrapperEl).removeClass('pre-load');
                                    section.addClass('is-loaded');
                                },
                            },
                            pagination: {
                                el: '.swiper-pagination-' + index,
                                clickable: true,
                            },
                        });
                    }
                }
            });
        }

        Module.scrollBarSlider = function () {

            const self = this;
            const items = $('.gb-slider-scrollbar');
            if (!items.length) return;

            items.each(function (index, itemEl) {
                if ($(itemEl).hasClass('is-loaded')) return;

                const autoplay = $(itemEl).data('autoplay') === 1;
                const caption = $(itemEl).closest('.gb-image-slider').find('.gb-image-caption');
                const scrollbarEl = $(itemEl).find('.swiper-scrollbar')[0];

                $(itemEl).find('.swiper-wrapper').children().addClass('swiper-slide');

                const updateCaption = (swiper) => {
                    const captionText = $(swiper.slides[swiper.activeIndex]).find('.wp-element-caption').html() || '';
                    caption.fadeOut(150, () => caption.html(captionText).fadeIn(200));
                };

                new RBSwiper(itemEl, {
                    slidesPerView: 1,
                    loop: false,
                    grabCursor: true,
                    autoplay: autoplay ? {
                        delay: self.themeSettings.sliderSpeed || 5000,
                        disableOnInteraction: self.isElementorEditor ? true : window.outerWidth < 1025,
                    } : false,
                    scrollbar: {
                        el: scrollbarEl,
                        hide: false,
                    },
                    on: {
                        init() {
                            $(itemEl).removeClass('pre-load').addClass('is-loaded');
                            updateCaption(this);
                        },
                        slideChange() {
                            updateCaption(this);
                        },
                    },
                });
            });
        };

        Module.highlightShares = function () {

            const self = this;

            if (!self.themeSettings.highlightShares || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) {
                return;
            }

            const config = {
                selectableElements: ['.is-highlight-shares'],
                twitterUsername: self.themeSettings.twitterName,
                facebook: !!self.themeSettings.highlightShareFacebook,
                twitter: !!self.themeSettings.highlightShareTwitter
            };

            const extra = self.themeSettings.highlightShareReddit ? [{
                icon: '<i class="rbi rbi-reddit"></i>',
                url: 'https://reddit.com/submit?url=PAGE_URL&title=TEXT_SELECTION'
            }] : [];

            Sharect.config(config).appendCustomShareButtons(extra).init();
        }

        /**
         *
         * @returns {boolean}
         */
        Module.floatingVideo = function () {

            const self = this;
            const floating = $('.floating-video').not('.is-loaded');

            if (floating.length === 0 || window.outerWidth < 1025) {
                return false;
            }

            self.wPoint['Floating'] = new Waypoint({
                element: floating,
                offset: -floating.height(),
                handler: function (direction) {
                    self._body.find('.floating-video').addClass('is-loaded').removeClass('floating-activated');
                    self._body.find('.floating-close').remove();
                    if ('down' == direction) {
                        this.element.addClass(' floating-activated');
                        this.element.find('.float-holder').prepend('<a class="floating-close close-popup-btn" href="#"><span class="close-icon"></span></a>');
                    }
                }
            });
        }

        Module.floatingVideoRemove = function () {
            const self = this;
            self._body.on('click', '.floating-close', function (e) {
                e.preventDefault();
                e.stopPropagation();
                self._body.find('.floating-video').removeClass('floating-activated');
                self.wPoint['Floating'].destroy();
            })
        }

        Module.siteAccessDetector = function () {
            const self = this;

            if (self.themeSettings && self.themeSettings.adDetectorMethod) {
                if (self.crwDetect()) {
                    return false;
                }

                setTimeout(() => {
                    if (self.themeSettings.adDetectorMethod == 2) {
                        self.advanceAdBlockDetector();
                    } else {
                        self.basicAdBlockDetector();
                    }
                }, 1500);
            }
        };

        Module.basicAdBlockDetector = function () {

            const self = this;
            const checktag = $('#rb-checktag');
            const placebo = $('.rb-adbanner');

            if (checktag.length === 0) {
                return false;
            }
            if (placebo.height() < 1) {
                self.siteAccessFlag = true;
                $.magnificPopup.close();
                setTimeout(() => {
                    self.siteAccessNotification();
                }, 200);
            }
        };

        Module.advanceAdBlockDetector = async function () {
            const self = this;
            const googleAdUrl = '../pagead2.googlesyndication.com/pagead/js/f.txt';
            const isAdBlocked = await (async () => {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);
                    await fetch(googleAdUrl, {method: 'HEAD', signal: controller.signal});
                    clearTimeout(timeoutId);
                    return false;
                } catch (error) {
                    return true;
                }
            })();
            if (isAdBlocked) {
                self.siteAccessFlag = true;
                self.siteAccessNotification();
            }
        };

        Module.siteAccessNotification = function () {
            $.magnificPopup.open({
                type: 'inline',
                preloader: false,
                showCloseBtn: false,
                closeBtnInside: false,
                enableEscapeKey: false,
                closeOnBgClick: false,
                removalDelay: 9999999,
                items: {
                    src: $('#tmpl-rb-site-access').html(),
                    type: 'inline'
                },
                mainClass: 'rb-popup-center site-access-popup',
                fixedBgPos: true,
                fixedContentPos: true,
            });

            window.addEventListener('contextmenu', event => event.preventDefault());
        }

        /** build gallery lightbox */
        Module.galleryLightbox = function () {

            const self = this;
            if (!self.galleriesData) {
                return;
            }

            $('.gallery-popup-trigger').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const target = $(this);
                const slideIndex = target.data('index');

                $.magnificPopup.open({
                    type: 'inline',
                    mainClass: 'rb-gallery-popup rb-popup-center',
                    closeMarkup: '<button title="%title%" class="mfp-close mfp-button"><i class="rbi rbi-close"></i></button>',
                    closeOnBgClick: false,
                    removalDelay: 400,
                    showCloseBtn: true,
                    fixedBgPos: true,
                    fixedContentPos: true,
                    preloader: false,
                    gallery: {
                        enabled: true,
                        preload: [0, 2],
                        arrowMarkup: '<button title="%title%" type="button" class="mfp-arrow mfp-button mfp-arrow-%dir%"><i class="rbi rbi-%dir%"></i></button>',
                        tCounter: '<span>%curr% / %total%</span>'
                    },
                    callbacks: {
                        open: function () {
                            let itemsArray = Object.values(self.galleriesData);
                            let targetIndex = itemsArray.findIndex(item => item.key === slideIndex);
                            if (targetIndex !== -1) {
                                $.magnificPopup.instance.goTo(targetIndex);
                            }
                        },
                        change: function () {

                            let imgContainer = $('.gallery-popup-content');
                            let loader = imgContainer.find('.rb-loader');
                            let img = imgContainer.find('img');
                            loader.show();

                            if (!img.length) {
                                loader.hide();
                                return;
                            }

                            let loaderTimeout = setTimeout(() => {
                                loader.fadeIn(200);
                            }, 300); // Show loader only if image takes longer  300ms

                            img.on('load', function () {
                                clearTimeout(loaderTimeout); // Prevent loader from showing if image loads within 300ms
                                loader.hide();
                            }).on('error', function () {
                                clearTimeout(loaderTimeout);
                                loader.hide();
                            });
                        },
                        afterClose: function () {
                            $.magnificPopup.instance.popupsCache = {};
                        },
                        buildControls: function () {
                            if (this.arrowLeft && this.arrowRight) {
                                this.contentContainer.find('.gallery-popup-nav').append(this.arrowLeft.add(this.arrowRight));
                            }
                        }
                    },
                    inline: {
                        markup:
                            '<div class="gallery-popup-header light-scheme">' +
                            '<div class="mfp-counter"></div><div class="mfp-title h5"></div>' +
                            '<div class="popup-header-right"><div class="mfp-close"></div></div>' +
                            '</div><div class="gallery-popup-nav"></div>' +
                            '<div class="gallery-popup-content"><i class="rb-loader"></i>' +
                            '<div class="gallery-popup-image mfp-image"></div>' +
                            '<div class="gallery-popup-entry light-scheme">' +
                            '<div class="h4 mfp-excerpt"></div>' +
                            '<div class="description-text mfp-description"></div>' +
                            '</div>' +
                            '</div>'
                    },
                    items: Object.values(self.galleriesData)
                });

                return false;
            });
        };

        /** single featured lightbox */
        Module.singleFeaturedLightbox = function () {
            $('.featured-lightbox-trigger').on('click', function (e) {

                e.preventDefault();
                e.stopPropagation();

                const trigger = $(this);
                const source = '<img src="' + trigger.data('source') + '" alt="' + $(this).find('img').attr('alt') + '">';
                const caption = trigger.data('caption');
                const attribution = trigger.data('attribution');

                $.magnificPopup.open({
                    mainClass: 'rb-popup-center popup-no-overflow',
                    closeOnBgClick: true,
                    removalDelay: 400,
                    showCloseBtn: true,
                    fixedBgPos: true,
                    fixedContentPos: true,
                    preloader: false,
                    closeMarkup: '<button title="%title%" class="mfp-close rb-popup-close"><i class="rbi rbi-close"></i></button>',
                    callbacks: {
                        afterClose: function () {
                            $.magnificPopup.instance.popupsCache = {};
                        },
                    },
                    inline: {
                        markup:
                            '<div class="featured-popup-image"><div class="mfp-source"></div>' +
                            '<div class="mfp-close rb-popup-close"></div></div>' +
                            '<div class="gallery-popup-entry light-scheme">' +
                            '<div class="h4 mfp-excerpt"></div>' +
                            '<div class="description-text mfp-description"></div>' +
                            '</div>'
                    },
                    items: {
                        source: source,
                        excerpt: caption,
                        description: attribution,
                    },
                });
            });
        }

        /** Ajax pagination */
        Module.paginationNextPrev = function () {
            const self = this;
            self._body.on('click', '.pagination-trigger', function (e) {

                e.preventDefault();
                e.stopPropagation();
                const paginationTrigger = $(this);
                if (paginationTrigger.hasClass('is-disable')) {
                    return;
                }

                const block = paginationTrigger.parents('.block-wrap');
                const uuid = block.attr('id');

                if (!self.ajaxData[uuid]) {
                    self.ajaxData[uuid] = self.getBlockSettings(uuid);
                }
                if (self.ajaxData[uuid] && self.ajaxData[uuid].processing) {
                    return;
                }
                self.ajaxData[uuid].processing = true;
                const type = paginationTrigger.data('type');
                self.ajaxStartAnimation(block, 'replace');
                self.ajaxReplaceLoad(block, uuid, type);
            });
        }

        Module.ajaxReplaceLoad = function (block, uuid, type) {

            const self = this;

            if (!self.ajaxData[uuid].paged) {
                self.ajaxData[uuid].paged = 1;
            }
            if ('prev' === type) {
                self.ajaxData[uuid].page_next = parseInt(self.ajaxData[uuid].paged) - 1;
            } else {
                self.ajaxData[uuid].page_next = parseInt(self.ajaxData[uuid].paged) + 1;
            }

            const cacheID = self.cacheData.getCacheID(uuid, self.ajaxData[uuid].page_next);

            /** use cache */
            if (self.cacheData.exist(cacheID)) {
                const cache = self.cacheData.get(cacheID);
                if ('undefined' !== typeof cache.paged) {
                    self.ajaxData[uuid].paged = cache.paged;
                }
                setTimeout(function () {
                    self.ajaxRenderHTML(block, uuid, cache, 'replace');
                }, 200)

            } else {
                /** POST AJAX */
                $.ajax({
                    type: 'GET',
                    url: self.ajaxURL,
                    data: {
                        action: 'rblivep',
                        data: self.ajaxData[uuid]
                    },
                    success: function (response) {
                        response = JSON.parse(JSON.stringify(response));
                        if ('undefined' !== typeof response.paged) {
                            self.ajaxData[uuid].paged = response.paged;
                        }
                        self.cacheData.set(cacheID, response);
                        self.ajaxRenderHTML(block, uuid, response, 'replace');
                    }
                });
            }
        }

        Module.paginationLoadMore = function () {
            const self = this;
            self._body.on('click', '.loadmore-trigger', function (e) {

                e.preventDefault();
                e.stopPropagation();

                const paginationTrigger = $(this);
                if (paginationTrigger.hasClass('is-disable')) {
                    return;
                }

                const block = paginationTrigger.parents('.block-wrap');
                const uuid = block.attr('id');

                if (!self.ajaxData[uuid]) {
                    self.ajaxData[uuid] = self.getBlockSettings(uuid);
                }
                if (self.ajaxData[uuid] && self.ajaxData[uuid].processing) {
                    return;
                }
                self.ajaxData[uuid].processing = true;
                self.ajaxStartAnimation(block, 'append');
                self.ajaxAppendLoad(block, uuid);
            })
        }

        Module.paginationInfinite = function () {

            const self = this;

            const infiniteElements = $('.pagination-infinite');
            if (infiniteElements.length > 0) {
                infiniteElements.each(function () {
                    const paginationTrigger = $(this);
                    if (!paginationTrigger.hasClass('is-disable')) {
                        const block = paginationTrigger.parents('.block-wrap');
                        if ((block.hasClass('is-hoz-scroll') || block.hasClass('is-mhoz-scroll') || block.hasClass('is-thoz-scroll')) && window.outerWidth < 1025) {
                            paginationTrigger.addClass('is-disable');
                            return;
                        }
                        const uuid = block.attr('id');
                        const wPointID = 'infinite' + uuid;
                        if (!self.ajaxData[uuid]) {
                            self.ajaxData[uuid] = self.getBlockSettings(uuid);
                        }
                        const params = {
                            element: paginationTrigger,
                            offset: 'bottom-in-view',
                            handler: function (direction) {
                                if (self.ajaxData[uuid] && self.ajaxData[uuid].processing) {
                                    return;
                                }
                                if ('down' == direction) {
                                    self.ajaxData[uuid].processing = true;
                                    self.ajaxStartAnimation(block, 'append');
                                    self.ajaxAppendLoad(block, uuid);
                                }
                            }
                        }
                        self.wPoint[wPointID] = new Waypoint(params);
                    }
                });
            }
        }

        Module.ajaxAppendLoad = function (block, uuid) {
            const self = this;
            if (!self.ajaxData[uuid].paged) {
                self.ajaxData[uuid].paged = 1;
            }
            if (self.ajaxData[uuid].paged >= self.ajaxData[uuid].page_max) {
                return;
            }
            self.ajaxData[uuid].page_next = parseInt(self.ajaxData[uuid].paged) + 1;
            $.ajax({
                type: 'GET',
                url: self.ajaxURL,
                data: {
                    action: 'rblivep',
                    data: self.ajaxData[uuid]
                },
                success: function (response) {
                    response = JSON.parse(JSON.stringify(response));
                    if ('undefined' !== typeof response.paged) {
                        self.ajaxData[uuid].paged = response.paged;
                    }
                    if ('undefined' !== typeof response.notice) {
                        response.content = response.content + response.notice;
                    }
                    self.ajaxRenderHTML(block, uuid, response, 'append');
                }
            });
        }

        Module.liveSearch = function () {

            const liveSearch = $('.live-search-form');
            if (liveSearch.length === 0) {
                return;
            }

            const self = this;

            liveSearch.each(function () {
                const liveSearchEl = $(this);
                const input = liveSearchEl.find('input[type="text"]');
                const responseWrap = liveSearchEl.find('.live-search-response');
                const animation = liveSearchEl.find('.live-search-animation');
                const limit = liveSearchEl.data('limit');
                const search = liveSearchEl.data('search');
                const follow = liveSearchEl.data('follow');
                const tax = liveSearchEl.data('tax');
                const dsource = liveSearchEl.data('dsource');
                const ptype = liveSearchEl.data('ptype');

                input.attr('autocomplete', 'off');

                input.on('focus', function () {
                    const param = $(this).val();
                    if (param && !responseWrap.is(':empty')) {
                        responseWrap.css('height', 'auto').fadeIn(200);
                    }
                });

                const delay = (function () {
                    let timer = 0;
                    return function (callback, ms) {
                        clearTimeout(timer);
                        timer = setTimeout(callback, ms);
                    };
                })();

                input.keyup(function () {
                    const param = $(this).val();
                    delay(function () {
                        if (param) {
                            liveSearchEl.addClass('search-loading');
                            setTimeout(function () {
                                animation.fadeIn(100);
                            }, 120);

                            $.ajax({
                                type: 'GET',
                                url: self.ajaxURL,
                                data: {
                                    action: 'rbsearch',
                                    s: param,
                                    limit: limit,
                                    search: search,
                                    follow: follow,
                                    tax: tax,
                                    dsource: dsource,
                                    ptype: ptype,
                                },
                                success: function (data) {
                                    data = $.parseJSON(JSON.stringify(data));
                                    animation.fadeOut(200);
                                    setTimeout(function () {
                                        liveSearchEl.removeClass('search-loading');
                                    }, 200);
                                    responseWrap.hide().empty().css('height', responseWrap.height());
                                    responseWrap.html(data);
                                    if ('category' === search && follow && typeof FOXIZ_PERSONALIZE !== 'undefined') {
                                        FOXIZ_PERSONALIZE.syncLayoutCategories();
                                    }
                                    responseWrap.css('height', 'auto').fadeIn(200);
                                }
                            });
                        } else {
                            responseWrap.fadeOut(200, function () {
                                responseWrap.empty().css('height', 'auto');
                            });
                        }
                    }, 300);
                })
            });
        }

        /** personalized block */
        Module.personalizeBlocks = function () {
            const self = this;
            const elements = $('.is-ajax-block');
            if (elements.length > 0) {
                const blockRequests = elements.map(function () {
                    const block = $(this);
                    const uuid = block.attr('id');
                    if (!self.ajaxData[uuid]) {
                        self.ajaxData[uuid] = self.getBlockSettings(uuid);
                    }

                    if (self.ajaxData[uuid].content_source &&
                        self.ajaxData[uuid].content_source === 'recommended' &&
                        typeof foxizQueriedIDs !== 'undefined' && foxizQueriedIDs.data
                    ) {
                        self.ajaxData[uuid].post_not_in = foxizQueriedIDs.data;
                    }

                    self.ajaxData[uuid].uID = self.getStorage('RBUUID', '0');

                    return $.ajax({
                        type: 'GET',
                        url: self.ajaxURL,
                        data: {
                            action: 'rbpersonalizeb',
                            data: self.ajaxData[uuid]
                        }
                    });
                });

                Promise.all(blockRequests).then(responses => {
                    responses.forEach((response, index) => {
                        const block = $(elements[index]);
                        block.html(response).fadeIn(200);
                        block.dequeue();
                    });
                    self.reloadBlockFunc();
                });
            }
        };

        /** personalized categories */
        Module.personalizeCategories = function () {

            const self = this;
            const elements = $('.is-ajax-categories');
            if (elements.length > 0) {
                const categoryRequests = elements.map(function () {
                    const block = $(this);
                    const uuid = block.attr('id');
                    if (!self.ajaxData[uuid]) {
                        self.ajaxData[uuid] = self.getBlockSettings(uuid);
                    }
                    return $.ajax({
                        type: 'GET',
                        url: self.ajaxURL,
                        data: {
                            action: 'rbpersonalizecat',
                            data: self.ajaxData[uuid]
                        }
                    });
                });

                Promise.all(categoryRequests).then(responses => {
                    responses.forEach((response, index) => {
                        const block = $(elements[index]);
                        block.html(response).fadeIn(200);
                        block.dequeue();
                    });

                    if (typeof FOXIZ_PERSONALIZE !== 'undefined') {
                        FOXIZ_PERSONALIZE.syncLayoutCategories();
                    }
                    self.reloadBlockFunc();
                });
            }
        };

        Module.readingCollect = function () {
            const self = this;
            if (self.themeSettings.yesReadingHis === undefined) {
                return;
            }
            $.ajax({
                type: 'GET',
                url: self.ajaxURL,
                data: {
                    action: 'rbcollect',
                    id: self.themeSettings.yesReadingHis
                }
            });
        };

        /** header notification */
        Module.newsNotification = function () {

            const notificationWrapper = $('.rb-notification');
            if (notificationWrapper.length < 1) {
                return false;
            }
            const notificationID = this.personalizeUID + '-notification';
            const notificationCount = this.personalizeUID + '-notification-count';

            const self = this;
            const dot = $('.notification-info');
            const content = self.getTTLStorage(notificationID);
            const count = self.getTTLStorage(notificationCount);
            let reload = notificationWrapper.data('interval');
            if (!reload || isNaN(reload) || reload <= 0) {
                reload = 6;
            }
            if (!content) {
                $.ajax({
                    type: 'GET',
                    url: self.ajaxURL,
                    data: {
                        action: 'rbnotification',
                    },
                    success: function (response) {
                        response = $.parseJSON(JSON.stringify(response));
                        self.SetTTLStorage(notificationID, response.content, reload);
                        self.SetTTLStorage(notificationCount, response.count, reload);
                        notificationWrapper.append(response.content);
                        if (response.count) {
                            dot.append(response.count);
                            dot.css('opacity', 1);
                        }
                    }
                });
            } else {
                notificationWrapper.append(content);
                dot.append(count);
            }
        };

        /** register cache object */
        Module.cacheData = {

            data: {},
            get: function (id) {
                return this.data[id];
            },

            set: function (id, data) {
                this.remove(id);
                this.data[id] = data;
            },

            remove: function (id) {
                delete this.data[id];
            },

            getCacheID: function (blockID, currentPage) {
                return JSON.stringify('RB_' + blockID + '_' + currentPage);
            },

            exist: function (id) {
                return this.data.hasOwnProperty(id) && this.data[id] !== null;
            }
        }

        /**
         * ajax start animation
         * @param block
         * @param action
         */
        Module.ajaxStartAnimation = function (block, action) {

            const inner = block.find('.block-inner');
            block.find('.pagination-trigger').addClass('is-disable');
            inner.stop();

            if ('replace' === action) {
                inner.css('min-height', inner.outerHeight());
                inner.fadeTo('200', 0.05);
                inner.after('<i class="rb-loader loader-absolute"></i>');
            } else {
                block.find('.loadmore-trigger').addClass('loading');
                block.find('.rb-loader').css({'display': 'block'}).delay(200).animate({opacity: 1}, 200);
            }
        }

        /**
         * render ajax
         * @param block
         * @param uuid
         * @param response
         * @param action
         */
        Module.ajaxRenderHTML = function (block, uuid, response, action) {

            const self = this;

            block.delay(50).queue(function () {
                const uuid = block.attr('id');
                const inner = block.find('.block-inner');
                block.find('.pagination-trigger').removeClass('is-disable');
                inner.stop();

                if ('replace' === action) {
                    inner.html(response.content);
                    block.find('.rb-loader').animate({opacity: 0}, 200, function () {
                        $(this).remove();
                    })
                    inner.css('min-height', '');
                    inner.fadeTo(200, 1);

                } else {
                    const content = $(response.content);
                    inner.append(content);
                    content.addClass('is-invisible');
                    content.addClass('opacity-animate');

                    block.find('.rb-loader').animate({opacity: 0}, 200, function () {
                        $(this).css({'display': 'none'});
                    });
                    setTimeout(function () {
                        content.removeClass('is-invisible');
                    }, 200);
                    block.find('.loadmore-trigger').removeClass('loading');
                }

                /** reload */
                self.ajaxTriggerState(block, uuid);
                self.ajaxData[uuid].processing = false;
                block.dequeue();
                self.reloadBlockFunc();
            });
        }

        /**
         * set
         * @param block
         * @param uuid
         */
        Module.ajaxTriggerState = function (block, uuid) {
            const self = this;
            block.find('.pagination-trigger').removeClass('is-disable');
            if (self.ajaxData[uuid].paged < 2) {
                block.find('[data-type="prev"]').addClass('is-disable');
            } else if (self.ajaxData[uuid].paged >= self.ajaxData[uuid].page_max) {
                block.find('[data-type="next"]').addClass('is-disable');
                block.find('.loadmore-trigger').addClass('is-disable').hide();
                block.find('.pagination-infinite').addClass('is-disable').hide();
            }
        }

        Module.getBlockSettings = function (uuid) {
            const settings = typeof window[uuid] !== 'undefined' ? window[uuid] : undefined;
            return this.cleanNull(settings);
        }

        Module.cleanNull = function (data) {
            if (typeof data === 'string') {
                return data;
            }

            if (data && typeof data === 'object') {
                Object.keys(data).forEach(key => {
                    if (data[key] === '' || data[key] === null) {
                        delete data[key];
                    }
                });
            }

            return data;
        };

        /* SINGLE INFINITE */
        Module.singleInfiniteLoadNext = function () {

            const infiniteWrapper = $('#single-post-infinite');
            const self = this;

            if (!infiniteWrapper.length || self.disabledLoadNext()) {
                return;
            }

            self.singleLoadNextCounter = 1;
            self.singleLoadNextLimit = self.themeSettings?.singleLoadNextLimit ? parseInt(self.themeSettings.singleLoadNextLimit, 10) : 20;

            const infiniteLoadPoint = $('#single-infinite-point');
            const animationIcon = infiniteLoadPoint.find('.rb-loader');
            const rootURL = new URL(window.location.href);
            const rootGetParams = rootURL.searchParams;

            const loadNextParams = {
                element: infiniteLoadPoint,
                offset: 'bottom-in-view',
                handler: function (direction) {
                    if (self.ajaxData.singleProcessing || direction === 'up' || self.singleLoadNextCounter > self.singleLoadNextLimit) {
                        return;
                    }
                    const nextPostURL = new URL(infiniteWrapper.data('nextposturl'));
                    nextPostURL.searchParams.set('rbsnp', '1');
                    if (rootGetParams) {
                        rootGetParams.forEach((value, key) => {
                            if (key !== 'rbsnp' && 'p' !== key) {
                                nextPostURL.searchParams.set(key, value);
                            }
                        });
                    }
                    self.ajaxData.singleProcessing = true;
                    animationIcon.css('display', 'block').animate({opacity: 1}, 200);

                    $.ajax({
                        type: 'GET',
                        url: nextPostURL.toString(),
                        dataType: 'html',
                        success: function (response) {
                            response = $('<div id="temp-dom"></div>').append($.parseHTML(response)).find('.single-post-outer');
                            const nextPostURL = response.data('nextposturl');

                            if (nextPostURL) {
                                infiniteWrapper.data('nextposturl', nextPostURL);
                            } else {
                                infiniteWrapper.removeAttr('id');
                                infiniteLoadPoint.remove();
                            }

                            animationIcon.animate({opacity: 0}, 200).delay(200).css('display', 'none');
                            infiniteWrapper.append(response);
                            self.ajaxData.singleProcessing = false;
                            self.singleLoadNextCounter++;

                            setTimeout(function () {
                                self.reInitAll();
                                if (typeof FOXIZ_CORE_SCRIPT !== 'undefined') {
                                    FOXIZ_CORE_SCRIPT.loadGoogleAds(response);
                                    FOXIZ_CORE_SCRIPT.loadInstagram(response);
                                    FOXIZ_CORE_SCRIPT.loadTwttr();
                                }
                            }, 1);
                        }
                    });
                }
            };

            self.wPoint.ajaxSingleNextPosts = new Waypoint(loadNextParams);
        };

        Module.singleScrollRefresh = function () {

            const infiniteWrapper = $('#single-post-infinite');
            if (!infiniteWrapper.length) {
                return;
            }
            const self = this;
            self.articleData = [];
            const articleOuter = infiniteWrapper.find('.single-post-outer');

            if (articleOuter.length > 0) {
                self.inviewPostID = articleOuter.eq(0).data('postid');

                articleOuter.each(function () {
                    const article = $(this);
                    const itemData = {
                        postID: article.data('postid'),
                        postURL: article.data('postlink'),
                        postTitle: article.find('h1.s-title').text(),
                        shareList: article.find('.sticky-share-list-buffer').html(),
                        top: article.offset().top,
                        bottom: article.offset().top + article.outerHeight(true)
                    };

                    if (self.readIndicator.length > 0) {
                        const content = article.find('.rbct').eq(0);
                        itemData.indicatorTop = content.offset().top;
                        itemData.indicatorHeight = content.outerHeight(true) - self._window.height();
                    }
                    self.articleData.push(itemData);
                });

                const onScroll = () => {
                    self.animationFrame(self.scrollToUpdateArticle.bind(self));
                };
                if (window.addEventListener) {
                    window.addEventListener('scroll', onScroll, false);
                }
            }
        }

        /** scrollToUpdateArticle */
        Module.scrollToUpdateArticle = function () {
            const self = this;
            const scroll = self._window.scrollTop();

            self.articleData.every(article => {
                if (scroll > (article.top + 5) && scroll < (article.bottom - 5)) {
                    if (article.indicatorTop) {
                        self.readIndicatorPercent = Math.min(((scroll - article.indicatorTop) / article.indicatorHeight) * 100, 100);
                        if (self.readIndicatorPercent <= 100) {
                            self.readIndicator.css('width', `${self.readIndicatorPercent}%`);
                        }
                    }

                    if (article.postID !== self.inviewPostID) {
                        self.inviewPostID = article.postID;
                        if (article.postURL) {
                            history.replaceState(null, null, article.postURL);
                        }
                        document.title = article.postTitle;
                        $('.single-post-outer').removeClass('activated');
                        $('[data-postid="' + article.postID + '"]').addClass('activated');
                        $('#s-title-sticky .sticky-title').hide().html(article.postTitle).fadeIn(300);
                        $('#s-title-sticky .sticky-share-list').html(article.shareList);
                        self._body.find('.floating-video').removeClass('floating-activated');

                        if (typeof FOXIZ_CORE_SCRIPT !== 'undefined') {
                            FOXIZ_CORE_SCRIPT.updateGA(article);
                        }
                    }
                    return false;
                }

                return true;

            });
        }

        /**
         * @returns {boolean}
         */
        Module.crwDetect = function () {
            const botPatterns = [
                /alexa|altavista|ask jeeves|attentio|baiduspider|bingbot|chtml generic|crawler|fastmobilecrawl|feedfetcher-google|firefly|froogle|gigabot|googlebot|googlebot-mobile|heritrix|httrack|ia_archiver|irlbot|iescholar|infoseek|jumpbot|linkcheck|lycos|mediapartners|mediobot|motionbot|msnbot|mshots|openbot|pss-webkit-request|pythumbnail|scooter|slurp|snapbot|spider|taptubot|technoratisnoop|teoma|twiceler|yahooseeker|yahooysmcm|yammybot|ahrefsbot|pingdom.com_bot|kraken|yandexbot|twitterbot|tweetmemebot|openhosebot|queryseekerspider|linkdexbot|grokkit-crawler|livelapbot|germcrawler|domaintunocrawler|grapeshotcrawler|cloudflare-alwaysonline/i
            ];

            const userAgent = navigator.userAgent;
            return botPatterns.some(pattern => pattern.test(userAgent));
        };

        /**
         *
         * @returns {boolean}
         */
        Module.disabledLoadNext = function () {

            if (this.themeSettings.crwLoadNext) {
                return false;
            }

            return this.crwDetect();
        }

        /** productQuantity */
        Module.productQuantity = function () {
            this._document.on('click', '.quantity .quantity-btn', function (e) {

                e.preventDefault();
                e.stopPropagation();

                const button = $(this);
                const input = button.parent().find('input');

                let step = 1;
                let min = 1;
                let max = 9999;
                let value_old = parseInt(input.val());
                let value_new = parseInt(input.val());

                if (input.attr('step')) {
                    step = parseInt(input.attr('step'));
                }

                if (input.attr('min')) {
                    min = parseInt(input.attr('min'));
                }

                if (input.attr('max')) {
                    max = parseInt(input.attr('max'));
                }

                if (button.hasClass('up')) {
                    if (value_old < max) {
                        value_new = value_old + step;
                    } else {
                        value_new = 1;
                    }
                } else if (button.hasClass('down')) {
                    if (value_old > min) {
                        value_new = value_old - step;
                    } else {
                        value_new = 0;
                    }
                }

                if (!input.attr('disabled')) {
                    input.val(value_new).change();
                }
            });
        }

        Module.cartNotification = function () {
            const self = this;
            const element = $('#add-cart-popup');

            self._body.on('added_to_cart', function () {
                element.fadeIn(200);
                self.cartNotificationTimeOut = setTimeout(function () {
                    element.fadeOut(200);
                }, 5000);
                self.hoveringNotification(element);
            });
        }

        Module.hoveringNotification = function (element) {
            const self = this;

            element.on('mouseenter', function () {
                clearTimeout(self.cartNotificationTimeOut);
            });

            element.on('mouseleave', function () {
                setTimeout(function () {
                    element.fadeOut(200);
                }, 1500);
            });
        }

        /** like/dislike */
        Module.likeToggle = function () {

            const self = this;
            let reaction = '';
            self._body.on('click', '.like-trigger, .dislike-trigger', function (e) {

                e.preventDefault();
                e.stopPropagation();

                const target = $(this);
                const wrap = target.parent('[data-like]');
                const pid = wrap.data('like');

                if (!pid || self.isProgress) return;

                self.isProgress = true;
                const storageKey = self.getLikeKey(pid);
                const isLike = target.hasClass('like-trigger');
                const isDislike = target.hasClass('dislike-trigger');
                const sibEl = target.siblings();
                const likeCountEl = wrap.find('.like-count');
                const dislikeCountEl = wrap.find('.dislike-count');
                let likeCountText = likeCountEl.text();
                let dislikeCountText = dislikeCountEl.text();

                if (isLike) {
                    if (!target.hasClass('triggered')) {
                        reaction = 'like';
                        if (!/[kKmM]/.test(likeCountText)) {
                            likeCountText = parseInt(likeCountText);
                            if (isNaN(likeCountText)) {
                                likeCountText = 0;
                            }
                            likeCountEl.text(likeCountText + 1);
                        }
                        target.addClass('triggered');

                        if (sibEl.hasClass('triggered')) {
                            sibEl.removeClass('triggered');
                            if (!/[kKmM]/.test(dislikeCountText)) {
                                dislikeCountText = parseInt(dislikeCountText) - 1;
                                if (isNaN(dislikeCountText) || dislikeCountText < 1) {
                                    dislikeCountText = '';
                                }
                                dislikeCountEl.text(dislikeCountText);
                            }
                        }
                        self.setStorage(storageKey, 'like');
                    } else {
                        reaction = 'rmlike';
                        if (!/[kKmM]/.test(likeCountText)) {
                            likeCountText = parseInt(likeCountText) - 1;
                            if (isNaN(likeCountText) || likeCountText < 1) {
                                likeCountText = '';
                            }
                            likeCountEl.text(likeCountText);
                        }
                        target.removeClass('triggered');
                        self.deleteStorage(storageKey);
                    }
                } else if (isDislike) {
                    if (!target.hasClass('triggered')) {
                        reaction = 'dislike';
                        if (!/[kKmM]/.test(dislikeCountText)) {
                            dislikeCountText = parseInt(dislikeCountText);
                            if (isNaN(dislikeCountText)) {
                                dislikeCountText = 0;
                            }
                            dislikeCountEl.text(dislikeCountText + 1);
                        }
                        target.addClass('triggered');
                        if (sibEl.hasClass('triggered')) {
                            sibEl.removeClass('triggered');
                            if (!/[kKmM]/.test(likeCountText)) {
                                likeCountText = parseInt(likeCountText) - 1;
                                if (isNaN(likeCountText) || likeCountText < 1) {
                                    likeCountText = '';
                                }
                                likeCountEl.text(likeCountText);
                            }
                        }
                        self.setStorage(storageKey, 'dislike');
                    } else {
                        reaction = 'rmdislike';
                        if (!/[kKmM]/.test(dislikeCountText)) {
                            likeCountText = parseInt(likeCountText) - 1;
                            if (isNaN(likeCountText) || likeCountText < 1) {
                                likeCountText = '';
                            }
                            dislikeCountEl.text(likeCountText);
                        }
                        target.removeClass('triggered');
                        self.deleteStorage(storageKey);
                    }
                }

                $.ajax({
                    type: 'GET',
                    url: self.ajaxURL,
                    data: {
                        uuid: self.personalizeUID,
                        action: 'rbvoting',
                        value: reaction,
                        pid: pid,
                    },
                    complete: () => {
                        self.isProgress = false;
                    }
                })
            })
        }

        /** sync layout */
        Module.syncLayoutLike = function () {

            this.isProgress = true;
            const likeElements = document.querySelectorAll('[data-like]:not(.loaded)');
            const jsCount = this._body.hasClass('is-jscount');
            let count, countEl;

            for (const el of likeElements) {
                el.classList.add('loaded');
                const key = this.getLikeKey(el.getAttribute('data-like'));
                const triggered = this.getStorage(key);

                if (!triggered) continue;

                const likeEl = el.querySelector('.el-like');
                const dislikeEl = el.querySelector('.el-dislike');

                if (!likeEl || !dislikeEl) continue;

                if (triggered === 'like') {
                    likeEl.classList.add('triggered');
                    countEl = jsCount ? likeEl.querySelector('.like-count') : null;
                    if (countEl) {
                        count = parseInt(countEl.textContent.trim()) || 0;
                        countEl.textContent = count + 1;
                    }
                } else if (triggered === 'dislike') {
                    dislikeEl.classList.add('triggered');
                    countEl = jsCount ? dislikeEl.querySelector('.dislike-count') : null;
                    if (countEl) {
                        count = parseInt(countEl.textContent.trim()) || 0;
                        countEl.textContent = count + 1;
                    }
                }
            }

            this.isProgress = false;
        };

        /** like key */
        Module.getLikeKey = function (id) {
            return this.personalizeUID + '-like-' + id;
        }

        /** live blog */
        Module.liveBlog = function () {
            const self = this;

            const liveEntry = $('.rb-live-entry');

            if (liveEntry.length === 0) {
                return false;
            }

            let intervalId;
            const interval = Math.max(30, this.themeSettings.liveInterval || 0);
            const liveSwitcher = $('#live-interval-switcher');
            const storedSetting = this.getStorage('liveIntervalCheckbox');

            const updateInterval = () => {
                clearInterval(intervalId);
                if (liveSwitcher.prop('checked')) {
                    intervalId = setInterval(() => this.updateLiveBlog(liveEntry), interval * 1000);
                    self.setStorage('liveIntervalCheckbox', 'yes');
                } else {
                    self.setStorage('liveIntervalCheckbox', 'no');
                }
            };

            if (storedSetting !== null) {
                liveSwitcher.prop('checked', storedSetting === 'yes');
            } else {
                self.setStorage('liveIntervalCheckbox', 'yes');
            }

            updateInterval();
            liveSwitcher.on('change', updateInterval);
        };

        Module.updateLiveBlog = function (liveEntry) {

            const self = this;
            const liveURL = new URL(window.location.href);
            liveURL.searchParams.set('rblive', '1');
            $.ajax({
                type: 'GET',
                url: liveURL.toString(),
                dataType: 'html',
                success: function (response) {
                    response = $('<div id="temp-dom"></div>').append($.parseHTML(response)).find('#rb-live-content');
                    liveEntry.html(response.html());
                    const liveCountElement = liveEntry.prev().find('.live-count');
                    if (liveCountElement.length) {
                        liveCountElement.text(response.data('total'));
                    }
                    setTimeout(function () {
                        self.reInitAll();
                        if (typeof FOXIZ_CORE_SCRIPT !== 'undefined') {
                            FOXIZ_CORE_SCRIPT.loadGoogleAds(response);
                            FOXIZ_CORE_SCRIPT.loadInstagram(response);
                            FOXIZ_CORE_SCRIPT.loadTwttr();
                        }
                    }, 1);
                }
            });
        }

        Module.accordion = function () {
            $('.gb-accordion').each(function () {
                const accordion = $(this);
                if (accordion.hasClass('yesLoaded')) return;

                accordion.addClass('yesLoaded');
                const accordionItems = accordion.find('.gb-accordion-item');

                if (accordion.hasClass('yes-open')) {
                    accordionItems.first().addClass('active').find('.accordion-item-content').css('display', 'block');
                }

                accordion.on('click', '.accordion-item-header', function (e) {
                    e.preventDefault();

                    const header = $(this);
                    const item = header.closest('.gb-accordion-item');
                    const content = item.find('.accordion-item-content');

                    if (item.hasClass('active')) {
                        item.removeClass('active');
                        content.stop().slideUp(200);
                    } else {
                        const activeItem = accordionItems.filter('.active');
                        activeItem.removeClass('active').find('.accordion-item-content').stop().slideUp(200);
                        item.addClass('active');
                        content.stop().slideDown(200);
                    }
                });
            });
        };

        Module.resIframeClassic = function () {

            if (!document.body.classList.contains('res-iframe-classic')) return
            const iframes = document.querySelectorAll('.rbct iframe');
            iframes.forEach(iframe => {
                const parent = iframe.parentElement;
                const grandParent = parent.parentElement;
                const greatGrandParent = grandParent.parentElement;

                if ([parent, grandParent, greatGrandParent].some(element => {
                    const classNames = Array.from(element.classList);
                    return classNames.some(className => className.indexOf('wp-block') !== -1);
                })) return;

                if (!iframe.parentElement.classList.contains('rb-video-ires')) {
                    if (iframe.src.includes('youtube.com') || iframe.src.includes('youtu.be') || iframe.src.includes('vimeo.com') || iframe.src.includes('dailymotion.com')) {
                        iframe.parentElement.classList.add('rb-video-ires');
                    }
                }
            });
        }

        Module.taxBasedAccordion = function () {

            const self = this;
            $('.block-tax-accordion').each(function () {
                const accordion = $(this);
                if (accordion.hasClass('is-loaded')) {
                    return;
                }
                accordion.addClass('is-loaded');
                const accordionItems = accordion.find('.tax-accordion-item');
                const lastOpenedTab = self.getStorage(accordion.attr('id') + '_lastOpenedTab', null);

                if (lastOpenedTab) {
                    const tabToOpen = accordion.find('[data-tab="' + lastOpenedTab + '"] .tax-accordion-sub');
                    if (tabToOpen.length !== 0) {
                        tabToOpen.show();
                    }
                }

                accordionItems.each(function () {
                    const item = $(this);
                    const trigger = item.find('.tax-accordion-trigger');
                    const subMenu = item.find('.tax-accordion-sub');

                    trigger.click(function () {
                        if (!subMenu.is(':visible')) {
                            accordion.find('.tax-accordion-sub').not(subMenu).slideUp();
                        }
                        subMenu.slideToggle(function () {
                            if (subMenu.is(':visible')) {
                                self.setStorage(accordion.attr('id') + '_lastOpenedTab', item.attr('data-tab'));
                            } else {
                                self.deleteStorage(accordion.attr('id') + '_lastOpenedTab');
                            }
                        });
                    });
                });
            });
        };


        Module.sequentialGalleryDisplay = function () {
            const galleries = Array.from(document.querySelectorAll('.gallery-animated'));
            galleries.forEach(gallery => {
                const images = Array.from(gallery.querySelectorAll('.e-gallery-item'));
                new Waypoint({
                    element: gallery,
                    handler: function (direction) {
                        if (direction === 'down') {
                            images.forEach((image, index) => {
                                requestAnimationFrame(() => {
                                    setTimeout(() => {
                                        image.classList.add('gallery-visible');
                                    }, index * 120);
                                });
                            });
                            this.destroy();
                        }
                    },
                    offset: '80%'
                });
            });
        };


        Module.reloadCaptchaPopups = function (delay = 50) {
            setTimeout(() => {
                const $content = $($.magnificPopup?.instance?.content || []);
                if (!$content.length) return;

                const removeDuplicateCaptchas = form => {
                    const seen = new Set();
                    $(form)
                        .find('.g-recaptcha, .h-captcha, .cf-turnstile, .turnstile-widget, .frc-captcha, [data-arkose-public-key], .arkose-enforcement, .geetest_holder, .geetest_panel')
                        .each(function () {
                            const cls = this.className;
                            const type = ['g-recaptcha', 'h-captcha', 'cf-turnstile', 'turnstile-widget', 'frc-captcha', 'arkose', 'geetest']
                                .find(t => cls.includes(t) || $(this).data('arkose-public-key') || $(this).hasClass('arkose-enforcement'));
                            if (!type) return;
                            const key = `${type}`;
                            if (seen.has(key)) {
                                $(this).remove();
                            } else {
                                seen.add(key);
                            }
                        });
                };

                try {
                    // Remove duplicates per form
                    $content.find('form').each(function () {
                        removeDuplicateCaptchas(this);
                    });

                    // Google reCAPTCHA
                    if (typeof grecaptcha !== 'undefined' && grecaptcha?.reset) {
                        $content.find('.g-recaptcha').each(function () {
                            const wid = this.dataset.widgetId;
                            if (wid) {
                                try { grecaptcha.reset(Number(wid)); } catch {}
                            }
                        });
                    }

                    // Cloudflare Turnstile
                    if (typeof turnstile !== 'undefined' && turnstile?.reset) {
                        $content.find('.cf-turnstile, .turnstile-widget').each(function () {
                            const iframe = this.querySelector('iframe');
                            const wid = iframe?.dataset?.wid;
                            if (wid) {
                                try { turnstile.reset(wid); } catch {}
                            }
                        });
                    }

                    // hCaptcha
                    if (typeof hcaptcha !== 'undefined' && hcaptcha?.reset) {
                        $content.find('.h-captcha').each(function () {
                            const wid = this.dataset.widgetId;
                            if (wid) {
                                try { hcaptcha.reset(Number(wid)); } catch {}
                            }
                        });
                    }

                    // FriendlyCaptcha
                    if (typeof friendlycaptcha !== 'undefined' && friendlycaptcha?.widget) {
                        $content.find('.frc-captcha').each(function () {
                            const stored = $(this).data('frc-widget');
                            if (stored?.reset) {
                                try { stored.reset(); } catch {}
                            }
                        });
                    }

                    // Arkose Labs
                    if (window?.arkose?.reset || typeof ECArkose !== 'undefined') {
                        const $arkoseEls = $content.find('[data-arkose-public-key], .arkose-enforcement');
                        if ($arkoseEls.length) {
                            try {
                                window?.arkose?.reset?.();
                                ECArkose?.reset?.();
                            } catch {}
                        }
                    }

                    // GeeTest
                    if (typeof initGeetest !== 'undefined' || typeof GeetInit !== 'undefined') {
                        $content.find('.geetest_holder, .geetest_panel').each(function () {
                            const inst = this.geetestInstance;
                            if (inst?.reset) {
                                try { inst.reset(); } catch {}
                            }
                        });
                    }

                } catch (err) {}
            }, delay);
        };

        return Module;

    }(FOXIZ_MAIN_SCRIPT || {}, jQuery)
)

/** init */
jQuery(document).ready(function ($) {
    FOXIZ_MAIN_SCRIPT.init();
});

/** Elementor editor */
jQuery(window).on('elementor/frontend/init', function () {

    if (typeof elementorFrontend !== 'undefined' && typeof elementorFrontend.isEditMode === 'function' && elementorFrontend.isEditMode()) {
        FOXIZ_MAIN_SCRIPT.isElementorEditor = true;
        FOXIZ_MAIN_SCRIPT.editorDarkModeInit = false;

        elementorFrontend.hooks.addAction('frontend/element_ready/widget', FOXIZ_MAIN_SCRIPT.initElementor);
    }
});