#!/usr/bin/env node
/**
 * Makes one TestFlight run's App Store signing from the App Store Connect
 * API key alone: an Apple Distribution certificate for a certificate
 * request made on the runner, and an App Store profile naming it for each
 * app and extension the project signs. deploy-ios.yml runs this when the
 * IOS_DIST_CERT_* secrets are not set, so the owner, who has no Mac,
 * provides an API key instead of making a certificate and profiles by hand
 * (docs/ios-release.md).
 *
 * The certificate's private key never leaves the runner, so each run needs
 * a new certificate and the previous one is no use to anyone. Each run
 * names its profiles after its certificate ("Tropos CI <serial>" for the
 * first bundle ID, "Tropos CI <serial> <last part of the ID>" for the rest)
 * and, before making anything, deletes the profiles of earlier runs by that
 * name and revokes the certificates they name. So the account holds one certificate
 * from these runs at a time, and a certificate this did not make is never
 * touched. Revoking a distribution certificate does not affect builds
 * already uploaded: Apple signs what the App Store and TestFlight install.
 *
 *   node scripts/ios/asc-signing.mjs <request.csr> <out-dir>
 *
 * with ASC_API_KEY_ID, ASC_API_ISSUER_ID, ASC_API_KEY_PATH (the .p8) and
 * SIGNED_BUNDLE_IDS, the space-separated bundle IDs the project signs
 * (scripts/ios_signed_targets.py lists them), in the environment. Writes
 * <out-dir>/dist.cer (DER) and <out-dir>/profiles/<bundle ID>.mobileprovision
 * for each.
 */
import { sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const API = "https://api.appstoreconnect.apple.com";
export const PROFILE_PREFIX = "Tropos CI ";

const base64url = (data) => Buffer.from(data).toString("base64url");

/** A team API key's token (ES256), good for 15 minutes; Apple allows 20. */
export function makeToken({ keyId, issuerId, privateKey, now = Date.now() }) {
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iss: issuerId, iat, exp: iat + 15 * 60, aud: "appstoreconnect-v1" })
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${base64url(signature)}`;
}

export class AppStoreConnectError extends Error {
  constructor(status, detail, call) {
    super(`${call} failed (${status}): ${detail}`);
    this.status = status;
    this.detail = detail;
    this.call = call;
  }
}

/** request(method, path, body?) against the API, JSON in and out. */
export function connect({ token, fetch: send = globalThis.fetch }) {
  return async function request(method, path, body) {
    const response = await send(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = response.status === 204 ? "" : await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const first = json?.errors?.[0];
      const detail = first
        ? [first.title, first.detail].filter(Boolean).join(": ")
        : text.slice(0, 300) || response.statusText;
      throw new AppStoreConnectError(response.status, detail, `${method} ${path.split("?")[0]}`);
    }
    return json;
  };
}

async function listAll(request, path) {
  const items = [];
  let next = path;
  for (let page = 0; next && page < 10; page++) {
    const json = await request("GET", next);
    items.push(...(json?.data ?? []));
    const link = json?.links?.next;
    next = link ? link.replace(API, "") : null;
  }
  return items;
}

/** Each profile's name: the run's serial, then the last part of the
 *  bundle ID for every ID after the first, kept unique. */
export function profileNames(serial, identifiers) {
  const names = [];
  for (const [index, identifier] of identifiers.entries()) {
    let name = `${PROFILE_PREFIX}${serial}`;
    if (index > 0) name += ` ${identifier.split(".").pop()}`;
    if (names.includes(name)) name += ` ${index}`;
    names.push(name);
  }
  return names;
}

/**
 * Clears earlier runs' signing, then makes this run's. Returns the
 * certificate (DER) and a profile per bundle ID, all as Buffers.
 */
export async function prepareSigning({ request, bundleIdentifier, bundleIdentifiers, csr, log = () => {} }) {
  const identifiers = bundleIdentifiers ?? [bundleIdentifier];
  if (!identifiers.length || identifiers.some((identifier) => !identifier)) {
    throw new Error("At least one App ID is required for signing.");
  }
  const bundles = [];
  for (const identifier of identifiers) {
    const matches = await listAll(
      request,
      `/v1/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}&limit=200`
    );
    const bundle = matches.find((b) => b.attributes?.identifier === identifier);
    if (!bundle) {
      throw new Error(
        `Apple has no App ID for ${identifier}. Register it under Apple Developer → Identifiers, with its capabilities, then run this again.`
      );
    }
    bundles.push(bundle);
  }

  const existingProfiles = await listAll(request, "/v1/profiles?filter[profileType]=IOS_APP_STORE&limit=200");
  const earlier = existingProfiles.filter((p) => p.attributes?.name?.startsWith(PROFILE_PREFIX));
  const serials = new Set(
    earlier.map((p) => p.attributes.name.slice(PROFILE_PREFIX.length).trim().split(" ")[0])
  );
  for (const profile of earlier) {
    await request("DELETE", `/v1/profiles/${profile.id}`);
    log(`Deleted the profile an earlier run made: ${profile.attributes.name}`);
  }
  if (serials.size > 0) {
    const certificates = await listAll(
      request,
      "/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=200"
    );
    for (const certificate of certificates) {
      if (!serials.has(certificate.attributes?.serialNumber)) continue;
      await request("DELETE", `/v1/certificates/${certificate.id}`);
      log(`Revoked the certificate an earlier run made: ${certificate.attributes.serialNumber}`);
    }
  }

  const certificate = (
    await request("POST", "/v1/certificates", {
      data: {
        type: "certificates",
        attributes: { certificateType: "DISTRIBUTION", csrContent: csr },
      },
    })
  ).data;
  const serial = certificate.attributes.serialNumber;
  log(`Made an Apple Distribution certificate: ${serial}`);

  const profiles = {};
  const createdProfileIds = [];
  const names = profileNames(serial, identifiers);
  try {
    for (const [index, bundle] of bundles.entries()) {
      const identifier = identifiers[index];
      const profile = (
        await request("POST", "/v1/profiles", {
          data: {
            type: "profiles",
            attributes: {
              name: names[index],
              profileType: "IOS_APP_STORE",
            },
            relationships: {
              bundleId: { data: { type: "bundleIds", id: bundle.id } },
              certificates: { data: [{ type: "certificates", id: certificate.id }] },
            },
          },
        })
      ).data;
      createdProfileIds.push(profile.id);
      profiles[identifier] = {
        profile: Buffer.from(profile.attributes.profileContent, "base64"),
        profileName: profile.attributes.name,
      };
      log(`Made the App Store profile ${profile.attributes.name} for ${identifier}`);
    }
  } catch (error) {
    // A partial set of profiles must not leave signing that a later run
    // cannot reconcile. Clean up the ones made before the certificate.
    for (const id of createdProfileIds) {
      await request("DELETE", `/v1/profiles/${id}`).catch(() => {});
    }
    await request("DELETE", `/v1/certificates/${certificate.id}`).catch(() => {});
    throw error;
  }

  return {
    certificate: Buffer.from(certificate.attributes.certificateContent, "base64"),
    profile: profiles[identifiers[0]].profile,
    profileName: profiles[identifiers[0]].profileName,
    profiles,
    serial,
  };
}

/** What to tell the owner when a step fails. */
export function explain(error) {
  if (!(error instanceof AppStoreConnectError)) return error.message;
  if (error.status === 401) {
    return `App Store Connect refused the API key (${error.detail}). ASC_API_KEY_ID, ASC_API_ISSUER_ID and the .p8 in ASC_API_KEY_P8_BASE64 must all come from the same team key.`;
  }
  if (error.status === 403) {
    return `The API key may not do this: ${error.call} (${error.detail}). Making the signing needs a team key with the Admin role: App Store Connect → Users and Access → Integrations → Team Keys.`;
  }
  if (error.status === 409 && error.call === "POST /v1/certificates") {
    return `Apple would not make another distribution certificate (${error.detail}). If the account holds the most it allows, revoke one you no longer use in Apple Developer → Certificates, or sign with your own through the IOS_DIST_CERT_* secrets (docs/ios-release.md).`;
  }
  return error.message;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [csrPath, outDir] = process.argv.slice(2);
  const env = process.env;
  try {
    const token = makeToken({
      keyId: env.ASC_API_KEY_ID.trim(),
      issuerId: env.ASC_API_ISSUER_ID.trim(),
      privateKey: readFileSync(env.ASC_API_KEY_PATH, "utf8"),
    });
    const bundleIdentifiers = (env.SIGNED_BUNDLE_IDS ?? "").split(/\s+/).filter(Boolean);
    if (!bundleIdentifiers.length) {
      throw new Error("SIGNED_BUNDLE_IDS is empty: the workflow's \"List the targets to sign\" step sets it.");
    }
    const result = await prepareSigning({
      request: connect({ token }),
      bundleIdentifiers,
      csr: readFileSync(csrPath, "utf8"),
      log: (line) => console.log(line),
    });
    writeFileSync(join(outDir, "dist.cer"), result.certificate);
    mkdirSync(join(outDir, "profiles"), { recursive: true });
    for (const identifier of bundleIdentifiers) {
      writeFileSync(
        join(outDir, "profiles", `${identifier}.mobileprovision`),
        result.profiles[identifier].profile
      );
    }
  } catch (error) {
    console.log(`::error::${explain(error)}`);
    process.exit(1);
  }
}
