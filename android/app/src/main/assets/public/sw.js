/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "version.json",
    "revision": "0d524c9b7f65a242f471096c3dd870f4"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "b80404237a2a8b71799ad272e222e8de"
  }, {
    "url": "pwa-512x512.png",
    "revision": "b80404237a2a8b71799ad272e222e8de"
  }, {
    "url": "pwa-192x192.png",
    "revision": "18dabd19e60da307e00e941435414321"
  }, {
    "url": "manifest.json",
    "revision": "5a7872014efbd43eb616688e62b36d6e"
  }, {
    "url": "index.html",
    "revision": "11496339ed881e63a9dad6d6eefd6bbc"
  }, {
    "url": "icon.svg",
    "revision": "78fff9608e1dd4900bf2eedab46f4345"
  }, {
    "url": "icon.png",
    "revision": "7044435645491b9d0257caef0b1c8375"
  }, {
    "url": "favicon.ico",
    "revision": "2707d6d97ec1785a3e57aefa379c87fa"
  }, {
    "url": "durga-avatar.jpg",
    "revision": "428ad4ba3690e76408bdca02274c5a7b"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "617b7103c59ae6bec562910f239f0e7c"
  }, {
    "url": "app-icon.png",
    "revision": "b80404237a2a8b71799ad272e222e8de"
  }, {
    "url": "app-icon.jpg",
    "revision": "2707d6d97ec1785a3e57aefa379c87fa"
  }, {
    "url": "assets/index-C_I64dlR.css",
    "revision": null
  }, {
    "url": "assets/index-Bnlo0zPt.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "617b7103c59ae6bec562910f239f0e7c"
  }, {
    "url": "favicon.ico",
    "revision": "2707d6d97ec1785a3e57aefa379c87fa"
  }, {
    "url": "icon.svg",
    "revision": "78fff9608e1dd4900bf2eedab46f4345"
  }, {
    "url": "pwa-192x192.png",
    "revision": "18dabd19e60da307e00e941435414321"
  }, {
    "url": "pwa-512x512.png",
    "revision": "b80404237a2a8b71799ad272e222e8de"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "b80404237a2a8b71799ad272e222e8de"
  }, {
    "url": "manifest.webmanifest",
    "revision": "dcaf378d374c097ccb9ec27fe78b5809"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/.*\.basemaps\.cartocdn\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "carto-map-tiles-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 1000,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/.*\.tile\.openstreetmap\.org\/.*/i, new workbox.CacheFirst({
    "cacheName": "osm-map-tiles-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 1000,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/images\.unsplash\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "unsplash-images-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
