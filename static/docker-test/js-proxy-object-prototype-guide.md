# JavaScript Proxy 13种方法详解与Object原型链深度解析

## 目录
1. [Proxy概述](#proxy概述)
2. [Proxy的13种方法详解](#proxy的13种方法详解)
3. [Object详解](#object详解)
4. [原型链深度解析](#原型链深度解析)
5. [实际应用示例](#实际应用示例)

---

## Proxy概述

Proxy是ES6引入的一个强大特性，用于创建一个对象的代理，可以拦截和自定义对象的基本操作（如属性查找、赋值、枚举、函数调用等）。

### 基本语法
```javascript
const proxy = new Proxy(target, handler);
```

- `target`: 要代理的目标对象
- `handler`: 处理器对象，包含各种拦截器方法

---

## Proxy的13种方法详解

### 1. get(target, property, receiver)
拦截对象属性的读取操作。

```javascript
const handler = {
  get(target, property, receiver) {
    console.log(`正在读取属性: ${property}`);
    return target[property];
  }
};

const obj = { name: '张三', age: 25 };
const proxy = new Proxy(obj, handler);

console.log(proxy.name); // 输出: 正在读取属性: name, 张三
```

**应用场景**: 属性访问日志、数据验证、懒加载

### 2. set(target, property, value, receiver)
拦截对象属性的设置操作。

```javascript
const handler = {
  set(target, property, value, receiver) {
    if (property === 'age' && (value < 0 || value > 150)) {
      throw new Error('年龄必须在0-150之间');
    }
    target[property] = value;
    return true; // 必须返回true表示设置成功
  }
};

const person = {};
const proxy = new Proxy(person, handler);

proxy.age = 25; // 正常
// proxy.age = 200; // 抛出错误
```

**应用场景**: 数据验证、属性变更通知、只读属性

### 3. has(target, property)
拦截`in`操作符。

```javascript
const handler = {
  has(target, property) {
    if (property.startsWith('_')) {
      return false; // 隐藏私有属性
    }
    return property in target;
  }
};

const obj = { name: '张三', _password: '123456' };
const proxy = new Proxy(obj, handler);

console.log('name' in proxy); // true
console.log('_password' in proxy); // false
```

**应用场景**: 隐藏私有属性、属性访问控制

### 4. deleteProperty(target, property)
拦截`delete`操作符。

```javascript
const handler = {
  deleteProperty(target, property) {
    if (property === 'id') {
      throw new Error('不能删除id属性');
    }
    return delete target[property];
  }
};

const obj = { id: 1, name: '张三' };
const proxy = new Proxy(obj, handler);

delete proxy.name; // 正常
// delete proxy.id; // 抛出错误
```

**应用场景**: 保护重要属性、删除确认

### 5. ownKeys(target)
拦截`Object.getOwnPropertyNames()`、`Object.getOwnPropertySymbols()`、`Object.keys()`、`for...in`循环。

```javascript
const handler = {
  ownKeys(target) {
    return Object.keys(target).filter(key => !key.startsWith('_'));
  }
};

const obj = { name: '张三', age: 25, _password: '123456' };
const proxy = new Proxy(obj, handler);

console.log(Object.keys(proxy)); // ['name', 'age']
```

**应用场景**: 属性枚举控制、隐藏私有属性

### 6. getOwnPropertyDescriptor(target, property)
拦截`Object.getOwnPropertyDescriptor()`。

```javascript
const handler = {
  getOwnPropertyDescriptor(target, property) {
    const descriptor = Object.getOwnPropertyDescriptor(target, property);
    if (property.startsWith('_')) {
      return undefined; // 隐藏私有属性的描述符
    }
    return descriptor;
  }
};

const obj = { name: '张三', _password: '123456' };
const proxy = new Proxy(obj, handler);

console.log(Object.getOwnPropertyDescriptor(proxy, 'name')); // 正常
console.log(Object.getOwnPropertyDescriptor(proxy, '_password')); // undefined
```

**应用场景**: 属性描述符控制、元数据隐藏

### 7. defineProperty(target, property, descriptor)
拦截`Object.defineProperty()`。

```javascript
const handler = {
  defineProperty(target, property, descriptor) {
    if (property === 'id' && !descriptor.writable) {
      throw new Error('id属性必须是可写的');
    }
    return Object.defineProperty(target, property, descriptor);
  }
};

const obj = {};
const proxy = new Proxy(obj, handler);

Object.defineProperty(proxy, 'id', { value: 1, writable: true }); // 正常
// Object.defineProperty(proxy, 'id', { value: 1, writable: false }); // 错误
```

**应用场景**: 属性定义验证、属性特性控制

### 8. preventExtensions(target)
拦截`Object.preventExtensions()`。

```javascript
const handler = {
  preventExtensions(target) {
    // 阻止对象被冻结
    return false;
  }
};

const obj = { name: '张三' };
const proxy = new Proxy(obj, handler);

// Object.preventExtensions(proxy); // 抛出错误
```

**应用场景**: 防止对象被冻结、扩展性控制

### 9. isExtensible(target)
拦截`Object.isExtensible()`。

```javascript
const handler = {
  isExtensible(target) {
    return false; // 始终返回false，表示对象不可扩展
  }
};

const obj = { name: '张三' };
const proxy = new Proxy(obj, handler);

console.log(Object.isExtensible(proxy)); // false
```

**应用场景**: 扩展性状态控制

### 10. getPrototypeOf(target)
拦截`Object.getPrototypeOf()`、`Reflect.getPrototypeOf()`、`instanceof`操作符。

```javascript
const handler = {
  getPrototypeOf(target) {
    return Array.prototype; // 伪装成数组
  }
};

const obj = { name: '张三' };
const proxy = new Proxy(obj, handler);

console.log(Object.getPrototypeOf(proxy) === Array.prototype); // true
console.log(proxy instanceof Array); // true
```

**应用场景**: 原型伪装、类型欺骗

### 11. setPrototypeOf(target, prototype)
拦截`Object.setPrototypeOf()`。

```javascript
const handler = {
  setPrototypeOf(target, prototype) {
    if (prototype === null) {
      throw new Error('不能将原型设置为null');
    }
    return Object.setPrototypeOf(target, prototype);
  }
};

const obj = { name: '张三' };
const proxy = new Proxy(obj, handler);

Object.setPrototypeOf(proxy, {}); // 正常
// Object.setPrototypeOf(proxy, null); // 错误
```

**应用场景**: 原型设置验证、原型链保护

### 12. apply(target, thisArg, argumentsList)
拦截函数调用。

```javascript
const handler = {
  apply(target, thisArg, argumentsList) {
    console.log('函数被调用，参数:', argumentsList);
    const result = target.apply(thisArg, argumentsList);
    console.log('函数返回值:', result);
    return result;
  }
};

function add(a, b) {
  return a + b;
}

const proxy = new Proxy(add, handler);
console.log(proxy(1, 2)); // 输出调用信息和返回值
```

**应用场景**: 函数调用日志、参数验证、性能监控

### 13. construct(target, argumentsList, newTarget)
拦截`new`操作符。

```javascript
const handler = {
  construct(target, argumentsList, newTarget) {
    console.log('构造函数被调用，参数:', argumentsList);
    const instance = new target(...argumentsList);
    instance.createdAt = new Date();
    return instance;
  }
};

class Person {
  constructor(name) {
    this.name = name;
  }
}

const ProxyPerson = new Proxy(Person, handler);
const person = new ProxyPerson('张三');
console.log(person); // { name: '张三', createdAt: Date }
```

**应用场景**: 构造函数增强、实例属性注入

---

## Object详解

### Object的基本概念

Object是JavaScript中所有对象的基类，所有对象都继承自Object.prototype。

### Object的静态方法

#### 1. Object.create(proto, propertiesObject)
创建一个新对象，使用现有的对象作为新创建对象的原型。

```javascript
const person = {
  sayHello() {
    console.log(`Hello, I'm ${this.name}`);
  }
};

const john = Object.create(person, {
  name: {
    value: 'John',
    writable: true,
    enumerable: true
  },
  age: {
    value: 30,
    writable: true,
    enumerable: true
  }
});

john.sayHello(); // Hello, I'm John
```

#### 2. Object.assign(target, ...sources)
将一个或多个源对象的所有可枚举属性复制到目标对象。

```javascript
const target = { a: 1 };
const source1 = { b: 2 };
const source2 = { c: 3 };

Object.assign(target, source1, source2);
console.log(target); // { a: 1, b: 2, c: 3 }
```

#### 3. Object.defineProperty(obj, prop, descriptor)
直接在对象上定义新属性，或修改现有属性。

```javascript
const obj = {};

Object.defineProperty(obj, 'name', {
  value: '张三',
  writable: false,      // 不可写
  enumerable: true,     // 可枚举
  configurable: false   // 不可配置
});

console.log(obj.name); // 张三
// obj.name = '李四'; // 严格模式下会报错
```

#### 4. Object.defineProperties(obj, props)
在一个对象上定义多个属性。

```javascript
const obj = {};

Object.defineProperties(obj, {
  name: {
    value: '张三',
    writable: true,
    enumerable: true
  },
  age: {
    value: 25,
    writable: true,
    enumerable: true
  }
});
```

#### 5. Object.getOwnPropertyDescriptor(obj, prop)
返回对象自有属性的属性描述符。

```javascript
const obj = { name: '张三' };
const descriptor = Object.getOwnPropertyDescriptor(obj, 'name');
console.log(descriptor);
// {
//   value: '张三',
//   writable: true,
//   enumerable: true,
//   configurable: true
// }
```

#### 6. Object.getOwnPropertyNames(obj)
返回一个由指定对象的所有自身属性的属性名组成的数组。

```javascript
const obj = { name: '张三', age: 25 };
const symbols = [Symbol('id')];
obj[symbols[0]] = 1;

console.log(Object.getOwnPropertyNames(obj)); // ['name', 'age']
```

#### 7. Object.getOwnPropertySymbols(obj)
返回一个给定对象自身的所有Symbol属性的数组。

```javascript
const obj = {};
const sym1 = Symbol('id');
const sym2 = Symbol('name');

obj[sym1] = 1;
obj[sym2] = '张三';

console.log(Object.getOwnPropertySymbols(obj)); // [Symbol(id), Symbol(name)]
```

#### 8. Object.keys(obj)
返回一个由一个给定对象的自身可枚举属性组成的数组。

```javascript
const obj = { name: '张三', age: 25 };
console.log(Object.keys(obj)); // ['name', 'age']
```

#### 9. Object.values(obj)
返回一个给定对象自身的所有可枚举属性值的数组。

```javascript
const obj = { name: '张三', age: 25 };
console.log(Object.values(obj)); // ['张三', 25]
```

#### 10. Object.entries(obj)
返回一个给定对象自身可枚举属性的[key, value]对数组。

```javascript
const obj = { name: '张三', age: 25 };
console.log(Object.entries(obj)); // [['name', '张三'], ['age', 25]]
```

#### 11. Object.freeze(obj)
冻结一个对象，使其不可修改。

```javascript
const obj = { name: '张三', age: 25 };
Object.freeze(obj);

// obj.name = '李四'; // 严格模式下会报错
// obj.newProp = 'value'; // 严格模式下会报错
// delete obj.name; // 严格模式下会报错
```

#### 12. Object.seal(obj)
密封一个对象，阻止添加新属性并将所有现有属性标记为不可配置。

```javascript
const obj = { name: '张三', age: 25 };
Object.seal(obj);

// obj.newProp = 'value'; // 严格模式下会报错
// delete obj.name; // 严格模式下会报错
obj.name = '李四'; // 可以修改现有属性
```

#### 13. Object.preventExtensions(obj)
阻止对象扩展，使其不能添加新属性。

```javascript
const obj = { name: '张三' };
Object.preventExtensions(obj);

// obj.age = 25; // 严格模式下会报错
obj.name = '李四'; // 可以修改现有属性
delete obj.name; // 可以删除现有属性
```

---

## 原型链深度解析

### 原型链的基本概念

原型链是JavaScript实现继承的主要方式。每个对象都有一个原型对象，对象以其原型为模板、从原型"继承"方法和属性。

### 原型链的工作原理

```javascript
// 原型链示例
function Person(name) {
  this.name = name;
}

Person.prototype.sayHello = function() {
  console.log(`Hello, I'm ${this.name}`);
};

const person = new Person('张三');

// 原型链查找过程
console.log(person.name); // 直接属性
console.log(person.sayHello); // 从Person.prototype查找
console.log(person.toString); // 从Object.prototype查找
console.log(person.nonExistent); // undefined
```

### 原型链的完整流程

```javascript
// 1. 创建构造函数
function Animal(name) {
  this.name = name;
}

// 2. 在原型上添加方法
Animal.prototype.eat = function() {
  console.log(`${this.name} is eating`);
};

// 3. 创建子构造函数
function Dog(name, breed) {
  Animal.call(this, name); // 调用父构造函数
  this.breed = breed;
}

// 4. 设置原型链
Dog.prototype = Object.create(Animal.prototype);
Dog.prototype.constructor = Dog; // 修复constructor指向

// 5. 在子原型上添加方法
Dog.prototype.bark = function() {
  console.log(`${this.name} is barking`);
};

// 6. 创建实例
const dog = new Dog('旺财', '金毛');

// 7. 原型链查找
console.log(dog.name); // 直接属性
console.log(dog.breed); // 直接属性
dog.eat(); // 从Animal.prototype查找
dog.bark(); // 从Dog.prototype查找
console.log(dog.toString); // 从Object.prototype查找
```

### 原型链的验证方法

```javascript
// 1. instanceof 操作符
console.log(dog instanceof Dog); // true
console.log(dog instanceof Animal); // true
console.log(dog instanceof Object); // true

// 2. isPrototypeOf 方法
console.log(Dog.prototype.isPrototypeOf(dog)); // true
console.log(Animal.prototype.isPrototypeOf(dog)); // true
console.log(Object.prototype.isPrototypeOf(dog)); // true

// 3. Object.getPrototypeOf 方法
console.log(Object.getPrototypeOf(dog) === Dog.prototype); // true
console.log(Object.getPrototypeOf(Dog.prototype) === Animal.prototype); // true
console.log(Object.getPrototypeOf(Animal.prototype) === Object.prototype); // true

// 4. __proto__ 属性（不推荐使用）
console.log(dog.__proto__ === Dog.prototype); // true
```

### 原型链的常见问题

#### 1. 共享引用类型属性

```javascript
function Person() {}
Person.prototype.friends = ['张三', '李四'];

const person1 = new Person();
const person2 = new Person();

person1.friends.push('王五');
console.log(person2.friends); // ['张三', '李四', '王五'] - 共享了同一个数组
```

**解决方案**：
```javascript
function Person() {
  this.friends = ['张三', '李四']; // 在构造函数中定义
}
```

#### 2. 无法向父构造函数传递参数

```javascript
function Animal(name) {
  this.name = name;
}

function Dog(name, breed) {
  Animal.call(this, name); // 使用call或apply
  this.breed = breed;
}
```

### 现代继承方式

#### 1. ES6 Class

```javascript
class Animal {
  constructor(name) {
    this.name = name;
  }
  
  eat() {
    console.log(`${this.name} is eating`);
  }
}

class Dog extends Animal {
  constructor(name, breed) {
    super(name); // 调用父构造函数
    this.breed = breed;
  }
  
  bark() {
    console.log(`${this.name} is barking`);
  }
}

const dog = new Dog('旺财', '金毛');
```

#### 2. Object.create()

```javascript
const animal = {
  init(name) {
    this.name = name;
    return this;
  },
  eat() {
    console.log(`${this.name} is eating`);
  }
};

const dog = Object.create(animal, {
  breed: {
    value: '金毛',
    writable: true,
    enumerable: true
  },
  bark: {
    value: function() {
      console.log(`${this.name} is barking`);
    },
    writable: true,
    enumerable: true
  }
});

dog.init('旺财');
```

---

## 实际应用示例

### 1. 数据验证Proxy

```javascript
const validationHandler = {
  set(target, property, value) {
    const validators = {
      name: (val) => typeof val === 'string' && val.length > 0,
      age: (val) => typeof val === 'number' && val >= 0 && val <= 150,
      email: (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
    };
    
    if (validators[property] && !validators[property](value)) {
      throw new Error(`Invalid value for ${property}: ${value}`);
    }
    
    target[property] = value;
    return true;
  }
};

const user = new Proxy({}, validationHandler);
user.name = '张三'; // 正常
user.age = 25; // 正常
// user.email = 'invalid-email'; // 抛出错误
```

### 2. 日志记录Proxy

```javascript
const loggingHandler = {
  get(target, property) {
    console.log(`访问属性: ${property}`);
    return target[property];
  },
  set(target, property, value) {
    console.log(`设置属性: ${property} = ${value}`);
    target[property] = value;
    return true;
  },
  deleteProperty(target, property) {
    console.log(`删除属性: ${property}`);
    return delete target[property];
  }
};

const obj = new Proxy({}, loggingHandler);
obj.name = '张三';
console.log(obj.name);
delete obj.name;
```

### 3. 缓存Proxy

```javascript
const cacheHandler = {
  cache: new Map(),
  
  apply(target, thisArg, argumentsList) {
    const key = JSON.stringify(argumentsList);
    
    if (this.cache.has(key)) {
      console.log('从缓存返回结果');
      return this.cache.get(key);
    }
    
    console.log('计算新结果');
    const result = target.apply(thisArg, argumentsList);
    this.cache.set(key, result);
    return result;
  }
};

function expensiveCalculation(a, b) {
  // 模拟复杂计算
  return a + b;
}

const cachedCalculation = new Proxy(expensiveCalculation, cacheHandler);

console.log(cachedCalculation(1, 2)); // 计算新结果
console.log(cachedCalculation(1, 2)); // 从缓存返回结果
```

### 4. 只读对象Proxy

```javascript
const readOnlyHandler = {
  set(target, property, value) {
    throw new Error(`Cannot assign to read-only property '${property}'`);
  },
  deleteProperty(target, property) {
    throw new Error(`Cannot delete read-only property '${property}'`);
  }
};

const config = new Proxy({
  apiUrl: 'https://api.example.com',
  timeout: 5000
}, readOnlyHandler);

// config.apiUrl = 'https://new-api.example.com'; // 抛出错误
// delete config.timeout; // 抛出错误
console.log(config.apiUrl); // 正常读取
```

### 5. 虚拟属性Proxy

```javascript
const virtualPropertyHandler = {
  get(target, property) {
    if (property === 'fullName') {
      return `${target.firstName} ${target.lastName}`;
    }
    if (property === 'age') {
      const birthYear = target.birthYear;
      return new Date().getFullYear() - birthYear;
    }
    return target[property];
  },
  
  set(target, property, value) {
    if (property === 'fullName') {
      const [firstName, lastName] = value.split(' ');
      target.firstName = firstName;
      target.lastName = lastName;
      return true;
    }
    target[property] = value;
    return true;
  }
};

const person = new Proxy({
  firstName: '张',
  lastName: '三',
  birthYear: 1990
}, virtualPropertyHandler);

console.log(person.fullName); // 张 三
console.log(person.age); // 当前年份 - 1990
person.fullName = '李 四';
console.log(person.firstName); // 李
```

这些示例展示了Proxy和原型链在实际开发中的强大应用。Proxy提供了强大的元编程能力，而原型链则是JavaScript面向对象编程的基础。掌握这些概念对于深入理解JavaScript和编写高质量的代码至关重要。 