/* FeedPulse's public flag endpoint supplies all_time and country counts.
 * Map geometry: Natural Earth, public domain. No external rendering library.
 * Preview hosts read statistics but never send tracking requests.
 */
(function () {
  'use strict';

  var card = document.querySelector('.visitor-map');
  if (!card || card.dataset.initialized) return;
  card.dataset.initialized = 'true';

  var siteId = card.dataset.siteId;
  var origin = 'https://feed-pulse.com';
  var stats = card.querySelector('.visitor-map__stats');
  var total = card.querySelector('[data-visitor-total]');
  var countryCount = card.querySelector('[data-visitor-countries]');
  var status = card.querySelector('[data-visitor-status]');
  var markers = card.querySelector('.visitor-map__markers');
  var svgNS = 'http://www.w3.org/2000/svg';

  function validCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function formatCount(value) {
    // Full numbers stay available to assistive technology and in the tooltip.
    if (value < 10000) return value.toLocaleString('en-US');
    return new Intl.NumberFormat('en-US', {
      notation: 'compact', maximumFractionDigits: 1
    }).format(value);
  }

  function showCount(element, value) {
    element.textContent = formatCount(value);
    element.title = value.toLocaleString('en-US');
    element.setAttribute('aria-label', element.title);
  }

  function render(data) {
    // all_time is the lifetime metric; total has a different provider scope.
    // Missing or invalid data must never be presented as zero visits.
    if (!data || data.site_id !== siteId || !validCount(data.all_time) ||
        !Array.isArray(data.countries)) throw new Error('Invalid visitor data');

    var countries = new Map();
    data.countries.forEach(function (row) {
      if (!row || !validCount(row.count)) throw new Error('Invalid country data');
      var code = String(row.country_code || '').toUpperCase();
      if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'ZZ' && row.count > 0) {
        countries.set(code, row.count);
      }
    });

    showCount(total, data.all_time);
    showCount(countryCount, countries.size);
    card.querySelectorAll('[data-country]').forEach(function (shape) {
      var count = countries.get(shape.dataset.country);
      shape.classList.toggle('has-visitors', Boolean(count));
      if (!count) return;
      shape.querySelector('title').textContent = shape.dataset.name + ': ' + count.toLocaleString('en-US') + ' visits';
      var group = document.createElementNS(svgNS, 'g');
      ['visitor-map__marker-halo', 'visitor-map__marker'].forEach(function (className, index) {
        var dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('class', className);
        dot.setAttribute('cx', shape.dataset.x);
        dot.setAttribute('cy', shape.dataset.y);
        dot.setAttribute('r', index === 0 ? '10' : '4.5');
        group.appendChild(dot);
      });
      markers.appendChild(group);
    });

    card.querySelector('#visitor-world-title').textContent =
      'Visitor countries: ' + countries.size + '. Locations are approximate country centers.';
    status.textContent = data.all_time === 0 ? 'Waiting for the first visit.' : 'Thanks for stopping by.';
    stats.setAttribute('aria-busy', 'false');
  }

  function loadStats() {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 8000);
    fetch(origin + '/api/widget/flags/' + encodeURIComponent(siteId) + '?include_bots=0', {
      signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
    }).then(function (response) {
      if (!response.ok) throw new Error('Statistics unavailable');
      return response.json();
    }).then(render).catch(function () {
      status.textContent = 'Statistics temporarily unavailable.';
      stats.setAttribute('aria-busy', 'false');
    }).finally(function () { clearTimeout(timeout); });
  }

  if (!siteId || !/^[a-f0-9-]{36}$/i.test(siteId)) {
    status.textContent = 'Statistics unavailable.';
    stats.setAttribute('aria-busy', 'false');
    return;
  }

  if (window.location.hostname.toLowerCase() !== String(card.dataset.trackingHost || '').toLowerCase()) {
    loadStats();
    return;
  }

  // One official tracking pixel per page load, followed by a read. Send only
  // the page path and host, without URL queries or referrer information.
  var pixel = new Image();
  var requested = false;
  var trackingTimeout;
  function afterTracking() {
    if (requested) return;
    requested = true;
    clearTimeout(trackingTimeout);
    loadStats();
  }
  pixel.onload = pixel.onerror = afterTracking;
  trackingTimeout = setTimeout(afterTracking, 4000);
  pixel.src = origin + '/api/track-pixel/' + encodeURIComponent(siteId) +
    '?path=' + encodeURIComponent(window.location.pathname) +
    '&host=' + encodeURIComponent(window.location.host);
})();
