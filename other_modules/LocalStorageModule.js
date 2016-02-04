/**
 * An Angular module that gives you access to the browsers local storage
 * @version v0.2.2 - 2015-05-29
 * @link https://github.com/grevory/angular-local-storage
 * @author grevory
 * @license MIT License, http://www.opensource.org/licenses/MIT
 */
(function (window, angular, undefined) {
    /*jshint globalstrict:true*/
    'use strict';

    var isDefined = angular.isDefined,
        isUndefined = angular.isUndefined,
        isNumber = angular.isNumber,
        isObject = angular.isObject,
        isArray = angular.isArray,
        extend = angular.extend,
        toJson = angular.toJson;
    var angularLocalStorage = angular.module('LocalStorageModule', []);

    angularLocalStorage.provider('localStorageService', function () {

        // You should set a prefix to avoid overwriting any local storage variables from the rest of your app
        // e.g. localStorageServiceProvider.setPrefix('yourAppName');
        // With provider you can use config as this:
        // myApp.config(function (localStorageServiceProvider) {
        //    localStorageServiceProvider.prefix = 'yourAppName';
        // });
        this.prefix = 'ls';

        // You could change web storage type localstorage or sessionStorage
        this.storageType = 'localStorage';

        // Cookie options (usually in case of fallback)
        // expiry = Number of days before cookies expire // 0 = Does not expire
        // path = The web path the cookie represents
        this.cookie = {
            expiry: 30,
            path: '/'
        };

        // Send signals for each of the following actions?
        this.notify = {
            setItem: true,
            removeItem: false
        };

        // Setter for the prefix
        this.setPrefix = function (prefix) {
            this.prefix = prefix;
            return this;
        };

        // Setter for the storageType
        this.setStorageType = function (storageType) {
            this.storageType = storageType;
            return this;
        };

        // Setter for cookie config
        this.setStorageCookie = function (exp, path) {
            this.cookie.expiry = exp;
            this.cookie.path = path;
            return this;
        };

        // Setter for cookie domain
        this.setStorageCookieDomain = function (domain) {
            this.cookie.domain = domain;
            return this;
        };

        // Setter for notification config
        // itemSet & itemRemove should be booleans
        this.setNotify = function (itemSet, itemRemove) {
            this.notify = {
                setItem: itemSet,
                removeItem: itemRemove
            };
            return this;
        };

        this.$get = ['$rootScope', '$window', '$document', '$parse', function ($rootScope, $window, $document, $parse) {
            var self = this;
            var prefix = self.prefix;
            var cookie = self.cookie;
            var notify = self.notify;
            var storageType = self.storageType;
            var webStorage;

            // When Angular's $document is not available
            if (!$document) {
                $document = document;
            } else if ($document[0]) {
                $document = $document[0];
            }

            // If there is a prefix set in the config lets use that with an appended period for readability
            if (prefix.substr(-1) !== '.') {
                prefix = !!prefix ? prefix + '.' : '';
            }
            var deriveQualifiedKey = function (key) {
                return prefix + key;
            };
            // Checks the browser to see if local storage is supported
            var browserSupportsLocalStorage = (function () {
                try {
                    var supported = (storageType in $window && $window[storageType] !== null);

                    // When Safari (OS X or iOS) is in private browsing mode, it appears as though localStorage
                    // is available, but trying to call .setItem throws an exception.
                    //
                    // "QUOTA_EXCEEDED_ERR: DOM Exception 22: An attempt was made to add something to storage
                    // that exceeded the quota."
                    var key = deriveQualifiedKey('__' + Math.round(Math.random() * 1e7));
                    if (supported) {
                        webStorage = $window[storageType];
                        webStorage.setItem(key, '');
                        webStorage.removeItem(key);
                    }

                    return supported;
                } catch (e) {
                    storageType = 'cookie';
                    $rootScope.$broadcast('LocalStorageModule.notification.error', e.message);
                    return false;
                }
            }());

            // Directly adds a value to local storage
            // If local storage is not available in the browser use cookies
            // Example use: localStorageService.add('library','angular');
            var addToLocalStorage = function (key, value) {
                // Let's convert undefined values to null to get the value consistent
                if (isUndefined(value)) {
                    value = null;
                } else {
                    value = toJson(value);
                }

                // If this browser does not support local storage use cookies
                if (!browserSupportsLocalStorage || self.storageType === 'cookie') {
                    if (!browserSupportsLocalStorage) {
                        $rootScope.$broadcast('LocalStorageModule.notification.warning', 'LOCAL_STORAGE_NOT_SUPPORTED');
                    }

                    if (notify.setItem) {
                        $rootScope.$broadcast('LocalStorageModule.notification.setitem', {
                            key: key,
                            newvalue: value,
                            storageType: 'cookie'
                        });
                    }
                    return addToCookies(key, value);
                }

                try {
                    if (webStorage) {
                        webStorage.setItem(deriveQualifiedKey(key), value)
                    }
                    ;
                    if (notify.setItem) {
                        $rootScope.$broadcast('LocalStorageModule.notification.setitem', {
                            key: key,
                            newvalue: value,
                            storageType: self.storageType
                        });
                    }
                } catch (e) {
                    $rootScope.$broadcast('LocalStorageModule.notification.error', e.message);
                    return addToCookies(key, value);
                }
                return true;
            };

            // Directly get a value from local storage
            // Example use: localStorageService.get('library'); // returns 'angular'
            var getFromLocalStorage = function (key) {

                if (!browserSupportsLocalStorage || self.storageType === 'cookie') {
                    if (!browserSupportsLocalStorage) {
                        $rootScope.$broadcast('LocalStorageModule.notification.warning', 'LOCAL_STORAGE_NOT_SUPPORTED');
                    }

                    return getFromCookies(key);
                }

                var item = webStorage ? webStorage.getItem(deriveQualifiedKey(key)) : null;
                // angular.toJson will convert null to 'null', so a proper conversion is needed
                // FIXME not a perfect solution, since a valid 'null' string can't be stored
                if (!item || item === 'null') {
                    return null;
                }

                try {
                    return JSON.parse(item);
                } catch (e) {
                    return item;
                }
            };

            // Remove an item from local storage
            // Example use: localStorageService.remove('library'); // removes the key/value pair of library='angular'
            var removeFromLocalStorage = function () {
                var i, key;
                for (i = 0; i < arguments.length; i++) {
                    key = arguments[i];
                    if (!browserSupportsLocalStorage || self.storageType === 'cookie') {
                        if (!browserSupportsLocalStorage) {
                            $rootScope.$broadcast('LocalStorageModule.notification.warning', 'LOCAL_STORAGE_NOT_SUPPORTED');
                        }

                        if (notify.removeItem) {
                            $rootScope.$broadcast('LocalStorageModule.notification.removeitem', {
                                key: key,
                                storageType: 'cookie'
                            });
                        }
                        removeFromCookies(key);
                    }
                    else {
                        try {
                            webStorage.removeItem(deriveQualifiedKey(key));
                            if (notify.removeItem) {
                                $rootScope.$broadcast('LocalStorageModule.notification.removeitem', {
                                    key: key,
                                    storageType: self.storageType
                                });
                            }
                        } catch (e) {
                            $rootScope.$broadcast('LocalStorageModule.notification.error', e.message);
                            removeFromCookies(key);
                        }
                    }
                }
            };
})(window, window.angular);
