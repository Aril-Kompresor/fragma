# View Page Rules

This directory contains the "Global View" interface for Fragma.

## Purpose
The View page (`/view/index.html`) acts as a unified dashboard that queries and displays visual widgets (Line Charts, Value Cards) across all created entities. It allows users to monitor their entire IoT ecosystem in a single page.

## Key Behaviors
1. **Aggregated Fetching**: The `js/view.js` script fetches all widgets by omitting the `entity_id` parameter to `/api/widgets.php`.
2. **Data Point Mapping**: It dynamically fetches recent data points (`/api/data.php?entity_id=X&limit=50`) for each unique entity that has an active widget.
3. **Adding Visuals**: Users can add a new widget directly from this global view. The modal fetches a list of all entities, and upon selecting an entity, it populates the available fields to visualize.

## Constraints
- Follow all root `AGENTS.md` rules.
- Do not introduce UI frameworks.
- Do not put comments inside functions.
- Reuse `js/widgets/line-chart.js` and `js/widgets/value-card.js` for rendering.
