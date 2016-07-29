const FileCookieStore = require('tough-cookie-filestore')
const _request = require('request-promise')
const cheerio = require('cheerio')
const config = require('./config.json')
const fs = require('fs')
const slack = require('slack')

const cookiePath = 'cookie.json'

// File given to FileCookieStore must exist.
fs.appendFileSync(cookiePath, '', {mode: 0o600})
const jar = _request.jar(new FileCookieStore(cookiePath))
const request = _request.defaults({jar: jar, followAllRedirects: true})

function signIn() {
  console.log('INFO', 'Signing in')
  return request('https://splatoon.nintendo.net/users/auth/nintendo').then(function (body) {
    const $ = cheerio.load(body)
    const form = $('input[value="https://splatoon.nintendo.net/users/auth/nintendo/callback"]').closest('form')
    if (form.length == 0) {
      return Promise.reject('Invalid HTML: ' + body)
    }

    const map = {}
    form.serializeArray().forEach(function (pair) {
      map[pair.name] = pair.value
    })
    map.username = config.nnidUsername
    map.password = config.nnidPassword

    return request.post({
      url: form.attr('action'),
      form: map
    })
  })
}

function crawlOnlineFriendList(onError) {
  console.log('INFO', 'Crawling')
  return request('https://splatoon.nintendo.net/friend_list/index.json').then(function (body) {
    console.log('INFO', 'Posting')
    const friends = JSON.parse(body)
    slack.chat.postMessage({
      token: config.token,
      channel: config.channel,
      username: config.username,
      icon_emoji: config.icon_emoji,
      text: formatFriends(friends)
    }, function (err, data) {
      if (err) {
        return Promise.reject([
          'ERROR: Failed to post a message to Slack.',
          err
        ])
      }
      console.log('INFO', 'Done')
    })
  })
}

function formatFriends(friends) {
  return friends.map(function (f) {
    const oldMode = 'offline'  // TODO
    const modeTrans = oldMode + '->' + f.mode
    const phrase = phraseTable[modeTrans]
    if (phrase !== false) {
      return f.mii_name + 'が' + (phrase || modeTrans)
    } else {
      return false
    }
  }).filter(function (text) {
    return text
  }).join('\n')
}

const phraseTable = {
  'regular->regular': false,
  'regular->gachi': 'ガチマッチを始めました',
  'regular->private': 'プライベートマッチを始めました',
  'regular->playing': '広場に戻りました',
  'regular->online': 'Splatoonを終了しました',
  'regular->none': 'オフラインになりました',
  'gachi->regular': 'レギュラーマッチを始めました',
  'gachi->gachi': false,
  'gachi->private': 'プライベートマッチを始めました',
  'gachi->playing': '広場に戻りました',
  'gachi->online': 'Splatoonを終了しました',
  'gachi->offline': 'オフラインになりました',
  'private->regular': 'レギュラーマッチを始めました',
  'private->gachi': 'ガチマッチを始めました',
  'private->private': false,
  'private->playing': '広場に戻りました',
  'private->online': 'Splatoonを終了しました',
  'private->offline': 'オフラインになりました',
  'playing->regular': 'レギュラーマッチを始めました',
  'playing->gachi': 'ガチマッチを始めました',
  'playing->private': 'プライベートマッチを始めました',
  'playing->playing': false,
  'playing->online': 'Splatoonを終了しました',
  'playing->offline': 'オフラインになりました',
  'online->regular': 'レギュラーマッチを始めました',
  'online->gachi': 'ガチマッチを始めました',
  'online->private': 'プライベートマッチを始めました',
  'online->playing': 'Splatoonを起動しました',
  'online->online': false,
  'online->offline': 'オフラインになりました',
  'offline->regular': 'レギュラーマッチをしています',
  'offline->gachi': 'ガチマッチをしています',
  'offline->private': 'プライベートマッチをしています',
  'offline->playing': 'Splatoonを起動しました',
  'offline->online': 'オンラインになりました',
  'offline->offline': false,
}

crawlOnlineFriendList()
.catch(function () {
  signIn()
  .then(function () {
    crawlOnlineFriendList()
    .catch(function (error) {
      console.log('ERROR', error)
    })
  })
})
