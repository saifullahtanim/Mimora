/* Fake Message Generator
 * Renders an iOS/Android Messages screenshot to a single <canvas>. Logical
 * dimensions match an iPhone 15 / Android screen at 3x density,
 * so the exported PNG is crisp and clean.
 */
(function () {
    'use strict';

    var canvas = document.getElementById('imsgCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    // ---------- Constants ----------
    // iPhone 15 logical viewport: 393 x 852 pt. Status bar 54, nav bar 96,
    // bottom safe area (home indicator) 34. Render at 3x for retina parity.
    var DPR = 3;
    var W = 393;

    var STATUS_H   = 54;
    var HEADER_H   = 96;
    var INPUT_H    = 50;   // matches real iOS Messages spec (was 64, too tall)
    var HOME_H     = 34;
    // The exported canvas always fills at least this height in points. Short
    // threads sit at the bottom with empty space above, anchored to the input
    // bar (like real iOS behavior).
    var SCREEN_H   = 800;

    var FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "Helvetica Neue", Helvetica, Arial, sans-serif';
    var FONT_DISPLAY = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro", "Helvetica Neue", Helvetica, Arial, sans-serif';

    var COLORS = {
        bg: '#FFFFFF',
        incoming: '#E9E9EB',
        incomingText: '#000000',
        iMessage: '#0B84FE',
        iMessageText: '#FFFFFF',
        sms: '#65C466',
        smsText: '#FFFFFF',
        timeSep: '#8A8A8E',
        receiptText: '#8A8A8E',
        chevron: '#0B84FE',
        nameText: '#000000',
        serviceLabel: '#8E8E93',
        statusIcon: '#000000',
        dynamicIsland: '#000000',
        inputFieldBg: '#FFFFFF',
        inputFieldBorder: 'rgba(60,60,67,0.18)',
        inputPlaceholder: 'rgba(60,60,67,0.55)',
        inputBarBg: '#FFFFFF',
        sendBg: '#0B84FE',
        sendArrow: '#FFFFFF',
        homeIndicator: '#000000',
        hairline: 'rgba(60,60,67,0.2)',
        avatarPalette: ['#FF9500', '#FF3B30', '#5856D6', '#34C759', '#5AC8FA', '#AF52DE', '#FF2D55', '#007AFF']
    };

    // ---------- State ----------
    var state = {
        deviceOS: 'ios',
        networkType: 'VoLTE',
        simMode: 'dual',
        showPercent: true,
        showCameraHole: true,
        showNotifIcons: false,
        contactName: 'Mimora',
        contactAvatar: null,
        service: 'iMessage',
        statusTime: '9:41',
        battery: 100,
        signal: 4,
        wifi: true,
        showTyping: false,
        showReadReceipt: true,
        readReceiptText: 'Read 9:42 AM',
        messages: [
            { id: 1, side: 'in',  text: 'Hey, are you free tonight?', timestamp: 'Today 9:38 AM' },
            { id: 2, side: 'out', text: 'Yeah! What time?',           timestamp: '' },
            { id: 3, side: 'in',  text: 'Around 8? I made reservations at that ramen place.', timestamp: '' }
        ]
    };
    var nextId = 4;

    // ---------- Path / canvas helpers ----------
    function roundRectPath(c, x, y, w, h, r) {
        if (typeof c.roundRect === 'function') {
            c.beginPath();
            c.roundRect(x, y, w, h, r);
            return;
        }
        var rr = Math.min(r, w / 2, h / 2);
        c.beginPath();
        c.moveTo(x + rr, y);
        c.lineTo(x + w - rr, y);
        c.quadraticCurveTo(x + w, y, x + w, y + rr);
        c.lineTo(x + w, y + h - rr);
        c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        c.lineTo(x + rr, y + h);
        c.quadraticCurveTo(x, y + h, x, y + h - rr);
        c.lineTo(x, y + rr);
        c.quadraticCurveTo(x, y, x + rr, y);
        c.closePath();
    }

    /**
     * Build a chat-bubble path. When `tail` is true, the bottom-trailing
     * corner gets the iMessage "ear" curl. Side decides which side the
     * tail attaches to.
     */
    function bubblePath(c, x, y, w, h, side, tail) {
        var r = 18;
        if (!tail) {
            roundRectPath(c, x, y, w, h, r);
            return;
        }
        c.beginPath();
        if (side === 'out') {
            // Top-left → top-right → right side → tail (bottom-right) → bottom → left → close.
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y);
            c.quadraticCurveTo(x + w, y, x + w, y + r);
            c.lineTo(x + w, y + h - 11);
            // Outer flare of the tail
            c.bezierCurveTo(
                x + w,      y + h - 2,
                x + w + 4,  y + h + 1,
                x + w + 7,  y + h
            );
            // Inner curl back into the bubble bottom edge
            c.bezierCurveTo(
                x + w - 2,  y + h + 1,
                x + w - 8,  y + h - 1,
                x + w - 14, y + h
            );
            c.lineTo(x + r, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - r);
            c.lineTo(x, y + r);
            c.quadraticCurveTo(x, y, x + r, y);
        } else {
            // Tail on the bottom-left (incoming).
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y);
            c.quadraticCurveTo(x + w, y, x + w, y + r);
            c.lineTo(x + w, y + h - r);
            c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            c.lineTo(x + 14, y + h);
            // Inner curl
            c.bezierCurveTo(
                x + 8,  y + h - 1,
                x + 2,  y + h + 1,
                x - 7,  y + h
            );
            // Outer flare
            c.bezierCurveTo(
                x - 4,  y + h + 1,
                x,      y + h - 2,
                x,      y + h - 11
            );
            c.lineTo(x, y + r);
            c.quadraticCurveTo(x, y, x + r, y);
        }
        c.closePath();
    }

    function setFont(c, size, weight, family) {
        c.font = (weight || 400) + ' ' + size + 'px ' + (family || FONT);
    }

    function wrapLines(c, text, maxWidth) {
        var paragraphs = String(text || '').split(/\r?\n/);
        var lines = [];
        for (var p = 0; p < paragraphs.length; p++) {
            var words = paragraphs[p].split(/\s+/);
            if (words.length === 1 && words[0] === '') { lines.push(''); continue; }
            var line = '';
            for (var i = 0; i < words.length; i++) {
                var test = line ? line + ' ' + words[i] : words[i];
                if (c.measureText(test).width <= maxWidth || !line) {
                    line = test;
                } else {
                    lines.push(line);
                    line = words[i];
                }
            }
            if (line) lines.push(line);
        }
        return lines.length ? lines : [''];
    }

    function paletteIndex(str) {
        var s = String(str || '');
        var h = 0;
        for (var i = 0; i < s.length; i++) {
            h = (h * 31 + s.charCodeAt(i)) | 0;
        }
        return Math.abs(h) % COLORS.avatarPalette.length;
    }

    function initialsFromName(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    // ---------- Status bar ----------
    function drawIosStatusBar(c, y) {
        // Time on the left
        setFont(c, 17, 600, FONT_DISPLAY);
        c.fillStyle = COLORS.statusIcon;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(state.statusTime || '9:41', 56, y + 24);

        // Right cluster: signal bars → wifi → battery (left to right).
        var iconBottomY = y + 34;
        var rightX = W - 20;

        // ----- Battery -----
        var battW = 27, battH = 12;
        var battX = rightX - battW;
        var battY = iconBottomY - battH;
        c.strokeStyle = COLORS.statusIcon;
        c.lineWidth = 1.1;
        roundRectPath(c, battX, battY, battW, battH, 3);
        c.stroke();
        // Cap
        c.fillStyle = COLORS.statusIcon;
        roundRectPath(c, battX + battW + 0.8, battY + 3, 1.8, battH - 6, 0.9);
        c.fill();
        // Fill
        var pct = Math.max(0, Math.min(100, state.battery)) / 100;
        var inset = 1.5;
        var fillW = Math.max(0, (battW - inset * 2) * pct);
        c.fillStyle = pct <= 0.2 ? '#FF3B30' : COLORS.statusIcon;
        roundRectPath(c, battX + inset, battY + inset, fillW, battH - inset * 2, 1.4);
        c.fill();

        // ----- Wi-Fi -----
        var wifiOuterR = 10;
        var iconGap = 7;
        var dotR = 1.6;
        var wifiCX = battX - iconGap - wifiOuterR;
        var wifiCY = iconBottomY - dotR;
        if (state.wifi) {
            c.strokeStyle = COLORS.statusIcon;
            c.lineCap = 'round';
            c.lineWidth = 1.9;
            var aStart = Math.PI + 0.55;
            var aEnd   = Math.PI * 2 - 0.55;
            c.beginPath();
            c.arc(wifiCX, wifiCY, wifiOuterR, aStart, aEnd);
            c.stroke();
            c.beginPath();
            c.arc(wifiCX, wifiCY, 6.7, aStart, aEnd);
            c.stroke();
            c.beginPath();
            c.arc(wifiCX, wifiCY, 3.5, aStart, aEnd);
            c.stroke();
            c.fillStyle = COLORS.statusIcon;
            c.beginPath();
            c.arc(wifiCX, wifiCY, dotR, 0, Math.PI * 2);
            c.fill();
            c.lineCap = 'butt';
        }

        // ----- Signal bars (4 ascending) -----
        var sigBaseY = iconBottomY;
        var sigBarW = 3.2, sigBarGap = 1.4, sigBarCount = 4;
        var sigClusterW = sigBarCount * sigBarW + (sigBarCount - 1) * sigBarGap;
        var sigEndX = wifiCX - wifiOuterR - iconGap;
        var sigX = sigEndX - sigClusterW;
        var bars = Math.max(0, Math.min(4, state.signal | 0));
        for (var b = 0; b < sigBarCount; b++) {
            var bh = 3 + b * 2.2;
            var bx = sigX + b * (sigBarW + sigBarGap);
            var by = sigBaseY - bh;
            c.fillStyle = b < bars ? COLORS.statusIcon : 'rgba(0,0,0,0.22)';
            roundRectPath(c, bx, by, sigBarW, bh, 0.9);
            c.fill();
        }
    }

    // Modern Android / Samsung Flagship status bar (matches punch-hole + VoLTE + Dual SIM)
    function drawAndroidStatusBar(c, y) {
        var centerY = y + 24;

        // 1. Center Punch-hole Camera
        if (state.showCameraHole) {
            var camCX = W / 2;
            var camCY = y + 21;
            // Outer bezel
            c.fillStyle = '#1c2024';
            c.beginPath();
            c.arc(camCX, camCY, 6.6, 0, Math.PI * 2);
            c.fill();
            // Inner dark lens
            c.fillStyle = '#06080c';
            c.beginPath();
            c.arc(camCX, camCY, 5.3, 0, Math.PI * 2);
            c.fill();
            // Glint reflection
            c.fillStyle = 'rgba(70, 130, 200, 0.45)';
            c.beginPath();
            c.arc(camCX + 1.5, camCY - 1.5, 1.2, 0, Math.PI * 2);
            c.fill();
        }

        // 2. Left side: Clean Time (no clutter/notification icons)
        var timeStr = state.statusTime || '9:41';
        setFont(c, 14.5, 600, '"Roboto", "Google Sans", "Segoe UI", -apple-system, sans-serif');
        c.fillStyle = COLORS.statusIcon;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(timeStr, 20, centerY);

        // 3. Right side: Horizontal Battery, Battery %, Wi-Fi, Network (VoLTE/5G/4G), Signal (Single / Dual SIM)
        var curX = W - 20;

        // Horizontal Battery (lying down like real screenshot)
        var battW = 25, battH = 11.5;
        var battX = curX - battW;
        var battY = centerY - battH / 2;

        // Body outline
        c.strokeStyle = COLORS.statusIcon;
        c.lineWidth = 1.1;
        roundRectPath(c, battX, battY, battW, battH, 3);
        c.stroke();

        // Terminal Cap on the right
        c.fillStyle = COLORS.statusIcon;
        roundRectPath(c, battX + battW + 0.8, battY + 2.8, 1.8, battH - 5.6, 0.9);
        c.fill();

        // Fill from left to right
        var pct = Math.max(0, Math.min(100, state.battery)) / 100;
        var inset = 1.4;
        var maxFillW = battW - inset * 2;
        var fillW = Math.max(0, maxFillW * pct);
        c.fillStyle = pct <= 0.15 ? '#FF3B30' : COLORS.statusIcon;
        roundRectPath(c, battX + inset, battY + inset, fillW, battH - inset * 2, 1.4);
        c.fill();
        curX = battX - 6;

        // Battery percentage text (e.g. 100% or 53%)
        if (state.showPercent) {
            var pctText = (state.battery | 0) + '%';
            setFont(c, 12.5, 600, '"Roboto", "Segoe UI", sans-serif');
            var pctW = c.measureText(pctText).width;
            c.fillStyle = COLORS.statusIcon;
            c.textAlign = 'right';
            c.textBaseline = 'middle';
            c.fillText(pctText, curX, centerY);
            curX -= (pctW + 7);
        }

        // Wi-Fi (3 concentric curved arcs + bottom apex dot matching reference image)
        if (state.wifi) {
            var wifiOuterR = 10;
            curX -= wifiOuterR;
            var wifiCX = curX;
            var wifiCY = centerY + 3.8;
            var dotR = 1.6;

            c.strokeStyle = COLORS.statusIcon;
            c.lineCap = 'round';
            c.lineWidth = 1.85;
            var aStart = Math.PI + 0.58;
            var aEnd   = Math.PI * 2 - 0.58;

            // Outer arc
            c.beginPath();
            c.arc(wifiCX, wifiCY, wifiOuterR, aStart, aEnd);
            c.stroke();

            // Middle arc
            c.beginPath();
            c.arc(wifiCX, wifiCY, 6.7, aStart, aEnd);
            c.stroke();

            // Inner arc
            c.beginPath();
            c.arc(wifiCX, wifiCY, 3.5, aStart, aEnd);
            c.stroke();

            // Bottom apex dot
            c.fillStyle = COLORS.statusIcon;
            c.beginPath();
            c.arc(wifiCX, wifiCY, dotR, 0, Math.PI * 2);
            c.fill();
            c.lineCap = 'butt';

            curX -= (wifiOuterR + 7);
        }

        // Network badge (VoLTE, 5G, 4G)
        if (state.networkType && state.networkType !== 'none') {
            var netStr = state.networkType;
            setFont(c, 8, 700, '"Roboto", "Segoe UI", sans-serif');
            var netW = c.measureText(netStr).width;
            var badgeW = netW + 5;
            var badgeH = 11;
            curX -= badgeW;
            c.strokeStyle = COLORS.statusIcon;
            c.lineWidth = 0.9;
            roundRectPath(c, curX, centerY - badgeH / 2, badgeW, badgeH, 2);
            c.stroke();
            c.fillStyle = COLORS.statusIcon;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(netStr, curX + badgeW / 2, centerY + 0.5);
            curX -= 5;
        }

        // Signal bars (Dual SIM vs. Single SIM) — without 1 & 2 numbers
        function drawBarSet(endX, bars) {
            var count = 4;
            var barW = 2.4, barGap = 1.1;
            var clusterW = count * barW + (count - 1) * barGap;
            var startX = endX - clusterW;
            var baseY = centerY + 5;
            for (var b = 0; b < count; b++) {
                var bh = 2.8 + b * 2.0;
                var bx = startX + b * (barW + barGap);
                var by = baseY - bh;
                c.fillStyle = b < bars ? COLORS.statusIcon : 'rgba(0,0,0,0.22)';
                roundRectPath(c, bx, by, barW, bh, 0.7);
                c.fill();
            }
            return clusterW;
        }

        var barsCount = Math.max(0, Math.min(4, state.signal | 0));
        if (state.simMode === 'dual') {
            var w2 = drawBarSet(curX, barsCount);
            curX -= (w2 + 3);
            var w1 = drawBarSet(curX, barsCount);
            curX -= (w1 + 4);
        } else {
            var wSingle = drawBarSet(curX, barsCount);
            curX -= (wSingle + 4);
        }
    }

    function drawStatusBar(c, y) {
        if (state.deviceOS === 'android') {
            drawAndroidStatusBar(c, y);
        } else {
            drawIosStatusBar(c, y);
        }
    }

    // ---------- Navigation header (photo style) ----------
    function drawHeader(c, y) {
        // Background fill (covers the area above the hairline)
        c.fillStyle = COLORS.bg;
        c.fillRect(0, y, W, HEADER_H);

        // Bottom hairline (1px @ logical scale)
        c.fillStyle = COLORS.hairline;
        c.fillRect(0, y + HEADER_H - 0.5, W, 0.5);

        // Back chevron on the left, vertically centered with the avatar
        c.strokeStyle = COLORS.chevron;
        c.lineWidth = 2.4;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        var chvY = y + 26;
        c.beginPath();
        c.moveTo(22, chvY - 7);
        c.lineTo(14, chvY);
        c.lineTo(22, chvY + 7);
        c.stroke();

        // FaceTime camera icon on the right
        var camCX = W - 28;
        var camCY = chvY;
        c.strokeStyle = COLORS.chevron;
        c.lineWidth = 1.8;
        // Body (rounded rect)
        c.beginPath();
        roundRectPath(c, camCX - 11, camCY - 7, 18, 14, 4);
        c.stroke();
        // Lens triangle on the right
        c.beginPath();
        c.moveTo(camCX + 8, camCY - 4);
        c.lineTo(camCX + 14, camCY - 7);
        c.lineTo(camCX + 14, camCY + 7);
        c.lineTo(camCX + 8, camCY + 4);
        c.closePath();
        c.stroke();

        // Avatar circle, centered horizontally
        var avSize = 50;
        var avX = (W - avSize) / 2;
        var avY = y + 6;

        if (state.contactAvatar && state.contactAvatar.complete && state.contactAvatar.naturalWidth > 0) {
            c.save();
            c.beginPath();
            c.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
            c.clip();

            // Cover crop
            var aImg = state.contactAvatar;
            var nw = aImg.naturalWidth || aImg.width;
            var nh = aImg.naturalHeight || aImg.height;
            var scale = Math.max(avSize / nw, avSize / nh);
            var sw = nw * scale;
            var sh = nh * scale;
            var sx = avX + (avSize - sw) / 2;
            var sy = avY + (avSize - sh) / 2;
            c.drawImage(aImg, sx, sy, sw, sh);
            c.restore();

            // Subtle border around photo
            c.save();
            c.strokeStyle = 'rgba(0,0,0,0.08)';
            c.lineWidth = 1;
            c.beginPath();
            c.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
            c.stroke();
            c.restore();
        } else {
            var palette = COLORS.avatarPalette[paletteIndex(state.contactName)];
            // Subtle gradient for depth
            var grad = c.createLinearGradient(avX, avY, avX, avY + avSize);
            grad.addColorStop(0, palette);
            grad.addColorStop(1, shade(palette, -0.18));
            c.fillStyle = grad;
            c.beginPath();
            c.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
            c.fill();

            // Initials inside avatar
            setFont(c, 19, 600, FONT_DISPLAY);
            c.fillStyle = '#fff';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(initialsFromName(state.contactName), avX + avSize / 2, avY + avSize / 2 + 1);
        }

        // Contact name + tiny chevron, below the avatar.
        // Render name and chevron as one centered group so spacing is exact.
        setFont(c, 11, 500);
        c.fillStyle = COLORS.nameText;
        var name = String(state.contactName || '').slice(0, 30);
        var nameY = avY + avSize + 12;
        var nameW = c.measureText(name).width;
        var chevSpacing = 5;
        var chevW = 5;
        var groupW = nameW + chevSpacing + chevW;
        var nameStartX = (W - groupW) / 2;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(name, nameStartX, nameY);
        // Chevron: a clean ›, drawn as two strokes
        var chevX = nameStartX + nameW + chevSpacing;
        c.strokeStyle = 'rgba(60,60,67,0.55)';
        c.lineWidth = 1.4;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.beginPath();
        c.moveTo(chevX,          nameY - 3.5);
        c.lineTo(chevX + chevW,  nameY);
        c.lineTo(chevX,          nameY + 3.5);
        c.stroke();
    }

    function shade(hex, pct) {
        var n = hex.replace('#', '');
        var r = parseInt(n.substring(0, 2), 16);
        var g = parseInt(n.substring(2, 4), 16);
        var b = parseInt(n.substring(4, 6), 16);
        var t = pct < 0 ? 0 : 255;
        var p = Math.abs(pct);
        r = Math.round((t - r) * p) + r;
        g = Math.round((t - g) * p) + g;
        b = Math.round((t - b) * p) + b;
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function drawTimeSeparator(c, y, label) {
        var H = 32;
        setFont(c, 11, 600);
        c.fillStyle = COLORS.timeSep;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(String(label || '').toUpperCase(), W / 2, y + H / 2);
        return H;
    }

    function bubbleColors(side) {
        if (side === 'in') {
            return { bg: COLORS.incoming, fg: COLORS.incomingText };
        }
        if (state.service === 'SMS') {
            return { bg: COLORS.sms, fg: COLORS.smsText };
        }
        return { bg: COLORS.iMessage, fg: COLORS.iMessageText };
    }

    function measureBubble(c, text) {
        var maxBubbleW = Math.round(W * 0.74);
        var padX = 13, padY = 8;
        setFont(c, 16.5, 400);
        var lines = wrapLines(c, text, maxBubbleW - padX * 2);
        var lineH = 21;
        var widest = 0;
        for (var i = 0; i < lines.length; i++) {
            var ww = c.measureText(lines[i]).width;
            if (ww > widest) widest = ww;
        }
        var bubbleW = Math.min(maxBubbleW, Math.max(40, Math.ceil(widest) + padX * 2));
        var bubbleH = lines.length * lineH + padY * 2;
        return { lines: lines, padX: padX, padY: padY, lineH: lineH, w: bubbleW, h: bubbleH };
    }

    function drawBubble(c, y, m, side, isLastInStack) {
        var sideMargin = 11;
        var x = side === 'in' ? sideMargin : W - sideMargin - m.w;
        var col = bubbleColors(side);
        c.fillStyle = col.bg;
        bubblePath(c, x, y, m.w, m.h, side, isLastInStack);
        c.fill();

        setFont(c, 16.5, 400);
        c.fillStyle = col.fg;
        c.textAlign = 'left';
        c.textBaseline = 'top';
        var ty = y + m.padY + 2;
        for (var i = 0; i < m.lines.length; i++) {
            c.fillText(m.lines[i], x + m.padX, ty + i * m.lineH);
        }
    }

    function drawTypingBubble(c, y) {
        var bw = 64, bh = 36;
        var x = 11;
        c.fillStyle = COLORS.incoming;
        bubblePath(c, x, y, bw, bh, 'in', true);
        c.fill();
        var cy = y + bh / 2;
        var dotXs = [x + 18, x + 32, x + 46];
        for (var i = 0; i < 3; i++) {
            c.beginPath();
            c.fillStyle = 'rgba(60,60,67,0.5)';
            c.arc(dotXs[i], cy, 3.6, 0, Math.PI * 2);
            c.fill();
        }
        return bh;
    }

    function drawReceipt(c, y, label) {
        setFont(c, 10.5, 500);
        c.fillStyle = COLORS.receiptText;
        c.textAlign = 'right';
        c.textBaseline = 'top';
        c.fillText(String(label || ''), W - 14, y);
        return 14;
    }

    // ---------- Input bar + home indicator ----------
    function drawInputBar(c, y) {
        // No top hairline: in iOS 17+ Messages the input bar shares the
        // chat-area background and only renders a separator when scroll
        // content actually peeks under it (material/blur effect).
        c.fillStyle = COLORS.inputBarBg;
        c.fillRect(0, y, W, INPUT_H);

        // Vertical center for icons that align with the input pill
        var fieldH = 36;
        var fieldY = y + (INPUT_H - fieldH) / 2;
        var midY = fieldY + fieldH / 2;

        // Plus circle on the left
        var plusCX = 26;
        c.fillStyle = '#EFEFEF';
        c.beginPath();
        c.arc(plusCX, midY, 14, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(60,60,67,0.85)';
        c.lineWidth = 1.6;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(plusCX - 5.5, midY);
        c.lineTo(plusCX + 5.5, midY);
        c.moveTo(plusCX,       midY - 5.5);
        c.lineTo(plusCX,       midY + 5.5);
        c.stroke();

        // Input pill (subtle hairline only, no thick border)
        var fieldX = plusCX + 18;
        var fieldW = W - fieldX - 16;
        c.fillStyle = COLORS.inputFieldBg;
        roundRectPath(c, fieldX, fieldY, fieldW, fieldH, fieldH / 2);
        c.fill();
        c.strokeStyle = 'rgba(60,60,67,0.18)';
        c.lineWidth = 0.5;
        c.stroke();

        // Placeholder text
        setFont(c, 15, 400);
        c.fillStyle = COLORS.inputPlaceholder;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(state.service === 'SMS' ? 'Text Message' : 'iMessage', fieldX + 14, midY);

        // Microphone glyph (right side of the pill)
        // Body: small rounded rectangle. Stand: a U-shape under it.
        var micCX = fieldX + fieldW - 16;
        var micCY = midY;
        c.strokeStyle = 'rgba(60,60,67,0.7)';
        c.lineWidth = 1.4;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.fillStyle = 'rgba(60,60,67,0.7)';
        // Mic body (filled pill, ~5x9)
        roundRectPath(c, micCX - 2.5, micCY - 7, 5, 9, 2.5);
        c.fill();
        // Stand U
        c.beginPath();
        c.arc(micCX, micCY, 5.5, 0, Math.PI, false);
        c.stroke();
        // Stem to base
        c.beginPath();
        c.moveTo(micCX, micCY + 5.5);
        c.lineTo(micCX, micCY + 8);
        c.stroke();
        // Base bar
        c.beginPath();
        c.moveTo(micCX - 3, micCY + 8);
        c.lineTo(micCX + 3, micCY + 8);
        c.stroke();
    }

    function drawHomeIndicator(c, y) {
        // Bottom safe area band — black pill centered.
        c.fillStyle = COLORS.homeIndicator;
        var barW = 134, barH = 5;
        roundRectPath(c, (W - barW) / 2, y + HOME_H - barH - 8, barW, barH, barH / 2);
        c.fill();
    }

    // ---------- Layout pass ----------
    // Returns three block arrays:
    //   topBlocks    — status bar + header (always pinned to top)
    //   middleBlocks — chat thread (anchored to BOTTOM of available space)
    //   bottomBlocks — input bar + home indicator (always pinned to bottom)
    function buildBlocks() {
        var topBlocks = [];
        topBlocks.push({ h: STATUS_H, draw: function (yy) { drawStatusBar(ctx, yy); } });
        topBlocks.push({ h: HEADER_H, draw: function (yy) { drawHeader(ctx, yy); } });

        var middleBlocks = [];
        // Top breathing room before the first message
        middleBlocks.push({ h: 14, draw: function () {} });

        // Pre-measure messages and mark "last in stack" so only those get tails.
        var measured = [];
        for (var i = 0; i < state.messages.length; i++) {
            measured.push({ raw: state.messages[i], m: measureBubble(ctx, state.messages[i].text) });
        }
        for (var k = 0; k < measured.length; k++) {
            var cur = measured[k].raw;
            var nxt = measured[k + 1] ? measured[k + 1].raw : null;
            var stackEnds = !nxt || nxt.side !== cur.side || (nxt.timestamp && nxt.timestamp.trim());
            measured[k].lastInStack = !!stackEnds;
        }

        // Find the index of the last outgoing message — the read receipt
        // attaches DIRECTLY below it, not at the bottom of the thread, so
        // an incoming message after the receipt still shows below it.
        var lastOutIndex = -1;
        for (var n = state.messages.length - 1; n >= 0; n--) {
            if (state.messages[n].side === 'out') { lastOutIndex = n; break; }
        }
        var wantReceipt = state.showReadReceipt && state.readReceiptText.trim() && lastOutIndex !== -1;

        var prevSide = null;
        for (var j = 0; j < measured.length; j++) {
            var entry = measured[j];

            if (entry.raw.timestamp && entry.raw.timestamp.trim()) {
                middleBlocks.push({ h: 18, draw: function () {} });
                (function (label) {
                    middleBlocks.push({ h: 32, draw: function (yy) { drawTimeSeparator(ctx, yy, label); } });
                })(entry.raw.timestamp.trim());
                middleBlocks.push({ h: 6, draw: function () {} });
                prevSide = null;
            }

            var gap = (prevSide === entry.raw.side) ? 3 : (prevSide === null ? 0 : 9);
            if (gap > 0) middleBlocks.push({ h: gap, draw: function () {} });

            (function (msgEntry) {
                middleBlocks.push({
                    h: msgEntry.m.h,
                    draw: function (yy) {
                        drawBubble(ctx, yy, msgEntry.m, msgEntry.raw.side, msgEntry.lastInStack);
                    }
                });
            })(entry);

            // Anchor the read receipt to the last outgoing message specifically.
            if (wantReceipt && j === lastOutIndex) {
                middleBlocks.push({ h: 4, draw: function () {} });
                (function (label) {
                    middleBlocks.push({ h: 14, draw: function (yy) { drawReceipt(ctx, yy, label); } });
                })(state.readReceiptText.trim());
            }

            prevSide = entry.raw.side;
        }

        if (state.showTyping) {
            middleBlocks.push({ h: 10, draw: function () {} });
            middleBlocks.push({ h: 36, draw: function (yy) { drawTypingBubble(ctx, yy); } });
        }

        // Bottom breathing room above the input bar
        middleBlocks.push({ h: 14, draw: function () {} });

        var bottomBlocks = [];
        bottomBlocks.push({ h: INPUT_H, draw: function (yy) { drawInputBar(ctx, yy); } });
        bottomBlocks.push({ h: HOME_H, draw: function (yy) { drawHomeIndicator(ctx, yy); } });

        return { top: topBlocks, middle: middleBlocks, bottom: bottomBlocks };
    }

    function sumHeights(blocks) {
        var s = 0;
        for (var i = 0; i < blocks.length; i++) s += blocks[i].h;
        return s;
    }

    function drawBlocks(blocks, startY) {
        var y = startY;
        for (var i = 0; i < blocks.length; i++) {
            blocks[i].draw(y);
            y += blocks[i].h;
        }
    }

    function render() {
        var groups = buildBlocks();
        var topH    = sumHeights(groups.top);
        var middleH = sumHeights(groups.middle);
        var bottomH = sumHeights(groups.bottom);
        var contentH = topH + middleH + bottomH;
        // Lock to iPhone 15 screen height (852 pt). Real screenshots always
        // capture the full screen — short threads simply have empty space
        // above the conversation, anchored to the input bar.
        var totalH = Math.max(contentH, SCREEN_H);
        // When the thread is short, push the messages down so the newest sits
        // just above the input bar (real iOS behavior).
        var topGap = totalH - contentH;

        canvas.width = W * DPR;
        canvas.height = totalH * DPR;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, totalH);

        drawBlocks(groups.top, 0);
        drawBlocks(groups.middle, topH + topGap);
        drawBlocks(groups.bottom, topH + topGap + middleH);
    }

    // ---------- Controls ----------
    var els = {
        contactName:        document.getElementById('imsgContactName'),
        avatarInput:        document.getElementById('imsgAvatarInput'),
        uploadAvatarBtn:    document.getElementById('imsgUploadAvatarBtn'),
        cropAvatarBtn:      document.getElementById('imsgCropAvatarBtn'),
        removeAvatarBtn:    document.getElementById('imsgRemoveAvatarBtn'),
        avatarThumbWrap:    document.getElementById('imsgAvatarThumbWrap'),
        avatarThumb:        document.getElementById('imsgAvatarThumb'),
        avatarInitials:     document.getElementById('imsgAvatarInitials'),
        avatarImg:          document.getElementById('imsgAvatarImg'),
        avatarHint:         document.getElementById('imsgAvatarHint'),
        cropperModal:       document.getElementById('imsgCropperModal'),
        cropCloseBtn:       document.getElementById('imsgCropCloseBtn'),
        cropCancelBtn:      document.getElementById('imsgCropCancelBtn'),
        cropApplyBtn:       document.getElementById('imsgCropApplyBtn'),
        cropCanvas:         document.getElementById('imsgCropCanvas'),
        cropZoom:           document.getElementById('imsgCropZoom'),
        cropZoomIn:         document.getElementById('imsgCropZoomIn'),
        cropZoomOut:        document.getElementById('imsgCropZoomOut'),
        cropRotateBtn:      document.getElementById('imsgCropRotateBtn'),
        cropResetBtn:       document.getElementById('imsgCropResetBtn'),
        cropViewport:       document.getElementById('imsgCropViewport'),
        service:            document.getElementById('imsgService'),
        statusTime:         document.getElementById('imsgStatusTime'),
        battery:            document.getElementById('imsgBattery'),
        batteryVal:         document.getElementById('imsgBatteryVal'),
        signal:             document.getElementById('imsgSignal'),
        signalVal:          document.getElementById('imsgSignalVal'),
        wifi:               document.getElementById('imsgWifi'),
        osIos:              document.getElementById('imsgOsIos'),
        osAndroid:          document.getElementById('imsgOsAndroid'),
        androidPanel:       document.getElementById('imsgAndroidPanel'),
        networkType:        document.getElementById('imsgNetworkType'),
        simMode:            document.getElementById('imsgSimMode'),
        showPercent:        document.getElementById('imsgShowPercent'),
        showCameraHole:     document.getElementById('imsgShowCameraHole'),
        showNotifIcons:     document.getElementById('imsgShowNotifIcons'),
        showTyping:         document.getElementById('imsgShowTyping'),
        showReceipt:        document.getElementById('imsgShowReceipt'),
        receiptText:        document.getElementById('imsgReceiptText'),
        addMessage:         document.getElementById('imsgAddMessage'),
        messageList:        document.getElementById('imsgMessageList'),
        downloadPng:        document.getElementById('imsgDownloadPng'),
        reset:              document.getElementById('imsgReset')
    };

    function buildMessageRow(msg, index, total) {
        var row = document.createElement('div');
        row.className = 'imsg-message';
        row.setAttribute('data-id', msg.id);

        var head = document.createElement('div');
        head.className = 'imsg-message-head';

        var sideToggle = document.createElement('div');
        sideToggle.className = 'imsg-side-toggle';
        sideToggle.setAttribute('role', 'group');
        sideToggle.setAttribute('aria-label', 'Message sender side');

        var btnIn  = document.createElement('button');
        btnIn.type = 'button';
        btnIn.textContent = 'Them';
        if (msg.side === 'in') btnIn.classList.add('is-active');
        btnIn.addEventListener('click', function () {
            if (msg.side !== 'in') { msg.side = 'in'; renderAll(); }
        });

        var btnOut = document.createElement('button');
        btnOut.type = 'button';
        btnOut.textContent = 'You';
        if (msg.side === 'out') btnOut.classList.add('is-active');
        btnOut.addEventListener('click', function () {
            if (msg.side !== 'out') { msg.side = 'out'; renderAll(); }
        });

        sideToggle.appendChild(btnIn);
        sideToggle.appendChild(btnOut);
        head.appendChild(sideToggle);

        var spacer = document.createElement('div');
        spacer.className = 'imsg-message-spacer';
        head.appendChild(spacer);

        function iconBtn(label, svgInner, onClick, danger) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'imsg-icon-btn' + (danger ? ' imsg-icon-btn--danger' : '');
            btn.setAttribute('aria-label', label);
            btn.title = label;
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + svgInner + '</svg>';
            btn.addEventListener('click', onClick);
            return btn;
        }

        var upBtn = iconBtn('Move up', '<polyline points="18 15 12 9 6 15"/>', function () {
            if (index > 0) {
                var arr = state.messages;
                var tmp = arr[index - 1]; arr[index - 1] = arr[index]; arr[index] = tmp;
                renderAll();
            }
        });
        if (index === 0) upBtn.disabled = true;
        head.appendChild(upBtn);

        var downBtn = iconBtn('Move down', '<polyline points="6 9 12 15 18 9"/>', function () {
            if (index < total - 1) {
                var arr = state.messages;
                var tmp = arr[index + 1]; arr[index + 1] = arr[index]; arr[index] = tmp;
                renderAll();
            }
        });
        if (index === total - 1) downBtn.disabled = true;
        head.appendChild(downBtn);

        var delBtn = iconBtn('Delete message',
            '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
            function () {
                state.messages = state.messages.filter(function (x) { return x.id !== msg.id; });
                renderAll();
            }, true);
        if (state.messages.length <= 1) delBtn.disabled = true;
        head.appendChild(delBtn);

        row.appendChild(head);

        var text = document.createElement('textarea');
        text.className = 'imsg-message-text';
        text.rows = 2;
        text.value = msg.text;
        text.placeholder = 'Message text...';
        text.maxLength = 800;
        text.addEventListener('input', function () { msg.text = text.value; render(); });
        row.appendChild(text);

        var meta = document.createElement('div');
        meta.className = 'imsg-message-meta';
        var ts = document.createElement('input');
        ts.type = 'text';
        ts.className = 'imsg-message-timestamp';
        ts.value = msg.timestamp || '';
        ts.placeholder = 'Optional timestamp above this message (e.g. Today 9:42 AM)';
        ts.maxLength = 60;
        ts.addEventListener('input', function () { msg.timestamp = ts.value; render(); });
        meta.appendChild(ts);
        row.appendChild(meta);

        return row;
    }

    function renderMessageList() {
        var list = els.messageList;
        list.innerHTML = '';
        var total = state.messages.length;
        for (var i = 0; i < total; i++) {
            list.appendChild(buildMessageRow(state.messages[i], i, total));
        }
    }

    function renderAll() {
        renderMessageList();
        render();
    }

    var rawSourceImage = null;

    // ---------- Interactive Modern Avatar Cropper Engine ----------
    var cropper = {
        img: null,
        zoom: 1,
        minZoom: 1,
        maxZoom: 4,
        panX: 0,
        panY: 0,
        rotation: 0,
        cropRadius: 120, // 240px diameter circle on 340x340 canvas
        isDragging: false,
        lastX: 0,
        lastY: 0
    };

    var touchState = {
        isPinching: false,
        startDist: 0,
        startZoom: 1
    };

    var cropCtx = els.cropCanvas ? els.cropCanvas.getContext('2d') : null;

    function getRotatedDimensions() {
        var rot = ((cropper.rotation % 360) + 360) % 360;
        var isSwapped = (rot === 90 || rot === 270);
        var imgW = cropper.img ? (cropper.img.naturalWidth || cropper.img.width || 300) : 300;
        var imgH = cropper.img ? (cropper.img.naturalHeight || cropper.img.height || 300) : 300;
        return {
            w: isSwapped ? imgH : imgW,
            h: isSwapped ? imgW : imgH,
            rawW: imgW,
            rawH: imgH
        };
    }

    // Modern constraint: photo must ALWAYS cover the crop circle
    function calculateMinZoom() {
        if (!cropper.img) return 1;
        var dims = getRotatedDimensions();
        var targetDiameter = cropper.cropRadius * 2; // 240px
        return Math.max(targetDiameter / dims.w, targetDiameter / dims.h);
    }

    // Modern boundary lock: photo edges cannot be dragged inside the crop circle
    function clampPan() {
        if (!cropper.img) return;
        var dims = getRotatedDimensions();
        var curW = dims.w * cropper.zoom;
        var curH = dims.h * cropper.zoom;
        var maxPanX = Math.max(0, (curW / 2) - cropper.cropRadius);
        var maxPanY = Math.max(0, (curH / 2) - cropper.cropRadius);

        if (cropper.panX > maxPanX) cropper.panX = maxPanX;
        if (cropper.panX < -maxPanX) cropper.panX = -maxPanX;
        if (cropper.panY > maxPanY) cropper.panY = maxPanY;
        if (cropper.panY < -maxPanY) cropper.panY = -maxPanY;
    }

    function syncZoomSlider() {
        if (!els.cropZoom) return;
        els.cropZoom.min = cropper.minZoom.toFixed(4);
        els.cropZoom.max = (cropper.minZoom * 4.5).toFixed(4);
        els.cropZoom.step = ((cropper.minZoom * 3.5) / 100).toFixed(4);
        els.cropZoom.value = cropper.zoom.toFixed(4);
    }

    function openCropModal(imageObj) {
        if (!els.cropperModal || !els.cropCanvas || !imageObj) return;
        cropper.img = imageObj;
        cropper.panX = 0;
        cropper.panY = 0;
        cropper.rotation = 0;
        cropper.isDragging = false;
        touchState.isPinching = false;

        var minZ = calculateMinZoom();
        cropper.minZoom = minZ;
        cropper.maxZoom = minZ * 4.5;
        cropper.zoom = minZ;

        syncZoomSlider();
        clampPan();

        els.cropperModal.style.display = 'flex';
        els.cropperModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        drawCropCanvas();
    }

    function closeCropModal() {
        if (!els.cropperModal) return;
        els.cropperModal.style.display = 'none';
        els.cropperModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function drawCropCanvas() {
        if (!cropCtx || !els.cropCanvas || !cropper.img) return;
        var cvs = els.cropCanvas;
        var w = cvs.width;
        var h = cvs.height;
        var radius = cropper.cropRadius;

        cropCtx.clearRect(0, 0, w, h);

        // 1. Draw translated, rotated and zoomed image
        cropCtx.save();
        cropCtx.imageSmoothingEnabled = true;
        cropCtx.imageSmoothingQuality = 'high';
        cropCtx.translate(w / 2 + cropper.panX, h / 2 + cropper.panY);
        cropCtx.rotate((cropper.rotation * Math.PI) / 180);
        cropCtx.scale(cropper.zoom, cropper.zoom);
        var imgW = cropper.img.naturalWidth || cropper.img.width;
        var imgH = cropper.img.naturalHeight || cropper.img.height;
        cropCtx.drawImage(cropper.img, -imgW / 2, -imgH / 2);
        cropCtx.restore();

        // 2. Dark circular overlay mask (frosted scrim)
        cropCtx.save();
        cropCtx.fillStyle = 'rgba(11, 15, 25, 0.72)';
        cropCtx.beginPath();
        cropCtx.rect(0, 0, w, h);
        cropCtx.arc(w / 2, h / 2, radius, 0, Math.PI * 2, true);
        cropCtx.fill();

        // 3. Crisp white circle boundary with shadow
        cropCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        cropCtx.shadowBlur = 8;
        cropCtx.strokeStyle = '#ffffff';
        cropCtx.lineWidth = 2.5;
        cropCtx.beginPath();
        cropCtx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
        cropCtx.stroke();
        cropCtx.shadowBlur = 0;

        // 4. Rule-of-thirds grid lines inside circle
        cropCtx.save();
        cropCtx.beginPath();
        cropCtx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
        cropCtx.clip();
        cropCtx.strokeStyle = (cropper.isDragging || touchState.isPinching) ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.22)';
        cropCtx.lineWidth = 1;
        var step = (radius * 2) / 3;
        var startX = w / 2 - radius;
        var startY = h / 2 - radius;
        cropCtx.beginPath();
        cropCtx.moveTo(startX + step, startY);
        cropCtx.lineTo(startX + step, startY + radius * 2);
        cropCtx.moveTo(startX + step * 2, startY);
        cropCtx.lineTo(startX + step * 2, startY + radius * 2);
        cropCtx.moveTo(startX, startY + step);
        cropCtx.lineTo(startX + radius * 2, startY + step);
        cropCtx.moveTo(startX, startY + step * 2);
        cropCtx.lineTo(startX + radius * 2, startY + step * 2);
        cropCtx.stroke();
        cropCtx.restore();

        cropCtx.restore();
    }

    // Touch & Mouse Dragging / Panning & Multi-touch Pinch to Zoom
    if (els.cropViewport && els.cropCanvas) {
        function getPointerPos(e) {
            var clientX = e.clientX;
            var clientY = e.clientY;
            if (e.touches && e.touches.length) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            }
            return { x: clientX, y: clientY };
        }

        function onDragStart(e) {
            if (e.touches && e.touches.length === 2) {
                cropper.isDragging = false;
                touchState.isPinching = true;
                touchState.startDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                touchState.startZoom = cropper.zoom;
                e.preventDefault();
                return;
            }
            cropper.isDragging = true;
            touchState.isPinching = false;
            var pos = getPointerPos(e);
            cropper.lastX = pos.x;
            cropper.lastY = pos.y;
            if (e.type === 'touchstart') e.preventDefault();
            drawCropCanvas();
        }

        function onDragMove(e) {
            if (e.touches && e.touches.length === 2 && touchState.isPinching) {
                e.preventDefault();
                var curDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                if (touchState.startDist > 0) {
                    var factor = curDist / touchState.startDist;
                    cropper.zoom = Math.max(cropper.minZoom, Math.min(cropper.maxZoom, touchState.startZoom * factor));
                    syncZoomSlider();
                    clampPan();
                    drawCropCanvas();
                }
                return;
            }

            if (!cropper.isDragging) return;
            if (e.type === 'touchmove') e.preventDefault();
            var pos = getPointerPos(e);
            var dx = pos.x - cropper.lastX;
            var dy = pos.y - cropper.lastY;
            cropper.lastX = pos.x;
            cropper.lastY = pos.y;

            var rect = els.cropCanvas.getBoundingClientRect();
            var scaleRatio = els.cropCanvas.width / (rect.width || 340);
            cropper.panX += dx * scaleRatio;
            cropper.panY += dy * scaleRatio;

            clampPan();
            drawCropCanvas();
        }

        function onDragEnd(e) {
            if (e.touches && e.touches.length === 1) {
                // Switched from pinch to single finger
                touchState.isPinching = false;
                cropper.isDragging = true;
                cropper.lastX = e.touches[0].clientX;
                cropper.lastY = e.touches[0].clientY;
                return;
            }
            cropper.isDragging = false;
            touchState.isPinching = false;
            drawCropCanvas();
        }

        els.cropViewport.addEventListener('mousedown', onDragStart);
        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('mouseup', onDragEnd);

        els.cropViewport.addEventListener('touchstart', onDragStart, { passive: false });
        window.addEventListener('touchmove', onDragMove, { passive: false });
        window.addEventListener('touchend', onDragEnd);
        window.addEventListener('touchcancel', onDragEnd);

        // Smooth Mouse wheel zoom with clamp
        els.cropViewport.addEventListener('wheel', function (e) {
            e.preventDefault();
            var step = (cropper.maxZoom - cropper.minZoom) * 0.05;
            var newZ = cropper.zoom + (e.deltaY < 0 ? step : -step);
            cropper.zoom = Math.max(cropper.minZoom, Math.min(cropper.maxZoom, newZ));
            syncZoomSlider();
            clampPan();
            drawCropCanvas();
        }, { passive: false });
    }

    if (els.cropZoom) {
        els.cropZoom.addEventListener('input', function () {
            var val = parseFloat(els.cropZoom.value);
            cropper.zoom = Math.max(cropper.minZoom, Math.min(cropper.maxZoom, val));
            clampPan();
            drawCropCanvas();
        });
    }

    if (els.cropZoomIn) {
        els.cropZoomIn.addEventListener('click', function () {
            var step = (cropper.maxZoom - cropper.minZoom) * 0.12;
            cropper.zoom = Math.min(cropper.maxZoom, cropper.zoom + step);
            syncZoomSlider();
            clampPan();
            drawCropCanvas();
        });
    }

    if (els.cropZoomOut) {
        els.cropZoomOut.addEventListener('click', function () {
            var step = (cropper.maxZoom - cropper.minZoom) * 0.12;
            cropper.zoom = Math.max(cropper.minZoom, cropper.zoom - step);
            syncZoomSlider();
            clampPan();
            drawCropCanvas();
        });
    }

    if (els.cropRotateBtn) {
        els.cropRotateBtn.addEventListener('click', function () {
            cropper.rotation = (cropper.rotation + 90) % 360;
            var minZ = calculateMinZoom();
            cropper.minZoom = minZ;
            cropper.maxZoom = minZ * 4.5;
            if (cropper.zoom < minZ) {
                cropper.zoom = minZ;
            }
            syncZoomSlider();
            clampPan();
            drawCropCanvas();
        });
    }

    if (els.cropResetBtn) {
        els.cropResetBtn.addEventListener('click', function () {
            cropper.panX = 0;
            cropper.panY = 0;
            cropper.rotation = 0;
            var minZ = calculateMinZoom();
            cropper.minZoom = minZ;
            cropper.maxZoom = minZ * 4.5;
            cropper.zoom = minZ;
            syncZoomSlider();
            clampPan();
            drawCropCanvas();
        });
    }

    if (els.cropCloseBtn) els.cropCloseBtn.addEventListener('click', closeCropModal);
    if (els.cropCancelBtn) els.cropCancelBtn.addEventListener('click', closeCropModal);

    // Apply crop button
    if (els.cropApplyBtn) {
        els.cropApplyBtn.addEventListener('click', function () {
            if (!cropper.img) return;
            var outSize = 480; // High-res avatar output
            var outCanvas = document.createElement('canvas');
            outCanvas.width = outSize;
            outCanvas.height = outSize;
            var outCtx = outCanvas.getContext('2d');
            outCtx.imageSmoothingEnabled = true;
            outCtx.imageSmoothingQuality = 'high';

            var scaleFactor = outSize / (cropper.cropRadius * 2);

            outCtx.save();
            outCtx.translate(outSize / 2, outSize / 2);
            outCtx.scale(scaleFactor, scaleFactor);
            outCtx.translate(cropper.panX, cropper.panY);
            outCtx.rotate((cropper.rotation * Math.PI) / 180);
            outCtx.scale(cropper.zoom, cropper.zoom);

            var imgW = cropper.img.naturalWidth || cropper.img.width;
            var imgH = cropper.img.naturalHeight || cropper.img.height;
            outCtx.drawImage(cropper.img, -imgW / 2, -imgH / 2);
            outCtx.restore();

            var croppedDataUrl = outCanvas.toDataURL('image/png');
            var croppedImg = new Image();
            croppedImg.onload = function () {
                state.contactAvatar = croppedImg;
                updateAvatarUI();
                render();
                closeCropModal();
            };
            croppedImg.src = croppedDataUrl;
        });
    }

    function updateAvatarUI() {
        if (!els.avatarThumb) return;
        if (state.contactAvatar && state.contactAvatar.src) {
            if (els.avatarImg) {
                els.avatarImg.src = state.contactAvatar.src;
                els.avatarImg.style.display = 'block';
            }
            if (els.avatarInitials) els.avatarInitials.style.display = 'none';
            if (els.avatarThumb) els.avatarThumb.style.background = 'transparent';
            if (els.cropAvatarBtn) els.cropAvatarBtn.style.display = 'inline-flex';
            if (els.removeAvatarBtn) els.removeAvatarBtn.style.display = 'inline-flex';
            if (els.avatarHint) els.avatarHint.textContent = 'Custom photo';
        } else {
            if (els.avatarImg) {
                els.avatarImg.style.display = 'none';
                els.avatarImg.src = '';
            }
            var palette = COLORS.avatarPalette[paletteIndex(state.contactName)];
            if (els.avatarThumb) {
                els.avatarThumb.style.background = 'linear-gradient(135deg, ' + palette + ' 0%, ' + shade(palette, -0.18) + ' 100%)';
            }
            if (els.avatarInitials) {
                els.avatarInitials.style.display = 'block';
                els.avatarInitials.textContent = initialsFromName(state.contactName);
            }
            if (els.cropAvatarBtn) els.cropAvatarBtn.style.display = 'none';
            if (els.removeAvatarBtn) els.removeAvatarBtn.style.display = 'none';
            if (els.avatarHint) els.avatarHint.textContent = 'Auto initials';
        }
    }

    if (els.uploadAvatarBtn && els.avatarInput) {
        els.uploadAvatarBtn.addEventListener('click', function () {
            els.avatarInput.click();
        });
    }
    if (els.cropAvatarBtn) {
        els.cropAvatarBtn.addEventListener('click', function () {
            if (rawSourceImage) {
                openCropModal(rawSourceImage);
            } else if (state.contactAvatar) {
                openCropModal(state.contactAvatar);
            }
        });
    }
    if (els.avatarThumbWrap && els.avatarInput) {
        els.avatarThumbWrap.addEventListener('click', function () {
            els.avatarInput.click();
        });
        els.avatarThumbWrap.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                els.avatarInput.click();
            }
        });
    }
    if (els.avatarInput) {
        els.avatarInput.addEventListener('change', function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (evt) {
                var img = new Image();
                img.onload = function () {
                    rawSourceImage = img;
                    openCropModal(img);
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
    if (els.removeAvatarBtn) {
        els.removeAvatarBtn.addEventListener('click', function () {
            state.contactAvatar = null;
            rawSourceImage = null;
            if (els.avatarInput) els.avatarInput.value = '';
            updateAvatarUI();
            render();
        });
    }

    // Also allow clicking directly on the avatar in the preview canvas
    canvas.addEventListener('click', function (e) {
        var rect = canvas.getBoundingClientRect();
        var clientX = e.clientX - rect.left;
        var clientY = e.clientY - rect.top;
        var scaleX = W / rect.width;
        var ptX = clientX * scaleX;
        var ptY = clientY * scaleX;
        // Avatar bounds: X in [(W-50)/2, (W+50)/2], Y in [STATUS_H + 6, STATUS_H + 56]
        var avSize = 50;
        var avX = (W - avSize) / 2;
        var avY = STATUS_H + 6;
        if (ptX >= avX && ptX <= avX + avSize && ptY >= avY && ptY <= avY + avSize) {
            if (rawSourceImage) {
                openCropModal(rawSourceImage);
            } else if (els.avatarInput) {
                els.avatarInput.click();
            }
        }
    });

    els.contactName.addEventListener('input', function () { 
        state.contactName = els.contactName.value; 
        updateAvatarUI();
        render(); 
    });
    els.service.addEventListener('change', function () { state.service = els.service.value; render(); });
    els.statusTime.addEventListener('input', function () { state.statusTime = els.statusTime.value; render(); });
    els.battery.addEventListener('input', function () {
        state.battery = parseInt(els.battery.value, 10);
        els.batteryVal.textContent = state.battery;
        render();
    });
    els.signal.addEventListener('input', function () {
        state.signal = parseInt(els.signal.value, 10);
        els.signalVal.textContent = state.signal;
        render();
    });
    els.wifi.addEventListener('change', function () { state.wifi = els.wifi.checked; render(); });
    els.showTyping.addEventListener('change', function () { state.showTyping = els.showTyping.checked; render(); });
    els.showReceipt.addEventListener('change', function () { state.showReadReceipt = els.showReceipt.checked; render(); });
    els.receiptText.addEventListener('input', function () { state.readReceiptText = els.receiptText.value; render(); });

    // Device OS Toggle & Android Options
    function setDeviceOS(os) {
        state.deviceOS = os;
        if (els.osIos) els.osIos.classList.toggle('is-active', os === 'ios');
        if (els.osAndroid) els.osAndroid.classList.toggle('is-active', os === 'android');
        if (els.androidPanel) {
            els.androidPanel.style.display = (os === 'android') ? 'block' : 'none';
        }
        render();
    }

    if (els.osIos) {
        els.osIos.addEventListener('click', function () { setDeviceOS('ios'); });
    }
    if (els.osAndroid) {
        els.osAndroid.addEventListener('click', function () { setDeviceOS('android'); });
    }
    if (els.networkType) {
        els.networkType.addEventListener('change', function () {
            state.networkType = els.networkType.value;
            render();
        });
    }
    if (els.simMode) {
        els.simMode.addEventListener('change', function () {
            state.simMode = els.simMode.value;
            render();
        });
    }
    if (els.showPercent) {
        els.showPercent.addEventListener('change', function () {
            state.showPercent = els.showPercent.checked;
            render();
        });
    }
    if (els.showCameraHole) {
        els.showCameraHole.addEventListener('change', function () {
            state.showCameraHole = els.showCameraHole.checked;
            render();
        });
    }
    if (els.showNotifIcons) {
        els.showNotifIcons.addEventListener('change', function () {
            state.showNotifIcons = els.showNotifIcons.checked;
            render();
        });
    }

    els.addMessage.addEventListener('click', function () {
        var lastSide = state.messages.length ? state.messages[state.messages.length - 1].side : 'in';
        var nextSide = lastSide === 'in' ? 'out' : 'in';
        state.messages.push({ id: nextId++, side: nextSide, text: '', timestamp: '' });
        renderAll();
        var rows = els.messageList.querySelectorAll('.imsg-message-text');
        if (rows.length) rows[rows.length - 1].focus();
    });

    els.reset.addEventListener('click', function () {
        if (!confirm('Clear all messages and reset settings to defaults?')) return;
        state.contactName = 'Mimora';
        state.contactAvatar = null;
        rawSourceImage = null;
        if (els.avatarInput) els.avatarInput.value = '';
        state.service = 'iMessage';
        state.statusTime = '9:41';
        state.battery = 100;
        state.signal = 4;
        state.wifi = true;
        state.showTyping = false;
        state.showReadReceipt = true;
        state.readReceiptText = 'Read 9:42 AM';
        state.deviceOS = 'ios';
        state.networkType = 'VoLTE';
        state.simMode = 'dual';
        state.showPercent = true;
        state.showCameraHole = true;
        state.showNotifIcons = true;
        if (els.networkType) els.networkType.value = state.networkType;
        if (els.simMode) els.simMode.value = state.simMode;
        if (els.showPercent) els.showPercent.checked = state.showPercent;
        if (els.showCameraHole) els.showCameraHole.checked = state.showCameraHole;
        if (els.showNotifIcons) els.showNotifIcons.checked = state.showNotifIcons;
        setDeviceOS('ios');
        state.messages = [
            { id: nextId++, side: 'in',  text: 'Hey, are you free tonight?', timestamp: 'Today 9:38 AM' },
            { id: nextId++, side: 'out', text: 'Yeah! What time?',           timestamp: '' },
            { id: nextId++, side: 'in',  text: 'Around 8? I made reservations at that ramen place.', timestamp: '' }
        ];
        els.contactName.value = state.contactName;
        els.service.value = state.service;
        els.statusTime.value = state.statusTime;
        els.battery.value = state.battery;
        els.batteryVal.textContent = state.battery;
        els.signal.value = state.signal;
        els.signalVal.textContent = state.signal;
        els.wifi.checked = state.wifi;
        els.showTyping.checked = state.showTyping;
        els.showReceipt.checked = state.showReadReceipt;
        els.receiptText.value = state.readReceiptText;
        updateAvatarUI();
        renderAll();
    });

    els.downloadPng.addEventListener('click', function () {
        render();
        try {
            var url = canvas.toDataURL('image/png');
            var a = document.createElement('a');
            var slug = (state.contactName || 'message').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'message';
            a.href = url;
            a.download = 'fake-message-' + slug + '.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            alert('Could not export PNG: ' + e.message);
        }
    });

    updateAvatarUI();
    renderAll();
})();
