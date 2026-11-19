# Third-party assets

## Tesla Model 3 (selectable car)

- **Model:** Tesla Model 3 Highland by [e96031413](https://github.com/e96031413/TESLA-Model3)
- **Source file:** `public/models/highland/highland.glb`
- **Licence:** MIT (see the upstream repository)
- **Integration:** the GLB was converted offline with `tools/glb2game.js` from the `car-model-lab` sandbox:
  179,692 source triangles decimated to ~18,000, textures baked into vertex colours, normalised to 4.70 m long.
  The generated `source/js/30_car_h_tesla_data.js` is self-contained; no runtime texture loader is needed.
- **Attribution of the original game:** Fiat Uno WebGPU Racing is an English port of
  [Uno com escada](https://github.com/viktorkav/uno-com-escada) by ViktorKav, licensed
  [PolyForm Noncommercial 1.0.0](LICENSE.md).

## Ferrari F40 (selectable car)

- **Model:** Ferrari F40 by PuKkBuMXDD on [Poly Pizza](https://poly.pizza/m/RTwim9bhNd)
- **Licence:** Creative Commons Attribution 3.0 (CC BY 3.0) — https://creativecommons.org/licenses/by/3.0/
- **Integration:** converted offline with `tools/glb2game.js` (4,760 triangles, textures baked into vertex colours, axis-corrected and normalised to 4.70 m). Generated file: `source/js/30_car_j_f40_data.js`.

The Citroën 2CV and Renault 5 are NOT included in the game; they are still being evaluated in the separate `car-model-lab` sandbox.
