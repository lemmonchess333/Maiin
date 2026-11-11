/** Release guards run offline here; Apple signing still needs a real macOS run. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../${path}`, import.meta.url)),
    "utf8"
  ).replace(/\r\n/g, "\n");
const workflow = read(".github/workflows/deploy-ios.yml");

function step(name: string) {
  const start = workflow.indexOf(`- name: ${name}`);
  if (start < 0) throw new Error(`Missing iOS release step: ${name}`);
  const next = workflow.indexOf("- name:", start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
}

describe("native push release checks", () => {
  it("keeps TestFlight manual with its existing optional notes input", () => {
    const trigger = workflow.slice(
      workflow.indexOf("\non:"),
      workflow.indexOf("\n# Never run")
    );
    expect(trigger).toContain("workflow_dispatch:");
    expect(trigger).toMatch(/notes:[\s\S]*required: false[\s\S]*default: ""/);
    expect(trigger).not.toMatch(/^\s+(push|pull_request|schedule):/m);
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("checks the decoded profile's production APNs capability before the archive", () => {
    const profile = step("Import signing certificate + provisioning profiles");
    expect(profile.indexOf("security cms -D")).toBeLessThan(
      profile.indexOf("python3 scripts/verify_ios_push.py")
    );
    // Every signed target's profile is decoded; the iPhone app's is the one
    // that must carry production APNs.
    expect(profile).toContain(
      'security cms -D -i "$PROFILES/$bundle.mobileprovision" > "$PROFILES/$bundle.plist"'
    );
    expect(profile).toContain(
      'python3 scripts/verify_ios_push.py --profile "$PROFILES/$BUNDLE_ID.plist"'
    );
    expect(workflow.indexOf("name: Import signing certificate")).toBeLessThan(
      workflow.indexOf("name: Archive")
    );
  });

  it("reads actual signed entitlements after archive and again after export", () => {
    const archive = step("Verify archived iPhone and Watch signing");
    expect(archive).toContain("python3 scripts/verify_ios_push.py");
    expect(archive).toContain("python3 scripts/verify_ios_watch.py");
    expect(archive).toContain(
      '--app "$RUNNER_TEMP/App.xcarchive/Products/Applications/App.app"'
    );
    const exported = step("Verify exported iPhone and Watch signing");
    expect(exported).toContain('ditto -x -k "$IPA" "$VERIFY_DIR"');
    expect(exported).toContain(
      'python3 scripts/verify_ios_push.py --app "${APPS[0]}" --bundle-id "$BUNDLE_ID"'
    );
    expect(exported).toContain(
      'python3 scripts/verify_ios_watch.py --app "${APPS[0]}"'
    );
    expect(exported).toContain('"${#IPAS[@]}" -ne 1');
    expect(exported).toContain('"${#APPS[@]}" -ne 1');
    const positions = [
      "Archive",
      "Verify archived iPhone and Watch signing",
      "Export .ipa",
      "Verify exported iPhone and Watch signing",
      "Upload to TestFlight",
    ].map((name) => workflow.indexOf(`- name: ${name}`));
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right)
    );
  });

  it("uploads exactly the IPA that passed verification", () => {
    expect(step("Verify exported iPhone and Watch signing")).toContain(
      'echo "VERIFIED_IPA=$IPA" >> "$GITHUB_ENV"'
    );
    expect(step("Upload to TestFlight")).toContain(
      'xcrun altool --upload-app -f "$VERIFIED_IPA"'
    );
    expect(step("Upload to TestFlight")).not.toContain("head -1");
  });

  it("runs executable signing-verifier regressions in the existing CI unit gate", () => {
    expect(read(".github/workflows/ci.yml")).toContain(
      "python3 -m unittest discover -s scripts -p 'test_verify*.py' -v"
    );
    expect(read("scripts/test_verify_ios_push.py")).toContain(
      "test_default_inspection_path_checks_signature_and_actual_embedded_plists"
    );
  });
});
