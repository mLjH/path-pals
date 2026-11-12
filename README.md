# Path Pals

A tap-to-plan puzzle for young children. Tap squares to place arrows, press Go, and the character walks the plan. There are 50 levels: four worlds (5 on 3x3, 10 on 4x4, 10 on 5x5, 15 on 6x6) and a bonus world of 10 where each character has its own snack to reach while still sharing one set of arrows. No reading needed.

Eight characters, each with its own food: baby emperor penguin (fish), toucan (peanuts), hornbill (fig), otter (shellfish), panda (bamboo), shark (squid), baby seal (milk) and bubble tea (its straw). Each level picks its characters at random. Tap a character to swap it for another; on levels with several characters there are never two of the same, and the goal changes to show the food of whoever is playing.

## Put it on the iPad

1. Host the `dist/` folder on any static HTTPS host. On GitHub Pages: push this whole project to the repository, then set **Settings › Pages › Build and deployment › Source** to **GitHub Actions**. The workflow in `.github/workflows/pages.yml` checks the levels, rebuilds `dist/` and publishes it on every push to `main`. (Pages' "Deploy from a branch" option can only serve the repository root or a `docs` folder, not `dist`, which is why the workflow is used.)
2. On the iPad, open the address in Safari, tap Share, then **Add to Home Screen**.
3. Open it from the home screen once while online. After that it opens full screen and works offline.

To keep your child inside the game, turn on Guided Access (Settings › Accessibility › Guided Access), open Path Pals, then triple-click the top button (or Home button).

To try it on your Mac first: `cd dist && python3 -m http.server 8000`, then open http://localhost:8000.

## Grown-ups panel

Press and hold the gear for about a second. You can turn sound and voice prompts on or off, choose which arrows a tap cycles through (all four, the default, or only the ones the level needs), choose when hints appear (after 2 tries, 3 tries, or never), open all levels, show a hint now, and reset progress. Progress is saved in the browser on that device.

Tap a square to cycle its arrow, or swipe across it to point the arrow that way. Hints start from what is already on the board: they show the one square to change that gets every character home with the fewest changes, keeping the child's own arrows wherever possible.

The game plays sound as media, so the in-game Sound setting is the mute control. It plays even when the iPad is in silent mode.

## Working on it

Everything is plain JavaScript with no dependencies. You need Node 18 or newer.

```
node tools/generate-levels.js   # rebuild src/levels.json (seeded, so it gives the same levels each time)
node tools/test.js              # check every level is solvable, and that following hints always wins
node tools/build.js             # write dist/ (the site) and build/artifact.html (single-page preview)
```

| File | What it holds |
| --- | --- |
| `src/engine.js` | Movement rules, the solver and the hints (`fixFor` finds the smallest change to the child's board). Pure functions, shared by the game and the tools. |
| `src/levels.json` | The 50 levels (positions only; the game picks the characters). |
| `src/art.js` | All characters, foods, obstacles and icons as inline SVG. |
| `src/sound.js` | Synthesized effects and animal calls (Web Audio). |
| `src/game.js` | Board, play, map, celebrations, progress and settings. |
| `src/base.css`, `src/ui.css` | Styles, including the four world palettes. |
| `src/body.html` | Page markup. |
| `src/sw.js`, `src/manifest.webmanifest`, `src/icons/` | Offline support and home screen install. |

### Level format

Each level in `src/levels.json` looks like this:

```json
{ "world": 1, "grid": ["S..P", ".R..", "....", "G..R"],
  "animals": [{ "x": 0, "y": 0, "dir": "right" }],
  "allowed": ["down", "left"] }
```

Grid letters: `.` floor, `S` start, `G` shared goal, `g` a goal that belongs to one character, `R` rock, `T` tree, `P` poo. On bonus levels each entry in `animals` has a `goal` (`{ "x": 3, "y": 0 }`) pointing at its own `g` square, and a `stage`: `apart` (routes never touch), `share` (routes use a square in common) or `tangle` (solving each character alone and combining the arrows does not work). A character walks straight over a friend's `g`. `allowed` is the set of arrows a tap cycles through, in the order right, down, left, up. Characters never start facing up, so the child always sees their face. Put one to three entries in `animals`; with more than one, they share the same arrows and the goal tile shows all their foods together. Levels don't name characters or a goal food; the game chooses those when the level starts. The first level also has `tappable`, `intro` and `say` for the guided first move.

You can edit levels by hand. Run `node tools/test.js` afterwards to make sure each one can still be solved.
