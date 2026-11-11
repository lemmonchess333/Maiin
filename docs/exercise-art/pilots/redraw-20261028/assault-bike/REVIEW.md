# Assault Bike six-frame art review — 2026-10-28

**Release gate: PASS.** Independent form QA reviewed all six images at 360px, both opposite motion extremes at 1024px, and all seven keyed anchors. The machine cage, console, saddle, and floor rails stay fixed; the rider stays seated; both hands wrap their respective moving rubber grips; both shoes remain on opposed level pedals. Frame 7 repeats frame 1, and the frame 6→1 crank step matches the normal cadence.

The floor rail center span was shortened from 2.48m to 1.98m so the rider fills more of the phone view. The six-blade fan is keyed at 13/6 revolutions per crank revolution, producing [0, 10, 20, 30, 40, 50, 0]° apparent angles and avoiding a stationary-looking six-frame alias.

Quantitative QA (`final-qa-anchors.json`, seven keys): maximum fixed anchor drift 0px; seated hip drift 0m; maximum three-fingertip hook to rubber-grip surface 0.01205m (~1.7px at 360); maximum trainer sole to pedal top 0.00662m (~0.9px at 360); minimum Y overlap of shoe with pedal 0.1428m; pedal target error 0m. The rendered source canvas is 1024 × 1024px for frames 1–6. `docs/exercise-art/cutout-sources/assault-bike.png` is an alpha-safe cutout source, separately rendered from frame 1; it is not one of the six animation frames.

Editable packed Blender source: `docs/exercise-art/sources/pose-locked-20261028/assault-bike/assault-final.blend`. A self-contained scripted rebuild and CC0 source/provenance are in its `source/` directory. Portable script setup was smoke-tested in Blender 4.3.2.

## SHA-256

```text
7b316149b69a0c3582be570fc804fe14ef327883c553742869ec84e19e095dcc  docs/exercise-art/pilots/redraw-20261028/assault-bike/1.png
5f3155410cb702f0bbaa87fdfec5db700e8872d1c4989999c2ae7c343dea249d  docs/exercise-art/pilots/redraw-20261028/assault-bike/2.png
2a4b058daffa497591f617638682c9ab5231d6f4145d3f64a8f110316f02d72e  docs/exercise-art/pilots/redraw-20261028/assault-bike/3.png
60bebc89f45e1f45c38df22375c20dae52a7a2984bc672f2d2f63bd3d5b207e1  docs/exercise-art/pilots/redraw-20261028/assault-bike/4.png
3b4e777a643732151528e3c9ca7f44ed679d4e84369fa0cde4a5287583359ce1  docs/exercise-art/pilots/redraw-20261028/assault-bike/5.png
6e2eb57fec1c3a25192b6179effde90a755eaeaaeb71d534351d0b5a52988fca  docs/exercise-art/pilots/redraw-20261028/assault-bike/6.png
218d682d7e3207630f907a8e6bb8ba62709c27e0afc7a4b48977ae1fe746031b  docs/exercise-art/cutout-sources/assault-bike.png
a4f1d0c4eed6e9370daab189a7e92dece3e421b7ab99c3140a9737237481e3f6  docs/exercise-art/sources/pose-locked-20261028/assault-bike/assault-final.blend
```
