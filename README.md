# Dylan Dyal — personal webspace

Y2K-style portfolio: WebGL fluid background, a Web Audio synth, and a draggable reaper. Hosted with GitHub Pages from `main`.

Live: https://dylan3737.github.io/y2k-site/

## Layout

Plain HTML, CSS and JavaScript modules. There is no build step: GitHub Pages serves the files as they are.

| File | What it does |
|---|---|
| `index.html` | The page |
| `style.css` | All styles |
| `404.html` | The "Lost" page GitHub Pages shows for missing paths |
| `js/main.js` | Entry point; loads the modules below |
| `js/store.js` | Safe `localStorage` access and the reduced-motion flag |
| `js/theme.js` | Dark and light themes |
| `js/fluid.js` | The WebGL fluid and its effects |
| `js/audio.js` | The synth, the songs and the Music Box |
| `js/games.js` | The game ring and its cards |
| `js/ui.js` | Nav, dialogs, copy buttons, cursor and click effects |
| `js/reaper.js` | Dragging, roaming, resting and idle lines |
| `js/actions.js` | His actions, soul, and the ghost-catching round |
| `js/rites.js` | Rites and the Grimoire |

## Working on it

The modules need a web server (browsers won't load them from `file://`).

```bash
npm install
npm run serve   # http://127.0.0.1:8080/y2k-site/
npm run lint
npm test        # browser smoke tests in headless Chromium
```

`npm test` needs Chromium for Playwright (`npx playwright install chromium` the first time).
When you change `style.css` or `js/main.js`, bump its `?v=` number in `index.html` so returning visitors get the new file.
