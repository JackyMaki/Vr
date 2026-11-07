# Hollow Canopy

A Gorilla Tag style VR horror game that runs in a browser. You are a monkey with no legs
and long arms. You move by pushing off the ground, trees and walls with your hands. Out in
the fog there are bigger, faster gorillas with red eyes, and they are hunting.

## What is in it

- **Gorilla Tag locomotion** in VR: push off floors, walls, furniture and trees with your
  hands, climb anything you can reach. Desktop fallback with WASD, mouse look, jump, sprint.
- **An endless abandoned complex.** The map is indoors everywhere, split into 96 m wings
  that stream in chunks around you with instanced draw calls. Every wing has walls with
  doorways, a ceiling, and lights baked into the floors, ceilings and props so there are
  pools of light and real darkness between them. Some lights flicker, some are dead.
  - **Halls**: concrete corridors and rooms on an 8 m grid with doors, lockers, desks,
    chairs, monitors, crate stacks, shelves, beds, corpses, blood, cobwebs, posters,
    vents, pipes and cables.
  - **Atrium**: an overgrown garden under a broken skylight, trees, moss, vines, planters.
  - **Backrooms**: yellow wallpaper maze, carpet, drop ceilings, humming panels.
  - **Caves**: dug below, near black, stalactites, pillars, glowing fungus, bone piles.
  - **Factory**: machines, consoles, pipes, climbable catwalks, barrels, chains, lamps.
  - **Sewer**: brick tunnels, a water channel, grates, wall lamps, slime.
  - **Morgue**: tiled rooms, body drawers, slabs with corpses, trays, sinks, blood.
  Every surface has a procedural texture. Lighting, fog and ambience change per wing.
- **Safe room**: the lit room at the spawn. Monsters cannot enter it. The guide board on
  its wall explains the controls, and that is the only text in the game.
- **Terminal**: set a name and join a room by code. The first player on a code hosts it.
- **Paint station**: pick a fur colour. The statue beside it shows it.
- **Flashlight**: in your left hand in VR (X or A toggles it), on your shoulder on desktop
  (F). Decent range, warm, and it stutters or drops out now and then.
- **Throwables**: rocks, bottles, cans, bricks, bones, skulls and wrenches lie around.
  Grip to grab in VR and let go to throw; E, click and Q on desktop. A hard hit stuns a
  monster for a moment, and loud impacts draw monsters to the sound.
- **Monsters**: textured, scarred gorillas 1.55x your size with red eyes, fangs, claws,
  exposed ribs and spines. They roam near players, roar, chase, sidestep walls, cannot
  climb, and prowl the edge of the safe room when you hide.
- **Death**: no death screen. The monster grabs you, lifts you to its face, and tears your
  head off. Your view is the head: it is flung away trailing blood, tumbles, lands and lies
  there while it feeds on your body, then everything goes black and you wake up in the
  safe room. Other players see you lifted, the head torn off and thrown, and the body drop.
- **Surround sound**: every world sound (roars, footsteps, growls, impacts, drips, clanks,
  voices) runs through an HRTF panner at its source, so a growl on your right is on your
  right. Ambience beds crossfade per wing. A heartbeat speeds up as something closes in.
- **Voice chat**: once you join a room your mic streams to everyone in it over WebRTC, and
  their voices come from where their monkeys stand.
- **Detailed monkeys**: faceted textured fur, brow ridge, crest, muzzle with nostrils, ears,
  pecs, elbows that bend with two-bone IK. Remote players' arms follow their real hands.

## Run it

WebXR needs HTTPS or `localhost`, so serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

On a headset, open the page over HTTPS (GitHub Pages works) and press **ENTER VR**.

Multiplayer and voice use PeerJS over WebRTC with the public PeerJS signalling server, so
nothing needs hosting beyond the static files. Players on very strict networks may fail to
connect to each other; that is a WebRTC limitation.

## Meta Quest Store

The game is a Progressive Web App (`manifest.json` and icons are included). Meta lets PWAs
be packaged into an APK and published to the Quest Store or App Lab. The outline:

1. Host the game on HTTPS (GitHub Pages is enough).
2. Create a Meta developer account at developer.oculus.com, verify it, and create an
   organization and an app.
3. Install Meta Quest Developer Hub, use its PWA packaging tool with the hosted URL to
   produce an APK, and upload that build to the app's release channel.
4. Fill in the store listing (screenshots, description, age rating) and submit for review.

Each of those steps needs a real person signed in to the Meta account, so they are not
something this repo can do for you.

## Layout

| File | What it does |
| --- | --- |
| `src/main.js` | Boot, frame loop, VR session, biome lighting, remote players, kill handling |
| `src/biomes.js` | Wing map, floor levels and the chunk content generator for each wing |
| `src/world.js` | Chunk streaming, instanced prop pools, baked light, flicker, safe room, collisions |
| `src/textures.js` | Procedural canvas textures for every surface |
| `src/monkey.js` | Textured gorilla model, two-bone IK, walk, kill and victim poses |
| `src/player.js` | Rig, hand-push locomotion, desktop controls, body physics, controller input |
| `src/monsters.js` | Monster AI (host), interpolation (clients), kill choreography, stun |
| `src/death.js` | First-person head-rip death sequence |
| `src/items.js` | Throwable items: spawning, grabbing, throwing, physics |
| `src/flashlight.js` | The flickering torch |
| `src/audio.js` | Spatial procedural sound and biome ambience |
| `src/voice.js` | WebRTC voice mesh with positional playback |
| `src/terminal.js` | Canvas screens: terminal, paint station, guide board |
| `src/net.js` | PeerJS rooms: host election, state relay, kill events |
| `src/gore.js` | Blood droplets, splats, chunks |
| `src/config.js` | Tuning values |
