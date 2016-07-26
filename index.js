const config = require('./config.json')
const slack = require('slack')

slack.chat.postMessage({
  token: config['slack-token'],
  channel: '#ypns',
  username: 'YPNS',
  icon_emoji: ':ypns:',
  text: 'XXX became online'
}, function (err, data) {
  console.log('err', err)
  console.log('data', data)
})
