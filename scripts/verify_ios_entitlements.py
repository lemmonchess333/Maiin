"""Compare requested entitlements with a decoded provisioning profile offline."""

ASSOCIATED_DOMAINS = "com.apple.developer.associated-domains"
APP_GROUPS = "com.apple.security.application-groups"


def _explicit_groups(value):
    """A non-empty list of App Group identifiers, none a pattern."""
    return (
        isinstance(value, list)
        and bool(value)
        and all(isinstance(group, str) and group.startswith("group.") and "*" not in group for group in value)
    )


def mismatched_entitlements(requested, allowed):
    """Keep exact checks, with the shapes Apple writes into profiles.

    Associated Domains: an App Store profile authorizes the wildcard, written
    "*" (seen in Apple's own profiles, 2026-11-08) or ["*"], while the app must
    still name its explicit domains. This does not add domains to the app or
    enable the Apple capability. No other entitlement may use the wildcard.

    A profile may also list the values it allows where the app names one: App
    Attest's profile holds ["development", "production"] while the app asks
    "production" (also seen 2026-11-08). A single string the app asks for
    passes when the profile's list holds that exact string; nothing else does.

    App Groups: a profile lists every group assigned to its App ID, so the
    app's groups pass when the profile's list holds each of them. Both lists
    name groups outright; neither may be a pattern.
    """
    mismatched = []
    for key, value in requested.items():
        have = allowed.get(key)
        if key == ASSOCIATED_DOMAINS and have in ("*", ["*"]):
            if (
                isinstance(value, list)
                and value
                and all(isinstance(domain, str) and domain and "*" not in domain for domain in value)
            ):
                continue
        elif key == APP_GROUPS:
            if _explicit_groups(value) and _explicit_groups(have) and set(value) <= set(have):
                continue
        elif have == value:
            continue
        elif (
            key != ASSOCIATED_DOMAINS
            and isinstance(value, str)
            and value
            and isinstance(have, list)
            and value in have
        ):
            continue
        mismatched.append(key)
    return sorted(mismatched)


def explain_mismatch(bundle, key, requested):
    """What the owner changes in Apple's developer site for an entitlement a
    profile lacks, where that is more than "turn the capability on", or None.

    App Groups is the one: the App ID needs the capability AND the group
    assigned to it, and the App Store Connect API can do neither part of the
    assigning (docs/ios-release.md, "The App Group").
    """
    if key != APP_GROUPS:
        return None
    groups = ", ".join(g for g in requested.get(key) or [] if isinstance(g, str)) or "the App Group"
    return (
        f"{bundle}: the profile carries no App Group {groups}, so the Home Screen widgets could not read "
        f"what the app writes. In Apple Developer, Certificates, Identifiers & Profiles, Identifiers: register "
        f"the App Group {groups} if it is not listed under App Groups, then open the App ID {bundle}, tick "
        f"App Groups, click Configure, choose {groups}, Continue, then Save. Run this again: it makes a new "
        f"profile, which carries the group (docs/ios-release.md, \"The App Group\")"
    )
