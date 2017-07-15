/* jslint node: true */

'use strict';

var cfg = require('./config.json');

exports.validNick = function(nickname) {
    var regex = /^\w*$/;
    return regex.exec(nickname) !== null;
};

exports.randomInRange = function (from, to) {
    return Math.floor(Math.random() * (to -from)) + from;
};

exports.randomPosition = function () {
    return {
        x: exports.randomInRange(cfg.playerSize, cfg.gameWidth - cfg.playerSize),
        y: exports.randomInRange(cfg.playerSize, cfg.gameHeight - cfg.playerSize)
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


exports.isInBoundary = function (entity) {
    return ( ||);
};
