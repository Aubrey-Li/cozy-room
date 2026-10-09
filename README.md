# Cozy Room

A cozy isometric room on a tiny planet, built with [three.js](https://threejs.org/) and WebGL.

The sky follows your local clock and your real sunrise and sunset: the sun climbs to solar noon, sets behind the planet in the evening, and the stars come out at night. The moon shows tonight's phase and keeps its own hours, so a full moon rises at sunset and a crescent hangs near the sun. The planet turns with the seasons: cherry blossom opening on bare branches in spring, leaves growing out to a lush summer green, red and gold leaves in the fall, and in winter bare, snow-laden trees and snow that falls gently until it buries the whole planet. Each season holds for a while and eases into the next over a few weeks. Outside the room is a little meadow where fireflies drift once it gets dark, and a stone-edged pond beside the garden path where koi swim; the water glitters by day, catches the moonlight at night and frosts over in deep winter.

Sun times and hemisphere come from your time zone's reference city (no location prompt). If the page already has location permission, your exact position is used instead. Inside there is a bed, a bookshelf with books sorted by colour, a record player, a guitar, house plants, a photo gallery and string lights that glow warm orange after sunset.

## Run it

No build step. Serve the folder with any static server and open it in a browser:

```sh
python3 -m http.server 8123
# then visit http://localhost:8123
```

three.js is loaded from a CDN via an import map, so a network connection is needed the first time.

## Controls

- The clock in the corner shows the local time the scene is rendering. Tap it (or the arrow) to collapse the panel; it starts collapsed on small screens.
- Click or tap the bookshelf to take down a book of public-domain poems: it opens over the room, and pages turn with the arrows, a click, a swipe or the arrow keys.
- Click the desk monitor (or the chair) to play The Little Lamplighter, a short pixel-art game about giving your light away. Arrow keys or A/D to walk, Space to talk, light and hop; on phones, on-screen buttons. Its music and sounds are original and synthesized live in the browser.
- Click the bedside lamp to step it through bright, medium, dim and off. The little switch beside the window cycles the string lights: steady, alternating, blinking and off.
- Click or tap the window to swing it open; the sheer linen curtains billow into the room with the breeze. Click again to close it.
- Click or tap the record player to open the song list. Picking a song drops the tonearm, spins up the record and sends music notes floating up; the arrow (or the panel title) minimizes it to a slim now-playing bar with play/pause while the song keeps going, and closing the panel stops the music. Songs stream through YouTube's embedded player, shown in the expanded panel and hidden in the mini bar. YouTube's API policies ask for a visible player of at least 200x200 while playing, so hiding it carries some risk of YouTube restricting playback.
- The world has sound once you first click or tap: birdsong in spring (loudest at dawn), cicadas by day and crickets by night in summer, crisp gusts and skittering leaves in fall, and a soft hush in winter. It is muffled through the glass until you open the window. The window's latch and hinges and the book's cover and pages make their own small sounds, and the outdoors ducks under the record player and goes quiet while the game plays. All of it is synthesized live, with no audio files. The speaker button beside the clock turns it off, and the choice is remembered.
- Drag the slider to scrub through the day. Press **Live** (or the `L` key) to return to the real clock.
- Drag the second slider to scrub through the year and watch the seasons, sun times and moon change. Press **Today** to return to the real date.
- The panel lists the date and season, today's sunrise and sunset, and the moon phase.
- Drag to orbit around the planet, scroll or pinch to zoom, right-drag (or `W A S D` / arrow keys) to pan. Press `R` to reset the view.
- Add `?t=HH:MM` to the URL to open the scene at a specific time, e.g. `?t=21:30`. Add `?z=2.5` to start zoomed in, and `?target=x,y,z` to centre the view on a point. `?date=2026-01-15` opens on a given day, and `?loc=lat,lon` sets the location used for the sun and seasons.

## Layout

```
index.html        page shell, import map, HUD
style.css         HUD styling
src/main.js       renderer, camera, lights, frame loop
src/time.js       local clock, sky palettes and light from the sun angle
src/astro.js      location, sunrise and sunset, moon phase, season position
src/tzcoords.js   approximate coordinates for each time zone (generated from tz zone.tab)
src/sky.js        screen-space sky gradient, stars, sun and moon
src/planet.js     the little planet, grass, flowers, trees, rose
src/planet-math.js  planet radius, placing things on the surface, the snow field
src/pond.js       the pond: water shader, bank, lily pads and koi
src/seasons.js    seasonal colours, blossom, fallen leaves and snow cover
src/weather.js    falling snow, autumn leaves and cherry petals
src/room.js       the room and everything in it
src/fireflies.js  fireflies over the meadow at night
src/music.js      song list panel and YouTube player
src/ambience.js   seasonal soundscape, window and page sounds (synthesized)
src/rose.js       the rose under her glass, and what becomes of her
src/rose-lines.js everything the rose says
src/game.js       the game window over the room (controls, mute)
src/games/lamplighter.js  The Little Lamplighter: story, drawing, both endings
src/games/sound.js        synthesized music and sound effects
game.css          game window styling
src/book.js       the bookshelf book: open/close animation and page turns
src/book-pages.js the book's pages (public-domain poems)
book.css          paper, cover and page-turn styling
src/foliage.js    shaped leaf and petal geometry, pots, stems
src/wind.js       vertex-shader wind sway for leaves and grass (also in the shadow pass)
src/textures.js   procedural canvas textures
```
