function arrayToMap(array) {
  const map = {};

  if (Array.isArray(array)) {
    array.forEach(item => {
      map[item] = true;
    });
  }

  return map;
}

/**
 * Creates a Redux store enhancer designed to replicate actions and states.
 *
 * @param {Object} options
 * @return {Function}
 * @api public
 */
export default function replicate({
  key,
  reducerKeys,
  queryable = false,
  replicator,
  clientState
}) {
  if (!Array.isArray(replicator)) {
    replicator = [ replicator ];
  }

  // TODO: clean this up a bit; it probably looks like one big blob of code
  // but it's actually pretty straightforward!
  return next => (reducer, initialState, enhancer) => {
    let store = null;
    let nextState = null;
    const replicators = replicator.map(Object.create);

    function getInitialState(gettingKey) {
      for (let replicator of replicators) {
        if (replicator.onReady) {
          store.onReady(replicator.onReady);
        }
      }

      if (store.initializingReplication) {
        store.initializingReplication++;
      } else {
        store.initializingReplication = 1;
      }

      store.initializedReplication = false;
      store.onReady(() => {
        store.initializedReplication = true;
      });

      let actualInitialState = reducerKeys ? {} : null;
      let setInitialState = false;
      let semaphore = replicators.length;

      function clear() {
        if (--semaphore === 0) {
          if (setInitialState) {
            store.setState(actualInitialState);
          }

          if (--store.initializingReplication === 0) {
            while (store.readyCallbacks.length) {
              store.readyCallbacks.shift()(store.key, store);
            }
          }
        }
      }

      if (!key) {
        actualInitialState = initialState;
        setInitialState = true;
        semaphore = 1;
        clear();
        return;
      }

      if (reducerKeys) {
        let initialReducerKeys = reducerKeys;

        if (reducerKeys === true) {
          reducerKeys = Object.keys(store.getState());
          initialReducerKeys = reducerKeys;
        }

        // here we want the client to get only the undefined initial states
        if (clientState) {
          initialReducerKeys = [];

          if (Array.isArray(reducerKeys)) {
            for (let reducerKey of reducerKeys) {
              if (typeof clientState[reducerKey] === 'undefined') {
                initialReducerKeys.push(reducerKey);
              }
            }
          } else {
            // if reducerKeys is an object, truthy values indicate keys that
            // can be overridden by the client
            for (let reducerKey in reducerKeys) {
              if (
                reducerKeys[reducerKey]
                && typeof clientState[reducerKey] === 'undefined'
              ) {
                initialReducerKeys.push(reducerKey);
              }
            }

            reducerKeys = Object.keys(reducerKeys);
          }
        }

        queryable = arrayToMap(queryable === true ? reducerKeys : queryable);
        semaphore = semaphore * initialReducerKeys.length;

        if (semaphore) {
          for (let replicator of replicators) {
            if (replicator.getInitialState) {
              for (let reducerKey of initialReducerKeys) {
                replicator.getInitialState({ key, reducerKey }, state => {
                  if (gettingKey === key && typeof state !== 'undefined') {
                    actualInitialState[reducerKey] = state;
                    setInitialState = true;
                  }

                  clear();
                });
              }
            } else {
              for (let reducerKey of initialReducerKeys) {
                clear();
              }
            }
          }
        } else {
          semaphore = 1;
          clear();
        }
      } else {
        for (let replicator of replicators) {
          if (replicator.getInitialState) {
            replicator.getInitialState({ key }, state => {
              if (gettingKey === key && typeof state !== 'undefined') {
                actualInitialState = state;
                setInitialState = true;
              }

              clear();
            });
          } else {
            clear();
          }
        }
      }
    }

    function mergeNextState(state) {
      if (reducerKeys) {
        state = { ...state, ...nextState };
      } else {
        state = nextState;
      }

      nextState = null;
      return state;
    }

    function replicatedReducer(state, action) {
      const actualNextState = nextState
        ? reducer(mergeNextState(state), action)
        : reducer(state, action);

      if (key && store && store.initializedReplication) {
        for (let replicator of replicators) {
          if (replicator.onStateChange) {
            if (reducerKeys) {
              for (let reducerKey of reducerKeys) {
                if (state[reducerKey] !== actualNextState[reducerKey]) {
                  replicator.onStateChange(
                    { key, reducerKey, queryable: queryable[reducerKey] },
                    state[reducerKey],
                    actualNextState[reducerKey],
                    action,
                    store
                  );
                }
              }
            } else if (state !== actualNextState) {
              replicator.onStateChange(
                { key, queryable }, state, actualNextState, action, store
              );
            }
          }

          if (replicator.postReduction) {
            replicator.postReduction(
              key, state, actualNextState, action, store
            );
          }
        }
      }

      return actualNextState;
    }

    store = next(replicatedReducer, initialState, enhancer);

    if (!store.onReady) {
      store.readyCallbacks = [];
      store.onReady = readyCallback => {
        store.readyCallbacks.push(readyCallback);
      };
    }

    if (!store.setKey) {
      store.setKey = (newKey, readyCallback) => {
        key = newKey;
        store.key = key;

        if (readyCallback) {
          store.onReady(readyCallback);
        }

        store.initialStateGetters.forEach(fn => fn(key));
      };
    }

    if (!store.setState) {
      store.setState = state => {
        nextState = state;
        store.replaceReducer(replicatedReducer);
      };
    }

    if (typeof key !== 'undefined') {
      store.key = key;
    }

    if (!store.initialStateGetters) {
      store.initialStateGetters = [];
    }
    store.initialStateGetters.push(getInitialState);

    getInitialState(key);

    return store;
  };
}
