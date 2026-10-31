/*
  Edit minigame odds and timers here.
  oddsDenominator: 1-in-N chance each time coal breaks.
  timeLimitSeconds: timer duration for a real puzzle (practice remains unlimited).
*/
window.RNGMINE_MINIGAME_SETTINGS = {
  destiny2PuzzlesEnabledByDefault: false,
  dynamite: { oddsDenominator: 15, timeLimitSeconds: 20, problemCount: 3 },
  wires:    { oddsDenominator: 10, timeLimitSeconds: 10 },
  verity:   { oddsDenominator: 30, timeLimitSeconds: 20 },
  double:   { oddsDenominator: 25, timeLimitSeconds: 20 },
  captcha:  { oddsDenominator: 15, timeLimitSeconds: 10 },
  memory:   { oddsDenominator: 15, timeLimitSeconds: 15, previewSeconds: 3, tileCount: 6 }
};