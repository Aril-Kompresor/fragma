# Simulation Page Rules

This directory contains the data simulation tool for Fragma.

## Purpose
The Simulation page (`/simulation/index.html`) is a developer utility that injects dummy data into all entities at a configurable interval. This allows the user to test and visualize the "Global View" and "Dashboard" graphs without needing physical IoT hardware.

## Key Behaviors
1. **Simulation Loop**: The `js/simulation.js` script runs a `setInterval` loop when started.
2. **Data Injection**: It calls `/api/simulate.php` which automatically parses each entity's fields and inserts sensible random data (e.g., random numbers for 'number' types).
3. **Activity Log**: Displays a terminal-like log of simulated pushes so the user knows it is working.

## Constraints
- Follow all root `AGENTS.md` rules.
- Do not use any frontend framework.
- The interface should match the dark, clean theme of the rest of the application.
