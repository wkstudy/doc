// 丐版vue响应式实现
// 发布者
class Observer {
  constructor() {
    this.listeners = [];
  }
  collect(t) {
    if (t) {
      this.listeners.push(t);
    }
  }
  publish() {
    this.listeners.forEach((item) => {
      item();
    });
  }
}

// 订阅者
class Watcher {
  constructor(v) {
    this.val = v;
  }
}
// 初始化方法，把数据变成一个 发布者
function becomeObserver(obj) {
  Object.keys(obj).forEach((item) => {
    const ob = new Observer();
    let val = obj[item];
    Object.defineProperty(obj, item, {
      get() {
        // 收集订阅者
        ob.collect(
          currentWatcher && currentWatcher.val ? currentWatcher.val : ""
        );
        return val;
      },
      set(newV) {
        val = newV;
        // 通知订阅者
        ob.publish();
      },
    });
  });
}
// 订阅方法， 把comouted 、watcher 等变为一个订阅者
function becomeWatcher(obj) {
  Object.keys(obj).forEach((item) => {
    const val = obj[item];
    Object.defineProperty(obj, item, {
      get() {
        // 把自己这个watcher放到对应的发布者的listeners里
        let pos = watcherList.findIndex((item) => item.val === val);
        if (pos !== -1) {
          currentWatcher = watcherList[pos];
        } else {
          watcherList.push(new Watcher(val));
          currentWatcher = watcherList[watcherList.length - 1];
        }
        return val;
      },
    });
  });
}
// 记录所有的订阅者
let watcherList = [];
// 记录当前正在使用的订阅者
let currentWatcher = null;
// data属性 ,对应vue组件中的data
var data = {
  age: 2,
};
// 对应vue组件里的comouted属性
var computed = {
  computedB() {
    const val = data.age + 20;
    console.log("hello, computedb is", val);
    return val;
  },
};

// 初始化data
becomeObserver(data);
// 初始化computed
becomeWatcher(computed);

// computed 调用， 模仿在vue 中使用computed属性
computed.computedB();

data.age = 39;
// 执行结果
// hello, computedb is 22
// hello, computedb is 59
