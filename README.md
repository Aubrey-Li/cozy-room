# Cozy Room

A cozy isometric room on a tiny planet, built with [three.js](https://threejs.org/) and WebGL.

The sky follows your local 24-hour clock: the sun rises at six, climbs to noon, sets behind the planet in the evening, and the stars and moon come out at night. Outside the room is a little meadow where fireflies drift once it gets dark. Inside there is a bed, a bookshelf with books sorted by colour, a record player, a guitar, house plants, a photo gallery and string lights that glow warm orange after sunset.

## Run it

No build step. Serve the folder with any static server and open it in a browser:

```sh
python3 -m http.server 8123
# then visit http://localhost:8123
```

three.js is loaded from a CDN via an import map, so a network connection is needed the first time.

## Controls

- The clock in the corner shows the local time the scene is rendering.
- Drag the slider to scrub through the day. Press **Live** (or the `L` key) to return to the real clock.
- Drag to orbit around the planet, scroll or pinch to zoom, right-drag (or `W A S D` / arrow keys) to pan. Press `R` to reset the view.
- Add `?t=HH:MM` to the URL to open the scene at a specific time, e.g. `?t=21:30`. Add `?z=2.5` to start zoomed in, and `?target=x,y,z` to centre the view on a point.

## Layout

```
index.html        page shell, import map, HUD
style.css         HUD styling
src/main.js       renderer, camera, lights, frame loop
src/time.js       local clock, sun angle, sky palettes
src/sky.js        screen-space sky gradient, stars, sun and moon
src/planet.js     the little planet, grass, flowers, trees, rose
src/room.js       the room and everything in it
src/fireflies.js  fireflies over the meadow at night
src/foliage.js    shaped leaf and petal geometry, pots, stems
src/wind.js       vertex-shader wind sway for leaves and grass (also in the shadow pass)
src/textures.js   procedural canvas textures
```
