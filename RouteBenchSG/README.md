# RouteBench Benchmark Gallery

Benchmark-style static gallery for the Singapore color-route-choice benchmark.

From the repository root:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

The root page redirects to:

```text
http://localhost:8080/benchmark_gallery/
```

The gallery currently reads:

```text
data/experiments/color_route_choice_benchmark_300_interactive/manifest.json
```

Current UI features:

- difficulty filter
- direct-distance filter
- rendered map viewer
- interactive origin-point map for starting-point filtering
- candidate-route list with distance, time, and OSM node counts
