/**
 * lib/adminSdk.js is the one object every function, script and test here
 * reaches the Admin SDK through. firebase-admin 14 has no namespace, so
 * `require("firebase-admin").firestore` is undefined on it: a file that
 * requires the bare package throws the first time it runs, in production,
 * where no test sees it. The last test here is the gate against that.
 *
 * The rest pins the object's layout, because the tests' replace-and-restore
 * code depends on it: they define an own property over a service and either
 * put the saved descriptor back or delete theirs.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const admin = require("../lib/adminSdk");
const functionsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SERVICES = ["firestore", "auth", "storage", "messaging"];

afterEach(() => {
  for (const name of SERVICES) delete admin[name];
});

describe("the Admin SDK object", () => {
  it("keeps each service as a getter on the prototype, not an own property", () => {
    const proto = Object.getPrototypeOf(admin);
    for (const name of [...SERVICES, "apps"]) {
      expect(Object.getOwnPropertyDescriptor(admin, name)).toBeUndefined();
      expect(typeof Object.getOwnPropertyDescriptor(proto, name)?.get).toBe(
        "function"
      );
    }
    for (const name of SERVICES) expect(typeof admin[name]).toBe("function");
  });

  it("carries the Firestore classes on admin.firestore", () => {
    const firestore = require("firebase-admin/firestore");
    for (const name of ["FieldValue", "Timestamp", "FieldPath"]) {
      expect(admin.firestore[name]).toBe(firestore[name]);
    }
    expect(admin.firestore.Timestamp.fromMillis(1500).toMillis()).toBe(1500);
    expect(
      admin.firestore.FieldValue.delete().isEqual(firestore.FieldValue.delete())
    ).toBe(true);
  });

  it("has the app functions, and credential as an own configurable property", () => {
    const app = require("firebase-admin/app");
    expect(typeof admin.initializeApp).toBe("function");
    expect(admin.apps).toEqual(app.getApps());
    const credential = Object.getOwnPropertyDescriptor(admin, "credential");
    expect(credential.configurable).toBe(true);
    expect(credential.value.cert).toBe(app.cert);
    expect(credential.value.applicationDefault).toBe(app.applicationDefault);
  });

  it("lets a test put a fake over a service and take it away again", () => {
    const fake = () => ({ fake: true });
    Object.defineProperty(admin, "firestore", {
      configurable: true,
      get: () => fake,
    });
    expect(admin.firestore).toBe(fake);
    expect(admin.firestore()).toEqual({ fake: true });

    delete admin.firestore;
    expect(admin.firestore).not.toBe(fake);
    expect(admin.firestore.FieldValue).toBeDefined();
  });

  it("puts a saved descriptor back as it was", () => {
    const before = Object.getOwnPropertyDescriptor(admin, "credential");
    Object.defineProperty(admin, "credential", {
      configurable: true,
      get: () => ({ applicationDefault: () => "stub" }),
    });
    expect(admin.credential.applicationDefault()).toBe("stub");
    Object.defineProperty(admin, "credential", before);
    expect(admin.credential).toBe(before.value);
  });
});

describe("nothing here requires the bare package", () => {
  it("every .js file reaches the SDK through lib/adminSdk or a service entry point", () => {
    const files = execFileSync("git", ["ls-files", "*.js", "**/*.js"], {
      cwd: functionsDir,
      encoding: "utf8",
    })
      .split("\n")
      // This file quotes the bare require below, to test the scan.
      .filter(
        (file) =>
          file &&
          !file.startsWith("node_modules/") &&
          file !== "__tests__/adminSdk.test.js"
      );
    // The source is scanned, so a real list keeps an empty one from passing.
    expect(files.length).toBeGreaterThan(100);

    const bare =
      /(?:require|import)\(\s*["']firebase-admin["']\s*\)|from\s+["']firebase-admin["']/;
    // Comments may name the package; code may not require it.
    const code = (file) =>
      readFileSync(resolve(functionsDir, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
    expect(files.filter((file) => bare.test(code(file)))).toEqual([]);

    // The scan itself: it finds one when there is one.
    expect(bare.test('const admin = require("firebase-admin");')).toBe(true);
    expect(bare.test('import admin from "firebase-admin";')).toBe(true);
    expect(bare.test('require("firebase-admin/firestore")')).toBe(false);
  });
});
