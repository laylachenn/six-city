# six city 🏙️

a tiny open-world toronto you can get into trouble in.

steal cars, pull heists and run from the cops on real streets, from the harbourfront to north york. take a boat or the ferry out to the toronto islands ✿

## play

no build step, just serve the folder:

```
npx serve .
```

then open the page and press play.

casino rules are unit-tested:

```
npm test
```

## code

no bundler: the browser loads `src/game/index.js`, which pulls in the game modules in numbered order (`01-core.js` … `26-main.js`, each importing the one before). the rules that don't need a page (`src/casino.js`, `radio.js`, `harbour.js`, `property.js`, `gangs.js`) are unit-tested. styles are in `src/style.css`.

## controls

| | |
|---|---|
| move · drive | `w a s d` |
| shoot · punch | left click |
| aim | right click |
| weapons | `1`–`6` · scroll |
| weapon wheel | hold `q` |
| talk · buy · enter · board a ferry | `e` |
| get in / out of a car, bike or boat | `f` |
| jump · handbrake | `space` |
| radio station (in a car) | scroll · `,` `.` |
| sprint | `shift` |
| map · teleport | `tab` |
| missions & heists | `j` |
| phone · camera | `k` |
| go to an address | `/` |
| skip an hour · weather | `t y` |
| menu | `esc` |

## thank you

map data © openstreetmap contributors (odbl) · building heights & roof colours from the city of toronto (open government licence – toronto)
