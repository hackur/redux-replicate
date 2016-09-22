const performReplication = (store, replication, state, nextState, action) => {
  if (!store || !store.key || !store.initializedReplication) {
    return;
  }

  const replicators = [].concat(replication.replicator);

  for (let replicator of replicators) {
    if (replicator.onStateChange) {
      if (replication.reducerKeys) {
        for (let reducerKey of replication.reducerKeys) {
          if (state[reducerKey] !== nextState[reducerKey]) {
            let queryable = typeof replication.queryable === 'object'
              ? replication.queryable[reducerKey]
              : replication.queryable;

            /*store.dispatch({
              type: CHANGED_STATE,
              reducerKey,
              state: state[reducerKey],
              nextState: nextState[reducerKey],
              queryable
            });*/

            replicator.onStateChange({
              store,
              reducerKey,
              state: state[reducerKey],
              nextState: nextState[reducerKey],
              queryable,
              action
            });
          }
        }
      } else if (state !== nextState) {
        /*store.dispatch({
          type: CHANGED_STATE,
          state,
          nextState,
          queryable
        });*/

        replicator.onStateChange({ store, state, nextState, action });
      }
    }

    if (replicator.postReduction) {
      replicator.postReduction({ store, state, nextState, action });
    }
  }
};

export default performReplication;
