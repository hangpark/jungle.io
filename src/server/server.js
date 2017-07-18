/*jslint node: true */
'use strict';

var express = require('express');
var app     = express();
var http    = require('http').Server(app);
var io      = require('socket.io')(http);

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

io.on('connection', function (socket) {
    console.log("Somebody connected!", socket.handshake.query.type);
    //type: human
    var type = socket.handshake.query.type;
    var position = util.randomPosition();

    var currentPlayer = {
        id: socket.id,
    };

    socket.on('respawn', function (screenWidth, screenHeight) {
    //우선 players 목록에 존재하면 삭제하고 나중에('gotit')에서 다시 추가함
        if (util.findIndex(players, currentPlayer.id) > -1)
            players.splice(util.findIndex(players, currentPlayer.id), 1);
        currentPlayer.screenWidth = screenWidth;
        currentPlayer.screenHeight = screenHeight;
        var gameData = {
            gameWidth: cfg.gameWidth,
            gameHeight: cfg.gameHeight,
            backSight: cfg.backSight,
            playerSize: cfg.playerSize,
            attackRadius: cfg.attackRadius
        };

        socket.emit('welcome', currentPlayer, gameData);

        if(currentPlayer.name == undefined)
            console.log('new player tries to join the game');
        else
            console.log(currentPlayer.name + ' respawns');
    });

    socket.on('gotit', function (player) {
        console.log('[INFO] Player' + player.name + ' connected');
        sockets[player.id] = socket;

        player.x = position.x;
        player.y = position.y;
        player.rotate = 0;
        player.direction = 0;
        player.speed = 0;
        player.score = 0;
        currentPlayer = player;
        players.push(currentPlayer);

    });

    socket.on('windowResized', function(data) {
        currentPlayer.screenWidth = data.screenWidth;
        currentPlayer.screenHeight = data.screenHeight;
    });

    socket.on('playerSendRotate', function(rotate) {
        if(rotate !== currentPlayer.rotate) {
            currentPlayer.direction =
                util.normalizeAngle(currentPlayer.direction + rotate * Math.PI / 180);
        }
    });

    socket.on('playerSendSpeed', function(speed) {
        if(speed !== currentPlayer.speed) {
            currentPlayer.speed = speed;
        }
    });

    socket.on('playerSendAttack', function() {
        var attack = {
            attacker: currentPlayer,
            duration: cfg.attackDuration,
            x: currentPlayer.x + cfg.playerSize * Math.sin(currentPlayer.direction),
            y: currentPlayer.y - cfg.playerSize * Math.cos(currentPlayer.direction),
        };
        attacks.push(attack);
    });

});


function movePlayer(player) {
    var angle = util.normalizeAngle(player.direction);
    //상하 움직임이 문제되지 않는 경우에만 허용
    //문제되는 경우는 위에서 위로가려는 경우, 아래에서 아래로 가는 경우
    if( !(util.isOnTopBoundary(player) && Math.abs(angle) < Math.PI/2 ) ||
        !(util.isOnBottomBoundary(player) && Math.abs(angle) > Math.PI/2) ) {
            player.y -= player.speed * Math.cos(player.direction);
        }

    if( !(util.isOnLeftBoundary(player) && util.isInRange(angle, -Math.PI, 0)) ||
        !(util.isOnRightBoundary(player) && util.isInRange(angle, 0, Math.PI))) {
            player.x += player.speed * Math.sin(player.direction);
        }
}

function checkAttack(player) {
    //TODO player's shape?
    var playerArea = new P(new V(player.x, player.y), [
        new V(0, -cfg.playerSize),
        new V(cfg.playerSize / 2, cfg.playerSize / 2),
        new V(-cfg.playerSize / 2, cfg.playerSize / 2),
    ]);

    for (var attack in attacks) {
        if((util.distance(player.x, player.y, attack.x, attack.y) > cfg.attackRadius + cfg.playerSize) ||
            (attack.attacker == player))  continue; //check if the attack is valid.

        var attackCircle = new C(new V(attack.x, attack.y), cfg.attackRadius);
        var attacked = SAT.testPolygonCircle(playerArea, attackCircle, new SAT.Response());
        if (attacked) {
            bloods.push({
                x: player.x,
                y: player.y,
                duration: cfg.bloodDuration,
            });

            if(player.type === 'human') {
                sockets[player.id].emit('serverTellPlayerDie');
                players.splice(util.findIndex(players, player), 1);
                attack.attacker.score++;
            } else { //player.type === 'computer'
                attack.attacker.score -= 2;
                //ai는 id 없어서 findIndex 불가하므로 filter로 제거
                player.state = 'dead';
                ais = ais.filter(function (ai) {
                    return (ai.state !== 'dead');
                });
            }

            break;
        }
    }
}

function tickPlayer(currentPlayer) {
    movePlayer(currentPlayer);
    checkAttack(currentPlayer);
}

//ai 작동 방식 -> 그냥 사람처럼 움직이는 게 아니라 일정주기마다 목적지를 정해서 그쪽으로 걸어가게 하자?
function tickAi(ai) {
    //목표지 설정
    if(ai.count == 0 || util.distance(ai.x, ai.y, ai.targetX, ai.targetY) < 3) {
        ai.target = util.randomPosition();
        ai.count = util.randomInRange(180, 600);
    }
    ai.count--;
    //차벡터(ai -> target)
    var targetX = ai.target.x - ai.x;
    var targetY = ai.target.y - ai.y;
    //차벡터의 방향
    var angleToTarget = Math.atan2(targetY, targetX) + (Math.PI / 2);
    var deltaAngle = util.normalizeAngle(angleToTarget - ai.direction);
    //반시계방향으로 돌아야 할 때 적당히 회전시키고 그 반대면 반대로
    if(deltaAngle > 0) {
        ai.direction = util.normalizeAngle(ai.direction + Math.PI / 180);
    } else {
        ai.direction = util.normalizeAngle(ai.direction - Math.PI / 180);
    }

    movePlayer(ai);
    checkAttack(ai);
}

function tickAttacks() {
    attacks = attacks.map( function (attack) {
        if (attack.duration > 0) {
            attack.duration--;
            return attack;
        }
    }).filter( function (attack) { return attack; });
}
function tickBloods() {
    bloods = bloods.map( function (blood) {
        if (blood.duration > 0) {
            blood.duration--;
            return blood;
        }
    }).filter( function (blood) { return blood; });
}

function moveloop() {
    for (var i = 0; i < players.length; i++) {
        tickPlayer(players[i]);
    }
    for (i = 0; i < ais.length; i++) {
        tickAi(ais[i]);
    }
    tickAttacks();
    tickBloods();
}

function gameloop() {
    //leaderboard 처리
    if (players.length > 0) {
        players.sort( function(a,b) { return b.score - a.score; });
    }
    var topPlayers = [];
    //leaderboard 관련 동작들....
    for (var i = 0; i < Math.min(5, players.length); i++) {
        topPlayers.push({
            id: players[i].id,
            name: players[i].name,
            score: players[i].score,
        });
    }
    if(leaderboard.length !== topPlayers.length) {
        leaderboard = topPlayers;
        leaderboardChanged = true;
    } else {
        for(i = 0; i < leaderboard.length; i++) {
            if(leaderboard[i].id !== topPlayers[i].id) {
                leaderboard = topPlayers;
                leaderboardChanged = true;
                break;
            }
        }
    }

    //ai 적정 수 유지
    //while(ais.length < cfg.numAis) {
    while(ais.length < 1) {
        //var position = util.randomPosition();
        var position = {x:1950, y:50};
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
            return { x: a.x, y: a.y };
        });
        var visibleBloods = bloods.filter( function (b) {
            return SAT.pointInPolygon(new V(b.x, b.y), screenBox);
        }).map(function (b) {
            return { x: b.x, y: b.y };
        });

        sockets[p.id].emit('serverTellPlayerMove', visibleEntities, visibleAttacks, visibleBloods);
        if(leaderboardChanged) {
            sockets[p.id].emit('leaderboard', {
                players: players.length,
                leaderboard: leaderboard
        });
      }

    });
    leaderboardChanged = false;
}


setInterval(moveloop, 1000 / 60);
setInterval(gameloop, 1000);
setInterval(sendUpdates, 1000 / cfg.networkUpdateFactor);


var serverPort = process.env.PORT || cfg.port;
http.listen(serverPort, function() {
    console.log("Server is listening on port " + serverPort);
});
