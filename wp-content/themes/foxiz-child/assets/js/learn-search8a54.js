/**
 * Learn page live tutorial search.
 * Index comes from the #learn-search-index JSON blob printed by the template.
 * Pure enhancement: every tutorial is also reachable through the grid/pagination.
 */
(function () {
	'use strict';

	var input = document.getElementById('learnSearchInput');
	var drop = document.getElementById('learnSearchDrop');
	var indexEl = document.getElementById('learn-search-index');
	if (!input || !drop || !indexEl) {
		return;
	}

	var items = [];
	try {
		items = JSON.parse(indexEl.textContent) || [];
	} catch (e) {
		return;
	}

	var active = -1;
	var results = [];

	function close() {
		drop.hidden = true;
		drop.innerHTML = '';
		active = -1;
		results = [];
	}

	function render(list) {
		drop.innerHTML = '';
		if (!list.length) {
			var none = document.createElement('span');
			none.className = 'none';
			none.textContent = 'No matching tutorials.';
			drop.appendChild(none);
		}
		list.forEach(function (item) {
			var a = document.createElement('a');
			a.href = item.u;
			a.textContent = item.t;
			drop.appendChild(a);
		});
		drop.hidden = false;
	}

	function update() {
		var q = input.value.trim().toLowerCase();
		active = -1;
		if (q.length < 2) {
			close();
			return;
		}
		var words = q.split(/\s+/);
		results = items.filter(function (item) {
			var hay = item.t.toLowerCase();
			return words.every(function (w) {
				return hay.indexOf(w) !== -1;
			});
		}).slice(0, 8);
		render(results);
	}

	function highlight() {
		var links = drop.querySelectorAll('a');
		links.forEach(function (a, i) {
			a.classList.toggle('is-active', i === active);
		});
		if (links[active]) {
			links[active].scrollIntoView({ block: 'nearest' });
		}
	}

	input.addEventListener('input', update);
	input.addEventListener('focus', update);

	input.addEventListener('keydown', function (e) {
		if (drop.hidden) {
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(active + 1, results.length - 1);
			highlight();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(active - 1, 0);
			highlight();
		} else if (e.key === 'Enter') {
			if (active >= 0 && results[active]) {
				e.preventDefault();
				window.location.href = results[active].u;
			}
		} else if (e.key === 'Escape') {
			close();
			input.blur();
		}
	});

	document.addEventListener('keydown', function (e) {
		if (e.key === '/' && document.activeElement !== input
			&& !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
			e.preventDefault();
			input.focus();
		}
	});

	document.addEventListener('click', function (e) {
		if (!e.target.closest('#learnSearch')) {
			close();
		}
	});
})();
