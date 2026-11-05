"""Compare requested entitlements with a decoded provisioning profile offline."""

ASSOCIATED_DOMAINS = "com.apple.developer.associated-domains"


def mismatched_entitlements(requested, allowed):
    """Keep exact checks except Apple's Associated Domains authorization wildcard.

    Apple profiles can authorize ["*"], while the app must still name its explicit
    domains. This does not add domains to the app or enable the Apple capability.
    No other entitlement is permitted to use this wildcard exception.
    """
    mismatched = []
    for key, value in requested.items():
        have = allowed.get(key)
        if key == ASSOCIATED_DOMAINS and have == ["*"]:
            if (
                isinstance(value, list)
                and value
                and all(isinstance(domain, str) and domain and "*" not in domain for domain in value)
            ):
                continue
        elif have == value:
            continue
        mismatched.append(key)
    return sorted(mismatched)
