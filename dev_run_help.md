# BadTodo

Lokální PWA ToDo aplikace podle Eisenhowerovy matice.

## Spuštění

Kvůli ES modulům a service workeru spouštějte přes lokální server, ne přímo dvojklikem na `index.html`.

```bash
cd badtodo
python3 -m http.server 8000
```

Poté otevřete:

```text
http://localhost:8000
```

## Co aplikace obsahuje

- více kontextů,
- rekurzivní úkoly a podúkoly,
- konstantní i časově proměnnou důležitost/naléhavost,
- normalizovanou logistickou změnu mezi dvěma daty,
- IndexedDB lokální úložiště,
- import/export JSON,
- PWA manifest a service worker.
