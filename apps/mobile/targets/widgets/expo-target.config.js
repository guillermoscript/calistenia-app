/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'CalisteniaWidgets',
  deploymentTarget: '16.2',
  entitlements: {
    'com.apple.security.application-groups': ['group.tech.guille.calistenia'],
  },
}
