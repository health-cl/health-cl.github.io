// Firebase web app settings (Firebase console > Project settings > Your apps). These identify the project;
// they are not secrets. Access is controlled by database.rules.json and the role claims set by tools/admin.py.
// Analytics is deliberately not loaded: raters are not tracked.
// Leave apiKey empty to run the demo (synthetic cases, stored in this browser only); ?demo forces the demo.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBIorDH--HXJolxqx0NdF8MWO0wmO0_a4A',
  authDomain: 'ivory-plane-406700.firebaseapp.com',
  databaseURL: 'https://ivory-plane-406700-default-rtdb.firebaseio.com',
  projectId: 'ivory-plane-406700',
  appId: '1:360125182471:web:52f8e72c2c4994686530a2',
};
