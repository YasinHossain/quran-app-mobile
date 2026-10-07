// Diagnostic entry only. No router, app providers, fonts, Quran data, or app CSS.
const React = require('react');
const { AppRegistry, Text, View } = require('react-native');

function IdleControl() {
  return React.createElement(View, { style: { flex: 1, justifyContent: 'center' } },
    React.createElement(Text, null, 'Idle memory control'));
}

AppRegistry.registerComponent('main', () => IdleControl);
