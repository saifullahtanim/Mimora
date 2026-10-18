/**
 * Fake Virus Scan.
 *
 * Runs a fake full-system scan inside the shared prank overlay: a progress bar
 * driven by the chosen speed, a rotating file path, files-scanned and
 * threats-detected counters, and a list of invented detections. At 100% the
 * screen flips to the "found" phase — red banner, optional alarm beeps, and
 * fake security-alert pop-ups that spawn more of themselves when clicked.
 *
 * Nothing is read from the machine: every path, threat name and number is
 * generated here. Fullscreen / ESC / exit-bar come from the shared
 * How7oPrank controller; the alarm is Web Audio (no asset).
 */
(function () {
	'use strict';

	var launchBtn  = document.getElementById('fvsLaunch');
	var overlay    = document.getElementById('fvsOverlay');
	var screenEl   = document.getElementById('fvsScreen');
	var barEl      = document.getElementById('fvsBar');
	var percentEl  = document.getElementById('fvsPercent');
	var elapsedEl  = document.getElementById('fvsElapsed');
	var pathEl     = document.getElementById('fvsPath');
	var filesEl    = document.getElementById('fvsFiles');
	var threatsEl  = document.getElementById('fvsThreats');
	var listEl     = document.getElementById('fvsThreatList');
	var titleEl    = document.getElementById('fvsTitle');
	var subEl      = document.getElementById('fvsSub');
	var bannerEl   = document.getElementById('fvsBannerText');
	var popupsEl   = document.getElementById('fvsPopups');

	var skinSel    = document.getElementById('fvsSkin');
	var speedSel   = document.getElementById('fvsSpeed');
	var popupsChk  = document.getElementById('fvsPopupsOn');
	var soundChk   = document.getElementById('fvsSound');

	if (!launchBtn || !overlay || !screenEl) return;

	/* ---------- Fake data ---------- */
	var DIRS = [
		'C:\\Windows\\System32\\',
		'C:\\Windows\\SysWOW64\\',
		'C:\\Windows\\Temp\\',
		'C:\\Users\\User\\AppData\\Local\\Temp\\',
		'C:\\Users\\User\\AppData\\Roaming\\',
		'C:\\Users\\User\\Downloads\\',
		'C:\\Users\\User\\Documents\\',
		'C:\\Users\\User\\Desktop\\',
		'C:\\Program Files\\Common Files\\',
		'C:\\Program Files (x86)\\',
		'C:\\ProgramData\\',
		'D:\\Backup\\'
	];

	var FILES = [
		'ntdll.dll', 'kernel32.dll', 'svchost.exe', 'winlogon.exe', 'explorer.exe',
		'setup_installer.exe', 'update_helper.dll', 'crypt32.dll', 'msvcrt.dll',
		'driver_pack.sys', 'invoice_2026.pdf.exe', 'photo_archive.html',
		'keygen.exe', 'browser_helper.dll', 'system_cache.tmp', 'runtime_x64.bin',
		'toolbar_setup.msi', 'media_codec.dll', 'backup_index.dat', 'mail_export.dat'
	];

	var THREATS = [
		'Trojan:Win32/Wacatac.B!ml',
		'Trojan:Script/Wacatac.H!ml',
		'Backdoor:Win32/Bladabindi',
		'Worm:Win32/Gamarue.I',
		'Ransom:Win32/Cryptolocker.A',
		'PUA:Win32/Presenoker',
		'TrojanSpy:MSIL/Stimilik',
		'HackTool:Win32/Keygen',
		'Exploit:HTML/IframeRef.gen',
		'Trojan:Win32/Emotet.PA',
		'Adware:Win32/Multiplug',
		'Rootkit:Win32/Necurs',
		'TrojanDownloader:O97M/Emotet',
		'Behavior:Win32/CredentialAccess'
	];

	var DURATIONS = { slow: 120000, normal: 45000, fast: 15000 };
	var MAX_POPUPS = 14;

	// Skin-specific wording — the Defender skin plays it straight, the classic
	// red alert skin is the loud scareware voice.
	var COPY = {
		defender: {
			title: 'Virus & threat protection',
			sub: 'Full scan in progress. Do not turn off your computer.',
			foundTitle: 'Threats found',
			foundSub: 'Your device is not protected. Action is required to remove {n} threats.',
			banner: '{n} threats found. Your computer is not protected.'
		},
		alert: {
			title: 'Malware scan running',
			sub: 'Do not close this window. Your system is being checked for active infections.',
			foundTitle: 'Your computer is infected!',
			foundSub: '{n} malicious files are active on this computer and must be removed immediately.',
			banner: '{n} active threats detected. Your personal data may be at risk.'
		}
	};

	// Pop-ups land on a scattered ring of zones (percent of the screen) instead
	// of pure random coordinates, so they never pile into one corner.
	// Zone coordinates are the pop-up's top-left corner, so they stop well
	// short of 100% — a pop-up placed at the right or bottom edge would be
	// cut off by the viewport.
	var ZONES = [
		[4, 8], [58, 6], [32, 14], [64, 30], [6, 36],
		[44, 44], [14, 56], [62, 54], [36, 62], [8, 22],
		[52, 20], [24, 34], [66, 10], [20, 60]
	];
	var zoneIndex = 0;

	/* ---------- State ---------- */
	var timers   = [];
	var raf      = null;
	var running  = false;
	var startAt  = 0;
	var duration = DURATIONS.normal;
	var files    = 0;
	var threats  = 0;
	var nextThreatAt = 0;
	var popupsOn = true;
	var soundOn  = false;
	var audioCtx = null;
	var copy     = COPY.defender;

	function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

	function fill(str, n) { return str.replace('{n}', n); }

	function every(fn, ms) {
		var id = setInterval(fn, ms);
		timers.push(id);
		return id;
	}

	function after(fn, ms) {
		var id = setTimeout(fn, ms);
		timers.push(id);
		return id;
	}

	function clearTimers() {
		timers.forEach(function (id) { clearInterval(id); clearTimeout(id); });
		timers = [];
		if (raf) { cancelAnimationFrame(raf); raf = null; }
	}

	/* ---------- Scan loop ---------- */
	function tickPath() {
		if (pathEl) pathEl.textContent = pick(DIRS) + pick(FILES);
		files += 3 + Math.floor(Math.random() * 24);
		if (filesEl) filesEl.textContent = files.toLocaleString();
	}

	function addThreat() {
		threats++;
		if (threatsEl) threatsEl.textContent = threats;

		if (listEl) {
			var li = document.createElement('li');
			var b = document.createElement('b');
			b.textContent = pick(THREATS);
			var span = document.createElement('span');
			span.textContent = pick(DIRS) + pick(FILES);
			li.appendChild(b);
			li.appendChild(span);
			listEl.insertBefore(li, listEl.firstChild);
			while (listEl.children.length > 8) {
				listEl.removeChild(listEl.lastChild);
			}
		}
	}

	function frame() {
		if (!running) return;

		var elapsed = Date.now() - startAt;
		var pct = Math.min(100, (elapsed / duration) * 100);

		if (barEl) barEl.style.width = pct.toFixed(1) + '%';
		if (percentEl) percentEl.textContent = Math.floor(pct) + '% complete';

		if (pct >= nextThreatAt && pct < 100) {
			addThreat();
			nextThreatAt += 8 + Math.random() * 12;
		}

		if (pct >= 100) {
			finish();
			return;
		}

		raf = requestAnimationFrame(frame);
	}

	function tickElapsed() {
		var s = Math.floor((Date.now() - startAt) / 1000);
		var m = Math.floor(s / 60);
		var ss = s % 60;
		if (elapsedEl) {
			elapsedEl.textContent = 'Time elapsed: ' + m + ':' + (ss < 10 ? '0' : '') + ss;
		}
	}

	/* ---------- Found phase ---------- */
	function finish() {
		running = false;
		clearTimers();

		if (threats < 3) {
			while (threats < 3) addThreat();
		}

		screenEl.setAttribute('data-phase', 'found');
		if (titleEl) titleEl.textContent = copy.foundTitle;
		if (subEl) subEl.textContent = fill(copy.foundSub, threats);
		if (bannerEl) bannerEl.textContent = fill(copy.banner, threats);
		if (percentEl) percentEl.textContent = '100% complete';
		if (barEl) barEl.style.width = '100%';

		if (soundOn) {
			beep();
			every(beep, 2400);
		}

		if (popupsOn) {
			var spawned = 0;
			var id = every(function () {
				spawnPopup();
				if (++spawned >= 5) clearInterval(id);
			}, 900);
			after(spawnPopup, 200);
		}
	}

	/* ---------- Fake alert pop-ups ---------- */
	function spawnPopup() {
		if (!popupsEl || popupsEl.children.length >= MAX_POPUPS) return;

		var zone = ZONES[zoneIndex % ZONES.length];
		zoneIndex++;

		var pop = document.createElement('div');
		pop.className = 'fvs-popup';
		pop.style.left = Math.max(2, Math.min(64, zone[0] + (Math.random() * 6 - 3))) + '%';
		pop.style.top = Math.max(4, Math.min(62, zone[1] + (Math.random() * 6 - 3))) + '%';

		var threat = pick(THREATS);
		var path = pick(DIRS) + pick(FILES);

		pop.innerHTML =
			'<div class="fvs-popup-bar">' +
				'<span>Security Alert</span>' +
				'<button type="button" class="fvs-popup-x" aria-label="Close alert">&times;</button>' +
			'</div>' +
			'<div class="fvs-popup-body">' +
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.5 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13.5"/><line x1="12" y1="17" x2="12" y2="17.1"/></svg>' +
				'<div><strong>' + threat + '</strong> was detected and could not be removed automatically.' +
					'<code>' + path + '</code>' +
				'</div>' +
			'</div>' +
			'<div class="fvs-popup-actions">' +
				'<button type="button" class="fvs-popup-btn">Ignore</button>' +
				'<button type="button" class="fvs-popup-btn fvs-popup-btn--primary">Remove threat</button>' +
			'</div>';

		// Every button is a dead end — the joke is that "fixing" it makes more.
		pop.addEventListener('click', function (e) {
			var btn = e.target.closest('button');
			if (!btn) return;
			var isClose = btn.classList.contains('fvs-popup-x');
			if (pop.parentNode) pop.parentNode.removeChild(pop);
			var extra = isClose ? 1 : 2;
			for (var i = 0; i < extra; i++) after(spawnPopup, 60 * i);
			if (soundOn) beep();
		});

		popupsEl.appendChild(pop);
	}

	function clearPopups() {
		if (!popupsEl) return;
		while (popupsEl.firstChild) popupsEl.removeChild(popupsEl.firstChild);
	}

	/* ---------- Alarm (Web Audio, no asset) ---------- */
	function beep() {
		if (!soundOn) return;
		try {
			audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
			if (audioCtx.state === 'suspended') audioCtx.resume();
			var t = audioCtx.currentTime;

			for (var k = 0; k < 2; k++) {
				var osc = audioCtx.createOscillator();
				var g = audioCtx.createGain();
				osc.type = 'square';
				osc.frequency.setValueAtTime(k === 0 ? 880 : 660, t + k * 0.22);
				g.gain.setValueAtTime(0.0001, t + k * 0.22);
				g.gain.linearRampToValueAtTime(0.12, t + k * 0.22 + 0.01);
				g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.22 + 0.18);
				osc.connect(g);
				g.connect(audioCtx.destination);
				osc.start(t + k * 0.22);
				osc.stop(t + k * 0.22 + 0.2);
			}
		} catch (e) { /* silent — sound is non-essential */ }
	}

	/* ---------- Reset / exit ---------- */
	function reset() {
		clearTimers();
		clearPopups();
		running = false;
		files = 0;
		threats = 0;
		nextThreatAt = 6 + Math.random() * 8;
		zoneIndex = Math.floor(Math.random() * ZONES.length);

		screenEl.setAttribute('data-phase', 'scanning');
		if (barEl) barEl.style.width = '0%';
		if (percentEl) percentEl.textContent = '0% complete';
		if (elapsedEl) elapsedEl.textContent = 'Time elapsed: 0:00';
		if (filesEl) filesEl.textContent = '0';
		if (threatsEl) threatsEl.textContent = '0';
		if (listEl) listEl.innerHTML = '';
		if (titleEl) titleEl.textContent = copy.title;
		if (subEl) subEl.textContent = copy.sub;
		if (pathEl) pathEl.textContent = 'C:\\Windows\\System32\\ntdll.dll';
	}

	function onExit() {
		clearTimers();
		clearPopups();
		running = false;
		if (audioCtx && audioCtx.state === 'running') {
			try { audioCtx.suspend(); } catch (e) { /* silent */ }
		}
	}

	/* ---------- Launch ---------- */
	launchBtn.addEventListener('click', function () {
		var skin = (skinSel && COPY[skinSel.value]) ? skinSel.value : 'defender';
		copy = COPY[skin];
		screenEl.setAttribute('data-skin', skin);

		reset();

		duration = DURATIONS[speedSel ? speedSel.value : 'normal'] || DURATIONS.normal;
		popupsOn = popupsChk ? popupsChk.checked : true;
		soundOn = soundChk ? soundChk.checked : false;

		window.How7oPrank.launch(overlay, { onExit: onExit });

		running = true;
		startAt = Date.now();
		tickPath();
		every(tickPath, 90);
		every(tickElapsed, 1000);
		raf = requestAnimationFrame(frame);
	});

})();
