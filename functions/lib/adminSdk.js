"use strict";

/**
 * The Admin SDK as one object: `admin.firestore()`, `admin.auth()`,
 * `admin.firestore.FieldValue` and the rest.
 *
 * firebase-admin 14 has no such object. Each service is its own entry
 * point (`firebase-admin/firestore`, `firebase-admin/auth`, …) and the
 * package root exports only the app functions, so `require("firebase-admin")
 * .firestore` is undefined there. Every function, script and test in this
 * folder requires this module instead.
 *
 * It is one shared object on purpose, because that object is the tests'
 * seam. A test replaces `admin.firestore` with a fake, and every function
 * meets the fake on its next call. That holds only while code reads a
 * service through this object when it runs (`admin.firestore()` inside the
 * handler), never by keeping `getFirestore` or a Firestore instance from
 * require time.
 *
 * The layout is the one the SDK's own namespace had, which the tests'
 * replace-and-restore code was written against:
 *
 * - `firestore`, `auth`, `storage`, `messaging` and `apps` are getters on
 *   the prototype. A test defines an own property over one, and deleting
 *   that property brings the real one back.
 * - `credential` is an own, configurable property.
 * - A service's module loads the first time the service is read, so a
 *   function that never touches Storage or Messaging never pays to load
 *   them, and a parity test that imports one helper loads no client.
 *
 * `adminSdk.test.js` pins the layout, and that nothing in this folder
 * requires the bare package.
 */

const app = require("firebase-admin/app");

/** `admin.<service>(app?)`: the default app's service, or a named app's. */
function serviceGetter(load, getterName) {
  return (appInstance) => {
    const getService = load()[getterName];
    return appInstance ? getService(appInstance) : getService();
  };
}

class AdminSdk {
  constructor() {
    Object.defineProperty(this, "credential", {
      value: {
        cert: app.cert,
        applicationDefault: app.applicationDefault,
        refreshToken: app.refreshToken,
      },
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }

  initializeApp(options, appName) {
    return app.initializeApp(options, appName);
  }

  app(appName) {
    return app.getApp(appName);
  }

  get apps() {
    return app.getApps();
  }

  /** `admin.firestore()`, with the Firestore classes on it:
   *  `admin.firestore.FieldValue`, `.Timestamp`, `.FieldPath`. */
  get firestore() {
    const load = () => require("firebase-admin/firestore");
    const { FieldPath, FieldValue, Filter, GeoPoint, Timestamp } = load();
    return Object.assign(serviceGetter(load, "getFirestore"), {
      FieldPath,
      FieldValue,
      Filter,
      GeoPoint,
      Timestamp,
    });
  }

  get auth() {
    return serviceGetter(() => require("firebase-admin/auth"), "getAuth");
  }

  get storage() {
    return serviceGetter(() => require("firebase-admin/storage"), "getStorage");
  }

  get messaging() {
    return serviceGetter(
      () => require("firebase-admin/messaging"),
      "getMessaging"
    );
  }
}

module.exports = new AdminSdk();
