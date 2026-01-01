import SocketIOClient from 'socket.io-client';
import { nanoid } from 'nanoid/non-secure';

function debounce(callback, ms = 0) {
  let scheduled = false;

  if (ms === 0) {
    return callback;
  }

  return function () {
    if (scheduled) {
      return;
    }

    scheduled = true;

    setTimeout(() => {
      scheduled = false;
      callback.apply(this, arguments);
    }, ms);
  };
}

export class SocketStore {
  /**
   * @param options
   */
  constructor(options) {
    this.baseURL = options.baseURL;
    this.listeners = [];
    this.rooms = {};
    this._io = null;
    this.pendingEmits = [];
    this.randomId = nanoid();
  }

  setToken() {
    this._reconnect();
  }

  setBaseURL(baseURL) {
    this.baseURL = baseURL;
    this._reconnect();
  }

  _reconnect() {
    if (this._io) {
      this._io.close();
    }
    this._io = SocketIOClient(this.baseURL, {
      transports: ['websocket'],
      query: {
        randomId: this.randomId,
      },
      autoConnect: false,
    });
    this.listeners.forEach(listener => {
      this._io.on(listener.event, listener.cb);
    });
    this._io.on('connect', () => {
      let rooms = Object.keys(this.rooms);
      if (rooms.length > 0) {
        this._io.emit('join', Object.keys(this.rooms));
      }
    });
    this._io.open();
    if (this.pendingEmits.length) {
      let emits = this.pendingEmits;
      this.pendingEmits = [];
      for (let [event, data, cb] of emits) {
        this.emit(event, data, cb);
      }
    }
  }

  open() {
    if (this._io) {
      this._io.open();
    }
  }

  close() {
    if (this._io) {
      this._io.close();
    }
  }

  /**
   * @param event
   * @param data
   * @param [cb]
   */
  emit(event, data, cb) {
    if (!this._io) {
      this.pendingEmits.push([event, data, cb]);
    } else {
      this._io.emit(event, data, cb);
    }
  }

  on(event, cb, delay = 0) {
    let disposed = false;
    const disposer = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      this.listeners = this.listeners.filter(
        listener => listener.disposer !== disposer,
      );
      if (this._io) {
        this._io.off(event, cb);
      }
    };

    const debouncedCb = debounce(cb, delay);

    this.listeners.push({
      event,
      cb: debouncedCb,
      disposer,
    });

    if (this._io) {
      this._io.on(event, debouncedCb);
    }

    return disposer;
  }

  join(roomName) {
    if (this.rooms[roomName]) {
      this.rooms[roomName] += 1;
    } else {
      this.rooms[roomName] = 1;
      this._io.emit('join', [roomName]);
    }
    let disposed = false;
    return () => {
      if (disposed) {
        return;
      }
      disposed = true;
      this.leave(roomName);
    };
  }

  leave(roomName) {
    if (this.rooms[roomName] && this.rooms[roomName] > 0) {
      this.rooms[roomName] -= 1;
      if (this.rooms[roomName] === 0 && this._io) {
        this._io.emit('leave', [roomName]);
      }
      delete this.rooms[roomName];
    }
  }

  subscribeToSocket(socketId, onChange, delay = 0) {
    if (!this.socketSubscriptions) {
      this.socketSubscriptions = {};
    }
    if (!this.socketSubscriptions[socketId]) {
      this.socketSubscriptions[socketId] = new SocketSubscription(
        this,
        socketId,
        () => {
          delete this.socketSubscriptions[socketId];
        },
      );
    }
    return this.socketSubscriptions[socketId].listen(debounce(onChange, delay));
  }

  onConnect(cb) {
    if (this._io && this._io.connected) {
      cb();
    }
    return this.on('connect', cb);
  }

  /**
   * @param typingData
   * @returns {TypingSubscription}
   */
  subscribeToTyping(typingData) {
    if (!this.typingSubscriptions) {
      this.typingSubscriptions = {};
    }
    if (!this.typingSubscriptions[typingData.id]) {
      this.typingSubscriptions[typingData.id] = new TypingSubscription(
        this,
        typingData,
        () => {
          delete this.typingSubscriptions[typingData.id];
        },
      );
    }
    return this.typingSubscriptions[typingData.id];
  }

  subscribeToData(id, onChange) {
    if (!this.dataSocketSubscriptions) {
      this.dataSocketSubscriptions = {};
    }
    if (!this.dataSocketSubscriptions[id]) {
      this.dataSocketSubscriptions[id] = new DataSocketSubscription(
        this,
        id,
        () => {
          delete this.dataSocketSubscriptions[id];
        },
      );
    }
    return this.dataSocketSubscriptions[id].listen(onChange);
  }
}

class TypingSubscription {
  constructor(socketStore, typingData, onClose) {
    this.socketStore = socketStore;
    this.typingData = typingData;
    this.listeners = [];
    this.disposers = [];
    this.onClose = onClose;
    this.prevTypingCalledAt = null;
    this.typings = new Map();
  }

  listen(listener) {
    this.listeners.push(listener);
    if (this.listeners.length === 1) {
      this.open();
    }
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
      if (this.listeners.length === 0) {
        this.close();
      }
    };
  }

  open() {
    this.disposers.push(
      this.socketStore.onConnect(() => {
        this.socketStore.emit('typing/subscribe', this.typingData);
      }),
    );
    this.disposers.push(() =>
      this.socketStore.emit('typing/unsubscribe', this.typingData),
    );
    this.disposers.push(
      this.socketStore.on('typing/update/' + this.typingData.id, value => {
        if (value.uid !== this.typingData.uid) {
          this._onTypingChange(value);
        }
      }),
    );
  }

  close() {
    this.disposers.forEach(disposer => disposer());
    this.disposers = [];
    this.onClose();
  }

  _onTypingChange = value => {
    if (value.uid !== this.typingData.uid) {
      let uid = value.uid;
      if (this.typings.has(uid)) {
        let currentTyping = this.typings.get(uid);
        if (currentTyping.timeoutHandle) {
          clearTimeout(currentTyping.timeoutHandle);
        }
      }
      let data = {
        ...this.typings.get(uid),
        ...value,
        timeoutHandle: setTimeout(() => {
          this.typings.delete(uid);
          this._emitTypings();
        }, 10000),
      };
      this.typings.set(uid, data);
      this._emitTypings();
    }
  };

  _emitTypings = () => {
    const names = [...this.typings.values()]
      .filter(t => !t.lastMessageAt || t.lastMessageAt < t.typedAt)
      .map(t => t.name);
    this.listeners.forEach(l => l(names));
  };

  updateTyping() {
    let now = new Date().getTime();
    if (!this.prevTypingCalledAt || this.prevTypingCalledAt + 2000 < now) {
      this.prevTypingCalledAt = now;
      this.socketStore.emit('typing/update', this.typingData);
    }
  }
}

class SocketSubscription {
  /**
   * @param {SocketStore} socketStore
   * @param {string} socketId
   * @param {Function} onClose
   */
  constructor(socketStore, socketId, onClose) {
    this.socketStore = socketStore;
    this.socketId = socketId;
    this.listeners = [];
    this.disposers = [];
    this.onClose = onClose;
    this.lastUpdatedValue = null;
  }

  listen(listener) {
    this.listeners.push(listener);
    if (this.listeners.length === 1) {
      this.open();
    }
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
      if (this.listeners.length === 0) {
        this.close();
      }
    };
  }

  open() {
    this.disposers.push(
      this.socketStore.onConnect(() => {
        this.socketStore.emit(
          'socket/subscribe',
          { socketId: this.socketId },
          data => {
            if (
              this.lastUpdatedValue &&
              data &&
              this.lastUpdatedValue !== data
            ) {
              this._emitChanged();
            }
            this.lastUpdatedValue = data;
          },
        );
      }),
    );
    this.disposers.push(() =>
      this.socketStore.emit('socket/unsubscribe', { socketId: this.socketId }),
    );
    this.disposers.push(
      this.socketStore.on('socket/' + this.socketId + '/updated', data => {
        this.lastUpdatedValue = data;
        this._emitChanged();
      }),
    );
  }

  close() {
    this.disposers.forEach(disposer => disposer());
    this.disposers = [];
    this.onClose();
  }

  _emitChanged() {
    this.listeners.forEach(listener => listener());
  }
}

class DataSocketSubscription {
  constructor(socketStore, id, onClose) {
    this.socketStore = socketStore;
    this.id = id;
    this.listeners = [];
    this.disposers = [];
    this.onClose = onClose;
  }

  listen(listener) {
    this.listeners.push(listener);
    if (this.listeners.length === 1) {
      this.open();
    }
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
      if (this.listeners.length === 0) {
        this.close();
      }
    };
  }

  open() {
    this.disposers.push(
      this.socketStore.onConnect(() => {
        this.socketStore.emit('dataSocket/subscribe', { id: this.id });
      }),
    );
    this.disposers.push(() =>
      this.socketStore.emit('dataSocket/unsubscribe', { id: this.id }),
    );
    this.disposers.push(
      this.socketStore.on('dataSocket/data/' + this.id, data => {
        this._emitChanged(data);
      }),
    );
  }

  close() {
    this.disposers.forEach(disposer => disposer());
    this.disposers = [];
    this.onClose();
  }

  _emitChanged(data) {
    this.listeners.forEach(listener => listener(data));
  }
}
