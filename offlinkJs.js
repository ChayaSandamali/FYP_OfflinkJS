//import manifest.js file
if ('undefined' === typeof window) {
    importScripts('manifest.js');
}
// initializing angular module
var OfflinkJs = angular.module('OfflinkJs', ['LocalStorageModule', 'indexedDB']);
// keep prefetched resources
OfflinkJs.prefetchedResources = {};
/**
 * detects the server status by continuously pinging to the remote server
 * executes 'autoSync' when there is a connection status change
 */
OfflinkJs.factory("ConnectionDetectorService", ['flnkSynchronizer', function (flnkSynchronizer) {
    /**
     *@method conDetector: convert the inline implementation to look like an external file
     *  for the web worker implementation
     */
    var conDetector = URL.createObjectURL(new Blob(['(',
        function () {
            var conDetectURL = "";
            //event listner for communicating with the web worker
            addEventListener('message', function (e) {
                switch (e.data.msg) {
                    //starts pinging to the relavent server repeatedly 3 seconds
                    case 'REGISTER':
                        conDetectURL = e.data.url;
                        setInterval(detectConnectivity, 3000);
                        break;
                    //get connection status
                    case 'POLL':
                        return getConnectionStatus();
                        break;
                }
            }, false);
            /**
             * @method detectConnectivity: create the actual http request
             */

            function detectConnectivity() {
                var http = new XMLHttpRequest();
                http.open('HEAD', conDetectURL);
                //once the request is successfully resolved send the connection status
                http.onreadystatechange = function () {
                    if (this.readyState == this.DONE) {
                        connectionStatus = this.status;
                        self.postMessage(this.status);
                    }
                };
                //check whether the connection URL is provided
                if (conDetectURL != "") {
                    http.send();
                }
            }
        }.toString(),

        ')()'], {type: 'application/javascript'})
    );

    var callbackFunc = null;
    var connectionStatus = "";
    //initialize web worker
    var worker = new Worker(conDetector);
    URL.revokeObjectURL(conDetector);
    /**
     * @method addEventListener: eventListner for the web worker to communicate with the application
     */
    worker.addEventListener('message', function (e) {
        //invoke the call back function with the returned data
        callbackFunc(e.data);
        //check whether there is an status change from offline to online
        if (e.data === 200 && connectionStatus !== 200) {
            console.info("Connection status changed from " + connectionStatus + " to " + e.data);
            console.info("Auto Syncing started .... ");
            //sync the autoSync requests using Synchronizer service
            flnkSynchronizer.syncAuto();
        }
        //set the connection status to the returned data
        connectionStatus = e.data;
    }, false);

    return {
        /**
         * @method register: register the application to ping for the remote server
         * @param url
         * @param callback
         */
        register: function (url, callback) {
            callbackFunc = callback;
            var msg = {
                msg: "REGISTER",
                url: url
            };
            //send the message to the worker
            worker.postMessage(msg);
        },
        /**
         * @method getConnectionStatus: get connection status of the server
         * @returns {string}
         */
        getConnectionStatus: function () {
            return connectionStatus;
        }
    };

}]);

/**
 * cacheInterceptor is responsible for intercepting the http requests and cache them
 * for offline usage
 */
OfflinkJs.factory('cacheInterceptor', ['localStorageService', '$q', '$location',
    function (localStorageService, $q, $location) {
       //prefixes to identify GET and POST/PUT/DELETE requests
        var GET_CACHE = "GC";
        var WRITE_CACHE = "WC";
        return {
            /**
             * @method request: intercepts the POST requests
             * @param config
             * @returns {*}
             */
            request: function (config) {
                //check whether the cache flag is set to true
                if (config.flnk_cache) {
                    if (config.method === 'POST') {
                    }
                }
                return config;
            },
            /**
             * @method response: intercepts the GET requests and caches them
             * @param response
             * @returns {*}
             */
            response: function (response) {
                //checks whether the offlink cache is set and the method is GET
                if (response.config.flnk_cache && response.config.method === 'GET') {
                    localStorageService.set(GET_CACHE + "<>" + response.config.url, response.data);
                }
                return response;
            },
            /**
             *@method responseError:  handles 401 error responses and calls the specified
             * function or redirect to the specifed URL
             * @param rejection
             * @returns {*}
             */
            responseError: function (rejection) {
                if (rejection.status === 401) {
                    if (rejection.config.offlink_callback) {
                        rejection.config.offlink_callback(rejection);
                    } else if (rejection.config.offlink_url_401) {
                        $location.url(rejection.config.offlink_url_401);
                        return;
                    }
                }
                /**
                 * handles 403 error responses and calls the specified
                 * function or redirect to the specifed URL
                 * @param rejection
                 * @returns {*}
                 */
                if (rejection.status === 403) {
                    if (rejection.config.offlink_callback) {
                        rejection.config.offlink_callback(rejection);
                    } else if (rejection.config.url_403) {
                        $location.url(rejection.config.url_403);
                    }
                }
                /**
                 * handles -1 error responses and calls the specified
                 * function or redirect to the specifed URL
                 * @param rejection
                 * @returns {*}
                 */
                if (rejection.status === -1) {
                    if (rejection.config.offlink_callback) {
                        rejection.config.offlink_callback(rejection);
                    } else if (rejection.config.fallback_url) {
                        $location.url(rejection.config.fallback_url);
                    }
                }
                /**
                 * handles 404 error responses and calls the specified
                 * function or redirect to the specifed URL
                 * @param rejection
                 * @returns {*}
                 */
                if (rejection.status === 404) {
                    if (rejection.config.offlink_callback) {
                        rejection.config.offlink_callback(rejection);
                    } else if (rejection.config.fallback_url) {
                        $location.url(rejection.config.fallback_url);
                    }
                }
                /**
                 * handles 0 error responses and calls the specified
                 * function or redirect to the specifed URL
                 * @param rejection
                 * @returns {*}
                 */
                if (rejection.status === 0) {
                    if (rejection.config.offlink_callback) {
                        rejection.config.offlink_callback(rejection);
                    } else if (rejection.config.fallback_url) {
                        $location.url(rejection.config.fallback_url);
                    }
                }
                /**
                 * check whether the error is due to the server unavailabilty
                 * or unable to teh find the specified resource
                 *
                 */
                if (rejection.status === 0 || rejection.status === 404) {
                    //set the rejection action
                    rejection.offline_action = true;
                    //check whether the offlink cache is set
                    if (rejection.config.flnk_cache) {
                    //if the request method is GET
                        if (rejection.config.method === 'GET') {
                            var data;
                    //retrieve the particular data to the GET request from local storage
                            data = localStorageService.get("GC<>" + rejection.config.url);
                    //append to rejection object
                            rejection.data = data;
                        } else if (rejection.config.offlink_callback) {
                            rejection.config.offlink_callback(rejection);
                        } else if (rejection.config.fallback_url) {
                            $location.url(rejection.config.fallback_url);
                        } else if (
                        //checks of the request was POST/PUT/DELETE
                            rejection.config.method === 'POST' ||
                            rejection.config.method === 'PUT' ||
                            rejection.config.method === 'DELETE'
                        ) {
                            //set the prefix for write requests
                            var prefix = WRITE_CACHE + "<>" + rejection.config.flnk_prefix + "<>" + Date.now();
                            //if the auto sync was added, alter the prefix
                            if (rejection.config.flnk_auto_sync) {
                                prefix += "<>auto"
                            }
                            //write to the local storage
                            localStorageService.add(prefix, rejection.config);
                        }

                    } else {
                        var key = rejection.config.url;
                        //if the requested resource was prefecthed before append to the rejection data
                        if (OfflinkJs.prefetchedResources[key]) {
                            rejection.data = OfflinkJs.prefetchedResources[key];
                        }
                    }

                }
                return rejection;
            }
        };
    }]);

OfflinkJs.factory('flinkPrefetchService', ['$window', '$indexedDB', 'localStorageService', '$location', '$document', '$http',
    function ($window, $indexedDB, localStorageService, $location, $document, $http) {
        var pc = $location.protocol() + "://";
        var host = $location.host();
        var port = $location.port() == '' ? '' : ':' + $location.port();
        //create the URL prefix with the http protocol, host and the port
        var urlPrefix = pc + host + port;

        var obj = {};
        /**
         * @method prefetch: prefecth the developer specified
         * resources on advance and add those to the prefetched resources
         * @param httpConfig
         */
        obj.prefetch = function (httpConfig) {
            var config;
            //iterate through all the specifed resources
            for (var i = 0; i < httpConfig.length; i++) {
                config = httpConfig[i];
            //set prefetch prefix
                httpConfig[i]['flnk_prefetch'] = true;
            //send an http request to fetch the resource
                $http(config).then(function (res) {
            //add the resource to the prefetched list
                    OfflinkJs.prefetchedResources[res.config.url] = res.data;
                }, function (error) {

                });
            }
        };
        /**
         * @method: staticPrefetchappend the resources that needs to be prefetched to
         * the DOM head as links from the manifest file
         * @param dom
         */
        obj.staticPrefetch = function (dom) {
            var head = dom.find('head').eq(0);
            for (var i = 0; i < OFFlINK_STATIC_CACHE.length; i++) {
                head.append("<link rel='prefetch' href=" + OFFlINK_STATIC_CACHE[i] + ">");
            }
        };
        /**
         * @method dynamicPrefetch: dynmically prefetch the resources by modifying the DOM
         * @param dom
         */
        obj.dynamicPrefetch = function (dom) {
            //get reference to the DOM
            dom = typeof dom !== 'undefined' ? dom : $document;
            //specify the threshold to prefetch
            var threshold = 1;
            var absUrl = $location.absUrl();
            var routeUrl;
            //read the indexedDB table
            $indexedDB.openStore('dynamic_prefetch_cache', function (store) {
                store.find(absUrl).then(function (e) {
                    var links_array = [];
            //find head element from DOM
                    var head = dom.find('head').eq(0);
            //select all the  prefetch links added to the head
                    var pf_links = document.querySelectorAll('link[title=flnk_pf]');
            //iterate through all the links and push the URL to an array
                    for (var j = 0; j < pf_links.length; j++) {
                        links_array.push(pf_links[j]['attributes']['href']['value']);/////
                    }
            //iterate through the child URL list
                    for (var i = 0; i < e['child_pages'].length; i++) {
            //check whether the weight satisfy the threshold
                        if (e['child_pages'][i].weight >= threshold) {
                            routeUrl = (e['child_pages'][i].url).split(urlPrefix)[1];
            //if the new URL was not found in the head add to the head as a new prefetch link
                            if (typeof ROUTE_MAP[routeUrl] !== 'undefined') {
                                if (links_array.indexOf(ROUTE_MAP[routeUrl]) < 0) {
                                    head.append("<link title='flnk_pf' rel='prefetch' href=" + ROUTE_MAP[routeUrl] + ">");
                                }
                            }
                        }
                    }
                }, function () {
                    console.log('No pages to pre fetch');
                });
            });
        };
        /**
         * @method updateDynamicPrefetchModel: updates the dynamic prefetch model by increasing the
         * weights when an URL transition occurs
         * @param current
         * @param previous
         */
        obj.updateDynamicPrefetchModel = function (current, previous) {
            //reads the indexedDB
            $indexedDB.openStore('dynamic_prefetch_cache', function (store) {
            //find if the parent page is visited before
                    store.find(previous).then(function (e) {
                        var childPageExists = false;
                        for (var i = 0; i < e['child_pages'].length; i++) {
            //if the child pages contains the current URL increase the current weight by one
                            if (e['child_pages'][i].url == current) {
                                e['child_pages'][i].weight++;
                                childPageExists = true;
                                break;
                            }
                        }
            //if it is not there, add a new entry to the parent URL
                        if (!childPageExists) {
                            e['child_pages'].push({
                                url: current,
                                weight: 1
                            });
                        }
            //update the indexedDB model
                        store.upsert({
                            "parent_page": previous,
                            "child_pages": e['child_pages']
                        });
                    }, function (e) {
            //if the parent and child pages are not viisted before add those as a new entry
                        store.insert({
                            "parent_page": previous,
                            "child_pages": [{
                                url: current,
                                weight: 1
                            }]
                        });
                    });

                }
            );
        };

        return obj;
    }])
;
/**
 * update the dynamic prefetch model and prefetch the resources when there is
 * an URL change
 */
OfflinkJs.run(['$location', 'localStorageService', 'flinkPrefetchService', '$rootScope',
    function ($location, localStorageService, flinkPrefetchService, $rootScope) {
        $rootScope.$on("$locationChangeSuccess", function (event, current, previous) {
            flinkPrefetchService.updateDynamicPrefetchModel(current, previous);
            flinkPrefetchService.dynamicPrefetch();
        });
    }]
);
/**
 * do configurations that needs to be completed when the app initializes
 */
OfflinkJs.config(['$indexedDBProvider', '$httpProvider', 'localStorageServiceProvider',
    function ($indexedDBProvider, $httpProvider, localStorageServiceProvider) {
        //register the cacheInterceptor in the interceptors
        $httpProvider.interceptors.push('cacheInterceptor');
        localStorageServiceProvider
            .setPrefix('flnk')
            .setNotify(true, true);
        // create the indexedDB table structure for the prefetch service when the app initializes
        $indexedDBProvider
            .connection('prefetchDB')
            .upgradeDatabase(1, function (event, db, tx) {
                var objStore = db.createObjectStore('dynamic_prefetch_cache', {keyPath: 'parent_page'});
                objStore.createIndex('child_pages_idx', 'child_pages', {unique: false});
            });

    }]
);