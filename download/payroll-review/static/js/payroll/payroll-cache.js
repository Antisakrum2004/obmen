/* ═══════════════════════════════════════════════════════════════
   payroll-cache.js — Smart Cache Layer
   v1.0.0 — Layered cache with TTL + stale-while-revalidate

   API:
     PayrollCache.get(key)            — valid entry or null
     PayrollCache.set(key, data, ttl) — store with TTL (ms)
     PayrollCache.getStale(key)       — expired entry for SWR
     PayrollCache.invalidate(key)     — remove key or prefix
     PayrollCache.clearExpired()      — purge all expired
     PayrollCache.has(key)            — check valid entry
     PayrollCache.keys()              — list all keys
     PayrollCache.stats()             — hit/miss/size metrics

   Cacheable:
     elapsed, tasks, normalized model, projections, dev cards, projects

   NOT cacheable:
     review statuses, manual edits, workflow transitions

   Storage: localStorage (in-memory mirror for speed)
   ═══════════════════════════════════════════════════════════════ */

var PayrollCache = (function() {

  /* ─── Configuration ─── */
  var DEFAULT_TTL = 5 * 60 * 1000; /* 5 minutes */
  var PREFIX = 'prc_';
  var MAX_ENTRIES = 50;

  /* ─── In-memory mirror for speed ─── */
  var _memory = {};

  /* ─── Stats ─── */
  var _stats = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    sets: 0,
    invalidations: 0,
    evictions: 0
  };

  /* ─── Internal helpers ─── */

  function _lsKey(key) {
    return PREFIX + key;
  }

  function _now() {
    return Date.now();
  }

  function _isExpired(entry) {
    if (!entry || !entry.exp) return true;
    return _now() > entry.exp;
  }

  function _entryFromRaw(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch(e) {
      return null;
    }
  }

  function _entryToRaw(data, ttl) {
    return JSON.stringify({
      d: data,
      exp: _now() + (ttl || DEFAULT_TTL),
      ts: _now()
    });
  }

  /* ─── Eviction: LRU-like based on timestamp ─── */
  function _evictIfNeeded() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          keys.push(k);
        }
      }
    } catch(e) { return; }

    if (keys.length < MAX_ENTRIES) return;

    /* Sort by timestamp ascending (oldest first) */
    var entries = [];
    keys.forEach(function(k) {
      try {
        var raw = localStorage.getItem(k);
        var entry = _entryFromRaw(raw);
        if (entry) {
          entries.push({ key: k, ts: entry.ts || 0 });
        }
      } catch(e) {}
    });

    entries.sort(function(a, b) { return a.ts - b.ts; });

    /* Remove oldest 25% */
    var toRemove = Math.ceil(entries.length * 0.25);
    for (var j = 0; j < toRemove && j < entries.length; j++) {
      try {
        localStorage.removeItem(entries[j].key);
        delete _memory[entries[j].key.replace(PREFIX, '')];
        _stats.evictions++;
      } catch(e) {}
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  return {

    /**
     * Get a valid (non-expired) cache entry
     * @param {String} key
     * @returns {*} data or null
     */
    get: function(key) {
      /* Check memory first */
      if (_memory[key] !== undefined) {
        var memEntry = _memory[key];
        if (!_isExpired(memEntry)) {
          _stats.hits++;
          return memEntry.d;
        }
        /* Expired in memory — remove */
        delete _memory[key];
      }

      /* Check localStorage */
      try {
        var raw = localStorage.getItem(_lsKey(key));
        if (!raw) {
          _stats.misses++;
          return null;
        }
        var entry = _entryFromRaw(raw);
        if (!entry) {
          _stats.misses++;
          return null;
        }
        if (_isExpired(entry)) {
          /* Expired — leave in LS for stale-while-revalidate */
          _stats.misses++;
          return null;
        }
        /* Cache hit — promote to memory */
        _memory[key] = entry;
        _stats.hits++;
        return entry.d;
      } catch(e) {
        _stats.misses++;
        return null;
      }
    },

    /**
     * Get stale (expired) cache entry for stale-while-revalidate
     * Returns data even if TTL expired, as long as entry exists
     * @param {String} key
     * @returns {*} data or null
     */
    getStale: function(key) {
      /* Check memory first */
      if (_memory[key] !== undefined) {
        _stats.staleHits++;
        return _memory[key].d;
      }

      /* Check localStorage */
      try {
        var raw = localStorage.getItem(_lsKey(key));
        if (!raw) return null;
        var entry = _entryFromRaw(raw);
        if (!entry) return null;
        _stats.staleHits++;
        return entry.d;
      } catch(e) {
        return null;
      }
    },

    /**
     * Store data in cache with TTL
     * @param {String} key
     * @param {*} data — must be JSON-serializable
     * @param {Number} ttl — time-to-live in milliseconds (default 5 min)
     */
    set: function(key, data, ttl) {
      var entry = {
        d: data,
        exp: _now() + (ttl || DEFAULT_TTL),
        ts: _now()
      };

      /* Store in memory */
      _memory[key] = entry;
      _stats.sets++;

      /* Store in localStorage */
      try {
        _evictIfNeeded();
        localStorage.setItem(_lsKey(key), _entryToRaw(data, ttl));
      } catch(e) {
        /* localStorage full — try clearing expired */
        this.clearExpired();
        try {
          localStorage.setItem(_lsKey(key), _entryToRaw(data, ttl));
        } catch(e2) {
          /* Still can't write — silently fail */
        }
      }
    },

    /**
     * Check if a valid (non-expired) entry exists
     * @param {String} key
     * @returns {Boolean}
     */
    has: function(key) {
      return this.get(key) !== null;
    },

    /**
     * Invalidate a cache entry or all entries matching a prefix
     * @param {String} key — exact key or prefix (if ends with '*')
     */
    invalidate: function(key) {
      _stats.invalidations++;

      if (key.charAt(key.length - 1) === '*') {
        /* Prefix invalidation */
        var prefix = key.slice(0, -1);
        /* Memory */
        Object.keys(_memory).forEach(function(k) {
          if (k.indexOf(prefix) === 0) delete _memory[k];
        });
        /* localStorage */
        try {
          var toRemove = [];
          for (var i = 0; i < localStorage.length; i++) {
            var lk = localStorage.key(i);
            if (lk && lk.indexOf(_lsKey(prefix)) === 0) {
              toRemove.push(lk);
            }
          }
          toRemove.forEach(function(k) { localStorage.removeItem(k); });
        } catch(e) {}
      } else {
        /* Exact key */
        delete _memory[key];
        try { localStorage.removeItem(_lsKey(key)); } catch(e) {}
      }
    },

    /**
     * Clear all expired entries
     * @returns {Number} count of entries removed
     */
    clearExpired: function() {
      var removed = 0;
      var now = _now();

      /* Memory */
      Object.keys(_memory).forEach(function(k) {
        if (_isExpired(_memory[k])) {
          delete _memory[k];
          removed++;
        }
      });

      /* localStorage */
      try {
        var toRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
          var lk = localStorage.key(i);
          if (lk && lk.indexOf(PREFIX) === 0) {
            try {
              var raw = localStorage.getItem(lk);
              var entry = _entryFromRaw(raw);
              if (!entry || now > entry.exp) {
                toRemove.push(lk);
              }
            } catch(e) {
              toRemove.push(lk);
            }
          }
        }
        toRemove.forEach(function(k) {
          localStorage.removeItem(k);
          removed++;
        });
      } catch(e) {}

      return removed;
    },

    /**
     * List all cache keys
     * @returns {Array}
     */
    keys: function() {
      var result = [];
      Object.keys(_memory).forEach(function(k) { result.push(k); });
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var lk = localStorage.key(i);
          if (lk && lk.indexOf(PREFIX) === 0) {
            var k = lk.replace(PREFIX, '');
            if (result.indexOf(k) < 0) result.push(k);
          }
        }
      } catch(e) {}
      return result;
    },

    /**
     * Get cache statistics
     * @returns {Object}
     */
    stats: function() {
      return {
        hits: _stats.hits,
        misses: _stats.misses,
        staleHits: _stats.staleHits,
        sets: _stats.sets,
        invalidations: _stats.invalidations,
        evictions: _stats.evictions,
        memoryKeys: Object.keys(_memory).length,
        hitRate: _stats.hits + _stats.misses > 0
          ? Math.round(_stats.hits / (_stats.hits + _stats.misses) * 100) + '%'
          : '0%'
      };
    },

    /**
     * Reset statistics
     */
    resetStats: function() {
      _stats = { hits: 0, misses: 0, staleHits: 0, sets: 0, invalidations: 0, evictions: 0 };
    },

    /**
     * Clear all cache entries
     */
    clear: function() {
      _memory = {};
      try {
        var toRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
          var lk = localStorage.key(i);
          if (lk && lk.indexOf(PREFIX) === 0) toRemove.push(lk);
        }
        toRemove.forEach(function(k) { localStorage.removeItem(k); });
      } catch(e) {}
    }
  };
})();
