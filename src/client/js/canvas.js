var global = require('./global');

class Canvas {
  constructor(params) {
    this.socket = global.socket;
    var self = this;

    this.cv = document.getElementById('cvs');
    this.cv.width = global.screenWidth;
    this.cv.height = global.screenHeight;
    this.cv.parent = self;
    this.cv.addEventListener('keydown', function(e) {
      self.updateKeyStatus(e);
    }, false);
    this.cv.addEventListener('keyup', function(e) {
      self.updateKeyStatus(e);
    }, false);
    global.canvas = this;
  }

  updateKeyStatus(event) {
    var keyCode = event.which || event.keyCode;
    this.keys = (this.keys || []);
    this.keys[keyCode] = (event.type == "keydown");
    switch(keyCode) {
      case global.KEY_ATTACK:
        this.socket.emit('playerSendAttack');
        break;
      case global.KEY_RUN:
      case global.KEY_UP:
      case global.KEY_DOWN:
        var speed;
        if (this.keys[global.KEY_UP]) {
          if (this.keys[global.KEY_DOWN]) {
            speed = 0;
          } else if (this.keys[global.KEY_RUN]) {
            speed = 2;
          } else {
            speed = 1;
          }
        } else if (this.keys[global.KEY_DOWN]) {
          speed = -1;
        } else {
          speed = 0;
        }
        this.socket.emit('playerSendSpeed', speed);
        break;
      case global.KEY_LEFT:
      case global.KEY_RIGHT:
        var rotate;
        if (this.keys[global.KEY_LEFT]) {
          if (this.keys[global.KEY_RIGHT]) {
            rotate = 0;
          } else {
            rotate = -1;
          }
        } else if (this.keys[global.KEY_RIGHT]) {
          rotate = 1;
        } else {
          rotate = 0;
        }
        this.socket.emit('playerSendRotate', rotate);
        break;
    }
  }
}

module.exports = Canvas;
