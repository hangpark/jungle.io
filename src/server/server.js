/*jslint node: true */
'use strict';

var express = require('express');
var app   = express();
var http  = require('http').Server(app);
var io    = require('socket.io')(http);

var SAT = require('sat'); //충돌 처리
var V = SAT.Vector;
var C = SAT.Circle;
var P = SAT.Polygon;

var util = require('./lib/util');
var cfg  = require('../../config.json');

app.use(express.static(__dirname + '/../client'));

var sockets = {};
//플레이 하는 사람
var players = [];
//인공지능들
var ais = [];

//플레이 하는 사람과 인공지능 전부의 배열.
function getAllEntities() {
  return players.concat(ais);
}
var attacks = [];
var bloods = [];


var leaderboard = [];
var leaderboardChanged = false;

var gameData = {
  gameWidth: cfg.gameWidth,
  gameHeight: cfg.gameHeight,
  backSight: cfg.backSight,
  playerSize: cfg.playerSize,
  attackRadius: cfg.attackRadius
};

io.on('connection', function (socket) {
  console.log("Somebody connected!");

  var currentPlayer = {
    id: socket.id,
    type: 'human'
  };

  socket.on('respawn', function (screenWidth, screenHeight) {
  //우선 players 목록에 존재하면 삭제하고 gotit에서 다시 추가함
    if (util.findIndex(players, currentPlayer.id) > -1)
      players.splice(util.findIndex(players, currentPlayer.id), 1);
    currentPlayer.screenWidth = screenWidth;
    currentPlayer.screenHeight = screenHeight;

    socket.emit('welcome', currentPlayer, gameData);

    if(currentPlayer.name == undefined)
      console.log('new player tries to join the game');
    else
      console.log(currentPlayer.name + ' respawns');
  });

  socket.on('gotit', function (name) {
    console.log('[INFO] Player ' + name + ' connected');
    sockets[currentPlayer.id] = socket;

    var position = util.randomPosition();
    currentPlayer.name = name;
    currentPlayer.x = position.x;
    currentPlayer.y = position.y;
    currentPlayer.rotate = 0;
    currentPlayer.direction = 2 * (Math.random() - 0.5) * Math.PI;
    currentPlayer.speed = 0;
    currentPlayer.score = 0;
    players.push(currentPlayer);

  });

  socket.on('windowResized', function(screenWidth, screenHeight) {
    currentPlayer.screenWidth = screenWidth;
    currentPlayer.screenHeight = screenHeight;
  });

  socket.on('playerSendRotate', function(rotate) {
    currentPlayer.rotate = rotate;
  });

  socket.on('playerSendSpeed', function(speed) {
      currentPlayer.speed = speed;
  });

  socket.on('playerSendAttack', function() {
    var attack = {
      attacker: currentPlayer,
      duration: cfg.attackDuration,
      x: currentPlayer.x + cfg.playerSize * Math.sin(currentPlayer.direction),
      y: currentPlayer.y - cfg.playerSize * Math.cos(currentPlayer.direction),
    };
    attacks.push(attack);
    checkAttack(attack);
  });

});

function rotatePlayer(player) {
  player.direction =
    util.normalizeAngle(player.direction + player.rotate * Math.PI / 180);
}

function movePlayer(player) {
  //벽에 부딪히지 않는 방향으로만 움직일 수 있음
  if( !(util.isOnTopBoundary(player) && Math.abs(player.direction) < Math.PI/2 ) &&
      !(util.isOnBottomBoundary(player) && Math.abs(player.direction) > Math.PI/2) ) {
      player.y -= player.speed * Math.cos(player.direction);
    }
  if( !(util.isOnLeftBoundary(player) && util.isInRange(player.direction, -Math.PI, 0)) &&
      !(util.isOnRightBoundary(player) && util.isInRange(player.direction, 0, Math.PI)) ) {
      player.x += player.speed * Math.sin(player.direction);
    }
}

function checkAttack(attack) {
  var attackCircle = new C(new V(attack.x, attack.y), cfg.attackRadius);
  var entities = getAllEntities();
  entities.forEach(function (entity) {
    if(attack.attacker === entity) return;

    var entityArea = new P(new V(entity.x, entity.y), [
      new V(0, -cfg.playerSize),
      new V(cfg.playerSize / 2, cfg.playerSize / 2),
      new V(-cfg.playerSize / 2, cfg.playerSize / 2),
    ]).rotate(entity.direction);

    var attacked = SAT.testPolygonCircle(entityArea, attackCircle, new SAT.Response());
    if(attacked) {
      bloods.push({
        x: entity.x,
        y: entity.y,
        duration: cfg.bloodDuration,
      });
      entity.isDead = true;
      if(entity.type === 'human') {
        sockets[entity.id].emit('serverTellPlayerDie');
        attack.attacker.score++;
        players = players.filter(function (p) { return !p.isDead; });
      } else { //player.type === 'computer'
        attack.attacker.score -= 3;
        ais = ais.filter(function (a) { return !a.isDead; });
      }
    }
  });
}

function tickPlayer(currentPlayer) {
  rotatePlayer(currentPlayer);
  movePlayer(currentPlayer);
}

function tickAi(ai) {
  //목표지 설정
  if(ai.count == 0 || util.distance(ai.x, ai.y, ai.targetX, ai.targetY) < 3) {
    ai.target = util.randomPosition();
    if(Math.random() > 0.89) {
      ai.count = util.randomInRange(40, 120);
      ai.speed = 0;
    } else {
      ai.count = util.randomInRange(180, 600);
      ai.speed = 1;
    }
  }
  ai.count--;
  //차벡터(ai -> target)
  var targetX = ai.target.x - ai.x;
  var targetY = ai.target.y - ai.y;
  //차벡터의 방향
  var angleToTarget = Math.atan2(targetY, targetX) + (Math.PI / 2);
  var deltaAngle = util.normalizeAngle(angleToTarget - ai.direction);
  //반시계방향으로 돌아야 할 때 적당히 회전시키고 그 반대면 반대로
  if(deltaAngle > Math.PI / 60) {
    ai.direction = util.normalizeAngle(ai.direction + Math.PI / 180);
  } else if (deltaAngle < - Math.PI / 60) {
    ai.direction = util.normalizeAngle(ai.direction - Math.PI / 180);
  }

  movePlayer(ai);
}

function tickAttacks() {
  attacks = attacks.map(function (attack) {
    if (attack.duration > 0) {
      attack.duration--;
      return attack;
    }
  }).filter(function (attack) { return attack; });
}
function tickBloods() {
  bloods = bloods.map(function (blood) {
    if (blood.duration > 0) {
      blood.duration--;
      return blood;
    }
  }).filter(function (blood) { return blood; });
}

function moveLoop() {
  players.forEach(tickPlayer);
  ais.forEach(tickAi);
  tickAttacks();
  tickBloods();
}

function gameLoop() {
  //leaderboard 처리
  if (players.length > 0) {
    players.sort( function(a,b) { return b.score - a.score; });
  }
  var topPlayers = [];
  for (var i = 0; i < Math.min(5, players.length); i++) {
    topPlayers.push({
      id: players[i].id, //id는 client로 보낼 필요가 없으므로 'leaderboard' 이벤트에서 삭제한다.
      name: players[i].name,
      score: players[i].score,
    });
  }
  if(leaderboard.length !== topPlayers.length) {
    leaderboard = topPlayers;
    leaderboardChanged = true;
  } else {
    for(i = 0; i < leaderboard.length; i++) {
      if(leaderboard[i].id !== topPlayers[i].id || leaderboard[i].score !== topPlayers[i].score) {
        leaderboard = topPlayers;
        leaderboardChanged = true;
        break;
      }
    }
  }

  //ai 적정 수 유지
  while(ais.length < cfg.numAis) {
    var position = util.randomPosition();
    ais.push({
      type: 'computer',
      target: util.randomPosition(),
      x: position.x,
      y: position.y,
      speed: 1,
      direction: 2 * (Math.random() - 0.5) * Math.PI,
      count: util.randomInRange(180,600),
    });
  }
}

function sendUpdates() {
  var entities = getAllEntities();
  players.forEach( function(p) {
    var screenBox = new P( new V(p.x, p.y), [
      new V(p.screenWidth / 2 + cfg.playerSize , cfg.backSight + cfg.playerSize),
      new V(- p.screenWidth / 2 - cfg.playerSize, cfg.backSight + cfg.playerSize),
      new V(- p.screenWidth / 2 - cfg.playerSize, cfg.backSight - p.screenHeight - cfg.playerSize),
      new V(p.screenWidth / 2 + cfg.playerSize, cfg.backSight - p.screenHeight - cfg.playerSize)
    ]).rotate(p.direction);
    var visibleEntities = entities.filter( function (e) {
      return SAT.pointInPolygon(new V(e.x, e.y), screenBox);
    }).map(function (e) {
      return { //만약 이 entity가 자기 자신이라면 me가 true
        me: (p.id === e.id),
        x: e.x,
        y: e.y,
        direction: e.direction
      };
    });

    var visibleAttacks = attacks.filter( function (a) {
      return SAT.pointInPolygon(new V(a.x, a.y), screenBox);
    }).map(function (a) {
      var x = a.attacker.x + cfg.playerSize * Math.sin(a.attacker.direction);
      var y = a.attacker.y - cfg.playerSize * Math.cos(a.attacker.direction);
      return { x: x, y: y };
    });

    var visibleBloods = bloods.filter( function (b) {
      return SAT.pointInPolygon(new V(b.x, b.y), screenBox);
    }).map(function (b) {
      return { x: b.x, y: b.y, opacity: b.duration / cfg.bloodDuration };
    });

    sockets[p.id].emit('serverTellPlayerMove', visibleEntities, visibleAttacks, visibleBloods);
    if(leaderboardChanged) {
      //leaderboard에서 자기자신인지 알기 위해 'me' 멤버 첨가
      leaderboard = leaderboard.map(function (leader) {
        return {
          name: leader.name,
          score: leader.score,
          me: (p.id === leader.id)
        };
      });
      sockets[p.id].emit('leaderboard', {
        players: players.length,
        leaderboard: leaderboard
      });
    }

  });
  leaderboardChanged = false;
}

setInterval(moveLoop, 1000 / 60);
setInterval(gameLoop, 1000);
setInterval(sendUpdates, 1000 / cfg.networkUpdateFactor);

var serverPort = process.env.PORT || cfg.port;
http.listen(serverPort, function() {
  console.log("Server is listening on port " + serverPort);
});
