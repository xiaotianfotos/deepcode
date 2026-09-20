import * as llm from '@deepseek-ai/dsh-llm';

// Keep namespace access: a named import fails before this adapter can run on
// the other official DSH generation. Both constructors have the same contract.
export function toolCallId(value) {
  const create = Reflect.get(llm, 'ToolCallId') ?? Reflect.get(llm, 'CallId');
  if (typeof create !== 'function') throw new Error('DSH does not provide a tool call ID constructor');
  return create(value);
}

// DSH alpha.3 exposed an immutable `events` snapshot. rc.1 replaced that
// accessor with `snapshotEvents()` and branded `seq`. Keep all runtime
// branching at this boundary so the same Relay artifact works on both hosts.
export function sessionEvents(session, from = 0) {
  if (!Number.isSafeInteger(from) || from < 0) throw new RangeError('session event offset must be a non-negative integer');
  const snapshot = Reflect.get(session, 'snapshotEvents');
  if (typeof snapshot === 'function') {
    return from === 0 ? Reflect.apply(snapshot, session, []) : Reflect.apply(snapshot, session, [from]);
  }
  const events = Reflect.get(session, 'events');
  if (!Array.isArray(events)) throw new TypeError('DSH Session exposes neither snapshotEvents() nor events');
  return from === 0 ? events : events.slice(from);
}

export function sessionEventCount(session) {
  const seq = Reflect.get(session, 'seq');
  return Number.isSafeInteger(seq) && seq >= 0 ? Number(seq) : sessionEvents(session).length;
}

export async function loadPersistedSession(persistence, id) {
  const load = Reflect.get(persistence, 'load');
  if (typeof load === 'function') return Reflect.apply(load, persistence, [id]);

  const open = Reflect.get(persistence, 'open');
  if (typeof open !== 'function') throw new TypeError('DSH persistence exposes neither load() nor open()');
  const handle = await Reflect.apply(open, persistence, [id, 'read']);
  try {
    return {
      meta: structuredClone(handle.header),
      inheritedEventCount: handle.inheritedEventCount,
      events: await handle.read(),
    };
  } finally {
    await handle.close();
  }
}

export async function appendPersistedEvents(persistence, id, events) {
  if (events.length === 0) return;
  const append = Reflect.get(persistence, 'append');
  if (typeof append === 'function') {
    await Reflect.apply(append, persistence, [id, events]);
    return;
  }

  const open = Reflect.get(persistence, 'open');
  if (typeof open !== 'function') throw new TypeError('DSH persistence exposes neither append() nor open()');
  const handle = await Reflect.apply(open, persistence, [id, 'write']);
  try {
    await handle.append(events);
    await handle.flush();
  } finally {
    await handle.close();
  }
}

export async function writePersistedSession(persistence, header, events, inheritedEventCount = 0) {
  const create = Reflect.get(persistence, 'create');
  if (typeof create !== 'function') throw new TypeError('DSH persistence does not expose create()');

  // alpha.3 and rc.1 expose a service API whose second argument is the
  // numeric inherited offset. Newer DSH builds return a write handle and use
  // an options object. The presence of append() distinguishes the services.
  const append = Reflect.get(persistence, 'append');
  if (typeof append === 'function') {
    await Reflect.apply(create, persistence, [header, inheritedEventCount]);
    await appendPersistedEvents(persistence, header.id, events);
    return;
  }

  const handle = await Reflect.apply(create, persistence, [header, { inheritedEventCount }]);
  if (handle && typeof handle.append === 'function') {
    try {
      if (events.length > 0) await handle.append(events);
      await handle.flush();
    } finally {
      await handle.close();
    }
    return;
  }
  throw new TypeError('DSH persistence create() did not return a write handle');
}
