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

var util = require('./util');
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

        socket.emit('welcome', currentPlayer, cfg.gameWidth, cfg.gameHeight);

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

    socket.on('playerSendStatus', function (status) {

    });


    socket.on('playerSendDirection', function(direction) {
        if(direction !== currentPlayer.direction) {
            currentPlayer.direction = direction;
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
    //canvas에서 각 어떻게 처리하는지 고려
    player.x += player.speed * Math.sin(player.direction);
    player.y -= player.speed * Math.cos(player.direction);
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
            } else { //player.type === 'ai'
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
    //방향설정
    if(ai.count == 0 || util.distance(ai.x, ai.y, ai.targetX, ai.targetY) < 3) {
        ai.target = util.randomPosition();
        ai.count = util.randomInRange(3, 10);
    }
    ai.count--;
    //벡터차
    var targetX = ai.target.x - ai.x;
    var targetY = ai.target.y - ai.y;
    //벡터차의 방향
    var angleToTarget = Math.atan2(targetY, targetX);
    //TODO 각이 PI~-PI에서 돌아 다니는 게 아니여서 이렇게 단순하게 처리하면 문제생김
    var deltaAngle = ai.direction - angleToTarget;
    //반시계방향으로 돌아야 할 때 적당히 회전시키고 그 반대면 반대로
    if(deltaAngle > 0) {
        ai.direction += Math.PI / 180;
    } else {
        ai.direction -= Math.PI / 180;
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
    while(ais.length < cfg.numAis) {
        var position = util.randomPosition();
        ais.push({
            type: 'ai',
            x: position.x,
            y: position.y,
            speed: 1,
            direction: (Math.random() - 0.5) * Math.PI,
            count: util.randomInRange(3,10),
        });
    }


}


function sendUpdates() {
    var entities = getAllEntities();
    players.forEach( function(p) {
        var screenBox = new P( new V(p.x, p.y), [
            new V(p.screenWidth / 2, cfg.backSight),
            new V(- p.screenWidth / 2, cfg.backSight),
            new V(- p.screenWidth / 2, cfg.backSight - p.screenHeight),
            new V(p.screenWidth / 2, cfg.backSight - p.screenHeight)
        ]).rotate(p.direction);

        var visibleEntities = entities.filter( function (e) {
            return SAT.pointInPolygon(new V(e.x, e.y), screenBox);
        });

        var visibleAttacks = attacks.filter( function (a) {
            return SAT.pointInPolygon(new V(a.x, a.y), screenBox);
        });
        var visibleBloods = bloods.filter( function (b) {
            return SAT.pointInPolygon(new V(b.x, b.y), screenBox);
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
