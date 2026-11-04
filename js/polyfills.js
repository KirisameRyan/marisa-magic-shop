/* Small polyfills for older browsers: Array.at / findLast / findLastIndex, String.at, Object.hasOwn. */
(function () {
  'use strict';
  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
      value: function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return n < 0 || n >= this.length ? undefined : this[n]; },
      writable: true, configurable: true
    });
  }
  if (!String.prototype.at) {
    Object.defineProperty(String.prototype, 'at', {
      value: function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return n < 0 || n >= this.length ? undefined : this[n]; },
      writable: true, configurable: true
    });
  }
  if (!Array.prototype.findLast) {
    Object.defineProperty(Array.prototype, 'findLast', {
      value: function (cb, thisArg) {
        for (var i = this.length - 1; i >= 0; i--) { if (cb.call(thisArg, this[i], i, this)) return this[i]; }
        return undefined;
      },
      writable: true, configurable: true
    });
  }
  if (!Array.prototype.findLastIndex) {
    Object.defineProperty(Array.prototype, 'findLastIndex', {
      value: function (cb, thisArg) {
        for (var i = this.length - 1; i >= 0; i--) { if (cb.call(thisArg, this[i], i, this)) return i; }
        return -1;
      },
      writable: true, configurable: true
    });
  }
  if (!Object.hasOwn) {
    Object.hasOwn = function (obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); };
  }
})();
