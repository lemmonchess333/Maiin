/**
 * What a paywall says in a build that cannot sell Pro (`canSellInThisBuild`):
 * no price, no button that cannot work, and nothing that points elsewhere
 * to buy it. One sentence, shared by the Upgrade page and ProModal.
 */
export default function ProNotOnSale() {
  return (
    <p
      role="note"
      className="text-sm text-muted-foreground text-center leading-relaxed"
    >
      Pro isn&apos;t on sale in this version of the app yet. Everything on Free
      keeps working.
    </p>
  );
}
