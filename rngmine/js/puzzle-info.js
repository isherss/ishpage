/* Puzzle descriptions and displayed odds/timers are sourced from minigame-settings.js. */
(function(){
  var settings=window.RNGMINE_MINIGAME_SETTINGS;
  window.RNGMINE_PUZZLE_INFO = [
    {
      id: "dyn",
      name: "Dynamite",
      oddsDenominator: settings.dynamite.oddsDenominator,
      timeLimitSeconds: settings.dynamite.timeLimitSeconds,
      solution: "Solve each of the "+settings.dynamite.problemCount+" arithmetic problems and submit the answer within "+settings.dynamite.timeLimitSeconds+" seconds. A wrong answer or expired timer detonates the dynamite. Finish all "+settings.dynamite.problemCount+" to defuse it."
    },
    {
      id: "wires",
      name: "Wires",
      oddsDenominator: settings.wires.oddsDenominator,
      timeLimitSeconds: settings.wires.timeLimitSeconds,
      solution: "Drag each wire from a color on the left to the matching color on the right. Match all four wires before the timer expires; a wrong match fails the puzzle."
    },
    {
      id: "verity",
      name: "Verity",
      oddsDenominator: settings.verity.oddsDenominator,
      timeLimitSeconds: settings.verity.timeLimitSeconds,
      solution: "Compare each room's shape with the statue in the same column. Rearrange the statue shapes by dragging one shape onto its statue, then another shape onto a different statue to swap them. Lock in when each statue's pair does not contain the shape shown in its room."
    },
    {
      id: "double",
      name: "Double Break",
      oddsDenominator: settings.double.oddsDenominator,
      timeLimitSeconds: settings.double.timeLimitSeconds,
      solution: "Count each element across both phases: the three orbs shown first, plus the orb each one changes into. The cycle is Void → Solar → Arc → Void. Enter the totals using s for Solar, v for Void, and a for Arc (for example: 2s 3v 1a), then lock in."
    },
    {
      id: "captcha",
      name: "Captcha",
      oddsDenominator: settings.captcha.oddsDenominator,
      timeLimitSeconds: settings.captcha.timeLimitSeconds,
      solution: "Read the five distorted characters, type them into the answer field, and choose Verify before the timer runs out."
    }
  ];
})();