# Orb Blaster VR

A small WebXR game built with [A-Frame](https://aframe.io). Colorful orbs float
around you. Point and shoot them before they fade. Farther orbs score more.
Each round lasts 60 seconds.

## Play it

WebXR needs HTTPS (or `localhost`), so serve the folder rather than opening the
file directly:

```bash
npx serve .
# or
python3 -m http.server 8000
```

- **Desktop**: open the URL, drag to look around, click orbs.
- **Headset (Quest, etc.)**: open the URL in the headset browser and press the
  **VR** button in the bottom right. Point either controller and pull the
  trigger. If you serve from a PC, use its LAN IP and an HTTPS tunnel such as
  `ngrok`, or enable GitHub Pages for this repo.

## How it works

- `index.html` is the whole game: scene, components and game loop.
- `orb-behavior` makes each orb bob, drift, time out, and pop when clicked.
- `shoot-on-trigger` turns a controller trigger press into a click on the orb
  under the laser, so one code path handles mouse and VR.
- `laser-controls` plus `raycaster` give both hands a visible laser pointer.
