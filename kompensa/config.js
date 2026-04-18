window.KOMPENSA_CONFIG = {
  API_BASE: "https://api.videco.se",

  // 2035-antaganden (SEK/MWh)
  SCENARIOS_2035: {
    SE1: {
      low: 600,
      base: 750,
      high: 900
    },
    SE2: {
      low: 600,
      base: 750,
      high: 900
    },
    SE3: {
      low: 700,
      base: 850,
      high: 1000
    },
    SE4: {
      low: 750,
      base: 900,
      high: 1100
    }
  }
};

window.KOMPENSA_API_BASE = window.KOMPENSA_CONFIG.API_BASE;