const config = require('./config.json')
const slack = require('slack')

slack.channels.list({token: config['slack-token']}, console.log)
