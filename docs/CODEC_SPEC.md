# essg-v1 — Graph Payload Format

The binary format used for the time-series half of a stored graph.
Implementation: `src/lib/graph-codec/`. Guarded by `scripts/test-codec.mjs`.

---

## Why a custom format

One `EvalData` holds 15 signals × 3 plants × 86,400 samples ≈ 3.9 M numbers.
`JSON.stringify` produces 30–100 MB, which is why `storageInspector.ts` refuses
to stringify one just to measure it. Copying that to a shared folder once a day
per project is not viable; 0.84 MB is.

Measured on real SNTL600 telemetry (3 plants, 2026-06-02, 2.94 M samples):

| Encoding | Size | vs. JSON |
|---|---|---|
| `JSON.stringify` | 31.84 MB | 100% |
| JSON + gzip | 5.29 MB | 16.6% |
| Float32 + gzip | 4.78 MB | 15.0% |
| **essg-v1 + gzip** | **0.84 MB** | **2.6%** |

Encode 430 ms, decode 62 ms, 2,549,369 values verified, zero NaN-placement
mismatches.

> `scripts/test-codec.mjs` uses synthetic data and reports ~1.7 MB. That is
> expected and conservative: its noise is uniform random and incompressible,
> whereas real telemetry has structure. The 0.84 MB figure is the real one.

---

## The four transformations

1. **Drop `timestamps`.** The parser generates them deterministically from
   `dataDate` plus a 1 Hz loop, and `GraphPanels` only ever renders them as
   `HH:MM:SS`. The decoder regenerates them bit-identically. Removes 86,400
   `Date` objects.
2. **Drop absent plants and empty series.** The parser allocates three plants
   unconditionally, but SNTL400 has two and BESS projects one, so `plant3` on
   SNTL400 is 86,400 NaNs of nothing. 33–67% saving depending on project.
3. **Quantize, then delta-encode.** Per-series scale factors (below). 1 Hz
   telemetry barely moves between samples, so deltas are small and varints stay
   short. ~4×.
4. **Gzip** (`fflate`, already a project dependency). ~2–3×.

---

## Precision

Defined in `src/lib/graph-codec/precision.ts`. Every step is far finer than the
measuring instrument — POC meters are ~0.5% accuracy class, so 1 kW on a 60 MW
plant (0.0017%) is below the noise floor.

| Series | Step | Unit |
|---|---|---|
| `pTotal`, `pPccPVS`, `pPV`, `pBESS`, `cmdP`, `remoteP`, `dispatchP` | 0.001 | MW (1 kW) |
| `qTotal`, `qBess`, `cmdQ` | 0.001 | MVar (1 kvar) |
| `soc` | 0.01 | % |
| `freq` | 0.001 | Hz (1 mHz) |
| `vab`, `vbc`, `vca` | 0.001 | kV (1 V) |

Worst-case error is half a step (round-to-nearest): 0.005 % on SOC, which the
panels render as `toFixed(1)` and therefore never display.

> Changing any value here is a **codec change**. Bump `CODEC_ID` and keep the
> old decoder, or previously stored graphs decode at the wrong scale.

---

## Container layout

```
[uint32 LE headerLength][header JSON][block][block]…
```

The header is a `PayloadManifest`:

```jsonc
{
  "schemaVersion": 1,
  "codec": "essg-v1",
  "dataDate": "2026-06-02",
  "xCount": 86400,
  "xStepSeconds": 1,
  "series": {
    "plant1.pTotal": { "offset": 0, "length": 41233, "precision": 0.001 }
  }
}
```

Self-describing on purpose: a payload separated from its metadata row can still
be decoded. The whole container is then gzipped.

## Block encoding

A stream of varint tokens per series:

| Token | Meaning |
|---|---|
| `0x00` followed by `varint(n)` | a run of `n` NaN samples |
| any other `varint(v)` | `zigzag⁻¹(v − 1)` added to the running quantized value |

`+1` on value tokens keeps `0x00` reserved as the NaN-run marker. Varints use
arithmetic rather than bitwise shifts: JS bitwise operators truncate to 32 bits
signed, and a first-sample delta already reaches ~2×10⁵.

Long NaN runs — an offline plant, a maintenance window — cost about two bytes
total, which is why dropping absent plants is an optimisation rather than a
correctness requirement.

---

## Compatibility

Decoders must read **every** codec version ever shipped: an engineer on last
month's build has to be able to open a graph published today. Version branches
are added to `decode.ts`, never replaced. A payload whose `codec` is unknown
produces an actionable error telling the user to update, rather than a corrupt
graph.

`GraphRecordMeta.payload.codec` records the writer's version, so a future
migration can find every record needing attention with a metadata scan and no
payload reads.
