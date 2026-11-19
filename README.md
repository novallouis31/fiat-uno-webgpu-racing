# Fiat Uno WebGPU Racing

An English port of the **Fable** build of [Uno com escada](https://github.com/viktorkav/uno-com-escada) by ViktorKav: a 1996 Fiat Uno Mille EP with an aluminium ladder strapped to the roof, racing on a hill-circuit directly in the browser.

The track, forest, sky and sound are generated from code. The Fiat Uno is fully procedural; the Tesla Model 3 is a converted CC/MIT 3D model with baked vertex colours (see CREDITS.md). No runtime 3D library or network needed: a single self-contained `index.html`.

> Original project and license: [viktorkav/uno-com-escada](https://github.com/viktorkav/uno-com-escada), [PolyForm Noncommercial 1.0.0](LICENSE.md). Free to use, study, modify and share for non-commercial purposes. This fork translates the interface, comments and documentation into English and adds adjustable performance presets; all credit for the original work goes to its author.

## Play

Open [`index.html`](index.html) in a recent **Chrome** or **Edge** on a computer. Wait a few seconds for the circuit to be generated, then click **Start**. Requires a browser with **WebGPU** (Chrome/Edge on Windows 11 works; enable hardware acceleration).

The original demo targeted a MacBook Pro M4 Max at 2560×1440. This port defaults to a **laptop-friendly profile** tuned for an Intel i9-11950H with an NVIDIA T1200 4 GB GPU and 64 GB RAM, so it should stay smooth on mid-range hardware.

## Controls

| Action | Keyboard | Controller |
| --- | --- | --- |
| Accelerate | `W` or `↑` | Right trigger |
| Brake / reverse | `S` or `↓` | Left trigger |
| Steer | `A` `D` or `←` `→` | Left stick |
| Handbrake | `Space` | `A` |
| Change camera | `C` | `Y` |
| Look back | hold `V` | hold `RB` |
| Put the car back on track | `R` | `X` |
| Pause / menu | `Esc` | `Start` |

| Tool | Key |
| --- | --- |
| Toggle sound | `M` |
| Performance statistics | `H` |
| Benchmark (60 s scripted lap, average and worst frame time) | `B` |
| Watch the scripted lap | `F` |
| Fixed camera poses | `1` to `6` |

The gearbox is automatic. A lap counts when the car crosses the start/finish line. Audio starts after the first click.

## Graphics quality

The start menu has a **Car** selector (Fiat Uno Mille EP / Ferrari F40 / Tesla Model 3) and a **Graphics quality** selector. Changing either saves the choice in `localStorage` and reloads the page. You can also force them with `?car=uno|f40|tesla` and `?quality=low|medium|high`. The F40 and Tesla are converted CC/MIT 3D models with baked vertex colours (see CREDITS.md) and their own handling profiles; the scripted lap, cameras, sound and benchmark work with every car.

| | Low (default) | Medium | High |
| --- | --- | --- | --- |
| Render resolution | 70% of display | 85% | 100% |
| Cascaded shadow maps | 1024² | 1536² | 2048² |
| Static world shadow | 2048² | 3072² | 4096² |
| Environment cubemap | 256² | 512² | 512² |
| Baked sky | 2048×512 | 3072×768 | 4096×1024 |
| Bloom levels | 4 | 5 | 6 |
| Cubemap faces per frame | 1 | 2 | 2 |
| Vegetation density | ~75% | ~90% | 100% |

**Low** keeps the deferred renderer, TAA, motion blur, volumetric light, reflections and all geometry — it only reduces pixel count, shadow/sky resolution, cubemap refresh rate and vegetation spacing. The visual identity is unchanged; start with Low and try Medium if your GPU has headroom.

Use `B` to run the built-in 60-second benchmark (frame time, GPU time, 99th percentile, FPS) and `H` for live statistics.

## Development

The readable source is in [`source/`](source/). Edit the files and rebuild the single-file game with Node.js 18+ (no packages to install):

```bash
node source/build.mjs
```

This rewrites `index.html` in place. JavaScript files in `source/js/` are concatenated in filename order; WGSL shaders in `source/wgsl/` are embedded as strings. `--min` strips comments and compresses whitespace:

```bash
node source/build.mjs --min
```

Useful files:

| File | Contents |
| --- | --- |
| `js/10_track.js` | Circuit layout, elevation and surface zones — a good place to start |
| `js/30_car_*.js` | The Uno: body surface, paint, parts, roof rack and ladder |
| `js/31_world.js`, `js/32_props.js` | Terrain, track, guard-rails, grandstands, pits and gantry |
| `js/33_veg_*.js` | Forest: trees, grass and distant impostors |
| `js/40_vehicle.js` | Car physics |
| `js/45_game.js` | Input, fixed-step loop, cameras and scripted lap |
| `js/50_som.js`, `js/51_painel.js`, `js/52_ui.js` | Synthesized sound, dashboard, menus and benchmark |
| `js/01_gpu.js` | WebGPU device and quality presets |
| `wgsl/` | Shaders: materials, sky, shadows, post-processing |
| `shell.html` | Page shell, CSS and start menu |

All comments and user-facing text are in English. Code identifiers, data keys and shader names are unchanged from the original so the upstream code stays easy to compare.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md) — inherited from the original project. Not for commercial use.
