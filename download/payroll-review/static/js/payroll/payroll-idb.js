/* ═══════════════════════════════════════════════════════════════
   payroll-idb.js — IndexedDB Storage Layer (v5.2.0)
   Provides larger storage capacity than localStorage.
   Used for: cache, snapshots, audit, timelines.
   ═══════════════════════════════════════════════════════════════ */

window.PayrollIDB = (function() {
  var DB_NAME = 'payroll_review';
  var DB_VERSION = 1;
  var STORES = {
    cache: 'cache',
    snapshots: 'snapshots',
    audit: 'audit',
    timelines: 'timelines'
  };

  var _db = null;
  var _idbSupported = typeof indexedDB !== 'undefined';

  /**
   * Open (or create) the database
   * @returns {Promise<IDBDatabase>}
   */
  function open() {
    if (!_idbSupported) return Promise.reject(new Error('IndexedDB not supported'));
    if (_db) return Promise.resolve(_db);

    return new Promise(function(resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.cache)) {
          db.createObjectStore(STORES.cache, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.snapshots)) {
          db.createObjectStore(STORES.snapshots, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.audit)) {
          db.createObjectStore(STORES.audit, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.timelines)) {
          db.createObjectStore(STORES.timelines, { keyPath: 'key' });
        }
      };

      request.onsuccess = function(e) {
        _db = e.target.result;
        resolve(_db);
      };

      request.onerror = function(e) {
        console.warn('PayrollIDB: open failed', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /**
   * Save data to a store
   * @param {String} storeName
   * @param {String} key
   * @param {*} data
   * @returns {Promise<void>}
   */
  function save(storeName, key, data) {
    if (!_idbSupported) return Promise.resolve();
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        try {
          var tx = db.transaction(storeName, 'readwrite');
          var store = tx.objectStore(storeName);
          store.put({
            key: key,
            data: data,
            savedAt: Date.now()
          });
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function(e) {
            console.warn('PayrollIDB: save failed', storeName, key, e.target.error);
            resolve(); /* don't reject — fire and forget */
          };
        } catch(e) {
          console.warn('PayrollIDB: save exception', storeName, key, e);
          resolve();
        }
      });
    }).catch(function() { /* IDB not available — silent */ });
  }

  /**
   * Load data from a store
   * @param {String} storeName
   * @param {String} key
   * @returns {Promise<data|null>}
   */
  function load(storeName, key) {
    if (!_idbSupported) return Promise.resolve(null);
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        try {
          var tx = db.transaction(storeName, 'readonly');
          var store = tx.objectStore(storeName);
          var request = store.get(key);
          request.onsuccess = function() {
            var result = request.result;
            resolve(result ? result.data : null);
          };
          request.onerror = function(e) {
            console.warn('PayrollIDB: load failed', storeName, key, e.target.error);
            resolve(null);
          };
        } catch(e) {
          console.warn('PayrollIDB: load exception', storeName, key, e);
          resolve(null);
        }
      });
    }).catch(function() { return null; });
  }

  /**
   * Remove an entry from a store
   * @param {String} storeName
   * @param {String} key
   * @returns {Promise<void>}
   */
  function remove(storeName, key) {
    if (!_idbSupported) return Promise.resolve();
    return open().then(function(db) {
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction(storeName, 'readwrite');
          var store = tx.objectStore(storeName);
          store.delete(key);
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function() { resolve(); };
        } catch(e) { resolve(); }
      });
    }).catch(function() {});
  }

  /**
   * Clear all entries in a store
   * @param {String} storeName
   * @returns {Promise<void>}
   */
  function clear(storeName) {
    if (!_idbSupported) return Promise.resolve();
    return open().then(function(db) {
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction(storeName, 'readwrite');
          var store = tx.objectStore(storeName);
          store.clear();
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function() { resolve(); };
        } catch(e) { resolve(); }
      });
    }).catch(function() {});
  }

  /**
   * Get all keys in a store
   * @param {String} storeName
   * @returns {Promise<string[]>}
   */
  function getAllKeys(storeName) {
    if (!_idbSupported) return Promise.resolve([]);
    return open().then(function(db) {
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction(storeName, 'readonly');
          var store = tx.objectStore(storeName);
          var request = store.getAllKeys();
          request.onsuccess = function() {
            resolve(request.result || []);
          };
          request.onerror = function() { resolve([]); };
        } catch(e) { resolve([]); }
      });
    }).catch(function() { return []; });
  }

  /**
   * Get approximate size of a store in bytes
   * @param {String} storeName
   * @returns {Promise<number>}
   */
  function getSize(storeName) {
    if (!_idbSupported) return Promise.resolve(0);
    return open().then(function(db) {
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction(storeName, 'readonly');
          var store = tx.objectStore(storeName);
          var request = store.getAll();
          request.onsuccess = function() {
            var items = request.result || [];
            var size = 0;
            items.forEach(function(item) {
              size += JSON.stringify(item).length * 2; /* UTF-16 approx */
            });
            resolve(size);
          };
          request.onerror = function() { resolve(0); };
        } catch(e) { resolve(0); }
      });
    }).catch(function() { return 0; });
  }

  /**
   * Check if IDB is supported
   * @returns {Boolean}
   */
  function isSupported() {
    return _idbSupported;
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */
  return {
    STORES: STORES,
    open: open,
    save: save,
    load: load,
    remove: remove,
    clear: clear,
    getAllKeys: getAllKeys,
    getSize: getSize,
    isSupported: isSupported
  };
})();
