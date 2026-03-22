/**
 * charts.js — EduRate Chart.js rendering layer
 *
 * Pattern: EJS views inject data via window.EDURATE_CHARTS before
 * this script runs. We read it here and render into named <canvas>
 * elements. Keeps all Chart.js logic out of EJS templates.
 *
 * Canvas IDs handled:
 *  criteriaBarChart  — Lecturer dashboard: mean score per criterion (bar)
 *  trendChart        — Lecturer dashboard: avg score over time (line)
 *  activityChart     — Admin dashboard: submission count last 7 days (bar)
 *  deptChart         — Admin analytics: avg score per department (horizontal bar)
 *
 * window.EDURATE_CHARTS shape:
 * {
 *   criteriaBar?: { labels: string[], data: number[], colors: string[] },
 *   trend?:       { labels: string[], data: number[] },
 *   activity?:    { labels: string[], data: number[] },
 *   dept?:        { labels: string[], data: number[], colors: string[] },
 * }
 */

;(function () {
  'use strict';

  /* ============================================================
     THEME TOKENS — must mirror CSS custom properties in main.css
  ============================================================ */
  var THEME = {
    textMuted   : '#8fa3c4',
    textDim     : '#506080',
    gridColor   : '#1b2d4f',
    fontFamily  : "'Inter', sans-serif",
    fontDisplay : "'Sora', sans-serif",
    // Score-to-colour mapping (same logic as EJS templates)
    scoreColors : {
      excellent : '#0fb981',  // >= 4.5
      good      : '#2a6fdb',  // >= 3.5
      average   : '#f0a847',  // >= 2.5
      poor      : '#f04a4a',  // < 2.5
    },
  };

  /* ============================================================
     HELPERS
  ============================================================ */

  /** Return a hex colour based on a 1-5 score */
  function scoreColor(score) {
    if (score >= 4.5) return THEME.scoreColors.excellent;
    if (score >= 3.5) return THEME.scoreColors.good;
    if (score >= 2.5) return THEME.scoreColors.average;
    return THEME.scoreColors.poor;
  }

  /** Add alpha transparency to a hex colour */
  function hexAlpha(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /** Truncate long label strings for chart axes */
  function truncate(str, max) {
    max = max || 22;
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  /** Build shared y-axis config for 1-5 score scales */
  function yScaleScore(min, max) {
    return {
      min   : min != null ? min : 0,
      max   : max != null ? max : 5,
      ticks : {
        color     : THEME.textMuted,
        font      : { size: 11, family: THEME.fontFamily },
        stepSize  : 1,
        callback  : function (v) { return v % 1 === 0 ? v : ''; },
      },
      grid : { color: THEME.gridColor },
      border: { color: THEME.gridColor },
    };
  }

  /** Build shared y-axis config for count scales (activity chart) */
  function yScaleCount() {
    return {
      beginAtZero : true,
      ticks : {
        color    : THEME.textMuted,
        font     : { size: 11, family: THEME.fontFamily },
        stepSize : 1,
        callback : function (v) { return Number.isInteger(v) ? v : ''; },
      },
      grid  : { color: THEME.gridColor },
      border: { color: THEME.gridColor },
    };
  }

  /** Shared x-axis config */
  function xScale(options) {
    options = options || {};
    return Object.assign({
      ticks : {
        color    : THEME.textMuted,
        font     : { size: 10, family: THEME.fontFamily },
        maxRotation: 35,
      },
      grid  : { display: false },
      border: { color: THEME.gridColor },
    }, options);
  }

  /** Shared plugin config */
  function plugins(options) {
    options = options || {};
    return Object.assign({
      legend : { display: false },
      tooltip: {
        backgroundColor : '#0d1526',
        borderColor     : '#243d66',
        borderWidth     : 1,
        titleColor      : '#e8edf8',
        bodyColor       : '#8fa3c4',
        padding         : 10,
        cornerRadius    : 8,
        titleFont       : { family: THEME.fontDisplay, size: 12, weight: 'bold' },
        bodyFont        : { family: THEME.fontFamily,  size: 11 },
      },
    }, options);
  }

  /* ============================================================
     GLOBAL CHART DEFAULTS
  ============================================================ */
  function applyDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color        = THEME.textMuted;
    Chart.defaults.borderColor  = THEME.gridColor;
    Chart.defaults.font.family  = THEME.fontFamily;
    Chart.defaults.animation    = { duration: 700, easing: 'easeOutQuart' };
    Chart.defaults.responsive   = true;
    Chart.defaults.maintainAspectRatio = false;
  }

  /* ============================================================
     CHART: CRITERIA BAR
     Canvas ID: criteriaBarChart
     Shows mean score (1-5) for each evaluation criterion.
     Each bar is coloured by its score band.
  ============================================================ */
  function renderCriteriaBar(d) {
    var el = document.getElementById('criteriaBarChart');
    if (!el || !d) return;

    var colors  = d.colors || d.data.map(function (v) { return scoreColor(v); });
    var bgColors = colors.map(function (c) { return hexAlpha(c, 0.6); });

    new Chart(el, {
      type : 'bar',
      data : {
        labels   : d.labels.map(function (l) { return truncate(l); }),
        datasets : [{
          label           : 'Mean Score',
          data            : d.data,
          backgroundColor : bgColors,
          borderColor     : colors,
          borderWidth     : 2,
          borderRadius    : 7,
          borderSkipped   : false,
          hoverBackgroundColor: colors.map(function (c) { return hexAlpha(c, 0.85); }),
        }],
      },
      options : {
        responsive          : true,
        maintainAspectRatio : false,
        plugins : plugins({
          tooltip: Object.assign(plugins().tooltip, {
            callbacks: {
              title : function (items) { return d.labels[items[0].dataIndex]; },
              label : function (item)  {
                var v = item.raw;
                var label =
                  v >= 4.5 ? 'Excellent' :
                  v >= 3.5 ? 'Good'      :
                  v >= 2.5 ? 'Average'   : 'Below Average';
                return ' ' + v.toFixed(2) + ' / 5 — ' + label;
              },
            },
          }),
        }),
        scales : {
          y : Object.assign(yScaleScore(), {
            title: {
              display   : true,
              text      : 'Mean Score (1–5)',
              color     : THEME.textDim,
              font      : { size: 11, family: THEME.fontFamily },
              padding   : { bottom: 4 },
            },
          }),
          x : xScale(),
        },
      },
    });
  }

  /* ============================================================
     CHART: TREND LINE
     Canvas ID: trendChart
     Shows average evaluation score over time (semester/year).
  ============================================================ */
  function renderTrend(d) {
    var el = document.getElementById('trendChart');
    if (!el || !d) return;

    // Colour each point by its score
    var pointColors = d.data.map(function (v) { return scoreColor(v); });

    new Chart(el, {
      type : 'line',
      data : {
        labels   : d.labels,
        datasets : [{
          label               : 'Average Score',
          data                : d.data,
          borderColor         : THEME.scoreColors.good,
          backgroundColor     : hexAlpha(THEME.scoreColors.good, 0.08),
          borderWidth         : 3,
          fill                : true,
          tension             : 0.4,
          pointBackgroundColor: pointColors,
          pointBorderColor    : pointColors,
          pointRadius         : 7,
          pointHoverRadius    : 10,
          pointBorderWidth    : 2,
        }],
      },
      options : {
        responsive          : true,
        maintainAspectRatio : false,
        plugins : plugins({
          tooltip: Object.assign(plugins().tooltip, {
            callbacks: {
              label: function (item) {
                var v = item.raw;
                return ' ' + v.toFixed(2) + ' / 5';
              },
            },
          }),
          // Reference lines at score band boundaries
          annotation: undefined,
        }),
        scales : {
          y : Object.assign(yScaleScore(), {
            title: {
              display : true,
              text    : 'Average Score',
              color   : THEME.textDim,
              font    : { size: 11, family: THEME.fontFamily },
            },
          }),
          x : xScale(),
        },
      },
    });
  }

  /* ============================================================
     CHART: ACTIVITY BAR
     Canvas ID: activityChart
     Admin dashboard — evaluation submission count per day (7 days).
  ============================================================ */
  function renderActivity(d) {
    var el = document.getElementById('activityChart');
    if (!el || !d) return;

    // Colour the bar with highest count in accent, others dimmer
    var maxVal = Math.max.apply(null, d.data.concat([0]));
    var bgColors = d.data.map(function (v) {
      return v === maxVal && maxVal > 0
        ? hexAlpha(THEME.scoreColors.good, 0.85)
        : hexAlpha(THEME.scoreColors.good, 0.45);
    });
    var borderColors = d.data.map(function () { return THEME.scoreColors.good; });

    new Chart(el, {
      type : 'bar',
      data : {
        labels   : d.labels,
        datasets : [{
          label           : 'Submissions',
          data            : d.data,
          backgroundColor : bgColors,
          borderColor     : borderColors,
          borderWidth     : 2,
          borderRadius    : 7,
          borderSkipped   : false,
          hoverBackgroundColor: hexAlpha(THEME.scoreColors.good, 0.9),
        }],
      },
      options : {
        responsive          : true,
        maintainAspectRatio : false,
        plugins : plugins({
          tooltip: Object.assign(plugins().tooltip, {
            callbacks: {
              label: function (item) {
                var v = item.raw;
                return ' ' + v + ' submission' + (v !== 1 ? 's' : '');
              },
            },
          }),
        }),
        scales : {
          y : Object.assign(yScaleCount(), {
            title: {
              display : true,
              text    : 'Submissions',
              color   : THEME.textDim,
              font    : { size: 11, family: THEME.fontFamily },
            },
          }),
          x : xScale(),
        },
      },
    });
  }

  /* ============================================================
     CHART: DEPARTMENT BAR
     Canvas ID: deptChart
     Admin analytics — average score per department.
     Rendered horizontally when many departments exist.
  ============================================================ */
  function renderDept(d) {
    var el = document.getElementById('deptChart');
    if (!el || !d) return;

    var colors   = d.colors || d.data.map(function (v) { return scoreColor(v); });
    var bgColors = colors.map(function (c) { return hexAlpha(c, 0.6); });

    // Use horizontal bars when more than 5 departments (labels fit better)
    var horizontal = d.labels.length > 5;

    var scalesConfig = horizontal
      ? {
          x : Object.assign(yScaleScore(), {
            title: {
              display : true,
              text    : 'Average Score (1–5)',
              color   : THEME.textDim,
              font    : { size: 11, family: THEME.fontFamily },
            },
          }),
          y : {
            ticks : {
              color : THEME.textMuted,
              font  : { size: 11, family: THEME.fontFamily },
            },
            grid  : { display: false },
            border: { color: THEME.gridColor },
          },
        }
      : {
          y : Object.assign(yScaleScore(), {
            title: {
              display : true,
              text    : 'Average Score (1–5)',
              color   : THEME.textDim,
              font    : { size: 11, family: THEME.fontFamily },
            },
          }),
          x : xScale(),
        };

    new Chart(el, {
      type : horizontal ? 'bar' : 'bar',
      data : {
        labels   : d.labels.map(function (l) { return truncate(l, 28); }),
        datasets : [{
          label               : 'Average Score',
          data                : d.data,
          backgroundColor     : bgColors,
          borderColor         : colors,
          borderWidth         : 2,
          borderRadius        : 7,
          borderSkipped       : false,
          hoverBackgroundColor: colors.map(function (c) { return hexAlpha(c, 0.85); }),
        }],
      },
      options : {
        indexAxis           : horizontal ? 'y' : 'x',
        responsive          : true,
        maintainAspectRatio : false,
        plugins : plugins({
          tooltip: Object.assign(plugins().tooltip, {
            callbacks: {
              title : function (items) { return d.labels[items[0].dataIndex]; },
              label : function (item)  {
                var v = item.raw;
                return ' ' + v.toFixed(2) + ' / 5';
              },
            },
          }),
        }),
        scales : scalesConfig,
      },
    });
  }

  /* ============================================================
     ENTRY POINT
     Called on DOMContentLoaded. Reads window.EDURATE_CHARTS
     and renders whichever charts have both data and a canvas.
  ============================================================ */
  function init() {
    if (typeof Chart === 'undefined') {
      console.warn('EduRate charts.js: Chart.js not loaded — charts will not render.');
      return;
    }

    applyDefaults();

    var d = window.EDURATE_CHARTS;
    if (!d) return; // No chart data on this page

    renderCriteriaBar(d.criteriaBar);
    renderTrend(d.trend);
    renderActivity(d.activity);
    renderDept(d.dept);
  }

  // Run after DOM + Chart.js are both ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();