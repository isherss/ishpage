(async () => {
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

  const map = L.map(canvas, { scrollWheelZoom: true }).setView([41.88, -87.63], 5);
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(map);
  tiles.on("tileerror", () => {
    status.textContent = "Map tiles could not load. Check your connection or whether this network blocks OpenStreetMap.";
  });

  let projectAreas;
  try {
    const projectDataUrl = new URL("/work/project-areas.js", window.location.href);
    projectDataUrl.searchParams.set("refresh", Date.now().toString());
    ({ PROJECT_AREAS: projectAreas } = await import(projectDataUrl.href));
    if (!Array.isArray(projectAreas)) throw new Error("Project data must export a PROJECT_AREAS array.");
  } catch (error) {
    console.error("Could not load project areas:", error);
    status.textContent = "Project areas could not be loaded. Check work/project-areas.js and reload.";
    return;
  }
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
      const positions = project.polygon.map(([first, second]) =>
        project.polygonOrder === "latlng" ? [first, second] : [second, first]
      );
      layer = L.polygon(positions, { color: "#39ff78", weight: 2, fillColor: "#27f549", fillOpacity: 0.22 });
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
