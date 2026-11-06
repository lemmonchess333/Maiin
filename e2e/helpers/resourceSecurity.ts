/** Only the local test server may serve same-origin resources over HTTP. */
export function isInsecureHttpResource(resourceUrl: string, documentUrl: string): boolean {
  const document = new URL(documentUrl);
  const resource = new URL(resourceUrl, document);
  if (resource.protocol !== "http:") return false;

  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(document.hostname);
  const isLocalTestResource =
    document.protocol === "http:" &&
    isLoopback &&
    resource.origin === document.origin;
  return !isLocalTestResource;
}
