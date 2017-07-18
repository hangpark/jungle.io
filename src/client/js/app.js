var io = require('socket.io-client');
var Canvas = require('./canvas');
var global = require('./global');

var playerNameInput = document.getElementById('playerNameInput');
var socket;

function startGame() {
  global.playerName = playerNameInput.value.replace(/(<([^>]+)>)/ig, '').substring(0,25);

  global.screenWidth = window.innerWidth;
  global.screenHeight = window.innerHeight;

  document.getElementById('gameAreaWrapper').style.display = 'block';
  document.getElementById('startMenuWrapper').style.display = 'none';

  if (!socket) {
    socket = io();
    setupSocket(socket);
  }
  if (!global.animLoopHandle)
    animLoop();

  socket.emit('respawn', global.screenWidth, global.screenHeight);

  window.canvas.socket = socket;
  global.socket = socket;
}

function validNick() {
  var regex = /^\w*$/;
  console.log('Regex Test', regex.exec(playerNameInput.value));
  return regex.exec(playerNameInput.value) !== null;
}

window.onload = function() {
  'use strict';

  var btn = document.getElementById('startButton'),
      nickErrorText = document.querySelector('#startMenu .input-error');

  btn.onclick = function () {
    if (validNick()) {
      startGame();
    } else {
      nickErrorText.style.display = 'inline';
    }
  };

  playerNameInput.addEventListener('keypress', function (e) {
    var key = e.which || e.keyCode;

    if (key === global.KEY_ENTER) {
      if (validNick()) {
        startGame();
      } else {
        nickErrorText.style.display = 'inline';
      }
    }
  });
};

// Game control

var me = {};
var players = [];
var attacks = [];
var bloods = [];
var leaderboard = [];

window.canvas = new Canvas();

var c = window.canvas.cv;
var graph = c.getContext('2d');

function setupSocket(socket) {
  socket.on('connect_failed', function() {
    console.log("[INFO] Connection failed.");
    socket.close();
    global.disconnected = true;
  });

  socket.on('disconnect', function() {
    console.log("[INFO] Disconnected.");
    socket.close();
    global.disconnected = true;
  });

  socket.on('welcome', function(player, data) {
    console.log("[INFO] Server welcomes you!");
    me = player;
    me.screenWidth = global.screenWidth;
    me.screenHeight = global.screenHeight;
    me.direction = window.canvas.direction;
    global.gameStart = true;
    global.gameWidth = data.gameWidth;
    global.gameHeight = data.gameHeight;
    global.backSight = data.backSight;
    global.playerSize = data.playerSize;
    global.attackRadius = data.attackRadius;
    resize();
    c.focus();

    socket.emit('gotit', global.playerName);
  });

  socket.on('serverTellPlayerMove', function(visiblePlayers, visibleAttacks, visibleBloods) {
    for (var i = 0; i < visiblePlayers.length; i++) {
      if (visiblePlayers[i].me) {
        me = visiblePlayers[i];
        break;
      }
    }

    players = visiblePlayers;
    attacks = visibleAttacks;
    bloods = visibleBloods;
  });

  socket.on('serverTellPlayerDie', function() {
    console.log("[INFO] You died!");
    global.gameStart = false;
    global.died = true;
    window.setTimeout(function() {
      document.getElementById('gameAreaWrapper').style.display = 'none';
      document.getElementById('startMenuWrapper').style.display = 'block';
      global.died = false;
      if (global.animLoopHandle) {
        window.cancelAnimationFrame(global.animLoopHandle);
        global.animLoopHandle = undefined;
      }
    }, 2500);
  });

  socket.on('leaderboard', function (data) {
    leaderboard = data.leaderboard;
    var status = '<span class="title">Leaderboard</span>';
    for (var i = 0; i < leaderboard.length; i++) {
      status += '<br />';
      if (leaderboard[i].me) {
        if(leaderboard[i].name.length !== 0)
          status += '<span class="me">' + (i + 1) + '. ' + leaderboard[i].name + ": "+ leaderboard[i].score +"</span>";
        else
          status += '<span class="me">' + (i + 1) + ". Anonymous player" + ": "+ leaderboard[i].score + "</span>";
      } else {
        if(leaderboard[i].name.length !== 0)
            status += (i + 1) + '. ' + leaderboard[i].name + ": "+ leaderboard[i].score;
        else
            status += (i + 1) + '. Anonymous player' + ": "+ leaderboard[i].score;
      }
    }
    document.getElementById('leaderboard').innerHTML = status;
  });
}

// Draw components

function drawGrid() {
  graph.lineWidth = 1;
  graph.strokeStyle = global.lineColor;
  graph.globalAlpha = 0.15;

  graph.beginPath();
  var i, start, end;
  for (i = global.gridGap; i < global.gameWidth; i += global.gridGap) {
    start = gameToScreen(i, 0);
    end = gameToScreen(i, global.gameHeight);
    graph.moveTo(start.x, start.y);
    graph.lineTo(end.x, end.y);
  }
  for (i = global.gridGap; i < global.gameHeight; i += global.gridGap) {
    start = gameToScreen(0, i);
    end = gameToScreen(global.gameWidth, i);
    graph.moveTo(start.x, start.y);
    graph.lineTo(end.x, end.y);
  }

  graph.stroke();
  graph.globalAlpha = 1;
}

function drawBoundary() {
  graph.lineWidth = 5;
  graph.strokeStyle = global.lineColor;

  graph.beginPath();
  corners = [gameToScreen(0, 0),
             gameToScreen(0, global.gameHeight),
             gameToScreen(global.gameWidth, global.gameHeight),
             gameToScreen(global.gameWidth, 0)];
  graph.moveTo(corners[3].x, corners[3].y);
  for (i = 0; i < 4; i++) {
    graph.lineTo(corners[i].x, corners[i].y);
  }

  graph.stroke();
}

function drawPlayer(player) {
  var sin = Math.sin(player.direction);
  var cos = Math.cos(player.direction);
  var size = global.playerSize;

  corner1 = gameToScreen(player.x + sin * size, player.y - cos * size);
  corner2 = gameToScreen(player.x - (sin + cos) * size / 2, player.y + (cos - sin) * size / 2);
  corner3 = gameToScreen(player.x - (sin - cos) * size / 2, player.y + (cos + sin) * size / 2);

  graph.beginPath();
  graph.moveTo(corner1.x, corner1.y);
  graph.lineTo(corner2.x, corner2.y);
  graph.lineTo(corner3.x, corner3.y);
  if (player.me) {
    graph.fillStyle = global.currentPlayerColor;
  } else {
    graph.fillStyle = global.playerColor;
  }
  graph.fill();
}

function gameToScreen(x, y) {
  var dx = x - me.x;
  var dy = y - me.y;
  var sin = Math.sin(me.direction);
  var cos = Math.cos(me.direction);

  var relX = dx * cos + dy * sin;
  var relY = dx * sin - dy * cos;

  return {x: global.screenWidth / 2 + relX, y: global.screenHeight - relY - global.backSight};
}

// Animation frame

window.requestAnimFrame = (function(){
  return  window.requestAnimationFrame       ||
          window.webkitRequestAnimationFrame ||
          window.mozRequestAnimationFrame    ||
          function(callback){
            window.setTimeout(callback, 1000 / 60);
          };
})();

window.cancelAnimFrame = (function(handle) {
  return window.cancelAnimationFrame   ||
         window.mozCancelAnimationFrame;
})();


function animLoop(){
  global.animLoopHandle = window.requestAnimFrame(animLoop);
  gameLoop();
}

// Game loop

function gameLoop() {
  if (global.died) {
    graph.fillStyle = '#333333';
    graph.fillRect(0, 0, global.screenWidth, global.screenHeight);

    graph.textAlign = 'center';
    graph.fillStyle = '#FFFFFF';
    graph.font = 'bold 30px sans-serif';
    graph.fillText('You died!', global.screenWidth / 2, global.screenHeight / 2);
  } else if (!global.disconnected) {
    if (!global.died) {
      graph.fillStyle = global.backgroundColor;
      graph.fillRect(0, 0, global.screenWidth, global.screenHeight);
      if (global.gameStart) {
        drawGrid();
        drawBoundary();
        players.forEach(drawPlayer);
        // bloods.forEach(drawBlood);
        // attacks.forEach(drawAttack);
      }
    } else {
      graph.fillStyle = '#333333';
      graph.fillRect(0, 0, global.screenWidth, global.screenHeight);

      graph.textAlign = 'center';
      graph.fillStyle = '#FFFFFF';
      graph.font = 'bold 30px sans-serif';
      graph.fillText('Game Over!', global.screenWidth / 2, global.screenHeight / 2);
    }
  } else {
    graph.fillStyle = '#333333';
    graph.fillRect(0, 0, global.screenWidth, global.screenHeight);

    graph.textAlign = 'center';
    graph.fillStyle = '#FFFFFF';
    graph.font = 'bold 30px sans-serif';
    graph.fillText('Disconnected!', global.screenWidth / 2, global.screenHeight / 2);
  }
}

// Resize

window.addEventListener('resize', resize);

function resize() {
  if (!socket) return;

  console.log("[INFO] Window resized.");
  me.screenWidth = c.width = global.screenWidth = window.innerWidth;
  me.screenHeight = c.height = global.screenHeight = window.innerHeight;

  socket.emit('windowResized', global.screenWidth, global.screenHeight);
}
