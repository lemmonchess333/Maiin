#!/usr/bin/env node
/**
 * Makes one TestFlight run's App Store signing from the App Store Connect
 * API key alone: an Apple Distribution certificate for a certificate
 * request made on the runner, and an App Store profile for the app that
 * names it. deploy-ios.yml runs this when the IOS_DIST_CERT_* secrets are
 * not set, so the owner, who has no Mac, provides an API key instead of
 * making a certificate and a profile by hand (docs/ios-release.md).
 *
 * The certificate's private key never leaves the runner, so each run needs
 * a new certificate and the previous one is no use to anyone. Each run
 * names its profile after its certificate ("Tropos CI <serial>") and, before
 * making anything, deletes the profiles of earlier runs by that name and
 * revokes the certificates they name. So the account holds one certificate
 * from these runs at a time, and a certificate this did not make is never
 * touched. Revoking a distribution certificate does not affect builds
 * already uploaded: Apple signs what the App Store and TestFlight install.
 *
 *   node scripts/ios/asc-signing.mjs <request.csr> <out-dir>
 *
 * with ASC_API_KEY_ID, ASC_API_ISSUER_ID, ASC_API_KEY_PATH (the .p8) and
 * BUNDLE_ID in the environment. Writes <out-dir>/dist.cer (DER) and
 * <out-dir>/profile.mobileprovision.
 */
import { sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
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

/**
 * Clears earlier runs' signing, then makes this run's. Returns the
 * certificate (DER) and the profile, both as Buffers.
 */
export async function prepareSigning({ request, bundleIdentifier, csr, log = () => {} }) {
  const bundles = await listAll(
    request,
    `/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundleIdentifier)}&limit=200`
  );
  const bundle = bundles.find((b) => b.attributes?.identifier === bundleIdentifier);
  if (!bundle) {
    throw new Error(
      `Apple has no App ID for ${bundleIdentifier}. Register it under Apple Developer → Identifiers, with its capabilities, then run this again.`
    );
  }

  const profiles = await listAll(request, "/v1/profiles?filter[profileType]=IOS_APP_STORE&limit=200");
  const earlier = profiles.filter((p) => p.attributes?.name?.startsWith(PROFILE_PREFIX));
  const serials = new Set(earlier.map((p) => p.attributes.name.slice(PROFILE_PREFIX.length).trim()));
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

  let profile;
  try {
    profile = (
      await request("POST", "/v1/profiles", {
        data: {
          type: "profiles",
          attributes: { name: `${PROFILE_PREFIX}${serial}`, profileType: "IOS_APP_STORE" },
          relationships: {
            bundleId: { data: { type: "bundleIds", id: bundle.id } },
            certificates: { data: [{ type: "certificates", id: certificate.id }] },
          },
        },
      })
    ).data;
  } catch (error) {
    // No profile names this certificate, so no later run would find it to
    // revoke. Revoke it now; the failure that got here is the one to report.
    await request("DELETE", `/v1/certificates/${certificate.id}`).catch(() => {});
    throw error;
  }
  log(`Made the App Store profile ${profile.attributes.name} for ${bundleIdentifier}`);

  return {
    certificate: Buffer.from(certificate.attributes.certificateContent, "base64"),
    profile: Buffer.from(profile.attributes.profileContent, "base64"),
    profileName: profile.attributes.name,
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
    const result = await prepareSigning({
      request: connect({ token }),
      bundleIdentifier: env.BUNDLE_ID,
      csr: readFileSync(csrPath, "utf8"),
      log: (line) => console.log(line),
    });
    writeFileSync(join(outDir, "dist.cer"), result.certificate);
    writeFileSync(join(outDir, "profile.mobileprovision"), result.profile);
  } catch (error) {
    console.log(`::error::${explain(error)}`);
    process.exit(1);
  }
}
