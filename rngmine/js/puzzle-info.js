/* Add or edit puzzle entries here. oddsDenominator means a 1-in-N chance per coal broken. */
window.RNGMINE_PUZZLE_INFO = [
  {
    id: "dyn",
    name: "Dynamite",
    oddsDenominator: 15,
    solution: "Solve each of the three arithmetic problems and submit the answer within 15 seconds. A wrong answer or expired timer detonates the dynamite. Finish all three to defuse it."
  },
  {
    id: "wires",
    name: "Wires",
    oddsDenominator: 10,
    solution: "Drag each wire from a color on the left to the matching color on the right. Match all four wires before the timer expires; a wrong match fails the puzzle."
  },
  {
    id: "verity",
    name: "Verity",
    oddsDenominator: 30,
    solution: "Compare each room's shape with the statue in the same column. Rearrange the statue shapes by dragging one shape onto its statue, then another shape onto a different statue to swap them. Lock in when each statue's pair does not contain the shape shown in its room."
  },
  {
    id: "double",
    name: "Double Break",
    oddsDenominator: 25,
    solution: "Count each element across both phases: the three orbs shown first, plus the orb each one changes into. The cycle is Void → Solar → Arc → Void. Enter the totals using s for Solar, v for Void, and a for Arc (for example: 2s 3v 1a), then lock in."
  },
  {
    id: "captcha",
    name: "Captcha",
    oddsDenominator: 20,
    solution: "Read the five distorted characters, type them into the answer field, and choose Verify before the timer runs out."
  }
];
