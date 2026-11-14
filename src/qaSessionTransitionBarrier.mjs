// A prior logout response must settle before a new same-tab login sets a cookie.
// Independent Firebase Auth sign-out needs the same ordering.
function gate() {
  let pending = null;
  return {
    start(operation) {
      if (pending) return pending;
      const task = Promise.resolve().then(operation);
      pending = task;
      void task.then(
        () => { if (pending === task) pending = null; },
        () => { if (pending === task) pending = null; },
      );
      return task;
    },
    async wait() {
      if (!pending) return;
      try { await pending; } catch { /* a failed logout must still settle */ }
    },
  };
}
const server = gate();
const firebase = gate();
export const runQaServerLogout = operation => server.start(operation);
export const waitForQaServerLogout = () => server.wait();
export const runQaFirebaseSignOut = operation => firebase.start(operation);
export const waitForQaFirebaseSignOut = () => firebase.wait();
