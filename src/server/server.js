/*jslint node: true */
'use strict';

var express = require('express');
var app     = express();
var http    = require('http').Server(app);
var io      = require('socket.io')(http);

var SAT = require('sat'); //충돌 처리
var V = SAT.Vector;

var config  = require('./config.json');
var util = require('./util');

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

    var type = socket.handshake.query.type;
    var position = util.randomPosition();

    var currentPlayer = {
        id: socket.id,
    };

    socket.on('respawn', function () {
    //우선 players 목록에 존재하면 삭제하고 나중에('gotit')에서 다시 추가함
        if (util.findIndex(players, currentPlayer.id) > -1)
            players.splice(util.findIndex(players, currentPlayer.id), 1);

        socket.emit('welcome', currentPlayer);

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

        socket.emit('gameSetup', {
            gameWidth: config.gameWidth,
            gameHeight: config.gameHeight
        });
    });

    socket.on('windowResized', function(data) {
        currentPlayer.screenWidth = data.screenWidth;
        currentPlayer.screenHeight = data.screenHeight;
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

    socket.on('playerSendAttack', function(attack) {
        attack.duration = config.attackDuration;
        attacks.push(attack);
    });

});


function movePlayer(player) {
    //canvas에서 각 어떻게 처리하는지 고려
    player.x += player.speed * Math.sin(player.direction);
    player.y -= player.speed * Math.sin(player.direction);

}




function tickPlayer(currentPlayer) {
    movePlayer(currentPlayer);

  //공격 확인, 죽음 이벤트 발생('serverTellPlayerDie') ....
  io.emit('serverTellPlayerDie', function(death) {

  });
}

//ai ->speed: 0 or 1, 방향, 속도 유지 시간 지정, 적절한 범위 내에서 방향과 속도를 바꿀 것
function updateAiState(ai) {
    if(ai.duration === 0) {
        //방향 변화

        //속도 변화
        ai.speed = Math.floor(Math.random() + 0.5);
    } else {
        (ai.duration)--;
    }


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
        updateAiState(ais[i]);
        tickPlayer(ais[i]);
    }
    tickAttacks();
    tickBloods();
}

function gameloop() {
    //leaderboard 처리
    if (players.lenght > 0) {
        players.sort( function(a,b) { return b.score - a.score; });
    }
    var topPlayers = [];
    //leaderboard 관련 동작들....
    for (var i = 0; i < Math.min(5, players.length); i++) {
        topPlayers.push({
            id: players[i].id,
            name: players[i].name
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


}


function sendUpdates() {
    var entities = getAllEntities();
    players.forEach( function(p) {
        var visibleEntities = entities.filter(); //계산법?
        var visibleAttacks = [];
        var visibleBloods = [];

        if(p.type === 'player') {
            sockets[p.id].emit('serverTellPlayerMove', visibleEntities, visibleAttacks, visibleBloods);
            if(leaderboardChanged) {
                sockets[p.id].emit('leaderboard', {
                    players: players.length,
                    leaderboard: leaderboard
            });
          }
        }
    });
    leaderboardChanged = false;
}


setInterval(moveloop, 1000 / 60);
setInterval(gameloop, 1000);
setInterval(sendUpdates, 1000 / config.networkUpdateFactor);





var serverPort = process.env.PORT || config.port;
http.listen(serverPort, function() {
    console.log("Server is listening on port " + serverPort);
});
