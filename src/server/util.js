/* jslint node: true */

'use strict';

var config = require('./config.json');

exports.randomInRange = function (from, to) {
  return Math.floor(Math.random() * (to -from)) + from;
};

exports.randomPosition = function () {
  return {
    x: exports.randomInRange(config.playerSize, config.gameWidth - config.playerSize),
    y: exports.randomInRange(config.playerSize, config.gameHeight - config.playerSize)
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
