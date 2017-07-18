  /* jslint node: true */

'use strict';

var cfg = require('../../../config.json');

exports.validNick = function(nickname) {
  var regex = /^\w*$/;
  return regex.exec(nickname) !== null;
};

exports.randomInRange = function (from, to) {
  return Math.floor(Math.random() * (to -from)) + from;
};

exports.isInRange = function (val, from, to) {
  return ((from <= to) && (from <= val) && (val <= to));
};

exports.randomPosition = function () {
  return {
    x: exports.randomInRange(cfg.playerSize * 3, cfg.gameWidth - cfg.playerSize * 3),
    y: exports.randomInRange(cfg.playerSize * 3, cfg.gameHeight - cfg.playerSize * 3)
  };
};

exports.findIndex = function(arr, id) {
  var len = arr.length;
  while(len--) {
    if(arr[len].id === id) {
      return len;
    }
  }
  return -1;
};

exports.distance = function (x1, y1, x2, y2) {
  return Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
};

//normalize angle into range [-PI, PI]
exports.normalizeAngle = function (angle) {
  var temp = angle % (2 * Math.PI);
  return (temp <= Math.PI) ? temp : temp - (2 * Math.PI);
};

exports.isOnTopBoundary = function (player) {
  return player.y < cfg.playerSize;
};

exports.isOnBottomBoundary = function (player) {
  return cfg.gameHeight - player.y < cfg.playerSize;
};

exports.isOnLeftBoundary = function (player) {
  return player.x < cfg.playerSize;
};

exports.isOnRightBoundary = function (player) {
  return cfg.gameWidth - player.x < cfg.playerSize;
};

exports.isOnBoundary = function (player) {
  return exports.isOnTopBoundary(player) || exports.isOnBottomBoundary(player) ||
  exports.isOnLeftBoundary(player) || exports.isOnRightBoundary(player);
};
