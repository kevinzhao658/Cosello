# Fixtures

Empty by design. Drop real local images here at the relative paths declared in
`CANARIES` inside `../listing_eval.py`, e.g.:

```
fixtures/
  clothing/
    nike_drifit_front.jpg
    nike_drifit_carelabel.jpg
    levis_501_front.jpg
    ...
  furniture/
  electronics/
  sports/
  collectibles/
  other/
```

Do not commit images. Missing fixtures are skipped (not errored) by the harness.
