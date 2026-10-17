# Earth imagery

Public-domain NASA imagery. NASA does not endorse this student project.

The flight globe uses four equirectangular maps, each stored at 4096×2048 and 2048×1024 in `public/textures/earth/{4k,2k}/`.

- **Day** — Blue Marble: Next Generation, December 2004, with topography and bathymetry. [Visible Earth 73909](https://visibleearth.nasa.gov/images/73909/december-blue-marble-next-generation). Source file: `world.topo.bathy.200412.3x21600x10800.jpg`.
- **Night** — Black Marble 2016, city lights. [Visible Earth 144898](https://visibleearth.nasa.gov/images/144898/earth-at-night-black-marble-2016). Source file: `BlackMarble_2016_3km.jpg`.
- **Clouds** — Blue Marble cloud map, a MODIS composite. [Visible Earth 57747](https://visibleearth.nasa.gov/images/57747/blue-marble-clouds). Source file: `cloud_combined_8192.tif`.
- **Ocean specular mask** — derived from the Blue Marble Next Generation land/water mask `world.watermask.21600x10800.png` ([NEO landmask archive](https://neo.gsfc.nasa.gov/archive/bluemarble/bmng/landmask/)). In that file water is black and land is white, including inland water such as the Great Lakes. The specular map is the mask inverted, so water is white.

A phone, a small window, or a low-density display loads the 2K set. A large desktop with a device pixel ratio of at least 1.5 loads the 4K set. If any texture fails to load, the globe keeps the painted map.

Follow-up: `components/ui/Credits.tsx` is owned by the mascot branch. When these branches merge, add this line to that footer: Earth imagery: NASA Visible Earth (Blue Marble, Black Marble, clouds, and the land/water mask), public domain.
