import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCoachTimeline, formatClockTime } from "../ai/coach.ts";

test("formatClockTime formatea segundos como MM:SS", () => {
  assert.equal(formatClockTime(0), "0:00");
  assert.equal(formatClockTime(65), "1:05");
  assert.equal(formatClockTime(780), "13:00");
  assert.equal(formatClockTime(805), "13:25");
});

test("buildCoachTimeline devuelve vacío sin análisis", () => {
  assert.equal(buildCoachTimeline(null), "");
  assert.equal(buildCoachTimeline(undefined), "");
  assert.equal(buildCoachTimeline({}), "");
});

test("buildCoachTimeline lista eventos con marca de tiempo", () => {
  const analysis = {
    events: {
      events: [
        { time_s: 12, type: "sprint_spike", player_id: 2 },
        { time_s: 65, type: "ball_out_of_frame" },
      ],
    },
  };
  const timeline = buildCoachTimeline(analysis);
  assert.ok(timeline.includes("[0:12] sprint_spike: jugador 2"));
  assert.ok(timeline.includes("[1:05] ball_out_of_frame"));
});

test("buildCoachTimeline incluye transiciones tácticas", () => {
  const analysis = {
    tactical: {
      transitions: {
        events: [
          { time_s: 90, type: "counterattack", from_team: 0, to_team: 1 },
        ],
      },
    },
  };
  const timeline = buildCoachTimeline(analysis);
  assert.ok(timeline.includes("[1:30] contraataque (transición)"));
});

test("buildCoachTimeline incluye riesgos de lesión con severidad", () => {
  const analysis = {
    fatigue: {
      players: {
        "3": {
          injury_risks: [{ time_s: 200, type: "overload", severity: "alta" }],
        },
      },
    },
  };
  const timeline = buildCoachTimeline(analysis);
  assert.ok(timeline.includes("[3:20] riesgo overload (severidad alta)"));
});

test("buildCoachTimeline ordena por tiempo y respeta fondo total", () => {
  const analysis = {
    events: {
      events: [
        { time_s: 300, type: "late" },
        { time_s: 5, type: "early" },
        { time_s: 150, type: "middle" },
      ],
    },
  };
  const timeline = buildCoachTimeline(analysis);
  const idxEarly = timeline.indexOf("[0:05] early");
  const idxMiddle = timeline.indexOf("[2:30] middle");
  const idxLate = timeline.indexOf("[5:00] late");
  assert.ok(idxEarly >= 0 && idxMiddle >= 0 && idxLate >= 0);
  assert.ok(idxEarly < idxMiddle && idxMiddle < idxLate);
});