import assert from "node:assert/strict";
import test from "node:test";

import { parseCSStatsProfileHtml } from "./csstats-client.ts";

const TARGET_STEAM_ID = "76561199857251932";

test("parses target-style CSStats fixture", () => {
  const profile = parseCSStatsProfileHtml(
    TARGET_STEAM_ID,
    `https://csgostats.gg/player/${TARGET_STEAM_ID}`,
    `
      <html>
        <head><title>Calibration target - CSStats</title></head>
        <body>
          <h1 id="player-name">Calibration target</h1>
          <div id="player-ranks">
            <div class="ranks">
              <div class="icon"><img alt="Premier Season 4" /></div>
              <div class="rank"><div class="cs2rating"><span>24<small>,856</small></span></div></div>
              <div class="best"><div class="cs2rating"><span>24<small>,856</small></span></div></div>
              <div class="bottom"><span class="wins"><b>41</b></span></div>
            </div>
            <div class="ranks">
              <div class="icon"><img alt="Premier Season 3" /></div>
              <div class="rank"><div class="cs2rating"><span>12<small>,634</small></span></div></div>
              <div class="best"><div class="cs2rating"><span>12<small>,634</small></span></div></div>
              <div class="bottom"><span class="wins"><b>29</b></span></div>
            </div>
            <div class="ranks">
              <div class="icon"><img alt="Dust II" /></div>
              <div class="rank"><img src="/images/ranks/15.png" /></div>
              <div class="best"><img src="/images/ranks/15.png" /></div>
              <div class="bottom"><span class="wins"><b>27</b></span></div>
            </div>
            <div class="ranks">
              <div class="icon"><img alt="Wingman" /></div>
              <div class="rank"><img src="/assets/wingman11.svg" /></div>
              <div class="best"><img src="/assets/wingman13.svg" /></div>
              <div class="bottom"><span class="wins"><b>16</b></span></div>
            </div>
          </div>
          <section>Premier Rating 24,856</section>
          <section>No FACEIT account</section>
          <section>Leetify Rating 6.2</section>
        </body>
      </html>
    `,
    `
      <html>
        <body>
          <div id="kpd"><span>1.42</span></div>
          <div id="rating"><span>1.34</span></div>
          <div class="stat-panel">
            <div class="stat-heading">Win Rate</div>
            <div style="font-size:34px">71%</div>
            <span class="total-value">64</span>
          </div>
          <div class="stat-panel">
            <div class="stat-heading">HS %</div>
            <div style="font-size:34px">64%</div>
          </div>
          <div class="stat-panel">
            <div class="stat-heading">ADR</div>
            <div style="font-size:34px">96</div>
          </div>
          <div class="stat-panel">
            <div class="stat-heading">Clutch Chance</div>
            <div style="font-size:34px">22%</div>
          </div>
          <canvas id="de_dust2-wr-chart-canvas"></canvas>
          <div class="match-dot match-win"></div>
          <div class="match-dot match-win"></div>
          <div class="match-dot match-lose"></div>
          <div class="match-dot match-win"></div>
          <div class="match-dot match-win"></div>
        </body>
      </html>
    `,
  );

  assert.equal(profile.steamId64, TARGET_STEAM_ID);
  assert.equal(profile.name, "Calibration target");
  assert.equal(profile.premierRating, 24_856);
  assert.equal(profile.bestPremierRating, 24_856);
  assert.equal(profile.hasFaceit, false);
  assert.equal(profile.bestRating, 6.2);
  assert.equal(profile.kdRatio, 1.42);
  assert.equal(profile.hltvRating, 1.34);
  assert.equal(profile.matches, 64);
  assert.equal(profile.winRate, 71);
  assert.equal(profile.hsPercentage, 64);
  assert.equal(profile.adr, 96);
  assert.equal(profile.clutchPercentage, 22);
  assert.deepEqual(profile.recentResults, ["W", "W", "L", "W", "W"]);
  assert.equal(profile.mostPlayedMap, "de_dust2");
  assert.deepEqual(profile.premierRatings, [
    { season: 4, latestRating: 24_856, bestRating: 24_856, wins: 41 },
    { season: 3, latestRating: 12_634, bestRating: 12_634, wins: 29 },
  ]);
  assert.deepEqual(profile.competitiveRanks, [
    { map: "Dust II", latestRank: 15, bestRank: 15, wins: 27 },
  ]);
  assert.deepEqual(profile.wingman, { latestRank: 11, bestRank: 13, wins: 16 });
});

test("throws when required CSStats selectors miss", () => {
  assert.throws(
    () => parseCSStatsProfileHtml(TARGET_STEAM_ID, "https://csgostats.gg/player/x", "<html />"),
    /CSStats selector missed/,
  );
});

test("parses CSStats profile with no Premier rating as absent data", () => {
  const profile = parseCSStatsProfileHtml(
    "76561198000000000",
    "https://csgostats.gg/player/76561198000000000",
    `
      <html>
        <head><title>No Premier - CSStats</title></head>
        <body>
          <section>FACEIT</section>
        </body>
      </html>
    `,
  );

  assert.equal(profile.premierRating, null);
  assert.equal(profile.bestRating, null);
  assert.equal(profile.hasFaceit, true);
});
