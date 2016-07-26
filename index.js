const config = require('./config.json')
const slack = require('slack')

slack.chat.postMessage({
  token: config.token,
  channel: config.channel,
  username: config.username,
  icon_emoji: config.icon_emoji,
  text: 'XXX became online'
}, function (err, data) {
  console.log('err', err)
  console.log('data', data)
})
