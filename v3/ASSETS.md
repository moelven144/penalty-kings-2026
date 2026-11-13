# Asset register (v3 rebuild)

Every asset in `v3/` is listed here with its source and licence. Rule: made by
us, or CC0-equivalent. Nothing from any other game; no real kits, crests,
sponsors, players or stadiums.

## Third-party assets

| File in repo | What it is | Source | Licence | Changes |
| --- | --- | --- | --- | --- |
| `v3/assets/textures/grass_detail.jpg` | Grass colour detail (only its brightness is used) | Poly Haven, "Sparse Grass": https://polyhaven.com/a/sparse_grass (1k diffuse) | CC0 1.0 | Re-compressed JPEG |
| `v3/assets/textures/grass_normal.jpg` | Grass surface normal map | Poly Haven, "Sparse Grass" (1k normal, GL) | CC0 1.0 | Re-compressed JPEG |
| `v3/assets/textures/concrete_diff.jpg` | Concrete colour | Poly Haven, "Concrete Wall 008": https://polyhaven.com/a/concrete_wall_008 (1k diffuse) | CC0 1.0 | Re-compressed JPEG |
| `v3/assets/textures/concrete_normal.jpg` | Concrete normal map | Poly Haven, "Concrete Wall 008" (1k normal, GL) | CC0 1.0 | Re-compressed JPEG |
| `v3/assets/textures/concrete_rough.jpg` | Concrete roughness | Poly Haven, "Concrete Wall 008" (1k roughness) | CC0 1.0 | Re-compressed JPEG |

Poly Haven's licence page: https://polyhaven.com/license (all assets CC0).

### Characters

| File in repo | What it is | Source | Licence | Changes |
| --- | --- | --- | --- | --- |
| `v3/assets/characters/Superhero_Male_FullBody.gltf/.bin` | Rigged base body used for the striker and the keeper (65-joint skeleton, about 14k triangles with eyebrows and eyes) | Quaternius, "Universal Base Characters" (Standard, free version), https://quaternius.com. Zip downloaded by the owner; folder `Base Characters/Godot - UE` | CC0 1.0 (the pack's own `License_Standard.txt`, copied to `v3/assets/characters/LICENSE-UniversalBaseCharacters.txt`) | Texture paths in the .gltf point at our resized copies; geometry untouched. The kit (shirt, shorts, socks, boots, gloves) is painted on in our own shader |
| `v3/assets/characters/hair/Hair_Buzzed.*`, `Hair_SimpleParted.*` | Hair meshes | Same pack, folder `Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)` | CC0 1.0 (same file) | Texture paths only; attached to the head bone in code |
| `v3/assets/characters/textures/T_Superhero_Male_Dark.jpg`, `_Normal.jpg`, `_Roughness.jpg`, `T_Hair_1_*`, `T_Eye_*` | Skin, normal and roughness maps, hair and eye maps | Same pack, folders `Base Characters/Godot - UE` and `Base Characters/Textures` | CC0 1.0 (same file) | Resized 2048 to 1024 and saved as JPEG (eye maps kept as PNG) |

The Quaternius licence file was read from inside the downloaded zip before anything was copied.

All player and keeper movement (run-up, strike, dives, reactions) is our own work: joint targets
written in `v3/js/game/choreo.js` and solved onto the skeleton in `v3/js/render/character.js`.
No motion-capture data and no third-party animation clips are in the game.

### Kept in the repository but not shipped in the app (`assets-src/`)

| Files | What | Source and licence |
| --- | --- | --- |
| `assets-src/characters/Superhero_Female_*`, other hair, light skin and second hair textures | Unused parts of the same Quaternius pack | CC0 1.0, as above |
| `assets-src/characters/UAL1_Standard.glb` | Quaternius "Universal Animation Library" (Standard), 43 clips | CC0 1.0 (`assets-src/characters/LICENSE-UniversalAnimationLibrary.txt`, from the zip) |
| `assets-src/mocap/cmu/10.asf`, `10_0{1,2,3,5,6}.amc` | Motion capture of a football kick | CMU Graphics Lab Motion Capture Database, subject 10. "May be copied, modified, or redistributed without permission" (https://mocap.cs.cmu.edu/faqs.php, quoted in `assets-src/mocap/cmu/LICENSE.txt`) |

## Code libraries (not assets, listed for completeness)

| Files | What | Licence |
| --- | --- | --- |
| `v3/vendor/three.module.min.js`, `v3/vendor/addons/**` | Three.js r187 with its post-processing, glTF loader and skeleton utility addons | MIT (`v3/vendor/THREE-LICENSE`) |

## Made by us (own work, in code)

Stadium, roof, floodlights, LED board artwork (our own branding only), sky and
stars, pitch shader and markings, grass tufts, goal and cloth net, ball panel
artwork, crowd figures and flags, kit shader and its three generic shirt
templates, all player and keeper movement, all sound (synthesised in
`v3/js/game/audio.js`, no audio files), icons, and all UI. System fonts only.
