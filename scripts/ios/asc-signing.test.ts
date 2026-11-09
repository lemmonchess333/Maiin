import { generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error Standalone Node .mjs script is outside the TS app project.
import * as asc from "./asc-signing.mjs";

type Call = { method: string; path: string; body?: unknown };
type Handler = (call: Call) => unknown;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(join(root, ".github/workflows/deploy-ios.yml"), "utf8");
const step = (name: string) => {
  const start = workflow.indexOf(`- name: ${name}`);
  if (start < 0) throw new Error(`no step named "${name}" in deploy-ios.yml`);
  const next = workflow.indexOf("- name:", start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
};

/** A fake API: answers each call from `handler` and records it. */
function fakeApi(handler: Handler) {
  const calls: Call[] = [];
  const request = async (method: string, path: string, body?: unknown) => {
    const call = { method, path, body };
    calls.push(call);
    return handler(call);
  };
  return { calls, request };
}

const bundleIds = {
  data: [
    // A prefix match the API may return alongside the real one.
    { id: "B-WIDGET", attributes: { identifier: "com.tropos.app.widget" } },
    { id: "B-APP", attributes: { identifier: "com.tropos.app" } },
    { id: "B-WATCH", attributes: { identifier: "com.tropos.app.watchkitapp" } },
  ],
};

function account({
  profiles = [] as { id: string; name: string }[],
  certificates = [] as { id: string; serialNumber: string }[],
  profileFails = false,
} = {}): Handler {
  return ({ method, path }) => {
    if (method === "GET" && path.startsWith("/v1/bundleIds")) return bundleIds;
    if (method === "GET" && path.startsWith("/v1/profiles")) {
      return { data: profiles.map((p) => ({ id: p.id, attributes: { name: p.name } })) };
    }
    if (method === "GET" && path.startsWith("/v1/certificates")) {
      return {
        data: certificates.map((c) => ({ id: c.id, attributes: { serialNumber: c.serialNumber } })),
      };
    }
    if (method === "POST" && path === "/v1/certificates") {
      return {
        data: {
          id: "C-NEW",
          attributes: {
            serialNumber: "7A1B2C3D4E5F",
            certificateContent: Buffer.from("DER-CERT").toString("base64"),
          },
        },
      };
    }
    if (method === "POST" && path === "/v1/profiles") {
      if (profileFails) throw new asc.AppStoreConnectError(409, "ENTITY_ERROR", "POST /v1/profiles");
      return {
        data: {
          id: "P-NEW",
          attributes: {
            name: "Tropos CI 7A1B2C3D4E5F",
            profileContent: Buffer.from("PROFILE").toString("base64"),
          },
        },
      };
    }
    if (method === "DELETE") return null;
    throw new Error(`unexpected ${method} ${path}`);
  };
}

describe("App Store Connect signing from the API key", () => {
  it("signs a token App Store Connect accepts: ES256, the key id, the issuer, under 20 minutes", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const token = asc.makeToken({
      keyId: "ABC123DEFG",
      issuerId: "57246542-96fe-1a63-e053-0824d011072a",
      privateKey: pem,
      now: Date.UTC(2026, 9, 4, 12),
    }) as string;
    const [header, payload, signature] = token.split(".");
    const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());
    expect(decode(header)).toEqual({ alg: "ES256", kid: "ABC123DEFG", typ: "JWT" });
    const claims = decode(payload);
    expect(claims.iss).toBe("57246542-96fe-1a63-e053-0824d011072a");
    expect(claims.aud).toBe("appstoreconnect-v1");
    expect(claims.exp - claims.iat).toBeGreaterThan(0);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(20 * 60);
    // JWS wants the raw 64-byte r||s signature, not DER.
    expect(Buffer.from(signature, "base64url")).toHaveLength(64);
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url")
      )
    ).toBe(true);
  });

  it("clears only the earlier runs' signing, then makes a certificate and a profile for the app", async () => {
    const api = fakeApi(
      account({
        profiles: [
          { id: "P-OLD", name: "Tropos CI 11AA22BB" },
          { id: "P-OWNER", name: "Tropos App Store" },
        ],
        certificates: [
          { id: "C-OLD", serialNumber: "11AA22BB" },
          { id: "C-OWNER", serialNumber: "99FF88EE" },
        ],
      })
    );
    const result = await asc.prepareSigning({
      request: api.request,
      bundleIdentifier: "com.tropos.app",
      csr: "-----BEGIN CERTIFICATE REQUEST-----\nMIIB\n-----END CERTIFICATE REQUEST-----\n",
    });

    const deleted = api.calls.filter((c) => c.method === "DELETE").map((c) => c.path);
    expect(deleted).toEqual(["/v1/profiles/P-OLD", "/v1/certificates/C-OLD"]);

    const makeCert = api.calls.find((c) => c.method === "POST" && c.path === "/v1/certificates");
    expect(makeCert?.body).toEqual({
      data: {
        type: "certificates",
        attributes: {
          certificateType: "DISTRIBUTION",
          csrContent: "-----BEGIN CERTIFICATE REQUEST-----\nMIIB\n-----END CERTIFICATE REQUEST-----\n",
        },
      },
    });
    const makeProfile = api.calls.find((c) => c.method === "POST" && c.path === "/v1/profiles");
    expect(makeProfile?.body).toEqual({
      data: {
        type: "profiles",
        attributes: { name: "Tropos CI 7A1B2C3D4E5F", profileType: "IOS_APP_STORE" },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: "B-APP" } },
          certificates: { data: [{ type: "certificates", id: "C-NEW" }] },
        },
      },
    });
    // Old signing goes before the new is asked for, so an account at its
    // certificate limit has room.
    const order = api.calls.map((c) => `${c.method} ${c.path.split("?")[0]}`);
    expect(order.indexOf("DELETE /v1/certificates/C-OLD")).toBeLessThan(
      order.indexOf("POST /v1/certificates")
    );
    expect(result.certificate.toString()).toBe("DER-CERT");
    expect(result.profile.toString()).toBe("PROFILE");
  });

  it("names each profile after the run's certificate, uniquely", () => {
    expect(
      asc.profileNames("7A1B", [
        "com.tropos.app",
        "com.tropos.app.watchkitapp",
        "com.tropos.app.LiveActivities",
        "com.other.LiveActivities",
      ])
    ).toEqual([
      "Tropos CI 7A1B",
      "Tropos CI 7A1B watchkitapp",
      "Tropos CI 7A1B LiveActivities",
      "Tropos CI 7A1B LiveActivities 3",
    ]);
  });

  it("makes a profile for every signed target with the same certificate", async () => {
    const api = fakeApi(account());
    const result = await asc.prepareSigning({
      request: api.request,
      bundleIdentifiers: ["com.tropos.app", "com.tropos.app.watchkitapp", "com.tropos.app.widget"],
      csr: "CSR",
    });
    const created = api.calls.filter((c) => c.method === "POST" && c.path === "/v1/profiles");
    expect(created.map((c) => (c.body as { data: { relationships: { bundleId: { data: { id: string } } } } }).data.relationships.bundleId.data.id)).toEqual([
      "B-APP",
      "B-WATCH",
      "B-WIDGET",
    ]);
    expect(Object.keys(result.profiles)).toEqual([
      "com.tropos.app",
      "com.tropos.app.watchkitapp",
      "com.tropos.app.widget",
    ]);
  });

  it("makes separate iPhone and Watch profiles with the same certificate", async () => {
    const api = fakeApi(
      account({
        profiles: [
          { id: "P-OLD-APP", name: "Tropos CI 11AA22BB" },
          { id: "P-OLD-WATCH", name: "Tropos CI 11AA22BB watchkitapp" },
        ],
        certificates: [{ id: "C-OLD", serialNumber: "11AA22BB" }],
      })
    );
    const result = await asc.prepareSigning({
      request: api.request,
      bundleIdentifiers: ["com.tropos.app", "com.tropos.app.watchkitapp"],
      csr: "CSR",
    });
    expect(api.calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual([
      "/v1/profiles/P-OLD-APP",
      "/v1/profiles/P-OLD-WATCH",
      "/v1/certificates/C-OLD",
    ]);
    const created = api.calls.filter((c) => c.method === "POST" && c.path === "/v1/profiles");
    expect(created).toHaveLength(2);
    expect(created[0].body).toMatchObject({
      data: { relationships: {
        bundleId: { data: { id: "B-APP" } },
        certificates: { data: [{ id: "C-NEW" }] },
      } },
    });
    expect(created[1].body).toMatchObject({
      data: { relationships: {
        bundleId: { data: { id: "B-WATCH" } },
        certificates: { data: [{ id: "C-NEW" }] },
      } },
    });
    expect(Object.keys(result.profiles)).toEqual(["com.tropos.app", "com.tropos.app.watchkitapp"]);
  });

  it("leaves every certificate alone when no earlier run's profile is there", async () => {
    const api = fakeApi(
      account({ certificates: [{ id: "C-OWNER", serialNumber: "99FF88EE" }] })
    );
    await asc.prepareSigning({ request: api.request, bundleIdentifier: "com.tropos.app", csr: "CSR" });
    expect(api.calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });

  it("revokes the new certificate when the profile can't be made, so none is left behind", async () => {
    const api = fakeApi(account({ profileFails: true }));
    await expect(
      asc.prepareSigning({ request: api.request, bundleIdentifier: "com.tropos.app", csr: "CSR" })
    ).rejects.toThrow("ENTITY_ERROR");
    expect(api.calls.at(-1)).toMatchObject({ method: "DELETE", path: "/v1/certificates/C-NEW" });
  });

  it("removes the new iPhone profile if the Watch profile fails", async () => {
    const base = account();
    let profilePosts = 0;
    const api = fakeApi((call) => {
      if (call.method === "POST" && call.path === "/v1/profiles" && ++profilePosts === 2) {
        throw new asc.AppStoreConnectError(409, "Watch profile refused", "POST /v1/profiles");
      }
      return base(call);
    });
    await expect(
      asc.prepareSigning({
        request: api.request,
        bundleIdentifiers: ["com.tropos.app", "com.tropos.app.watchkitapp"],
        csr: "CSR",
      })
    ).rejects.toThrow("Watch profile refused");
    expect(api.calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual([
      "/v1/profiles/P-NEW",
      "/v1/certificates/C-NEW",
    ]);
  });

  it("names the missing App ID instead of making a certificate for nothing", async () => {
    const api = fakeApi(account());
    await expect(
      asc.prepareSigning({ request: api.request, bundleIdentifier: "com.other.app", csr: "CSR" })
    ).rejects.toThrow(/no App ID for com\.other\.app.*Identifiers/);
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("checks the Watch App ID before revoking an earlier valid certificate", async () => {
    const api = fakeApi(
      account({
        profiles: [{ id: "P-OLD", name: "Tropos CI 11AA22BB" }],
        certificates: [{ id: "C-OLD", serialNumber: "11AA22BB" }],
      })
    );
    await expect(
      asc.prepareSigning({
        request: api.request,
        bundleIdentifiers: ["com.tropos.app", "com.tropos.app.missing-watch"],
        csr: "CSR",
      })
    ).rejects.toThrow(/no App ID for com\.tropos\.app\.missing-watch/);
    expect(api.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("registers an App ID that needs no capability, then signs it with the rest", async () => {
    const base = account();
    const api = fakeApi((call) => {
      if (call.method === "POST" && call.path === "/v1/bundleIds") {
        return {
          data: { id: "B-LIVE", attributes: { identifier: "com.tropos.app.LiveActivities" } },
        };
      }
      return base(call);
    });
    const result = await asc.prepareSigning({
      request: api.request,
      bundleIdentifiers: ["com.tropos.app", "com.tropos.app.watchkitapp", "com.tropos.app.LiveActivities"],
      register: ["com.tropos.app.LiveActivities"],
      csr: "CSR",
    });
    const registered = api.calls.filter((c) => c.method === "POST" && c.path === "/v1/bundleIds");
    expect(registered.map((c) => c.body)).toEqual([
      {
        data: {
          type: "bundleIds",
          attributes: {
            identifier: "com.tropos.app.LiveActivities",
            name: "Tropos LiveActivities",
            platform: "IOS",
          },
        },
      },
    ]);
    const created = api.calls.filter((c) => c.method === "POST" && c.path === "/v1/profiles");
    expect(
      created.map(
        (c) =>
          (c.body as { data: { relationships: { bundleId: { data: { id: string } } } } }).data
            .relationships.bundleId.data.id
      )
    ).toEqual(["B-APP", "B-WATCH", "B-LIVE"]);
    expect(Object.keys(result.profiles)).toEqual([
      "com.tropos.app",
      "com.tropos.app.watchkitapp",
      "com.tropos.app.LiveActivities",
    ]);
  });

  it("registers no App ID Apple has, and none before every missing one may be", async () => {
    const found = fakeApi(account());
    await asc.prepareSigning({
      request: found.request,
      bundleIdentifiers: ["com.tropos.app"],
      register: ["com.tropos.app"],
      csr: "CSR",
    });
    expect(found.calls.some((c) => c.path === "/v1/bundleIds" && c.method === "POST")).toBe(false);

    // One that may be registered and one that may not: nothing is made.
    const mixed = fakeApi(account());
    await expect(
      asc.prepareSigning({
        request: mixed.request,
        bundleIdentifiers: ["com.tropos.app.LiveActivities", "com.tropos.app.missing"],
        register: ["com.tropos.app.LiveActivities"],
        csr: "CSR",
      })
    ).rejects.toThrow(/no App ID for com\.tropos\.app\.missing/);
    expect(mixed.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("checks the App Group's App IDs carry it before making or revoking anything", async () => {
    const base = account({
      profiles: [{ id: "P-OLD", name: "Tropos CI 11AA22BB" }],
      certificates: [{ id: "C-OLD", serialNumber: "11AA22BB" }],
    });
    const api = fakeApi((call) =>
      call.path.endsWith("/bundleIdCapabilities")
        ? { data: [{ id: "CAP-1", attributes: { capabilityType: "PUSH_NOTIFICATIONS" } }] }
        : base(call)
    );
    await expect(
      asc.prepareSigning({
        request: api.request,
        bundleIdentifiers: ["com.tropos.app", "com.tropos.app.watchkitapp"],
        appGroups: { "com.tropos.app": ["group.com.tropos.app"] },
        csr: "CSR",
      })
    ).rejects.toThrow(
      /App ID com\.tropos\.app has no App Groups capability.*cannot make an App Group or assign one.*Configure, choose group\.com\.tropos\.app/
    );
    // Read only: nothing made, nothing revoked, and only the App ID that
    // asks for a group was read for its capabilities.
    expect(api.calls.every((c) => c.method === "GET")).toBe(true);
    expect(api.calls.filter((c) => c.path.endsWith("/bundleIdCapabilities")).map((c) => c.path)).toEqual([
      "/v1/bundleIds/B-APP/bundleIdCapabilities",
    ]);
  });

  it("signs once every App Group App ID carries the capability", async () => {
    const base = account();
    const api = fakeApi((call) =>
      call.path.endsWith("/bundleIdCapabilities")
        ? { data: [{ id: "CAP-1", attributes: { capabilityType: "APP_GROUPS" } }] }
        : base(call)
    );
    const result = await asc.prepareSigning({
      request: api.request,
      bundleIdentifiers: ["com.tropos.app", "com.tropos.app.watchkitapp"],
      appGroups: asc.parseAppGroups("com.tropos.app=group.com.tropos.app"),
      csr: "CSR",
    });
    expect(Object.keys(result.profiles)).toEqual(["com.tropos.app", "com.tropos.app.watchkitapp"]);
  });

  it("names the App Group when the App ID that needs one is missing", async () => {
    const api = fakeApi(account());
    await expect(
      asc.prepareSigning({
        request: api.request,
        bundleIdentifiers: ["com.tropos.app.LiveActivities"],
        appGroups: { "com.tropos.app.LiveActivities": ["group.com.tropos.app"] },
        csr: "CSR",
      })
    ).rejects.toThrow(
      /no App ID for com\.tropos\.app\.LiveActivities.*App Groups among them with group\.com\.tropos\.app assigned/
    );
    expect(api.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("reads the App Group bundle IDs as the workflow writes them", () => {
    expect(
      asc.parseAppGroups(
        "com.tropos.app=group.com.tropos.app com.tropos.app.LiveActivities=group.com.tropos.app,group.x"
      )
    ).toEqual({
      "com.tropos.app": ["group.com.tropos.app"],
      "com.tropos.app.LiveActivities": ["group.com.tropos.app", "group.x"],
    });
    expect(asc.parseAppGroups("")).toEqual({});
    expect(asc.parseAppGroups(undefined)).toEqual({});
    expect(asc.parseAppGroups("com.tropos.app=")).toEqual({});
  });

  it("names an App ID it registers as Apple allows: letters, numbers and spaces", () => {
    expect(asc.bundleIdName("com.tropos.app.LiveActivities")).toBe("Tropos LiveActivities");
    expect(asc.bundleIdName("com.tropos.app.notification-service")).toBe(
      "Tropos notification service"
    );
  });

  it("follows the API's pages", async () => {
    const api = fakeApi(({ method, path }) => {
      if (path.startsWith("/v1/bundleIds")) return bundleIds;
      if (path.startsWith("/v1/profiles?")) {
        return {
          data: [{ id: "P1", attributes: { name: "Something else" } }],
          links: { next: `${asc.API}/v1/profiles/page2` },
        };
      }
      if (path === "/v1/profiles/page2") {
        return { data: [{ id: "P2", attributes: { name: "Tropos CI 11AA22BB" } }] };
      }
      if (path.startsWith("/v1/certificates?")) {
        return { data: [{ id: "C-OLD", attributes: { serialNumber: "11AA22BB" } }] };
      }
      return account()({ method, path });
    });
    await asc.prepareSigning({ request: api.request, bundleIdentifier: "com.tropos.app", csr: "CSR" });
    expect(api.calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual([
      "/v1/profiles/P2",
      "/v1/certificates/C-OLD",
    ]);
  });

  it("sends the token and reads Apple's error out of a refusal", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const request = asc.connect({
      token: "TOKEN",
      fetch: async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        return new Response(
          JSON.stringify({ errors: [{ status: "403", title: "Forbidden", detail: "role" }] }),
          { status: 403 }
        );
      },
    });
    await expect(request("POST", "/v1/certificates", { data: {} })).rejects.toMatchObject({
      status: 403,
      detail: "Forbidden: role",
      call: "POST /v1/certificates",
    });
    expect(seen[0].url).toBe(`${asc.API}/v1/certificates`);
    expect(seen[0].init.headers).toMatchObject({
      Authorization: "Bearer TOKEN",
      "Content-Type": "application/json",
    });
    const ok = asc.connect({ token: "T", fetch: async () => new Response(null, { status: 204 }) });
    await expect(ok("DELETE", "/v1/profiles/P1")).resolves.toBeNull();
  });

  it("tells the owner what to fix for the refusals they can fix", () => {
    const err = (status: number, call: string) =>
      new asc.AppStoreConnectError(status, "detail", call);
    expect(asc.explain(err(401, "GET /v1/bundleIds"))).toMatch(/ASC_API_KEY_ID.*same team key/);
    expect(asc.explain(err(403, "POST /v1/certificates"))).toMatch(/Admin role/);
    expect(asc.explain(err(409, "POST /v1/certificates"))).toMatch(
      /revoke one you no longer use.*IOS_DIST_CERT_/
    );
  });
});

describe("deploy-ios.yml signs from the API key when no certificate is given", () => {
  it("makes the signing before the import step checks it, and only without the certificate secrets", () => {
    const make = step("Make the signing certificate and profiles from the API key");
    expect(workflow.indexOf("- name: Make the signing certificate")).toBeLessThan(
      workflow.indexOf("- name: Import signing certificate + provisioning profiles")
    );
    expect(make).toMatch(/if \[ -n "\$IOS_DIST_CERT_P12_BASE64" \]; then[\s\S]*?exit 0/);
    expect(make).toContain("node scripts/ios/asc-signing.mjs");
    // LibreSSL's own pkcs12 defaults are the ones macOS's `security` imports.
    expect(make).toMatch(/\/usr\/bin\/openssl pkcs12 -export/);
    expect(step("Import signing certificate + provisioning profiles")).toContain(
      "$RUNNER_TEMP/api-signing/p12-password"
    );
    // The script writes one profile per signed bundle; the step hands all
    // of them to the import, whatever their number.
    expect(make).toContain('cp "$OUT"/profiles/*.mobileprovision "$RUNNER_TEMP/profiles/"');
    const script = readFileSync(join(root, "scripts/ios/asc-signing.mjs"), "utf8");
    expect(script).toContain("env.SIGNED_BUNDLE_IDS");
    expect(script).toContain('join(outDir, "profiles", `${identifier}.mobileprovision`)');
  });

  it("asks for the certificate secrets all together or not at all", () => {
    const preflight = step("Check the signing secrets are set");
    expect(preflight).toMatch(/Only some of your own signing secrets are set/);
    for (const name of ["APPLE_TEAM_ID", "ASC_API_KEY_ID", "ASC_API_ISSUER_ID", "ASC_API_KEY_P8_BASE64"]) {
      expect(preflight).toMatch(new RegExp(`for name in [^;]*${name}`));
    }
    expect(preflight).toContain("IOS_WATCH_PROVISIONING_PROFILE_BASE64");
    expect(preflight).toMatch(/\[ "\$own" -ne 4 \]/);
  });

  it("signs every listed target and verifies the Watch packaging twice", () => {
    expect(workflow).toContain("WATCH_BUNDLE_ID: com.tropos.app.watchkitapp");
    // The iPhone and Watch apps must be in the list the run signs, because
    // the verifiers below look for both.
    expect(step("List the targets to sign")).toContain(
      '--require "$BUNDLE_ID" --require "$WATCH_BUNDLE_ID"'
    );
    const imported = step("Import signing certificate + provisioning profiles");
    // The owner's own secrets cover the iPhone and Watch apps; any other
    // signed target is named, with the way out.
    expect(imported).toContain('"$PROFILES/$WATCH_BUNDLE_ID.mobileprovision"');
    expect(imported).toMatch(/your own signing secrets hold profiles for \$BUNDLE_ID and \$WATCH_BUNDLE_ID only/);
    for (const name of [
      "Verify archived iPhone and Watch signing",
      "Verify exported iPhone and Watch signing",
    ]) {
      expect(step(name)).toContain("python3 scripts/verify_ios_watch.py");
    }
  });

  it("signs the Live Activity widget in every build, may register an App ID that needs no capability, and checks the widget twice", () => {
    expect(workflow).toContain("WIDGET_BUNDLE_ID: com.tropos.app.LiveActivities");
    const list = step("List the targets to sign");
    expect(list).toContain('--require "$WIDGET_BUNDLE_ID"');
    // Only a target with no entitlements needs no App ID capability.
    expect(list).toMatch(/if not t\["entitlements"\]/);
    expect(list).toContain(
      'echo "REGISTERABLE_BUNDLE_IDS=$REGISTERABLE_BUNDLE_IDS" >> "$GITHUB_ENV"'
    );
    const script = readFileSync(join(root, "scripts/ios/asc-signing.mjs"), "utf8");
    expect(script).toContain("env.REGISTERABLE_BUNDLE_IDS");
    // The owner's own secrets hold no widget profile: said in the first
    // minute, before npm ci and a build.
    expect(step("Check the signing secrets are set")).toMatch(
      /your own signing secrets hold profiles for \$BUNDLE_ID and \$WATCH_BUNDLE_ID only/
    );
    for (const name of [
      "Verify archived iPhone and Watch signing",
      "Verify exported iPhone and Watch signing",
    ]) {
      expect(step(name)).toContain("python3 scripts/verify_ios_live_activity.py");
      expect(step(name)).toContain('--bundle-id "$WIDGET_BUNDLE_ID"');
    }
    // Both of the pull request's simulator builds, standard and pilot.
    const compile = readFileSync(join(root, ".github/workflows/ios-native-compile.yml"), "utf8");
    expect(compile.match(/python3 scripts\/verify_ios_live_activity\.py --unsigned/g)?.length).toBe(2);
  });

  it("checks the App Group the app and the widget share before the signing, at the profiles and on the build", () => {
    // Wid1: both App IDs carry the group, assigned once by the owner.
    expect(workflow).toContain("APP_GROUP: group.com.tropos.app");
    const list = step("List the targets to sign");
    expect(list).toMatch(/t\["bundle_id"\] \+ "=" \+ ",".join\(t\["app_groups"\]\)/);
    expect(list).toContain('echo "APP_GROUP_BUNDLE_IDS=$APP_GROUP_BUNDLE_IDS" >> "$GITHUB_ENV"');
    const script = readFileSync(join(root, "scripts/ios/asc-signing.mjs"), "utf8");
    expect(script).toContain("parseAppGroups(env.APP_GROUP_BUNDLE_IDS)");
    // A profile without the group is named with the clicks, before the
    // archive, rather than left to codesign.
    const imported = step("Import signing certificate + provisioning profiles");
    expect(imported).toContain("explain_mismatch(bundle, key, wanted)");
    for (const name of [
      "Verify archived iPhone and Watch signing",
      "Verify exported iPhone and Watch signing",
    ])
      expect(step(name)).toContain('--app-group "$APP_GROUP"');
  });

  it("takes the .p8 and the Firebase plist pasted as text as well as in base64", () => {
    for (const name of [
      "Check the signing secrets are set",
      "Place GoogleService-Info.plist",
      "Make the signing certificate and profiles from the API key",
      "Upload to TestFlight",
    ]) {
      expect(step(name)).toMatch(/\*"-----BEGIN"\*\|\*"<\?xml"\*/);
    }
  });
});
