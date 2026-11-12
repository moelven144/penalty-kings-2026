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

### Characters and animation (for milestone d; not used in the game yet)

| File in repo | What it is | Source | Licence | Changes |
| --- | --- | --- | --- | --- |
| `v3/assets/characters/Superhero_Male_FullBody.gltf/.bin`, `Superhero_Female_FullBody.gltf/.bin` | Rigged base bodies (65-joint skeleton, about 14k triangles each with hair and eyes) | Quaternius, "Universal Base Characters" (Standard, free version), https://quaternius.com. Zip downloaded by the owner; folder `Base Characters/Godot - UE` | CC0 1.0 (the pack's own `License_Standard.txt`, copied to `v3/assets/characters/LICENSE-UniversalBaseCharacters.txt`) | Texture paths in the .gltf point at our resized copies; geometry untouched |
| `v3/assets/characters/hair/*.gltf/.bin` (Buzzed, SimpleParted, Beard, Long, Buns, two eyebrow sets) | Hair meshes rigged to the head bone | Same pack, folder `Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)` | CC0 1.0 (same file) | Texture paths only |
| `v3/assets/characters/textures/T_Superhero_*`, `T_Hair_*`, `T_Eye_*` | Skin (light and dark), normal and roughness maps, hair and eye maps | Same pack, folders `Base Characters/Godot - UE` and `Base Characters/Textures` | CC0 1.0 (same file) | Resized 2048 to 1024 and saved as JPEG (eye maps kept as PNG); `Male_Ligh` renamed `Male_Light` |
| `v3/assets/characters/UAL1_Standard.glb` | 43 animation clips on the same skeleton (idle, walk, jog, sprint, jump, roll and others) | Quaternius, "Universal Animation Library" (Standard), https://quaternius.com. Zip downloaded by the owner; folder `Unreal-Godot` | CC0 1.0 (the pack's own `License.txt`, copied to `v3/assets/characters/LICENSE-UniversalAnimationLibrary.txt`) | None. Clips with weapons will not be used and will be stripped when the file is trimmed for release |
| `assets-src/mocap/cmu/10.asf`, `10_0{1,2,3,5,6}.amc` (source data, **not shipped in the app**) | Motion capture of a football kick, five takes | CMU Graphics Lab Motion Capture Database, subject 10: https://mocap.cs.cmu.edu/search.php?subjectnumber=10 | "May be copied, modified, or redistributed without permission" (https://mocap.cs.cmu.edu/faqs.php, quoted in `assets-src/mocap/cmu/LICENSE.txt`). Not CC0 in name, but equivalent in effect; credit is given anyway | None yet. In milestone (d) one take is retargeted to the Quaternius skeleton and cleaned |

The two Quaternius licence files were read from inside the downloaded zips before anything was copied.
Not copied from the packs: the Unity/FBX variants, the 2048 px originals and the preview images.

## Code libraries (not assets, listed for completeness)

| Files | What | Licence |
| --- | --- | --- |
| `v3/vendor/three.module.min.js`, `v3/vendor/addons/**` | Three.js r187 and its post-processing addons | MIT (`v3/vendor/THREE-LICENSE`) |

## Made by us (own work, in code)

Stadium, roof, floodlights, LED board artwork (our own branding only), sky and
stars, pitch shader and markings, grass blades, goal and net, ball panel
artwork, crowd figures and flags, all UI.

## Planned, not yet added

- Keeper dives, saves and reactions: hand-animated on the Quaternius skeleton (own work), milestone (d)
- Recorded crowd and ball sounds (CC0 only), milestone (e), otherwise synthesised
