"""Compare requested entitlements with a decoded provisioning profile offline."""

ASSOCIATED_DOMAINS = "com.apple.developer.associated-domains"


def mismatched_entitlements(requested, allowed):
    """Keep exact checks, with the two shapes Apple writes into profiles.

    Associated Domains: an App Store profile authorizes the wildcard, written
    "*" (seen in Apple's own profiles, 2026-11-08) or ["*"], while the app must
    still name its explicit domains. This does not add domains to the app or
    enable the Apple capability. No other entitlement may use the wildcard.

    A profile may also list the values it allows where the app names one: App
    Attest's profile holds ["development", "production"] while the app asks
    "production" (also seen 2026-11-08). A single string the app asks for
    passes when the profile's list holds that exact string; nothing else does.
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
