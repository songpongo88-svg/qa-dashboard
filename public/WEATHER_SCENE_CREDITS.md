# Weather Collection scenes

The current collection uses locally bundled, AI-generated illustrative Bangkok cityscapes in `/weather/*.webp`, created with the built-in Image Generation tool for this dashboard. These are atmospheric illustrations, not live camera images or photographs of the selected user's exact location. The prior external Wikimedia/Unsplash CSS layers are not loaded.

Shared prompt specification: `photorealistic-natural`, one 1536×1024 landscape image, detailed realistic Bangkok city skyline in the lower half, expansive weather sky above, natural cinematic editorial photography. No UI, text, labels, logo, watermark, frame or collage. Each weather scene is independently generated, rather than applying a tint to one photo. Original PNGs are converted to WebP for delivery without changing composition.

| File | Scene prompt |
| --- | --- |
| clear.webp | Clear fair midmorning, blue sky, green urban park and lake, crisp modern skyline. |
| hot.webp | Intense hot daytime sun, warm golden reflections, heat haze and modern city; not sunset. |
| partly-cloudy.webp | Bright cumulus clouds alternating with blue sky and sunshine over city and park. |
| cloudy.webp | Dense layered grey overcast sky, silver-blue light, detailed city and park, no rain. |
| light-rain.webp | Gentle daytime drizzle, fine rain, softened buildings, damp park, brighter sky opening. |
| rain.webp | Sustained monsoon rain, grey clouds, rain streaks, wet city and river reflections. |
| thunderstorm.webp | Late-afternoon storm clouds, branched lightning behind high rises, rain and warm window lights. |
| fog.webp | Early morning cool mist layered between skyscrapers, crisp nearer buildings and park trees. |
| sunshower.webp | Rain falling in sunshine, blue sky openings, white clouds, subtle rainbow, wet reflections. |
| night.webp | Clear deep blue night, small crescent moon, glowing high rises and river reflections. |
| night-cloudy.webp | Cloud layers veiling a moon above a legible Bangkok night skyline with warm windows. |
| night-rain.webp | Rainy Bangkok night, rain veils, glowing windows, wet streets and river. |
| night-thunderstorm.webp | Night storm, realistic fork of lightning behind lit skyscrapers, rain haze and wet reflections. |
| night-fog.webp | Night mist between lit buildings, warm lights through blue fog, navy sky and river. |

Weather data attribution: [Open-Meteo](https://open-meteo.com/), [API documentation](https://open-meteo.com/en/docs). Approximate automatic city location uses [Vercel request geolocation headers](https://vercel.com/docs/headers/request-headers). No browser GPS permission is requested. Coarse coordinates are rounded to two decimals before weather lookup or persistence. Users can choose a city manually; Bangkok is explicitly labelled when used as fallback.
