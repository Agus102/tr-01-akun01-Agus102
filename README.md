# token-radar-01 — Token Launch Radar

A ranked radar of pre-token protocols: it reads the sealed DefiLlama snapshot, scores every
protocol with a model calibrated on the snapshot itself (the multiple that turns TVL into an
implied token value is read off the live-token protocols in the same file, not hard-coded),
and writes the board, a static dashboard and the judge dossier.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Under the grader, `/input/snapshot.json` and `/output` are the paths.
