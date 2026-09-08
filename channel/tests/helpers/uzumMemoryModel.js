const { isDeepStrictEqual } = require('node:util');
const copy = (value) => value == null ? value : structuredClone(value);
const get = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);
function set(row, path, value) {
  const keys = path.split('.');
  const key = keys.pop();
  let target = row;
  for (const part of keys) target = target[part] ||= {};
  target[key] = copy(value);
}
function matches(row, filter) {
  return Object.entries(filter).every(([key, wanted]) => {
    if (key === '$or') return wanted.some((part) => matches(row, part));
    if (key === '$and') return wanted.every((part) => matches(row, part));
    const actual = get(row, key);
    if (wanted && typeof wanted === 'object' && !(wanted instanceof Date)) {
      return Object.entries(wanted).every(([op, value]) => {
        if (op === '$ne') return !isDeepStrictEqual(actual, value);
        if (op === '$in') return value.includes(actual);
        if (op === '$nin') return !value.includes(actual);
        if (op === '$exists') return (actual !== undefined) === value;
        if (op === '$lte') return actual <= value;
        if (op === '$lt') return actual < value;
        if (op === '$gt') return actual > value;
        throw new Error(`Unsupported memory query ${op}`);
      });
    }
    return wanted === null ? actual == null : isDeepStrictEqual(actual, wanted);
  });
}
function update(row, mutation) {
  for (const [path, value] of Object.entries(mutation.$set || {})) set(row, path, value);
  for (const [path, value] of Object.entries(mutation.$inc || {})) set(row, path, (get(row, path) || 0) + value);
  for (const [path, value] of Object.entries(mutation.$push || {})) {
    let values = [...(get(row, path) || []), ...(value.$each || [value])];
    if (value.$slice) values = values.slice(value.$slice);
    set(row, path, values);
  }
}
function query(value) {
  return { lean: async () => copy(value), then: (yes, no) => Promise.resolve(copy(value)).then(yes, no),
    sort() { return this; }, limit() { return this; }, skip() { return this; } };
}
function memoryModel(rows) {
  return {
    rows,
    findOne: (filter) => query(rows.find((row) => matches(row, filter)) || null),
    find: (filter) => query(rows.filter((row) => matches(row, filter))),
    countDocuments: async (filter) => rows.filter((row) => matches(row, filter)).length,
    findOneAndUpdate(filter, mutation) {
      const row = rows.find((entry) => matches(entry, filter));
      if (row) update(row, mutation);
      return query(row || null);
    },
    async updateOne(filter, mutation) {
      const row = rows.find((entry) => matches(entry, filter));
      if (row) update(row, mutation);
      return { modifiedCount: row ? 1 : 0 };
    },
  };
}
module.exports = { memoryModel };
