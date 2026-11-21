# Leagues, challenges and Spaces from the first day (App1 Q6)

Before (`origin/main` at `e2417edc`) and after, from the branch
`claude/q6-show-filling-up`, 18 November 2026, at 393 pt in both themes,
device scale 2, Reduce Motion on.

Captured without the emulator rig, which needs the Firebase CLI this
sandbox does not have. A throwaway Vite page rendered the real
`CommunityView` (Together) and `League` page from each tree on the
repo's Firestore fake (`__mocks__/firebase/firestore.ts`), with auth,
the Firebase app and callables stubbed, for an account that joined
nothing on a Tropos below 10 people:

- `leagueStatus/current`: `{ joined: 4, needed: 10, open: false }`
- the weekly challenge with 1 joined, the month's challenges with 0 and
  2, the community goal at 23.4 km from 2 runners
- Spaces with 0 to 2 members; no Circle

Files:

- `before-together-393-{light,dark}.webp`: #3322's quiet Together, only
  Circles.
- `after-together-393-{light,dark}.webp`: This week (the weekly
  challenge saying "Filling up" with Join challenge, the league card),
  Circles, Discover (races, Spaces saying "Filling up", the community
  goal, the challenges to join).
- `after-league-card-393-{light,dark}.webp`: "The league starts once 10
  people have joined. 4 so far." over a bronze bar, with Join the league.
  Before, the card drew nothing, so there is no before frame.
- `after-spaces-directory-393-{light,dark}.webp`: Discover with the
  search, the race chips and rows, and each Space's card. Before, the
  directory drew nothing.
- `before-league-393-{light,dark}.webp` and
  `after-league-393-{light,dark}.webp`: `/league`. Before, the page sent
  someone who had not joined back to Together (blank here, as the harness
  has no Together route); after, the join card with the same line.

No element runs past the screen in any after frame.
