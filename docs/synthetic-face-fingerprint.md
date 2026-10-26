# Synthetic face image fingerprint specification

Status: version 1 (`v=1`). Normative for producers and consumers of the
fingerprint.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used as in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Purpose and scope

A synthetic face photo is an image of one face of a Rubik's cube that a program
rendered instead of a camera taking it. Such photos are test data for color
recognition. A reader that only sees the image file (an importer, a test
harness) cannot tell a rendered photo from a camera photo, and cannot render
the same photo again.

The fingerprint is a small JSON object stored in the image file's metadata. It
says that the photo is synthetic and with which settings it was made, so a
reader can tell the two apart and reproduce the photo.

This document specifies the object, where each image container stores it, how
a consumer reads it, and how a consumer groups six photos into one synthetic
fixture. It does not specify the renderer, the pixels, or any cube state. The
pixels do not depend on the fingerprint: a photo has the same pixels with and
without it.

This is a different artifact from the
[CubeAssembler fingerprint](cubeassembler-fingerprint.md). That one is a
`<meta>` marker and a `<script type="application/json">` block in a web page
and carries a cube size and a move history. This one lives in an image file
and carries rendering settings. They share no fields, no marker and no
consumer. CubeLab itself never reads the synthetic face fingerprint; it is
specified here because CubeLab hosts the normative contract and its schema.

Reference implementations:

- Producer: cubacle, command
  `cubacle photo` (PNG, renderer `rust/v1`).
- Producer and consumer: [CubeAssembler](https://github.com/wstein/cube-assembler),
  `docs/synthetic-face-generator-spec.md`, section 13 (JPEG, renderer
  `parametric/v1`; reads both containers).

## Versioning

- `v` is the version of this contract. This document specifies `v=1`.
- `v` rises only for a breaking change: a field removed, renamed or
  reinterpreted, or a changed meaning of an existing value.
- A producer MAY add fields to the object, and keys to `options`, without
  changing `v`. A consumer MUST ignore fields and option keys it does not
  know.
- A consumer MUST treat a `v` it does not implement as if the fingerprint
  were absent (see [Consumer behavior](#consumer-behavior)). It MUST NOT apply
  the rules of `v=1` to another `v`.
- A new `renderer` value does not change `v`. The renderer names which program
  and which version of its drawing code made the pixels (see below).

## Containers

The fingerprint is one JSON object (RFC 8259) in UTF-8. A producer MUST NOT
write more than 65 518 bytes of JSON (a JPEG comment holds at most 65 533 bytes
in all, minus the 15 bytes of the prefix `cube-assembler:`) and fails instead
of writing more. cubacle limits itself to 60 000 bytes. A consumer SHOULD accept
JSON up to 65 518 bytes and MAY ignore a longer text.

| Container | Where                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------- |
| PNG       | A `tEXt` chunk with the keyword `cube-assembler`, a NUL byte, then the JSON. The chunk comes before the first `IDAT`. |
| JPEG      | A comment segment (marker `FFFE`) right after SOI, holding the text `cube-assembler:` followed by the JSON. |

- A PNG `tEXt` text is Latin-1 by the PNG specification. A producer SHOULD
  therefore MUST write ASCII only and escape every other character as `\uXXXX`
  (the Rust producer does so). ASCII is identical in Latin-1 and UTF-8.
- A consumer MUST read the JSON text as UTF-8, so a PNG written by a producer
  that did not follow the ASCII rule is still read.
- A JPEG comment segment holds at most 65533 bytes in all, including the
  `cube-assembler:` prefix, which is why the JSON limit is 65 518.
- A consumer MUST NOT require the JPEG segment at a fixed position: it looks
  for it anywhere before the start of scan (SOS). The producers place it right
  after SOI or, in one case, after the JFIF segment (see
  [Known deviations](#known-deviations-between-the-sources)).
- A file carries at most one fingerprint. If a file has several `tEXt` chunks
  with the keyword `cube-assembler` (or several matching comment segments), a
  consumer ignores the fingerprint. This rule is new in `v=1`; it is not in
  the earlier sources (see Known deviations).
- Other containers (WebP, HEIF) are not defined by `v=1`.

## The object

```json
{"v":1,"renderer":"rust/v1","preset":"glare","seed":5,"face":"u","size":32,"options":{"scatter":1,"noise":12,"brightness":0.9,"shadow":{"strength":0.3,"shape":"corner"}},"app":{"version":"0.1.0"}}
```

A producer writes the fields in this fixed order. A consumer MUST NOT depend
on the order.

| Field      | Type    | Required | Meaning                                                                                     |
| ---------- | ------- | -------- | ------------------------------------------------------------------------------------------- |
| `v`        | integer | yes      | The version of this contract. For this document always `1`.                                 |
| `renderer` | string  | yes      | The producer and the version of its drawing code. `rust/v1` is written by cubacle, `parametric/v1` by CubeAssembler. Other values match `^[a-z0-9-]+/v[0-9]+$`. |
| `preset`   | string  | yes      | The lighting preset: one of `clean`, `scatter`, `real`, `gradient`, `shadow`, `dim-warm`, `glare`, `noise`, `bad-camera`. cubacle has no `real`. |
| `seed`     | integer | yes      | The seed of **this** face's photo, that is the base seed plus the face number: the index of the face in the order `U R F D L B` (0 to 5). cubacle wraps on 32-bit overflow. Not the base seed. |
| `face`     | string  | yes      | The face the photo shows, lowercase: `u`, `r`, `f`, `d`, `l` or `b`.                        |
| `size`     | integer | yes      | The side of the photo in pixels, at least 1.                                                |
| `options`  | object  | yes      | The generator options that were given, see below. No options gives `{}`.                    |
| `app`      | object  | yes      | `{"version": string}`, the version of the producing program. No commit hash, so output stays reproducible. |

Other fields MAY be present and MUST be ignored by a consumer that does not
know them.

### The `renderer` field

`renderer` says which drawing code made the pixels. Two renderers with the
same settings need not produce the same bytes: `rust/v1` and `parametric/v1`
agree on the design but not byte for byte. A consumer that wants to render the
photo again MUST NOT assume that a renderer it does not implement gives the
same pixels. The pattern `^[a-z0-9-]+/v[0-9]+$` lets a future producer name
itself without a schema change; the schema accepts any value of that shape.

### The `options` object

`options` holds exactly the options that were given, so defaults are left out.
cubacle writes them in the order below; the order carries no meaning. Every key is optional:

| Key          | Value                                                              |
| ------------ | ------------------------------------------------------------------ |
| `scatter`    | number, scale of the color scatter between stickers                |
| `tone`, `shading`, `faceShift` | numbers, used by the `real` preset (CubeAssembler only) |
| `lightness`  | number, scale of the brightness jitter between stickers            |
| `palette`    | object, a letter to `[r,g,b]` (letters sorted)                     |
| `logo`       | object `{row, col, color, size}`                                   |
| `noise`      | number, sigma of the noise in levels 0 to 255                      |
| `blur`       | number, box blur radius in pixels                                  |
| `brightness` | number, factor on every channel                                    |
| `shadow`     | object `{strength, shape, softness}`; `shape` is `band`, `half`, `spot` or `corner`; each member is optional |
| `geometry`   | object `{margin, gap, radius}`                                     |

Numbers are written in the shortest form that reads back the same (`12`,
`0.2`). A value JSON cannot hold (NaN, infinity) is written as `null`. `null`
is not the same as an absent key: a consumer MUST NOT assume it can render such
a photo again. A producer SHOULD reject non-finite option values instead of
writing them. A consumer that does not render again MUST ignore option keys it
does not know (a consumer that renders again follows the
[security rules](#security-considerations)). The schema checks the types of
the known keys only; for `logo` it requires no member and sets no length limit
on `color`. Two `options` objects are equal when they are equal as JSON values,
whatever the key order.

## Consumer behavior

### Reading

A consumer reading the fingerprint:

1. MUST read the metadata with a container parser (PNG chunks, JPEG
   segments), not by searching the file's bytes for text.
2. MUST parse the JSON with a strict JSON parser. It MUST NOT evaluate it
   (`eval`, `new Function`) and MUST NOT put values into markup, commands or
   file paths without escaping.
3. SHOULD bound its input before parsing: it SHOULD accept up to 65 518 bytes
   of JSON and MAY ignore a longer text.
4. MUST NOT let the fingerprint change how it reads the pixels. The pixels
   carry no fingerprint influence.

### When the fingerprint is ignored

A consumer MUST ignore the fingerprint (and treat the file as a photo without
one, without showing an error) when any of the following holds:

- the container has no `cube-assembler` chunk or `cube-assembler:` comment, or
  has more than one;
- the text is not valid JSON, or the JSON is not an object;
- `v` is missing or is not a value the consumer implements;
- a required field is missing or has the wrong type;
- `face` is not one of `u r f d l b`, or `size` or `seed` is not an integer;
- `renderer` does not match `^[a-z0-9-]+/v[0-9]+$`.

A consumer that does not know a `preset` or a `shadow.shape` value of the
shape `^[a-z0-9-]+$` keeps the string (or ignores the fingerprint); it MUST NOT
fail on it. A consumer MUST NOT assume that it can render such a photo again.

### Synthetic fixtures

Six photos form one synthetic fixture when all of these hold:

- all six have a valid fingerprint;
- `renderer`, `preset`, `size` and `options` are identical in all six (equal
  as JSON values, not as text);
- the `face` letters are six distinct values, that is all of `u r f d l b`, and
  each photo is assigned to the face it names.

`seed` is not compared: it differs per face by design. `app.version` is not
compared either. A set that fails any condition is a set of camera photos or
of mixed provenance and is not marked synthetic. CubeAssembler marks a
matching set as synthetic by a `synt-` name, the `synthetic` tags and
`capture.synthetic`; how a consumer marks it is its own choice.

## Producer behavior

- The `tEXt` chunk (PNG) or the comment segment (JPEG) MUST be placed as
  described under [Containers](#containers).
- The object MUST validate against the
  [JSON Schema](#json-schema) and carry all eight fields.
- `seed` MUST be the seed of the face the photo shows.
- `options` MUST list the options that were given, not the effective values
  with defaults.
- The producer SHOULD offer a way to leave the fingerprint out. A contact sheet
  that holds six faces in one image has no single `face`, so it MUST NOT carry
  a fingerprint.
- The pixels MUST NOT depend on whether the fingerprint is written.

## JSON Schema

The JSON Schema (draft 2020-12) is published with CubeLab:

<https://wstein.github.io/cubelab/schemas/synthetic-face-fingerprint-v1.schema.json>

Its source is `public/schemas/synthetic-face-fingerprint-v1.schema.json` in
this repository. The schema checks syntax only. It does not set
`additionalProperties` to false, in keeping with the forward-compatibility
rule above, and it cannot express the fixed field order or the
fixture rules. Where this document and the schema disagree, this document is
authoritative and the schema is to be corrected.

## Security considerations

- The fingerprint is untrusted input: any file can carry it, and a hostile
  file can carry a hostile one. It proves nothing about the file's origin. A
  consumer MUST NOT grant extra privileges because a file carries it.
- Consumers read only the metadata container and parse it as strict JSON with
  a bounded size and a fixed set of known field types. Strings from the
  fingerprint are data: they MUST NOT be evaluated, executed, or used to
  build file paths or commands.
- A consumer that renders a photo again from the fingerprint MUST bound `size`
  and every option value before it allocates or draws, and MUST refuse (not
  silently ignore) option keys it does not implement, since ignoring them would
  render another photo.
- A JavaScript consumer MUST NOT merge the parsed object into existing objects
  (for example with `Object.assign` or a deep merge): a key such as `__proto__`
  could change object prototypes. It reads the known fields into fresh values.
- Decompression is not involved: `tEXt` is uncompressed. A consumer SHOULD NOT
  expand other text chunk types (`zTXt`, `iTXt`) as a fingerprint.

## Privacy considerations

The fingerprint carries rendering settings only: the renderer, the lighting
preset, seed, face, size, options and the version of the producing program. A
producer MUST NOT put device data, user or person data, file paths, host
names, timestamps or anything else personal into it, and MUST NOT transmit
anything because of it. A camera photo's EXIF data is separate and is not part
of this contract.

## Examples

### Valid

Written by `cubacle photo --scramble "R U" --pixels 32 --preset glare --seed 5 --noise 12 --shadow-shape corner` into `U.png` (checked by running the command and reading the chunk):

```json
{"v":1,"renderer":"rust/v1","preset":"glare","seed":5,"face":"u","size":32,"options":{"noise":12,"shadow":{"shape":"corner"}},"app":{"version":"0.1.0"}}
```

No options given:

```json
{"v":1,"renderer":"rust/v1","preset":"clean","seed":3,"face":"f","size":32,"options":{},"app":{"version":"0.1.0"}}
```

An illustrative JPEG comment segment as CubeAssembler writes it (not produced by a run):

```text
cube-assembler:{"v":1,"renderer":"parametric/v1","preset":"clean","seed":6,"face":"b","size":600,"options":{},"app":{"version":"1.4.0"}}
```

A palette value that is not finite is written as `null` (valid; a consumer cannot render such a photo again):

```json
{"v":1,"renderer":"rust/v1","preset":"clean","seed":1,"face":"u","size":64,"options":{"palette":{"X":[null,0,0]}},"app":{"version":"0.1.0"}}
```

An unknown preset name or `shadow.shape` is valid too, as long as it has the shape `^[a-z0-9-]+$`:

```json
{"v":1,"renderer":"example-lab/v2","preset":"fog","seed":2,"face":"r","size":64,"options":{"shadow":{"shape":"wedge"}},"app":{"version":"2.0.0"}}
```

A future producer and extra fields (accepted, extras ignored):

```json
{"v":1,"renderer":"example-lab/v2","preset":"noise","seed":9,"face":"d","size":64,"options":{"noise":20,"vignette":0.3},"app":{"version":"2.0.0"},"note":"ignored"}
```

### Invalid (consumer ignores the fingerprint)

| Input                                                                                   | Reason                                  |
| --------------------------------------------------------------------------------------- | --------------------------------------- |
| `{"v":2,"renderer":"rust/v1",...}`                                                      | unknown `v`                             |
| `{"v":"1",...}`                                                                         | `v` not an integer                      |
| `{"v":1,"renderer":"Rust v1",...}`                                                      | `renderer` does not match the pattern   |
| `{"v":1,"renderer":"rust/v1","preset":"clean","seed":3,"face":"F",...}`                 | `face` must be lowercase                |
| `{"v":1,"renderer":"rust/v1","preset":"clean","seed":3,"face":"x",...}`                 | `face` is not one of `u r f d l b`      |
| `{"v":1,"renderer":"rust/v1","preset":"clean","seed":"3","face":"f",...}`               | `seed` not an integer                   |
| `{"v":1,"renderer":"rust/v1","preset":"clean","seed":3,"face":"f","size":0,...}`        | `size` below 1                          |
| `{"v":1,"renderer":"rust/v1","preset":"clean","seed":3,"face":"f","size":32,"app":{}}`  | `options` missing and `app.version` missing |
| `{"v":1,"renderer":"rust/v1","preset":"clean","seed":3,"face":"f","size":32,"options":[],"app":{"version":"0.1.0"}}` | `options` is not an object |
| `[{"v":1}]`                                                                             | JSON is not an object                   |
| a PNG with two `cube-assembler` chunks                                                  | more than one fingerprint               |

## Conformance checklist

Producer:

- [ ] PNG: one `tEXt` chunk with keyword `cube-assembler` before the first
      `IDAT`; JPEG: a `FFFE` segment right after SOI with
      `cube-assembler:` and the JSON.
- [ ] JSON object in UTF-8 (PNG: ASCII with `\uXXXX` escapes), at most 65 518
      bytes (cubacle: 60 000); fails instead of writing more.
- [ ] Non-finite option values are rejected, not written as `null`.
- [ ] All eight fields in the fixed order, `v` is `1`; validates against the
      published schema.
- [ ] `seed` is the seed of the face shown; `face` is lowercase.
- [ ] `options` lists the options given, none gives `{}`.
- [ ] `app` has only `version`, no commit; nothing personal anywhere.
- [ ] A contact sheet of six faces has no fingerprint.
- [ ] Pixels are the same with and without the fingerprint.

Consumer:

- [ ] Reads the metadata with a container parser, as UTF-8, with a strict
      JSON parser; never evaluates it.
- [ ] Ignores silently a missing, duplicated, malformed or wrong-version
      fingerprint.
- [ ] Ignores unknown fields and unknown option keys.
- [ ] Groups six photos into a fixture only when `renderer`, `preset`, `size`
      and `options` are equal and the six `face` letters are distinct.
- [ ] Does not compare `seed` or `app` for the grouping.
- [ ] Does not let the fingerprint change how it reads the pixels.
- [ ] Treats all values as data: no markup, paths or commands built from them.

## Known deviations between the sources

Found while checking this document against the two implementations; recorded
so they can be corrected at the source.

- Size: cubacle limits the JSON to 60 000 bytes. CubeAssembler enforces only
  the 65 533-byte JPEG segment limit. This document sets 65 518 for the JSON.
- Several fingerprints in one file: CubeAssembler's reader takes the first
  `cube-assembler` chunk. This document says to ignore the file (new in `v=1`).
- Validation: CubeAssembler's reader checks no field and accepts any JSON
  object. This document requires the checks under "When the fingerprint is
  ignored".
- Options equality: CubeAssembler compares the serialized text of `options`.
  That works because all six photos of one render share one options object;
  this document compares them as JSON values.
- JPEG position: CubeAssembler writes the comment segment before APP0/JFIF,
  not right after SOI as the Containers table says for new producers. A
  consumer finds the segment anywhere before SOS.

## Open questions

1. **Registry of `renderer` values.** There is none beyond `rust/v1` and
   `parametric/v1`. Whether CubeLab should host one is undecided.
