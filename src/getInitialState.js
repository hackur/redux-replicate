import extractReducerKeys from './extractReducerKeys';
import storeKeysEqual from './storeKeysEqual';
import {
  INIT,
  CREATE,
  GET_INITIAL_STATE,
  GOT_INITIAL_STATE
} from './actionTypes';

const getInitialState = (store, replication) => {
  const replicators = [].concat(replication.replicator);
  const initReplicators = replicators.filter(replicator => {
    if (replicator.onReady) {
      store.onReady(replicator.onReady);
    }
    // just the replicators with `getInitialState`
    return typeof replicator.getInitialState === 'function';
  });

  // need this for multiple replication enhancers
  store.initializingReplication = (store.initializingReplication || 0) + 1;
  store.initializedReplication = false;

  let waitCount = 1;
  let setInitialState = false;
  let actualInitialState = replication.reducerKeys ? {} : null;
  const clear = () => {
    if (--waitCount === 0) {
      if (setInitialState) {
        store.setState(actualInitialState);
      }

      if (--store.initializingReplication === 0) {
        // all replication enhancers initialized, so we can clear all callbacks
        while (store.readyCallbacks.length) {
          store.readyCallbacks.shift()({ store });
        }
        store.initializedReplication = true;
        // these are only used during initialization
        delete replication.create;
        delete replication.clientState;
      }
    }
  };

  if (!store.key) {
    clear();
    return;
  }

  const { key } = store;
  const currentState = store.getState();
  const action = { type: replication.create ? CREATE : INIT };

  const shouldReplicate = reducerKey => replication.create || (
    replication.clientState && (
      !reducerKey || typeof replication.clientState[reducerKey] !== 'undefined'
    )
  );

  const initState = ({ getInitialState, onStateChange }) => reducerKey => {
    store.dispatch({ type: GET_INITIAL_STATE, reducerKey });
    waitCount++;

    getInitialState({
      store,
      reducerKey,
      setState: state => {
        if (typeof state === 'undefined') {
          if (onStateChange && shouldReplicate(reducerKey)) {
            const nextState = reducerKey
              ? currentState[reducerKey]
              : currentState;
            const queryable = typeof replication.queryable === 'object'
              ? replication.queryable[reducerKey]
              : replication.queryable;
            const create = replication.create;
            const clientState = reducerKey
              ? replication.clientState && replication.clientState[reducerKey]
              : replication.clientState;

            /*store.dispatch({
              type: REPLICATE_INITIAL_STATE,
              reducerKey,
              nextState,
              queryable,
              create,
              clientState
            });*/

            onStateChange({
              store,
              reducerKey,
              nextState,
              queryable,
              create,
              clientState,
              action
            });
          }
        } else if (storeKeysEqual(key, store.key)) {
          if (reducerKey) {
            actualInitialState[reducerKey] = state;
          } else {
            actualInitialState = state;
          }
          setInitialState = true;
        }

        store.dispatch({ type: GOT_INITIAL_STATE, reducerKey, state });
        clear();
      }
    });
  };

  if (replication.reducerKeys) {
    const { getReducerKeys, setReducerKeys } = extractReducerKeys(
      replication,
      currentState
    );

    if (setReducerKeys) {
      for (let replicator of replicators) {
        if (replicator.onStateChange) {
          for (let reducerKey of setReducerKeys) {
            if (shouldReplicate(reducerKey)) {
              let nextState = reducerKey
                ? currentState[reducerKey]
                : currentState;
              let queryable = typeof replication.queryable === 'object'
                ? replication.queryable[reducerKey]
                : replication.queryable;
              let create = replication.create;
              let clientState = reducerKey
                ? replication.clientState
                  && replication.clientState[reducerKey]
                : replication.clientState;

              /*store.dispatch({
                type: REPLICATE_INITIAL_STATE,
                reducerKey,
                nextState,
                queryable,
                create,
                clientState
              });*/

              replicator.onStateChange({
                store,
                reducerKey,
                nextState,
                queryable,
                create,
                clientState,
                action
              });
            }
          }
        }
      }
    }

    for (let replicator of initReplicators) {
      let initReducerState = initState(replicator);

      for (let reducerKey of getReducerKeys) {
        initReducerState(reducerKey);
      }
    }
  } else {
    for (let replicator of initReplicators) {
      initState(replicator)();
    }
  }

  clear();
};

export default getInitialState;
