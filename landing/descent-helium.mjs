// SPDX-License-Identifier: GPL-2.0-or-later
// NASSP DPSValve::SwitchToggled, LEMDPSValveTalkback::GetState,
// IndicatorSwitch::DrawSwitch. Pinned sources in cockpit-progress.md.
const minDcVoltage = 20;
const regulatorDefinitions = {
  DESHeReg1Switch: {initialOpen: true, failOpen: true},
  DESHeReg2Switch: {initialOpen: false, failOpen: false}
};

export function createDescentHelium({commandVoltage = 28, indicatorVoltage = 28, indicatorRate = 4} = {}) {
  const valves = new Map();
  const commandPowered = commandVoltage > minDcVoltage;
  const indicatorPowered = indicatorVoltage > minDcVoltage;

  function reset() {
    for (const [id, definition] of Object.entries(regulatorDefinitions)) {
      const displayedOpen = indicatorPowered ? definition.initialOpen : definition.failOpen;
      valves.set(id, {...definition, open: definition.initialOpen, display: displayedOpen ? 3 : 0});
    }
  }
  reset();

  return {
    reset,
    get moving() {
      for (const valve of valves.values()) {
        const target = (indicatorPowered ? valve.open : valve.failOpen) ? 3 : 0;
        if (valve.display !== target) return true;
      }
      return false;
    },
    move(id, position) {
      const valve = valves.get(id);
      if (!valve || !commandPowered) return;
      if (position === 2) valve.open = true;
      if (position === 0) valve.open = false;
    },
    advance(seconds) {
      for (const valve of valves.values()) {
        const displayedOpen = indicatorPowered ? valve.open : valve.failOpen;
        const travel = indicatorRate * seconds;
        valve.display = displayedOpen ? Math.min(3, valve.display + travel) : Math.max(0, valve.display - travel);
      }
    },
    inspect(id) {
      const valve = valves.get(id);
      if (!valve) return null;
      return {open: valve.open, frame: Math.floor(valve.display), commandPowered, indicatorPowered};
    }
  };
}
