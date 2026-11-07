# Hollow Canopy

A Gorilla Tag style VR horror game that runs in a browser. You are a monkey with no legs
and long arms. You move by pushing off the ground and trees with your hands. Out in the fog
there are bigger, faster monkeys with red eyes, and they are hunting.

## Features

- **Gorilla Tag locomotion** in VR: push off surfaces with your hands, climb trees and the
  spawn totem by grabbing them. Desktop fallback with WASD, mouse look, jump and sprint.
- **Infinite map**: the forest is generated from noise and streamed in chunks. Only chunks
  near you are loaded, trees and rocks are drawn with a handful of instanced draw calls, and
  thick fog hides the loading edge.
- **Safe zone**: the lit stone platform at the spawn. Monsters cannot enter it. The glowing
  green ring marks the edge.
- **Terminal**: the screen on the platform lets you type a name and join a room by code.
  The first person to join a code hosts it. Everyone else in that room sees each other,
  with names over their heads and arms that follow their real hands.
- **Paint station**: the screen on the east side of the platform. Pick a fur colour, the
  statue next to it shows it, and others see it on your monkey.
- **Monsters**: host-run AI gorillas, 1.55x your size and a little faster than you. They roam
  near the players, roar when they spot you, chase you, and prowl the edge of the safe zone
  when you hide. They cannot climb, so a high tree is the other way to survive.
- **Gore and death**: a catch sprays blood droplets, ground splats and chunks, the monster
  slams into the corpse, your view collapses to the ground under a red haze, and you respawn
  on the platform a few seconds later. Other players see your monkey fall and bleed.
- **Procedural audio**: wind, a drone, a heartbeat that speeds up as something gets closer,
  roars, footsteps, and a death scream. No audio files.

## Run it

WebXR needs HTTPS or `localhost`, so serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

On a headset, open the same URL over HTTPS (GitHub Pages works: enable it for this repo and
open the page in the headset browser) and press **ENTER VR**. Point a controller at a
screen and pull the trigger to use it.

Multiplayer uses PeerJS over WebRTC with the public PeerJS signalling server, so nothing
needs hosting beyond the static files. Two players on very strict networks may fail to
connect to each other; that is a WebRTC limitation.

## Layout

| File | What it does |
| --- | --- |
| `src/main.js` | Boots everything, the frame loop, VR session, overlays, remote players |
| `src/world.js` | Terrain height, chunk streaming, instanced props, colliders, spawn zone |
| `src/player.js` | Rig, hand-push locomotion, desktop controls, body physics, death/respawn |
| `src/monsters.js` | Monster AI (host), interpolation (clients), kill detection |
| `src/monkey.js` | Procedural gorilla model for players and monsters, animation |
| `src/terminal.js` | Canvas-drawn screens: name/room terminal and paint station |
| `src/net.js` | PeerJS rooms: host election, state relay, kill events |
| `src/gore.js` | Blood particles, splats, chunks |
| `src/audio.js` | Synthesized sound |
| `src/config.js` | Tuning values (speeds, sizes, fog, chunk radius) |

## Swapping in real models

`buildMonkey()` in `src/monkey.js` returns a group whose `userData.parts` names the body,
head, arms and hands. Load a GLB and fill those same slots and the animation, networking
and monsters keep working. The monster variant is the same builder with `monster: true`,
so a scarier mesh only needs to go in there.
