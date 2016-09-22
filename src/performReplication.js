import {
  REPLICATE_STATE,
  REPLICATED_STATE,
  STATE_CHANGE_ERROR
} from './actionTypes';

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
            let setProps = {
              reducerKey,
              state: state[reducerKey],
              nextState: nextState[reducerKey],
              queryable: typeof replication.queryable === 'object'
                ? replication.queryable[reducerKey]
                : replication.queryable
            };

            store.dispatch({ type: REPLICATE_STATE, ...setProps });

            replicator.onStateChange({
              ...setProps,
              store,
              action,
              setStatus: status => store.dispatch({
                type: REPLICATED_STATE, ...setProps, status
              }),
              setError: error => store.dispatch({
                type: STATE_CHANGE_ERROR, ...setProps, error
              })
            });
          }
        }
      } else if (state !== nextState) {
        let setProps = {
          state,
          nextState,
          queryable: replication.queryable
        };

        store.dispatch({ type: REPLICATE_STATE, ...setProps });

        replicator.onStateChange({
          ...setProps,
          store,
          action,
          setStatus: status => store.dispatch({
            type: REPLICATED_STATE, ...setProps, status
          }),
          setError: error => store.dispatch({
            type: STATE_CHANGE_ERROR, ...setProps, error
          })
        });
      }
    }

    if (replicator.postReduction) {
      replicator.postReduction({ store, state, nextState, action });
    }
  }
};

export default performReplication;
