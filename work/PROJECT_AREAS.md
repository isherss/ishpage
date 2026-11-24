# Adding project areas

Open `project-areas.js` and add one object to the `PROJECT_AREAS` array for each project. The live work map only shows the areas saved in that file; it has no visitor drawing or editing tools.

For a quick rectangular area, use `bounds` with southwest and northeast latitude/longitude coordinates:

```js
{
  title: "Project title",
  location: "City, State",
  dates: "2023–2025",
  role: "Your role",
  description: "A short project summary.",
  bounds: [[41.80, -87.80], [41.95, -87.55]]
}
```

For a custom outline, replace `bounds` with `polygon` and list at least three `[longitude, latitude]` points in order around the area. This matches the coordinate order commonly copied from mapping tools. Add another object after a comma to include another project. Only the project title and geometry are required. Set `polygonOrder: "latlng"` only if your points are in `[latitude, longitude]` order.
