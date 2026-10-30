/* Edit each puzzle solution below. Odds and timers come from minigame-settings.js. Changes load on the next page refresh. */
(function(){
  var settings=window.RNGMINE_MINIGAME_SETTINGS;
  window.RNGMINE_PUZZLE_INFO = [
    {
      id: "dyn",
      name: "Dynamite",
      oddsDenominator: settings.dynamite.oddsDenominator,
      timeLimitSeconds: settings.dynamite.timeLimitSeconds,
      solution: "Solve "+settings.dynamite.problemCount+" math problems (addition/subtraction up to 2 digits) within "+settings.dynamite.timeLimitSeconds+" seconds. A wrong answer or expired timer detonates the dynamite. Finish all "+settings.dynamite.problemCount+" to defuse it."
    },
    {
      id: "wires",
      name: "Wires",
      oddsDenominator: settings.wires.oddsDenominator,
      timeLimitSeconds: settings.wires.timeLimitSeconds,
      solution: "Match the wires with each other (like among us)."
    },
    {
      id: "verity",
      name: "Verity",
      oddsDenominator: settings.verity.oddsDenominator,
      timeLimitSeconds: settings.verity.timeLimitSeconds,
      solution: "Exactly like Verity dissection from Salvations's Edge (Destiny 2). The inside room has 3 2D shapes assigned to them on each side. The outside room has 3 3D shapes on each side that are made of 2 2D shapes (eg. cone = triange + cirlcle). The outside shape cannot contain the 2D shape on the same side. Drag one of the 2D shapes on the bottom into the 3D shape to swap out the 2D shape in the 3D shape with another 2D shape in another 3D shape. Keep swapping until all 3 3D shapes don't have the shape assigned to their side."
    },
    {
      id: "double",
      name: "Double Break",
      oddsDenominator: settings.double.oddsDenominator,
      timeLimitSeconds: settings.double.timeLimitSeconds,
      solution: "Exactly like double break callouts from Argos, Planetary Core in Eater of Worlds (Destiny 2). Given 3 orbs, you can callout the next 3 orbs that spawn as well since they follow the 'Void -> Solar -> Arc -> Void' rotation. So to callout the double break, you have to count the orbs in the first phase and what will spawn in the second phase, then total it. It will be in the format of Xv Xs Xa, v = void, s = solar, a = arc."
    },
    {
      id: "memory",
      name: "Memory Grid",
      oddsDenominator: settings.memory.oddsDenominator,
      timeLimitSeconds: settings.memory.timeLimitSeconds,
      solution: "Memorize "+settings.memory.tileCount+" lit tiles in the 4×4 grid during the "+settings.memory.previewSeconds+"-second preview. Then select them all within "+settings.memory.timeLimitSeconds+" seconds. Choosing any tile that was not lit causes an explosion."
    },    {
      id: "captcha",
      name: "Captcha",
      oddsDenominator: settings.captcha.oddsDenominator,
      timeLimitSeconds: settings.captcha.timeLimitSeconds,
      solution: "Its a captcha"
    }
  ];
})();