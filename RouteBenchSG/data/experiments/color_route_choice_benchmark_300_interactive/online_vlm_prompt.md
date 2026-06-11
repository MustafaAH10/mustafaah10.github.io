# Online VLM Prompt

Use either the combined image in `with_legend/` or the map plus separate legend images in `separate_legend/`.

The image shows complete colored candidate driving routes from A to B over a faded OpenStreetMap road background. Shared road portions may be drawn as two or three parallel color stripes so overlapping routes remain visible.

Pick the candidate route color that is shortest by road geometry. Do not return a junction sequence. Return JSON only:

{"shortest_route_color":"blue","route_index":"R1"}