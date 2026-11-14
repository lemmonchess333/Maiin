# Slice 4: a lift day past its length, said on Train

12 November 2026. The owner chose B from `options-a-b-c.webp`: a notice
under the day's card with the day's real minutes, "Rebuild for 45 min" and
"Keep this day". A put a row at the top of the day list and took the
card's action slot, so Start workout went; C put a line inside the card
with one button and no way to say no.

Captured from the app's own `SessionCommandCard` and `OutgrownDayNotice`
in a scratch page on the dev server, since Train needs a signed-in account
and this workspace has no emulator. The card's 95 minutes is the owner's
12-lift Pull A against his 45-minute sessions.

| File                         | What                                                         |
| ---------------------------- | ------------------------------------------------------------ |
| `before.webp`                | Today: the card says about 95 min and nothing else does      |
| `after-dark.webp`            | The notice under the card                                    |
| `after-light.webp`           | The same, light theme                                        |
| `after-320-larger-text.webp` | 320 pt wide at 1.35× text: the buttons stack, nothing spills |
| `confirm.webp`               | Rebuild asks first, and says what stays and what may go      |
| `options-a-b-c.webp`         | The three directions put to the owner                        |
