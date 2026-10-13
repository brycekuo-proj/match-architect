# itch.io 報名素材：Match Architect（火柴建築師）

給 **AI Browser Game Jam 5**（<https://itch.io/jam/ai-jam-5>，投稿 2026-10-17 ～ 10-31）用。
下半部的英文內容可以直接貼到 itch.io 專案頁。

## 一、itch.io 專案設定（照填）

| 欄位 | 填什麼 |
|---|---|
| Title | `Match Architect` |
| Project URL | `https://<你的帳號>.itch.io/match-architect` |
| Short description or tagline | `Frame world landmarks out of matchsticks, then survive a 10-second earthquake. Fewer matches, more stars.` |
| Classification | Games |
| Kind of project | **HTML** |
| Release status | Released（或 In development，之後還會更新） |
| Pricing | **No payments**（jam 規定要免費） |
| Uploads | `match-architect-itch.zip`（在 Mac 專案的 `dist/` 資料夾），勾 **This file will be played in the browser** |
| Embed options | Embed in page；Viewport **960 × 640**；勾 **Mobile friendly**（Orientation: Default）；勾 **Fullscreen button** |
| Frame options | 不勾 Automatically start on page load（讓玩家點 Run game，聲音才放得出來） |
| Cover image | `cover-630x500.jpg`（或高解析版 `cover-1260x1000.jpg`） |
| Screenshots | `screenshot-1` 到 `screenshot-8`（依序上傳） |
| Genre | Puzzle |
| Tags | `physics`, `puzzle`, `building`, `earthquake`, `low-poly`, `3d`, `mobile`, `casual`, `construction`, `ai-generated` |
| AI generation disclosure | 選 **Yes**，勾 Code、Graphics、Sound、Text |
| App store links / Community | 開 Comments，方便玩家留言 |

投稿：10/17 jam 開始後，到 jam 頁按 **Submit your project**，選這個專案。發文宣傳加上 `#AIGameJam`。

**注意 jam 規則**：「Continuing an existing project is allowed, only if the majority of the submission is new content.」這個遊戲是在 jam 開始前做的，所以 10/17～10/31 期間要加入比現有內容更多的新東西（例如照 `docs/LEVEL_PLAN.md` 補到 50 關、新的 Q 版模型、配合主題的新模式），並在頁面下方的 Jam log 寫清楚哪些是 jam 期間做的。

貼內容的小技巧：itch 的編輯器不吃 Markdown。在 GitHub 上打開這個檔案（會自動排版），從「Match Architect」標題選到最後，複製後貼進 itch 的 Description，粗體和清單就會保留。

---

# Match Architect

**Build world landmarks out of matchsticks, then hold on through a 10-second earthquake.**

You are a matchstick architect. Clients around the world send you work orders: a triangle for training, then the Great Sphinx, the Eiffel Tower, Tokyo Tower… all the way up to Taipei 101. Frame each building with fixed-length matches, press **Start Quake**, and hope the glue holds.

Free, plays in your browser on phone and desktop. English and 繁體中文.

## How to play

1. **Accept the job.** Every work order lists the stars to reach, the quake level (3 up to 7) and your match quota.
2. **Build.** Drag a match out of a red anchor or the end of another match; ends snap together. Press on the middle of a match to glue a brace onto it. There's no gravity while you build.
3. **Start the quake.** The ground shakes for 10 seconds and your flat design opens up into a 3D tower. Matches turn red as they strain. When a glue joint snaps it catches fire, and the fire runs along the matches until the whole building comes down.
4. **Pass inspection.** Keep every star up and every joint whole. Your reward: a cute 3D model of the real landmark spinning on a turntable.

## Fewer matches, better score

- Every match costs 1 coin, paid when the quake starts.
- Pass, and every unused match in your quota pays back 2 coins.
- Finish at or under the target count for ★★★.
- Open the daily gift on the title screen for 30 free coins a day.
- Spend coins in the shop (from the title screen) on anti-quake items and new looks. Runs that use anti-quake items still earn stars and coins but don't go on the leaderboard.

## Controls

- **Touch:** drag to build, drag empty space to pan, pinch to zoom, or use the + / − buttons on the right.
- **Mouse:** drag to build or pan, mouse wheel or trackpad pinch to zoom, keys + − 0.

## Features

- A hands-on tutorial: a finger shows you where to press and drag for your first two builds
- 10 jobs: 3 training builds and 7 world landmarks (Great Sphinx, Great Pyramid, Leaning Tower of Pisa, Eiffel Tower, Tokyo Tower, Oriental Pearl Tower, Taipei 101). Tokyo Skytree, Burj Khalifa, Sagrada Família and more are coming in the full version
- Real-time rigid-body physics: every match is a body, and every glue joint can snap
- Burning collapse: fire spreads along the matches and melts the glue it reaches
- A shop of one-use anti-quake items based on real seismic engineering: a tuned mass damper like the one in Taipei 101, lead-rubber base isolation, spring dampers, carbon-fibre wrap, ductile steel and a structure scanner that shows where your frame will break. Use them from the item tray while you build
- Match skins (bamboo, candy, glow, gold), scenes (desert, snow, night) and a cabinet for every landmark model you've earned
- 10 low-poly landmark models, revealed on a turntable when you pass
- Every sound and the marimba music are synthesized live; there are no audio files
- One 1.5 MB HTML file

## How AI made this game

I (Bryce) came up with the concept, the rules, the level list and the art direction, and play-tested every build. Almost everything else was made by **Claude** (Anthropic), working from my feedback in a chat:

- **Code:** game loop, physics tuning with Planck.js, the Three.js renderer, UI, coin economy, translations.
- **Levels:** Claude designed a reference build for every landmark and checks all of them with an automated physics test. The reference build must survive its quake; flimsy builds must fail.
- **3D models:** Claude wrote Blender Python scripts that generate the match and all 13 landmark models, including their textures (stone blocks, iron lattice, glass curtain walls, arcades). A Claude sub-agent ran Blender on my Mac, rendered contact sheets and fixed what looked wrong.
- **Audio:** the music, crackling fire, snapping glue and rumble are generated in code with the Web Audio API.
- **Testing:** Claude play-tested on emulated phones and desktops: pinch zoom, the coin flow, the collapse, and every screen in both languages.
- **Text:** all game text, in Chinese and English.

## Jam log

- Before the jam (Oct 12–16): first playable version.
- During the jam (Oct 17–31): *(fill in what you add during the jam)*

## Credits

- [Three.js](https://threejs.org/) (MIT), [Planck.js](https://github.com/piqnt/planck.js) (MIT), [esbuild](https://esbuild.github.io/) (MIT)
- [Blender](https://www.blender.org/), used to generate the 3D models
- Fonts from Google Fonts, SIL Open Font License: Bungee by David Jonathan Ross, Huninn (jf open 粉圓) by justfont, Noto Sans TC by Google
- Made with Claude by Anthropic

Source code: <https://github.com/brycekuo-proj/match-architect>

#AIGameJam
