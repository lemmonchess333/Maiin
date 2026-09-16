# Marathon coverage expansion — 15 September 2026

Adds 16 confirmed marathons to the previous 18: 34 full marathons, 42 race spaces and 50 total spaces. UK remains the default country; six additional country options expose the international additions. All three client, Firestore and account-deletion allowlists change together.

Dates checked against organiser pages on 2026-09-15. Photos, where available, show the destination rather than an official future course.

| Event                                 | Date       | Location                | Official source                                                                               |
| ------------------------------------- | ---------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| Richmond Marathon                     | 2027-09-12 | Richmond, GB            | [Organiser](https://run-fest.com/events/richmond-marathon/)                                   |
| Marathon Eryri                        | 2026-10-24 | Llanberis, GB           | [Organiser](https://www.marathoneryri.com/)                                                   |
| Windermere Marathon                   | 2027-06-13 | Windermere, GB          | [Organiser](https://www.windermeremarathon.co.uk/)                                            |
| Shakespeare Marathon                  | 2027-04-25 | Stratford-upon-Avon, GB | [Organiser](https://www.runthrough.co.uk/event/shakespeare-marathon-half-marathon-april-2027) |
| Portsmouth Coastal Waterside Marathon | 2026-12-20 | Portsmouth, GB          | [Organiser](https://www.fitprorob.biz/)                                                       |
| The Wales Marathon                    | 2027-07-04 | Tenby, GB               | [Organiser](https://www.activitywalesevents.com/events/run/the-wales-marathon)                |
| Tokyo Marathon                        | 2027-03-07 | Tokyo, JP               | [Organiser](https://www.marathon.tokyo/en/participants/guideline/)                            |
| Sydney Marathon                       | 2027-08-29 | Sydney, AU              | [Organiser](https://www.tcssydneymarathon.com/)                                               |
| Valencia Marathon                     | 2026-12-06 | Valencia, ES            | [Organiser](https://www.valenciaciudaddelrunning.com/)                                        |
| Amsterdam Marathon                    | 2026-10-18 | Amsterdam, NL           | [Organiser](https://www.tcsamsterdammarathon.eu/program)                                      |
| Rotterdam Marathon                    | 2027-04-11 | Rotterdam, NL           | [Organiser](https://nnmarathonrotterdam.nl/en/register/nn-marathon-rotterdam-2/)              |
| Rome Marathon                         | 2027-03-14 | Rome, IT                | [Organiser](https://www.runromethemarathon.com/en/)                                           |
| Barcelona Marathon                    | 2027-03-14 | Barcelona, ES           | [Organiser](https://zurichmaratobarcelona.es/en/)                                             |
| Seville Marathon                      | 2027-02-21 | Seville, ES             | [Organiser](https://www.zurichmaratonsevilla.es/en/)                                          |
| Cape Town Marathon                    | 2027-05-23 | Cape Town, ZA           | [Organiser](https://capetownmarathon.com/)                                                    |
| Nice–Cannes Marathon                  | 2026-11-08 | Nice to Cannes, FR      | [Organiser](https://www.marathon06.com/2026/AN/)                                              |

## Remaining coverage

- Blackpool: verify the next edition against an accessible organiser page before adding.
- Great Welsh: the organiser advertises 17 October 2027 but the relocated venue is not yet confirmed; do not reuse the old Pembrey location.
- London 2027: the organiser now advertises a two-day edition, 24–25 April. The existing single-day event model needs a separate update so training goals use the runner’s allocated day.
- Destination images for this batch: Unsplash and Pexels blocked automated downloads with bot-verification pages during this session. Use the existing designed photo-free fallback until licensed files have been downloaded and inspected; never substitute generated real places.

This is a curated expansion, not an exhaustive worldwide marathon directory. New race IDs and bundled images require a new native build; the remote event override sync only updates IDs known to an installed binary.

## Bundle budget

The 16 additional metadata blocks increase the `spaceDefs` chunk from 9868 to 15217 bytes. Only that chunk budget and the corresponding total delta are updated; no other size limits change.

## Related missing coverage corrected

The coach prompt classifier still recognised only the original 12 races. Added both the previous 14 marathons and this batch to its race-preparation bank, with a catalogue parity test to prevent future omissions. This does not send any messages during the update; the existing scheduled coach-post workflow uses the corrected classification.
