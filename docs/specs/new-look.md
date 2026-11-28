# The town in its new look

Status: ready-for-agent
Serves: GOAL.md, "Glance: the world tells the truth at a glance. A red PR is a burning house, a
long wait shows in how a character stands ... Only the most urgent thing is loud", the success
lines "The three-second glance" and "You want to open it", and the Desk's "A project's lead walks
to you with its questions and its finished PR".

## Problem Statement

The town is a flat beige board with a grid of plain boxes. Houses look alike, my agents are
coloured blobs and working subagents are hats on a rack. Every wait looks the same, and a queue
snakes across a plaza. What the State now knows (a house on fire, a fire someone is handling, a PR
waiting for me, how long an ask has waited) is in the plain list, but the world draws none of it.

So the three-second glance fails. To learn what needs me and what's burning I press L and read,
and the town gives me no reason to open it when nothing is wrong.

## Solution

The town becomes the clay island I picked: a natural cove with a harbour village, toy-harbour
houses, animal folk in their role's hats, and the castle on its own grass hill with a grand stair.
Day and night follow the real clock.

At the top of the stair, in front of my throne and the Queen's, stands a stone table. A lead with
an ask walks up from its house carrying a slip and joins the line: the head at the table, the
rest down the left half of the stair, oldest highest. Only the head of the urgency list waves its
white-and-red signal flag, so it is the one loud thing. The others hold their flags up and still,
and each waiting lead's house flies a small still flag. A burning house shows big flames and a tall
dark column when it is the loud thing, and smaller flames otherwise. A lead with a finished PR lays
its parcel on the pile beside the Queen's seat and walks home. When I ask the Queen for her word,
she leans over the table and writes. Everything else is still unless it is working, walking or
waiting long enough to fidget.

The plain list, the cards, the keys and the classroom work as before. The town draws on the four
approved shaders at 30 fps when calm.

## User Stories

**The island**

1. As a user, I want the town to be one island in open sea that fades into haze, so that it reads
   as a toy on a table, not a square floating in the sky.
2. As a user, I want the island shaped like the natural cove I picked (a west lobe, a lighthouse
   point, a sheltered cove with the harbour village), so that it looks natural and never symmetric.
3. As a user, I want ground coloured by height and slope (meadow, deep green, rock on steep faces,
   sand on low shores), so that the land has contour.
4. As a user, I want a stone seawall, a paved quay, a wooden pier, rowing boats that bob and quay
   clutter, so that the harbour village has the detail I liked in the harbour style.
5. As a user, I want a cobbled square with a well, benches and lamps at the village's centre, so
   that the default view has a clear middle.
6. As a user, I want trees only in groves on the hills and never within about 3 units of a house,
   a square or a door, so that trees never hide a house or a character.
7. As a user, I want lanes and stepping stones that wind with the land between the houses, the
   square and the castle, so that the walks follow real paths.
8. As a user, I want the island to hold about twelve houses with open land left for more, so that
   new projects have room.

**Houses**

9. As a user, I want each added project to be a toy-harbour house (stone footing, timber corners,
   a tiled gable roof, chimney, shuttered windows with flower boxes, a framed door with a step and
   lamp, one variant feature), so that houses are worth looking at.
10. As a user, I want each house's door and pennant in its project's colour, so that I can tell
    whose house it is.
11. As a user, I want houses in loose rows on the slope above the quay, each facing the harbour
    with a little jitter, so that the village never looks like a grid.
12. As a user, I want a house to keep its lot while the set of projects stays the same, so that I
    learn where each project lives.
13. As a user, I want white chimney puffs while anyone of a house works and none while it is still,
    so that busy and still houses differ at a glance.
14. As a user, I want a house to keep a distinct place on land when there are more projects than
    the first lots, so that no project is ever hidden.

**The folk**

15. As a user, I want each role to be an animal (lead cat, implementer beaver, explorer hare,
    tester hedgehog, reviewer owl), so that I know the job from across the island.
16. As a user, I want a subagent type that isn't one of those (Plan, general-purpose, ui-reviewer,
    any other) to be the nearest of the five animals, wearing its own type's hat, so that every
    type is drawn and the hat still says which.
17. As a user, I want every animal in its role's hat (today's hats) and the lead in a captain's
    cap, so that the lead reads as in charge.
18. As a user, I want clothes only where they help tell the role (the lead's scarf and apron in
    its project's colour, the implementer's tool belt, the explorer's pack, the tester's white
    apron), so that each lead still matches its house.
19. As a user, I want the folk at 1.2 times the old size, and me and the Queen as clay people at
    1.5, so that we two stand out among the animals.
20. As a user, I want the person I am to wear my chosen avatar preset, so that the Settings avatar
    row still dresses me.
21. As a user, I want a working character to act its role's work at its house (planing, hammering,
    ticking a clipboard, walking the track), so that working looks like work.
22. As a user, I want a stuck character to sit slumped on its own doorstep, so that stuck and
    resting differ by pose and place.
23. As a user, I want a resting lead to stand still by its door with its letter, so that I see its
    turn has ended without it calling for me.
24. As a user, I want a finished subagent to walk off down the lane and be gone within 2.5 seconds,
    so that the town clears without a jump.
25. As a user, I want idle folk to stand still, without breathing or bobbing, so that the town is
    calm when nothing happens.

**The castle and the forecourt**

26. As a user, I want the castle on its own higher grass hill (all grass, no rock), set back from
    the village, so that it is my place apart.
27. As a user, I want one broad straight stair of 16 steps from the village square to a walled
    forecourt, with lamps at its foot and top, so that the way up is clear.
28. As a user, I want my throne and the Queen's side by side behind a stone table with a purple
    runner, mine on the left and hers lower, round-backed and teal on my right, so that she has her
    own seat and never takes mine.
29. As a user, I want to sit still on my throne, so that I am not one more moving thing.

**The line and the flag**

30. As a user, I want a character with an ask to walk from its house across the square and up the
    right half of the stair, carrying its slip, so that I see who is coming.
31. As a user, I want the card to open on the Desk as soon as the ask is held, never waiting for
    the walk, so that the drawing never slows an answer.
32. As a user, I want waiting characters in a line, the oldest at the table with its slip laid
    before me, the second at the stair head and the rest on every third tread down the left half,
    oldest highest, so that I can count them from the island.
33. As a user, I want a line too long for the stair to go on in order at the stair's foot, so that
    every ask has a place.
34. As a user, I want only the head of the urgency list, when it is an ask, to wave a big
    white-and-red signal flag in slow arcs, so that the one loud thing moves and nothing else does.
35. As a user, I want the rest of the line to hold their signal flags up, unfurled and still, so
    that they are seen but quiet.
36. As a user, I want each house with a character in the line to fly a small still signal flag by
    its pennant, so that from the village I see whose lead is up at the castle.
37. As a user, I want a climbing character to hold its flag up and still, and start waving only
    once it is the head at the table, so that the loud thing doesn't jump about.
38. As a user, I want the ask's red to be a crimson with a white hoist, apart from fire's
    red-orange, so that a flag never reads as fire.
39. As a user, I want the head to stand while it waves and the rest to act their wait (tapping from
    2 minutes, sitting from 10, asleep from 30), so that a long wait shows in how a character
    stands.
40. As a user, I want an answered character to lower and furl its flag and walk home empty-handed
    down the right half of the stair, and its house flag to come down, so that the answer shows.
41. As a user, I want the next head to start waving the moment the first is answered and step up
    to the table, so that the loud thing passes on at once.

**Fire**

42. As a user, I want a burning house that is the loud thing to show big flames and a tall dark
    smoke column seen from across the island, so that I find it in a second.
43. As a user, I want a burning house that is not the loud thing to keep smaller flames and a short
    grey plume, so that it is findable when I look but doesn't compete.
44. As a user, I want a handled fire to show a small flame, white steam and its lead throwing water
    from a bucket, so that I see someone is on it.
45. As a user, I want a fire under fog to show its quiet fire, frozen, so that it says "last seen"
    and is never loud.

**Parcels and the Queen**

46. As a user, I want a PR that has finished its checks (green or none) to sit as a parcel tied in
    its project's colour on a pile beside the Queen's seat until it is merged or closed, so that
    finished work is brought to me.
47. As a user, I want a PR whose checks are running or failed to stay at its house's doorstep, so
    that only finished work goes up the hill.
48. As a user, I want the house's lead to carry a newly finished parcel up the stair, lay it on the
    pile and walk home, when it is free to, so that "a lead walks to you with its finished PR".
49. As a user, I want a parcel with the Queen's review ready to carry her teal-sealed note on top,
    so that I see which reviews are ready.
50. As a user, I want parcels stacked once three or more are on the pile, so that the pile stays
    tidy.
51. As a user, I want the Queen to lean over the table and write while her word on a card is asked
    for, so that I see she is working on it.
52. As a user, I want the Queen to read a parcel in her lap while she reviews a PR or works on
    something else, so that busy reads differently from writing my word.
53. As a user, I want her note to lie on that character's slip when her word is ready, and her to
    sit still, so that ready reads as still.

**Light**

54. As a user, I want day, dusk and night by the real clock, with sunrise at 06:30 and sunset at
    19:30 every day and the light always from my side, so that the town feels alive at any hour.
55. As a user, I want dusk orange with windows and lamps lit, and night deep blue with stars, a
    moon, glowing windows and lamps and the lighthouse shining, so that night is cosy and still
    readable.

**Looking and picking**

56. As a user, I want the island view framed so that the village and the castle are both in the
    sharp band of the tilt-shift, so that I see both at once.
57. As a user, I want clicking a house to open its classroom, a character its panel, a parcel its
    PR pane or the Queen's review, and the Queen her panel, as today, so that the new look keeps
    every way in.
58. As a user, I want the arrow keys to move the mark between the houses on the island by screen
    direction, so that the keyboard map works in the new layout.
59. As a user, I want the marked house to show a thin still white ring round its footing and its
    name plate beside the roof, so that the mark is quiet and never looks like the loud thing.
60. As a user, I want hover plates as today, so that I can find a name without words on the town.
61. As a user, I want no visible words in the town, so that the world stays a picture.
62. As a screen-reader user, I want the hidden list to say for each character where it is (in the
    line and its place, waving the flag, walking) and for each parcel whether it is at the castle
    or at its house, so that the list tells what the picture shows.

**Quiet and fast**

63. As a user, I want the town to draw at 30 fps when calm and 60 while something walks, the
    camera moves or I point or press keys at the town, so that it is smooth when it matters and
    cheap when not.
64. As a user, I want typing in a terminal not to count as using the town, so that the town stays
    at its calm rate behind a shown terminal.
65. As a user, I want nothing drawn while the window is hidden, so that Funtown costs nothing in
    the background.
66. As a user, I want nothing to move or wave while the page has lost the server, so that nothing
    looks loud when nothing can be answered.
67. As a user, I want a known ask to stay loud while only the session list fails, so that a card
    that still works keeps calling.
68. As a user, I want the classroom to look as it does today, so that the new look doesn't redraw
    what the Yard replaces next stretch.

## Implementation Decisions

**The pure town model (seam 1)**

- `layout` stays the one pure function from the State to what the town shows, and grows. It takes
  the town, the urgency list, the page's clock and whether the page has lost the server, and gives
  every placed thing in world coordinates with how it looks. Same input, same output. Keys stay
  stable across frames, so the scene moves a thing rather than remaking it. The scene draws only
  what `layout` gives, and the hidden list reads the same output. Working it out in the page beat a
  server-side "scene" (a contract change for a look).
- A placed thing says:
  - **a house:** its lot and facing, its colour, whether it is busy (chimney puffs), its fire
    (`none`, `handled`, `burning-loud`, `burning`, `last-seen`), whether its house flag flies, and
    whether it is marked;
  - **a character:** its animal, hat and clothes; its pose (`work`, `stand`, `stuck`, `rest`,
    `wait`, `walk-up`, `walk-home`, `leave`); for a wait, its place in the line and its posture
    (`stand`, `tap`, `sit`, `asleep`); what it carries (`slip`, `parcel`, nothing); and its flag
    (`wave`, `still`, `furled`, none);
  - **a parcel:** on the pile (with its stack place) or on its house's doorstep, with or without the
    Queen's note;
  - **you:** your throne and your avatar preset;
  - **the Queen:** her seat and her state (`idle`, `asked`, `busy`, `ready`), and on `ready`, which
    character's slip her note lies on.
- The walks come from the difference between two layouts. When a character's place changes
  between the line and its house, or a parcel moves from a doorstep to the pile, the scene walks
  the character there along a route. The route comes from a pure function from a start to an end:
  door, lane, square, stair foot, the right half of the stair, the forecourt. It has heights from
  the ground and is drawn at today's walking speed. The walk is drawn only and never delays a card.
- **Animals by role**, one pure function beside today's hat function: the lead is a cat;
  `implementer`, `general-purpose` and any type not listed are beavers; `explorer`, `Explore` and
  `Plan` are hares; any type with "test" in it is a hedgehog; any type with "review" in it is an
  owl. The hat stays today's hat for the type, except the lead, which wears the captain's cap.
  Clothes follow the five named roles only: the lead's scarf and apron, the implementer's tool
  belt, the explorer's pack, the tester's white apron. The user picked "nearest of the five" over a
  sixth animal, because nothing new needs drawing and the hat still tells the type.
- **The line:** the characters whose pose today is "queue" (needs you, not stuck, turn not ended),
  in urgency-list order. Places: the table, then the stair head, then every third tread down the
  left half of the stair, oldest highest. The rest stand in order in a short row at the stair's
  foot, on the square. The line is drawn as one ordered list, so the island shows the urgency
  list's asks as they are.
- **The loud thing in the world:** the head of the urgency list, when it is in tiers 1 to 3 and the
  page has not lost the server. An ask: the head of the line waves. A burning house: its loud fire.
  A stuck character: today's dizzy stars over its slumped head, moving; other stuck characters are
  still. At most one thing is loud. While only the session list fails, a known ask stays loud, as
  the urgency list already has it.
- **Wait postures:** from the card's or the character's `since`: standing under 2 minutes, tapping
  from 2, sitting from 10, asleep from 30. The head always stands while it waves. The thresholds
  are one constant each.
- **Fire,** from the house's Glance (`glanceOf`): `burning-loud` when the house is the head of the
  urgency list; `burning` when it burns but is not the head; `handled` when a lead works (that
  lead's work pose becomes throwing water from a bucket); `last-seen` when it burns under fog,
  which shows the quiet fire, frozen. Fog itself is not drawn. Its look is out of this stretch by
  the user's word, and the "can't see" icon and the plain list already say it.
- **Parcels:** an open PR with checks green or none lies on the pile beside the Queen's seat. One
  with checks running or red stays on its house's doorstep, as today. The pile beat "only the PRs
  waiting for you" because a parcel stays until the PR is merged or closed (the user kept that
  pick), while "waiting for you" drops out whenever a lead works.
  - The carry: when a parcel goes from a doorstep to the pile, or first appears on the pile, its
    house's first lead carries it up if that lead is listed and neither in the line nor stuck.
    Otherwise the parcel just appears.
  - A parcel never carries a flag and is never loud. It stacks from three on.
- **The Queen:**
  - `asked` while any card's `word` is queued or writing: she leans over the table and writes, and
    moves.
  - `busy` while the steward's lead is working and no word is being written: a parcel open in her
    lap, read with a glass, and moves.
  - `ready` while a card's word is ready: still, her note on that character's slip.
  - `idle` otherwise, still. With no steward listed she sits idle.
  - The covered throne ("switched off") is left out: no State field says she is off, and no field
    is added for a look.
- **You:** a clay person at 1.5 on your throne, in your avatar preset's coat, skin and hat
  (absent or unknown: the king). Still.
- **Lots:** an ordered list, house i in town order on lot i. The first twelve are the sketch's
  lots, with lots 2 and 6 nudged clear of the stair's foot. At least twelve more go on the open land
  (the hamlet and the farm), and past the last lot a fallback row on open meadow. Lots by house
  order beat lots saved per project, because they need no new file. A house can move when a
  project is removed. Houses that grow are a later stretch.
- **The steward's house** gets no building unless it is added or another lead works there, as
  today. The Queen sits at the castle, and her subagents work in a small yard beside the castle.
- **Light by the clock:** a pure function from the local time to the light. Night until 06:00,
  dawn from 06:00 to 07:00, day from 07:00 to 19:00, dusk from 19:00 to 20:00, then night. Sunrise
  (06:30) and sunset (19:30) are the middles of their bands. Windows and lamps are lit from dusk to
  dawn. The light always comes from the viewer's side. The page reads the clock once a minute.
- **The frame pace:** a pure function from what is going on to a frame rate. 60 while anything walks,
  the camera eases, or the pointer or a key acts on the town (keys typed in a typing place, a
  terminal included, don't count). 30 otherwise. 0 while the window is hidden or the page has lost
  the server, apart from one frame on a resize.
- **Stillness:** only these move: the waving head's flag, working characters and the working Queen,
  chimney puffs, an acted wait (tapping), walking characters, a loud stuck character's stars, the
  flames and smoke of a fire not under fog, the sea and the bobbing boats. Pennants, the line's
  flags, house flags, idle folk, you and the idle Queen are still.

**The scene (drawn, not unit-tested)**

- React-three-fiber stays the frame. Every repeated part (house parts, roofs, folk bodies, hats,
  clothes, props, cobbles, tufts, trees, flags' poles) is one instanced mesh per kind, moved each
  frame by mutation, not React state. The aim is about 24 part kinds, plus the terrain, the sea,
  the sky and the post passes. This follows "The drawing stack and the app shell"; the sketches'
  one-mesh-per-part houses are rebuilt as instanced parts.
- **The four shaders in one module:** the sea (depth colour and foam from a small height texture of
  the island), the sky (by the hour), the ink outline (an inverted hull on characters only, pushed
  out along smooth normals, with an instanced variant) and the tilt-shift (four passes, horizontal
  and vertical twice). No other custom GLSL. The flag's ripple moves the cloth's points on the CPU.
  Fire, smoke, steam, glow and stars are parts and sprites.
- **Post:** a multisampled render target, the tilt-shift, then the output pass for colour space,
  from three.js's own add-ons. There is no new package.
- **Light:** one warm sun with one 4096 shadow map over the whole island, a sky-and-ground fill that
  follows the hour, fog in the horizon colour, and additive glow sprites at night.
- **Terrain:** one mesh of up to about 400 by 400 segments with vertex colours. The castle hill is
  painted grass at any slope, with a deeper green on its steep parts and no scattered rocks. Its
  numbers (top 4.2, the castle set back 1.8, 16 steps of 0.24, the forecourt about 10 by 4.5) live
  in one module so they can be tuned.
- **The ask flag:** the waved flag is 1.35 by 0.88 on a pole 2.2 above the grip, in the lead's own
  scale. A still flag in the line is held upright at the lead's side. A house flag is 1.0 by 0.66
  on a 2.3 pole by the house's pennant. Crimson #d6283f at the fly and white at the hoist. It
  sweeps from upright to well out to the side, away from the thrones.
- **The camera:** the island view fits the window as today's fit does, framed a little high, with
  the tilt-shift's sharp band raised so the castle and the village are both sharp. No orbiting and
  no leaning toward the loud thing.
- **Doors for the arrows:** each house's door point is read on screen from its lot and the ground's
  height, so the existing `nextHouse` works unchanged.
- **The classroom keeps today's kit and look:** its figures, hats, outline and light. Inside it the
  island's sea, sky and post passes are not drawn. Today's town-only parts (the desk, the hat racks,
  the board the town stands on, the king's bob) go.
- **The kit page** shows the new folk (each animal in its hats and clothes), the captain's cap, the
  ask flag in its three modes, and a house, beside today's classroom parts.
- **Colours:** project colours stay today's palette (`colourFor`), shared with the work view. Fire
  is the one red-orange. The ask is crimson with white. Gold is not reserved for anything.

**Docs on this branch**

- ADR 0008, "Role sets the animal; the project sets the colour; you and the Queen are people", the
  user's pick from "Houses and characters in the new look".
- GLOSSARY.md gains: Island, Castle, Harbour village, Castle hill, Grand stair, Forecourt, Animal
  folk, Parcel, Slip, The walk, The table, Your throne and the Queen's seat, The line, The ask flag,
  The house flag, Quiet sign, Last seen.
- The CLAUDE.md map lines for `web/src/town/` and `kit/` are updated by the tickets that change
  them. No contract line and no "Decisions that bind" line changes.

## Testing Decisions

- A good test drives the public seam and checks what the user would see or be told. It never
  checks a mesh, a material or a pixel. Each test's name says the break it catches.
- **Seam 1, the pure town model, in Vitest** (like `tests/town/layout.test.ts`, `glance.test.ts`
  and `urgency.test.ts`):
  - houses on distinct lots on land, in house order, past twelve and past the last lot, never on
    the stair, the square or the castle hill;
  - animals, hats and clothes for every role and for unlisted types; the lead's captain's cap;
  - the line's order and places (the table, the stair head, every third tread on the left half,
    then the stair's foot);
  - only the head waves, and only when it is the loud thing; the others still; house flags exactly
    for houses with a character in the line; no flag waving while lost; an ask still loud while
    only the list fails;
  - wait postures at 2, 10 and 30 minutes; the head always standing;
  - each fire form from the Glance and the urgency list; `last-seen` under fog;
  - parcels on the pile (green or none) or on the doorstep (running or red), stacking from three,
    and the Queen's note;
  - the Queen's four states and their precedence; you in your preset;
  - stuck on the doorstep, resting by the door, done gone;
  - the route: it starts at the door, ends at the place, climbs only the right half of the stair
    and stays on land at the ground's height;
  - the hill is grass at any slope; light by the hour at the band edges; the frame pace for each
    case (hidden, lost, walking, interacting, typing in a terminal, calm).
- **Seam 2, the town page, in Playwright** on the stubbed state stream (like `village.spec.ts`,
  `arrows.spec.ts` and `glance.spec.ts`):
  - the canvas draws with WebGL2 and logs no console errors and no failed requests;
  - no visible words on the town;
  - the hidden list names every house, character and parcel with its project, role, stage and its
    place (in the line and where, waving, at the castle or at its house);
  - clicking a house, a character, a parcel and the Queen opens what it did before;
  - the arrows move the mark across the island's houses, and Enter goes in;
  - Esc's layers; the classroom still opens and looks as before;
  - the kit page draws with no errors.
- **Tests that change on purpose:** the layout tests that pin today's grid, queue snake, rack pegs
  and desk; the village and town specs where they name the queue or the rack; the kit spec. The
  classroom tests stay as they are.
- **Live check, once at the end, on a quiet Mac in Chrome:** the frame rate calm (30) and moving
  (60), and draw calls per frame on a town of twelve houses with an ask, a line of three, a burning
  house and a parcel pile, the four shaders and the 4096 shadow map on. It is measured by a
  throwaway script under `.scratch/` that counts the GL context's draw calls and the frames, with
  no hook in the product. Day, dusk and night are looked at once.
- **Commands:** `npm test` (lint, build, Vitest, Playwright). Vitest alone with `npx vitest run`,
  and Playwright one spec at a time.

## Out of Scope

- Fog's look in the town (the veil, pale houses, sketch-ink folk): skipped by the user for this
  stretch.
- The sunbeam, the gulls, the castle tower flag, the camera leaning in, and B's hand cart.
- The Queen's covered throne when she is switched off, and "away" (your crown on your cushion):
  there is no signal for either.
- A sixth animal for unlisted subagent types.
- The classroom's redraw and the Yard; weeds; weather; houses that grow; saved lots per project.
- Outside art of any kind; WebGPU; any shader beyond the four.
- The stats panel (spec 5) and the app's shell (next stretch).
- Any change to the State, the contracts or the urgency list's rules.

## Further Notes

- The planning notes this spec is built from are in the local planning folder: the world's look,
  houses and characters, how each Glance state shows in the world, the walk to the castle and the
  Queen's seat, the flag, the table and the line, the drawing stack and the app shell, a terminal
  that feels real (item 9), and the spec list (spec 4, its gate and disagreements 6, 7 and 9 to 12).
  They are untracked. The builders start from the sketches' source there: the forecourt and line,
  the flag, the captain's cap in the costume table, and the hill and stair.
- **The user's picks:**
  - The clay island, A7 Natural cove, the harbour style, a bigger island, and day and night by the
    clock.
  - Toy-harbour houses, animal folk with the role setting the animal, folk at 1.2, and you and the
    Queen as people at 1.5.
  - The grand stair, and the higher all-grass hill ("This is what I meant", for the hill, the hats
    and the two people).
  - The captain's cap, and stillness.
  - The classroom kept as it is, and the parcel laid at the castle.
  - The table with the line ("I like C but I like the first picture in B for that they stay in a
    line").
  - "C Signal flag", "Piled by the Queen's seat" and "Leans over the table".
  - On 2026-11-28: the two existing test seams, and the nearest of the five animals for other
    types.
- **What the user has not seen as one picture:** the combined pick (the signal flag, the pile by
  her seat and her leaning over the table) is drawn only on a page they did not see. Night and dusk
  with these parts were never drawn, and neither were the hamlet's lots, other types as the nearest
  animal, or the parcels left at the doorstep.
- **Smaller picks never reviewed, taken here as defaults:**
  - clothes only where they tell the role, and the lead's scarf and apron kept under the cap;
  - the Queen moves when asked and is still when ready;
  - the hill's numbers;
  - the walk never delays a card;
  - a known ask stays loud while only the list fails;
  - stuck on the doorstep and resting by the door;
  - a burning house that isn't the head keeps visible flames;
  - the toque and the top hat;
  - the flag's sizes, the crimson, the line's places, and the next head waving at once.

  Each is one constant or one function.
- **Decided here, not by the user:** a loud stuck character shows today's dizzy stars, since the
  sunbeam that carried it is gone. Other decisions made here: parcels with running or failed
  checks stay at the house; the line past the stair waits at the stair's foot; lots go by house
  order; and the Queen sits idle when no steward is listed.
- **Risks:**
  - The four shaders, the 4096 shadow map and the instanced kit have never been timed together on
    the full island.
  - The sketches are throwaway code to be rebuilt as instanced parts.
  - Walks on terrain have to be built.
  - A heavier scene in the tests' headless browser may slow or destabilise the Playwright run. A
    slow or flaky spec is measured, not blamed on load.
- **Size:** the spec list estimated 11 to 13 build tickets. If the tickets go past about 13, split
  them in two: the world, houses and folk first, then the states, the line, the walk and the seat.
