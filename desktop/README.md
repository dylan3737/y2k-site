# Reaper: a desktop companion

The reaper from the webspace, loose on your desktop. He floats around your screen, naps when you step away, and holds a ring of abilities, some useful and some just for show. There is an idle game in him too: the souls you earn raise skeletons, and they dig up more while you're away. He can also talk: ask him things and he answers in character, using Claude or a free model that runs on your own computer. While he's at it he can set reminders and timers, look at your screen, work with your clipboard, and remember things about you.

He lives in a transparent window that stays on top of everything. Clicks pass through to your apps everywhere except on the reaper himself and on his effects.

## Getting him

**[Download the latest release](https://github.com/dylan3737/y2k-site/releases/latest)** and pick the file for your computer:

| Computer | File |
|---|---|
| Mac with Apple silicon | `Reaper-…-mac-arm64.dmg` |
| Intel Mac | `Reaper-…-mac-x64.dmg` |
| Windows | `Reaper-…-win-x64.exe` |
| Linux | `Reaper-…-linux-x86_64.AppImage` |

The builds aren't code-signed, so the first launch needs one extra step:

- **macOS:** right-click the app and choose **Open**.
- **Windows:** choose **More info**, then **Run anyway**.
- **Linux:** mark the AppImage as executable first.

Or run it from source:

```bash
cd desktop
npm install
npm start
```

## Handling him

| Do this | And he… |
|---|---|
| Click him | opens his ring of abilities |
| Right-click him | shows the tray menu |
| Drag him and let go gently | kneels and rests; soul refills fast |
| Fling him | flies off, bouncing off the screen edges, or onto the next monitor through an edge it touches |
| Drag him past the edge of a monitor and let go | lands on the monitor next to it |
| Drop files on him | eats them: they go to the Trash or Recycle Bin, so you can still get them back |
| Rub the cursor back and forth over him | reacts (grudgingly) |
| Leave the computer for 3 minutes | falls asleep, and tells you how long you were gone, and what the skeletons dug up, when you're back |
| Start the day | greets you with how many reminders are due today |
| Press **Ctrl+Alt+R** (**⌘⌥R** on a Mac) | vanishes and reappears at your cursor, even on another monitor |
| Press **Ctrl+Alt+Space** (**⌘⌥Space**) | appears at your cursor with Speak open |

The tray icon has the same commands, plus:

- **Mind:** whose mind Speak borrows: Claude, a local model, or none. See [Speak](#speak).
- **Wander:** on or off.
- **Talk on his own**
- **Sounds:** turn his sounds on or off.
- **Skeletons on screen:** show or hide the skeletons. Hidden ones still dig.
- **Roam between screens:** on or off. Only offered with more than one monitor. See [More than one monitor](#more-than-one-monitor).
- **Hide**
- **Open at login:** macOS and Windows only.
- **Forget what he remembers**
- **Forget API key**
- **Quit**

## More than one monitor

With several monitors, he roams across all of them. Wherever the edge of one monitor touches another, there's a doorway: now and then he wanders through it, a fling carries him through, and you can drag him across.

- He comes out at the same place on your desktop, so with monitors of different heights (portrait, landscape, portrait, say) he only crosses where they actually meet.
- Monitors with a gap between them, or that only touch at a corner, have no doorway.
- His cards, his ring, his skeletons and his reminders go with him.
- He doesn't wander off in the middle of something: while Summon or a screen effect is running, he stays put.
- **Ctrl+Alt+R** (**⌘⌥R**) still brings him to the cursor, whichever monitor it's on.
- **Roam between screens** in the tray menu keeps him on one monitor.

## Abilities

Soul is the meter under him. It refills in several ways:

- Slowly over time.
- Quickly while he rests.
- In a burst when you come back to the computer.
- When he catches ghosts or eats files.

When it's low, he fades.

| Ability | Soul | What it does |
|---|---|---|
| **Speak** | free | A chat card. Ask him anything. See [Speak](#speak). |
| **Slash** | 20 | His scythe cuts a picture of your screen in two; the halves slide apart over a void and close again. Nothing on your screen is changed. During Summon, it reaps every ghost. |
| **Shatter** | 25 | He strikes where your cursor is: the screen cracks like glass, the shards fall away over a void, then fly back into place. Only a picture breaks. During Summon, it reaps every ghost. |
| **Glitch** | 15 | A second and a half of Y2K corruption: the colours split, the screen tears into slices, blocks smear and scanlines roll, then the signal comes back. |
| **Vortex** | 25 | A black hole opens at your cursor and the whole screen spirals into it, then it spits everything back out. Loose ghosts get pulled in. |
| **Burn** | 30 | The screen catches fire at the edges and burns away like paper, with glowing embers and sparks, down to darkness; then it un-burns. |
| **Melt** | 20 | The screen sags and drips downward like hot wax in uneven columns, then snaps back into shape. |
| **Soul Rip** | 20 | The patch of screen at your cursor tears loose as a pale ghost, drifts over to him and is swallowed; the hole it left fills back in. |
| **Summon** | 25 | Ten seconds of ghosts flying across your whole desktop. Click them to catch them. Golden ones are worth three. Your best catch is saved. |
| **Hourglass** | 10 | A focus timer (5, 15, 25 or 50 minutes). Sand drains in a ring around him; hover over him to see the time left. When it runs out, a bell rings, you get a notification, and he offers a 5-minute break or another round. |
| **Raven** | 5 | A reminder. When it's due, a raven flies in with your note, and you get a notification. Snooze it or mark it done. Reminders are kept if you quit and reopen the app. |
| **Crypt** | free | Your banked souls and your skeletons. See [The Crypt](#the-crypt). |
| **Hum** | 5 | A slow minor music-box tune over a drone. Cast again to stop it. |
| **Vanish** | free | He fades into the corner and stays quiet for 30 minutes. Click him to bring him back. |

## The Crypt

The Crypt is an idle game. It banks **souls**, which are yours to keep. (The meter under him is his own soul: his energy, which drains and refills. The two are separate.)

You earn souls by using him:

| Deed | Souls |
|---|---|
| A ghost caught in Summon | 1 (3 for a golden one) |
| A file he eats | 5 |
| A finished Hourglass | 1 for each minute |

Souls raise **skeletons**. The first costs 25, and each one after costs 25% more than the last. Every skeleton digs up 1.5 souls an hour, all the time: while you work, while you're away, and while the app is shut.

- When you come back to the computer, he tells you what they dug up while you were gone.
- When the app was shut or the computer asleep, they are paid for up to 8 hours of it.
- Up to eight skeletons dig along the bottom of your screen. Clicks pass through them.

### Upgrades

Souls also buy upgrades, which change the rules instead of adding diggers. Each level costs more than the one before.

| Upgrade | Levels | What each level does | First level costs |
|---|---|---|---|
| **Sharper shovels** | 10 | Every skeleton digs 25% faster | 60 |
| **Deeper graves** | 3 | Time with the app shut pays for 12, then 16, then 24 hours | 90 |
| **Finer sand** | 3 | A finished Hourglass is worth 1.5, then 2, then 3 souls a minute | 120 |
| **Ghost lure** | 3 | 16%, then 22%, then 30% of the ghosts in Summon are golden (10% without it) | 80 |

### Milestones

There are 17 milestones, such as raising your first skeleton, catching 100 ghosts or finishing a 50-minute Hourglass. Each pays a soul bonus the first time you reach it, and he rings a bell and says so. The Crypt lists the ones still ahead, with what each pays.

### Using it

Open the **Crypt** from his ring. It has three tabs: **Dig** (your skeletons, and raising more), **Upgrades** and **Milestones**. Speak can do the same ("raise two skeletons", "buy sharper shovels", "how's the crypt?"), and so can the plain commands.

### Tuning the numbers

The rates and prices are at the top of `crypt.js`. `tools/pacing.mjs` plays the game as three kinds of user (casual, typical, heavy) and prints when each purchase and milestone lands, so a change can be judged from what it does:

```bash
npm run pacing
```

```bash
npm run pacing -- typical 60
```

The first prints a line a day for all three over four weeks. The second prints every purchase for one of them over 60 days. With the current numbers, the typical user (three 25-minute hourglasses and a round of Summon on a working day) raises a skeleton in the first two hours, has 10 by day 4 and 25 after about a month, and buys the last upgrade in week seven.

## Speak

Speak can borrow one of four minds. Choose one in the card, or any time from **Mind** in the tray menu.

| Mind | Cost | What you need | What he can do |
|---|---|---|---|
| **Free, on this computer** (the default) | Free | A one-time download of about 1.2 GB, offered in the card | Everything but Look; nothing leaves your computer |
| **Claude** | A fraction of a cent per reply | An Anthropic API key | Everything below, and the best answers |
| **Your own Ollama** | Free | [Ollama](https://ollama.com/) and a model, on your computer | Everything the model can manage |
| **None** | Free | Nothing | The [plain commands](#plain-commands) only |

The plain commands also step in when the chosen mind can't be reached: before the free mind's download, with no key, no network, or Ollama not running. With the free mind or Ollama, a clear command (a reminder, a timer, the Crypt, memory) is always done by the plain commands, straight away: they get times exactly right, which small models often don't.

### The free mind

The free mind is a small language model, **Qwen3.5 2B**, that runs inside the app on your own computer, on the graphics card where it can (Metal on a Mac, Vulkan on Windows and Linux) and on the processor otherwise. The first time you open Speak, the card offers the download; it's kept in the app's data folder, and a download that's cut off carries on where it stopped. The model is loaded when you first ask something and let go after 10 minutes unused, so he costs no memory while he's quiet.

It is slower and less capable than Claude. It can't see pictures, so Look isn't offered, and it sometimes uses an ability nobody asked for. `tools/bench-models.mjs` scores a model on Speak's own requests, which is how this one was chosen; see [Checks](#checks).

### Claude

With Claude, Speak runs on **Claude Haiku 5.5** (`claude-haiku-5-5`), Anthropic's fast, low-cost model, at low effort. The calls are made from the app's main process.

For this mind you need an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/). The first time you open Speak, paste the key into the card.

The API is billed separately from a Claude Pro or Max subscription: it runs on prepaid credits, bought in the Console under **Plans & Billing**. A new key won't work until the account has credit, and the card says so if it hasn't.

- The key is encrypted with your system keychain (Keychain on macOS, DPAPI on Windows, the Secret Service on Linux) and kept in the app's settings file. It never reaches the page.
- If there's no keychain, which is common on Linux, the key isn't saved. Set `ANTHROPIC_API_KEY` in the environment before starting the app instead. A profile saved with `ant auth login` also works.
- **Forget API key** in the tray menu removes the saved key.

### Your own Ollama

1. Install [Ollama](https://ollama.com/) and start it.
2. Download a model. This one is about 2 GB and can use his abilities:

   ```bash
   ollama pull llama3.2
   ```

3. Choose **Mind → Your own Ollama** in the tray menu.

He picks a model from the ones you have, preferring those that handle tools well. To choose yourself, pick one under **Mind** in the tray menu.

- A local model is slower and less capable than Claude, and small ones sometimes misuse an ability or miss a request.
- **Abilities** need a model that supports tools, and **Look** needs one that can also see pictures. If the model can't, he tells you and just talks.
- If Ollama runs somewhere other than `127.0.0.1:11434`, set `OLLAMA_HOST` before starting the app.

### Plain commands

These need no model at all. Type them the way they are written here, or close to it:

| Type | And he… |
|---|---|
| `remind me in 20 minutes to check the oven` | sends a raven. Also `at 3pm`, `at 15:30`, `tomorrow at 9am`, `in 2 hours`… |
| `reminders` | lists the ravens that are waiting |
| `cancel reminder oven` | calls back the raven whose note mentions "oven" (`cancel all reminders` for every one) |
| `25 minute timer`, `pomodoro` | turns the hourglass |
| `stop timer` | stops it |
| `how did today go` | gives today's tally |
| `crypt` | counts your souls and skeletons |
| `raise a skeleton`, `raise 3 skeletons` | raises them, if the souls allow |
| `upgrades` | lists the upgrades with their levels and prices |
| `buy shovels` (or `graves`, `sand`, `lure`) | buys the next level |
| `milestones` | says how many you have reached and what is next |
| `remember I like tea` | keeps a note |
| `what do you remember` | lists his notes |
| `forget tea` | drops the notes that mention "tea" (`forget everything` for all) |
| `slash`, `shatter`, `glitch`, `vortex`, `burn`, `melt`, `soul rip`, `summon`, `hum`, `vanish` | casts it |
| `what time is it`, `what's the date` | tells you |
| `help` | lists these |

### What he can do for you

| Ask something like | He uses |
|---|---|
| "Remind me in 20 minutes to check the oven" | **Raven**: sends, lists or cancels reminders |
| "25-minute focus timer" | **Hourglass**: starts or stops the timer |
| "What's this error on my screen?" | **Look**: takes a picture of your screen, with him hidden, and looks at it |
| "Summarize what I copied" | **Clipboard**: reads the text you copied |
| "Copy that for me" | **Clipboard**: puts his text on your clipboard |
| "My name is Sam" / "Remember I like tea" | **Memory**: keeps short notes about you across conversations and restarts (up to 50) |
| "How did today go?" | **Tally**: time at the computer, timers finished, ghosts caught, files reaped |
| "How's the crypt?" / "Raise two skeletons" / "Buy sharper shovels" | **Crypt**: counts your souls, skeletons, upgrades and milestones, raises skeletons, or buys an upgrade. He spends souls only when you ask. |
| "Break my screen" / "Burn it" / "Do the ghost game" | **Abilities**: casts Slash, Shatter, Glitch, Vortex, Burn, Melt, Soul Rip, Summon, Hum or Vanish |

### Privacy

- **Look** and **reading the clipboard** ask your permission in the card every time, and send nothing unless you choose **Allow**. Unanswered requests are declined after 80 seconds.
- Screen pictures go to the model at no more than 1568 pixels on the long edge.
- With a local model, your words, screen pictures and clipboard go only to Ollama on your computer. With no mind, they go nowhere.
- He can't read or move files, browse the web, or click or type in other apps, and he says so if asked.

### Other details

- Replies stream into the card, and each finished reply has a **copy** button.
- **↺** starts a new conversation. Memory is kept until you forget it, either by asking him or with the tray menu.
- Haiku has no fallback model. If it declines a question, he says so, and that question is dropped from the conversation.
- Changing minds, or local models, starts a new conversation. What he remembers is kept.

## Permissions

- **macOS:** Look and the screen effects (Slash, Shatter, Glitch, Vortex, Burn, Melt, Soul Rip) need Screen Recording permission to photograph the screen (System Settings → Privacy & Security → Screen Recording). Without it, the effects play over dark glass instead of your real screen, and Look reports that it can't see.
- **Linux:** transparency needs a compositing window manager, which most desktops have.

## Where things are kept

`companion.json` in the app's user-data folder keeps:

- Settings, soul and the mind you chose.
- The Crypt: banked souls, skeletons, upgrades and milestones reached.
- Your best catch.
- Pending reminders and a running timer.
- Today's tally.
- What he remembers.
- The encrypted key.

The folder is:

- macOS: `~/Library/Application Support/reaper-companion`
- Windows: `%APPDATA%\reaper-companion`
- Linux: `~/.config/reaper-companion`

## Releasing

The **Desktop release** workflow (`.github/workflows/desktop-release.yml`) builds the installers on macOS, Windows and Linux. To publish a release with them, push a tag that starts with `reaper-v`:

```bash
git tag reaper-v0.2.0
```

```bash
git push origin reaper-v0.2.0
```

Running the workflow by hand from the Actions tab only builds the installers, as downloadable artifacts, without making a release.

To build on your own machine instead, run the command for that machine (each writes to `desktop/dist/`):

```bash
npm run dist:mac
```

```bash
npm run dist:win
```

```bash
npm run dist:linux
```

## Files

| File | What it does |
|---|---|
| `main.js` | The window, tray, shortcuts, idle detection, screen capture, clipboard, the Trash, memory and saved state |
| `oracle.js` | Speak: the conversation with Claude or a local model, its system prompt and tools |
| `freemind.js` | The free mind: downloading its model and running it on this computer |
| `screens.js` | Which edges of a monitor lead to another one |
| `ollama.js` | The link to Ollama: finding its models and streaming a chat turn |
| `offline.js` | The plain commands he follows with no model |
| `crypt.js` | The Crypt's rules: what deeds are worth, what skeletons cost and dig, upgrades and milestones |
| `tools/pacing.mjs` | Plays the Crypt for weeks as three kinds of user, to tune its numbers |
| `preload.cjs` | The small API the page is allowed to use |
| `renderer/app.js` | Movement, dragging and throwing, resting, sleeping and haunting, the ring, greetings, and which parts of the window take clicks |
| `renderer/abilities.js` | Every ability, and the tool calls Speak makes |
| `renderer/crypt.js` | The Crypt's card, with its three tabs, and the skeletons on screen |
| `renderer/speak.js` | The Speak card, choosing a mind, its permission questions and copy buttons |
| `renderer/effects.js` | The screen effects over a picture of the screen: Shatter, Glitch and Soul Rip on a canvas; Vortex, Burn and Melt as WebGL shaders |
| `renderer/sound.js` | The bell, a sound for each screen effect, and Hum |
| `renderer/bridge.js` | The page's link to the app, with a stand-in so it also runs in a browser tab |

## Checks

From this folder:

```bash
npm test
```

This runs four files, with no network and no real model:

- `tests/oracle.mjs` tests Speak's conversation loop against a fake API with no real calls.
- `tests/minds.mjs` tests the local model against a fake Ollama, and the plain commands.
- `tests/crypt.mjs` tests the Crypt's rules.

Two more need something extra, so `npm test` leaves them out:

- `tests/roam.mjs` checks roaming between monitors. It needs a desktop of several monitors; `tests/plp-desktop.sh` makes a pretend portrait-landscape-portrait one with X.org's dummy driver (on Debian or Ubuntu: `xserver-xorg-video-dummy` and `x11-xserver-utils`), and CI runs it that way:

  ```bash
  tests/plp-desktop.sh node tests/roam.mjs
  ```

- `tests/freemind.mjs` runs the free mind's real model, in Node and inside the app. Point it at the downloaded model file:

  ```bash
  REAPER_FREE_MODEL=/path/to/Qwen3.5-2B-Q4_K_M.gguf xvfb-run -a node tests/freemind.mjs
  ```

`tools/bench-models.mjs` scores models for the free mind on Speak's requests: `node tools/bench-models.mjs model.gguf [more.gguf …]`.
- `tests/launch.mjs` starts the real app and checks the window, the bridge and the main process.

On Linux without a display, run it under `xvfb-run -a npm test`.

From the repo root, `npm run test:desktop` checks the page itself in a headless browser.
