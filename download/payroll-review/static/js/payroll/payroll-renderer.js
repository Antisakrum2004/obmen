/* ═══════════════════════════════════════════════════════════════
   payroll-renderer.js — Render Module (v5.2.0)
   Extracted rendering functions from tab-payroll-review.js.
   All functions remain globally accessible for backward compatibility.
   ═══════════════════════════════════════════════════════════════ */

window.PayrollRenderer = (function() {

  /* ═══════════════════════════════════════════════════════════════
     NOTE: All rendering functions remain as global functions.
     They are referenced here for module exposure only.
     The actual implementations stay in tab-payroll-review.js
     because they depend on the _pr state object directly.
     
     This module provides a namespace for future refactoring
     and exposes references for the debug panel.
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Collect card DOM references after rendering
   * Called after innerHTML is set in _prRenderAll
   */
  function collectCardRefs() {
    if (typeof _pr === 'undefined') return;
    _pr.cardRefs = _pr.cardRefs || {};
    if (!_pr.projection || !_pr.projection.length) return;
    _pr.projection.forEach(function(dev) {
      var el = document.getElementById('pr-card-' + dev.developerId);
      if (el) {
        _pr.cardRefs[dev.developerId] = el;
      }
    });
  }

  /**
   * Render a single card partially using cached reference
   * @param {String} devId
   */
  function renderCardPartial(devId) {
    if (typeof _pr === 'undefined' || !_pr.container) return;
    var cardEl = null;

    /* Use cached reference first, fallback to getElementById */
    if (_pr.cardRefs && _pr.cardRefs[devId]) {
      cardEl = _pr.cardRefs[devId];
      /* Verify the element is still in the DOM */
      if (!document.contains(cardEl)) {
        cardEl = document.getElementById('pr-card-' + devId);
        _pr.cardRefs[devId] = cardEl;
      }
    } else {
      cardEl = document.getElementById('pr-card-' + devId);
    }

    if (!cardEl) {
      if (typeof _prScheduleRender === 'function') _prScheduleRender();
      return;
    }

    /* Find matching projection */
    var dev = null;
    if (typeof PayrollStore !== 'undefined' && PayrollStore.getDeveloperProjection) {
      dev = PayrollStore.getDeveloperProjection(devId);
    }
    if (!dev && _pr.projection) {
      _pr.projection.forEach(function(d) {
        if (String(d.developerId) === String(devId)) dev = d;
      });
    }
    if (!dev) return;

    var tmp = document.createElement('div');
    tmp.innerHTML = _prRenderOneDevCard(dev);
    var newCard = tmp.firstChild;
    if (newCard && cardEl.parentNode) {
      cardEl.parentNode.replaceChild(newCard, cardEl);
      _pr.cardRefs[devId] = newCard;
    }

    /* Track partial rerenders */
    if (_pr._perf) {
      _pr._perf.partialRerenders = (_pr._perf.partialRerenders || 0) + 1;
    }
  }

  /**
   * Toggle accordion section for a card (CSS-based, no full rerender)
   * @param {String} devId
   */
  function toggleAccordion(devId) {
    if (typeof _pr === 'undefined') return;
    var cardEl = (_pr.cardRefs && _pr.cardRefs[devId]) || document.getElementById('pr-card-' + devId);
    if (!cardEl) return;

    var expanded = cardEl.querySelector('.pr-card-expanded');
    var expandBtn = cardEl.querySelector('.pr-card-expand');
    if (!expanded || !expandBtn) return;

    var isOpen = expanded.classList.contains('open');
    if (isOpen) {
      expanded.classList.remove('open');
      expandBtn.classList.remove('open');
      expandBtn.innerHTML = '<span class="pr-card-expand-icon">&#9660;</span> Задачи (' + (_pr.projection ? _pr.projection.find(function(d) { return String(d.developerId) === String(devId); }) || {} : {}).taskCount + ')';
      delete _pr.expandedCards[devId];
    } else {
      expanded.classList.add('open');
      expandBtn.classList.add('open');
      expandBtn.innerHTML = '<span class="pr-card-expand-icon">&#9660;</span> Свернуть';
      _pr.expandedCards[devId] = true;

      /* Lazy-render timeline if not already present */
      var timelineContainer = expanded.querySelector('.pr-timeline');
      if (!timelineContainer && typeof _prRenderTimeline === 'function') {
        var timelineHTML = _prRenderTimeline(devId);
        expanded.innerHTML = timelineHTML;
      }
    }
  }

  return {
    collectCardRefs: collectCardRefs,
    renderCardPartial: renderCardPartial,
    toggleAccordion: toggleAccordion
  };
})();

/* Also expose as global functions for backward compatibility */
if (typeof _prCollectCardRefs === 'undefined') {
  window._prCollectCardRefs = function() {
    if (typeof PayrollRenderer !== 'undefined') PayrollRenderer.collectCardRefs();
  };
}
