# Asset register (v3 rebuild)

Every asset in `v3/` is listed here with its source and licence. Rule: made by
us, or CC0-equivalent. Nothing from any other game; no real kits, crests,
sponsors, players or stadiums. This file moves to `v3/ASSETS.md` at the final swap.

## Third-party assets

| File in repo | What it is | Source | Licence | Changes |
| --- | --- | --- | --- | --- |
| `v3/assets/textures/grass_detail.jpg` | Grass colour detail (only its brightness is used) | Poly Haven, "Sparse Grass": https://polyhaven.com/a/sparse_grass (1k diffuse) | CC0 1.0 | Re-compressed JPEG |
| `v3/assets/textures/grass_normal.jpg` | Grass surface normal map | Poly Haven, "Sparse Grass" (1k normal, GL) | CC0 1.0 | Re-compressed JPEG |
| `v3/assets/textures/concrete_diff.jpg` | Concrete colour | Poly Haven, "Concrete Wall 008": https://polyhaven.com/a/concrete_wall_008 (1k diffuse) | CC0 1.0 | Re-compressed JPEG |
| `v3/assets/textures/concrete_normal.jpg` | Concrete normal map | Poly Haven, "Concrete Wall 008" (1k normal, GL) | CC0 1.0 | Re-compressed JPEG |
| `v3/assets/textures/concrete_rough.jpg` | Concrete roughness | Poly Haven, "Concrete Wall 008" (1k roughness) | CC0 1.0 | Re-compressed JPEG |

Poly Haven's licence page: https://polyhaven.com/license (all assets CC0).

## Code libraries (not assets, listed for completeness)

| Files | What | Licence |
| --- | --- | --- |
| `v3/vendor/three.module.min.js`, `v3/vendor/addons/**` | Three.js r187 and its post-processing addons | MIT (`v3/vendor/THREE-LICENSE`) |

## Made by us (own work, in code)

Stadium, roof, floodlights, LED board artwork (our own branding only), sky and
stars, pitch shader and markings, grass blades, goal and net, ball panel
artwork, crowd figures and flags, all UI.

## Planned, not yet added

- Player and keeper body: Quaternius "Universal Base Characters" (CC0), milestone (d)
- Striker motion: CMU Graphics Lab Motion Capture Database (free for any use), milestone (d), if a verifiable copy is reachable
- Recorded crowd and ball sounds (CC0 only), milestone (e), otherwise synthesised
