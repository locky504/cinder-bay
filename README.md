[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/locky504/cinder-bay/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/locky504/cinder-bay/reward.svg)](https://make.fun/c/gta6-01)

# Cinder Bay — Rain City Run

An original open-world crime game for the [make.fun GTA 6 bounty](https://make.fun/c/gta6-01):
a rainy industrial port city to explore on foot and by car, built with three.js
from plain static files — no build step, no network requests.

**The city:** Cinder Bay, three districts that open up as the story advances —
Dockside, Old Town, Uptown — with traffic, pedestrians, neon signs, shipping
containers, piers and harbour water, all in the rain at night.

**The story:** Mara Quinn, ex-courier turned getaway driver, works six missions
for her dispatcher Dex — fares, a lifted coupe, a timed courier run, a dockyard
shootout, an Uptown vault grab and the final Rain City Heist — plus repeatable
taxi fares and courier runs for cash.

**The systems:** stealable cars (E to enter, F to jack), a 0–5 star wanted level
with police cars and officers who chase and ram, pistol combat, a HUD with a
circular minimap, start / pause / wasted / finale menus, autosave to
localStorage with Continue, and fully procedural WebAudio sound and music.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

WASD walk / drive · drag mouse to orbit the camera · click to shoot · E enter a
car · F steal a car · Space brake · P pause · R restart mission · M mute.

## Layout

- `game/` — the playable game (`index.html`, `style.css`, `src/*.js`, three.js vendored under `game/vendor/`)
- `screenshots/` — real in-game renders
- `main.ts` — the make.fun entry program (copies `game/` + `screenshots/` to `/output`, writes `dossier.json`)
- `serve.ts` — local static server for playtesting

An original game. Not affiliated with Rockstar Games or the Grand Theft Auto series.
All art, names, story and music are original. MIT licensed.
