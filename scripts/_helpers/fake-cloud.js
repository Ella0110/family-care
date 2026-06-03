function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === '[object Object]';
}

function cloneValue(value) {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (isPlainObject(value)) {
    return Object.keys(value).reduce((accumulator, key) => {
      accumulator[key] = cloneValue(value[key]);
      return accumulator;
    }, {});
  }

  return value;
}

function getFieldValue(document, fieldPath) {
  return fieldPath.split('.').reduce((current, key) => (current == null ? current : current[key]), document);
}

function compareValues(left, right) {
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;

  if (leftValue < rightValue) {
    return -1;
  }

  if (leftValue > rightValue) {
    return 1;
  }

  return 0;
}

function createCommand() {
  const wrap = (operator, value) => ({ __op: operator, value });

  return {
    gte: (value) => wrap('gte', value),
    lte: (value) => wrap('lte', value),
    and: (value) => wrap('and', value),
    in: (value) => wrap('in', value),
  };
}

function matchesOperator(operatorObject, actualValue) {
  if (!operatorObject || typeof operatorObject !== 'object' || !operatorObject.__op) {
    return actualValue === operatorObject;
  }

  if (operatorObject.__op === 'gte') {
    return compareValues(actualValue, operatorObject.value) >= 0;
  }

  if (operatorObject.__op === 'lte') {
    return compareValues(actualValue, operatorObject.value) <= 0;
  }

  if (operatorObject.__op === 'and') {
    return operatorObject.value.every((condition) => matchesOperator(condition, actualValue));
  }

  if (operatorObject.__op === 'in') {
    return Array.isArray(operatorObject.value) && operatorObject.value.includes(actualValue);
  }

  return false;
}

function matchesQuery(document, query) {
  return Object.keys(query).every((key) => {
    const expectedValue = query[key];
    const actualValue = getFieldValue(document, key);
    return matchesOperator(expectedValue, actualValue);
  });
}

class FakeDocRef {
  constructor(store, collectionName, id) {
    this.store = store;
    this.collectionName = collectionName;
    this.id = id;
  }

  async get() {
    const collection = this.store[this.collectionName] || {};
    if (!collection[this.id]) {
      const error = new Error(`document.get:fail document with _id ${this.id} does not exist`);
      error.code = 'DOCUMENT_NOT_FOUND';
      throw error;
    }

    return {
      data: cloneValue(collection[this.id]),
    };
  }

  async set({ data }) {
    const collection = (this.store[this.collectionName] = this.store[this.collectionName] || {});
    if (data && Object.prototype.hasOwnProperty.call(data, '_id')) {
      const error = new Error('document.set:fail -501007 invalid parameters. 不能更新_id的值');
      error.code = 'INVALID_DOCUMENT_SET';
      throw error;
    }

    collection[this.id] = cloneValue(Object.assign({}, data, { _id: this.id }));
    return { updated: 1 };
  }

  async update({ data }) {
    const collection = (this.store[this.collectionName] = this.store[this.collectionName] || {});
    if (!collection[this.id]) {
      throw new Error(`Document ${this.collectionName}/${this.id} does not exist`);
    }

    collection[this.id] = Object.assign({}, collection[this.id], cloneValue(data));
    return { updated: 1 };
  }

  async remove() {
    const collection = (this.store[this.collectionName] = this.store[this.collectionName] || {});
    if (!collection[this.id]) {
      return { deleted: 0 };
    }

    delete collection[this.id];
    return { deleted: 1 };
  }
}

class FakeQuery {
  constructor(database, store, collectionName, query = null, sort = null, limitValue = null) {
    this.database = database;
    this.store = store;
    this.collectionName = collectionName;
    this.query = query;
    this.sort = sort;
    this.limitValue = limitValue;
  }

  doc(id) {
    return new FakeDocRef(this.store, this.collectionName, id);
  }

  where(query) {
    return new FakeQuery(this.database, this.store, this.collectionName, query, this.sort, this.limitValue);
  }

  orderBy(field, direction) {
    return new FakeQuery(
      this.database,
      this.store,
      this.collectionName,
      this.query,
      { field, direction },
      this.limitValue,
    );
  }

  limit(limitValue) {
    return new FakeQuery(this.database, this.store, this.collectionName, this.query, this.sort, limitValue);
  }

  async get() {
    const collection = Object.values(this.store[this.collectionName] || {});
    let docs = this.query ? collection.filter((document) => matchesQuery(document, this.query)) : collection.slice();

    if (this.sort) {
      const direction = this.sort.direction === 'asc' ? 1 : -1;
      docs = docs
        .slice()
        .sort((left, right) => compareValues(getFieldValue(left, this.sort.field), getFieldValue(right, this.sort.field)) * direction);
    }

    if (typeof this.limitValue === 'number') {
      docs = docs.slice(0, this.limitValue);
    }

    return {
      data: docs.map((document) => cloneValue(document)),
    };
  }

  async add({ data }) {
    const collection = (this.store[this.collectionName] = this.store[this.collectionName] || {});
    const cloned = cloneValue(data);
    const id = cloned._id || `id_${this.database.nextId()}`;
    cloned._id = id;
    collection[id] = cloned;
    return { _id: id };
  }
}

class FakeTransaction {
  constructor(database) {
    this.database = database;
    this.snapshot = cloneValue(database.store);
  }

  collection(name) {
    return new FakeQuery(this.database, this.snapshot, name);
  }

  async commit() {
    this.database.store = this.snapshot;
  }

  async rollback() {}
}

class FakeDatabase {
  constructor(seed = {}) {
    this.store = {};
    this.command = createCommand();
    this.idCounter = 0;

    Object.keys(seed).forEach((collectionName) => {
      this.store[collectionName] = {};
      seed[collectionName].forEach((document) => {
        this.store[collectionName][document._id] = cloneValue(document);
      });
    });
  }

  nextId() {
    this.idCounter += 1;
    return this.idCounter;
  }

  collection(name) {
    return new FakeQuery(this, this.store, name);
  }

  async startTransaction() {
    return new FakeTransaction(this);
  }
}

function createFakeCloud(initialOpenId = 'user_owner') {
  let currentOpenId = initialOpenId;

  return {
    setOpenId(nextOpenId) {
      currentOpenId = nextOpenId;
    },
    getCurrentOpenId() {
      return currentOpenId;
    },
    getWXContext() {
      return {
        OPENID: currentOpenId,
        UNIONID: `union_${currentOpenId}`,
      };
    },
  };
}

function createFakeRuntime(options = {}) {
  const database = new FakeDatabase(options.seed || {});
  const cloud = createFakeCloud(options.openId);

  return {
    db: database,
    cloud,
    command: database.command,
    now: options.now || (() => new Date('2026-04-23T08:00:00.000Z')),
    setOpenId(openId) {
      cloud.setOpenId(openId);
    },
    getOpenId() {
      return cloud.getCurrentOpenId();
    },
  };
}

module.exports = {
  cloneValue,
  createFakeRuntime,
};
