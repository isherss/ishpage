(() => {
  const canvas = document.getElementById("projectMapCanvas");
  const status = document.getElementById("mapStatus");
  const title = document.getElementById("projectTitle");
  const prompt = document.getElementById("projectPrompt");
  const facts = document.getElementById("projectFacts");
  const description = document.getElementById("projectDescription");

  if (!window.L) {
    status.textContent = "The map library could not load. Check your internet connection and reload.";
    return;
  }

  const map = L.map(canvas, { scrollWheelZoom: false }).setView([41.88, -87.63], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(map);

  const projectAreas = typeof PROJECT_AREAS !== "undefined" && Array.isArray(PROJECT_AREAS) ? PROJECT_AREAS : [];
  const layers = [];

  function showProject(project) {
    title.textContent = project.title || "Project";
    prompt.hidden = true;
    facts.replaceChildren();
    const pairs = [
      ["Location", project.location],
      ["Dates", project.dates],
      ["Role", project.role]
    ].filter(([, value]) => value);
    pairs.forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      facts.append(term, detail);
    });
    facts.hidden = pairs.length === 0;
    description.textContent = project.description || "Add project details in work/project-areas.js.";
    if (project.link) {
      const link = document.createElement("a");
      link.href = project.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "More project information ↗";
      link.className = "work-project-link";
      description.append(document.createElement("br"), link);
    }
  }

  projectAreas.forEach((project) => {
    let layer;
    if (Array.isArray(project.polygon) && project.polygon.length >= 3) {
      layer = L.polygon(project.polygon, { color: "#39ff78", weight: 2, fillColor: "#27f549", fillOpacity: 0.22 });
    } else if (Array.isArray(project.bounds) && project.bounds.length === 2) {
      layer = L.rectangle(project.bounds, { color: "#39ff78", weight: 2, fillColor: "#27f549", fillOpacity: 0.22 });
    }
    if (!layer) return;

    layer.addTo(map);
    layer.bindTooltip(project.title || "Project area", { sticky: true });
    layer.on("click", () => showProject(project));
    layers.push(layer);
  });

  if (layers.length) {
    map.fitBounds(L.featureGroup(layers).getBounds().pad(0.18));
    status.textContent = `${layers.length} project area${layers.length === 1 ? "" : "s"} shown. Select an area for details.`;
  } else {
    status.textContent = "Map ready. Add project areas in work/project-areas.js to highlight locations.";
  }

  window.addEventListener("resize", () => map.invalidateSize());
})();
