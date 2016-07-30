const FileCookieStore = require('tough-cookie-filestore')
const _request = require('request-promise')
const cheerio = require('cheerio')
const config = require('./config.json')
const fs = require('fs')
const slack = require('slack')

function existsFile(path) {
  try {
    fs.accessSync(path, fs.R_OK)
    return true
  } catch (e) {
    return false
  }
}

const cookiePath = 'cookie.json'
// File given to FileCookieStore must exist.
if (!existsFile(cookiePath)) {
  fs.appendFileSync(cookiePath, '', {mode: 0o600})
}
const jar = _request.jar(new FileCookieStore(cookiePath))
const request = _request.defaults({jar: jar, followAllRedirects: true})

const lastFriendsPath = './last-friends.json'
const lastFriends = (function () {
  if (existsFile(lastFriendsPath)) {
    return require(lastFriendsPath)
  } else {
    return []
  }
})()

function signIn() {
  console.log('INFO', 'Signing in')
  return request('https://splatoon.nintendo.net/users/auth/nintendo').then(function (body) {
    const $ = cheerio.load(body)
    const form = $('input[value="https://splatoon.nintendo.net/users/auth/nintendo/callback"]').closest('form')
    if (form.length == 0) {
      // return Promise.reject('Invalid HTML: ' + body)
      return Promise.reject('Invalid HTML')
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
    const currentFriends = JSON.parse(body)
    const freshFriendStats = compareFriends(currentFriends, lastFriends)

    updateLastFriends(currentFriends)
    if (freshFriendStats.length >= 1) {
      slack.chat.postMessage({
        token: config.token,
        channel: config.channel,
        username: config.username,
        icon_emoji: config.icon_emoji,
        text: formatFriendStats(freshFriendStats)
      }, function (err, data) {
        if (err) {
          return Promise.reject([
            'ERROR: Failed to post a message to Slack.',
            err
          ])
        }
        console.log('INFO', 'Done')
      })
    } else {
      console.log('INFO', 'Nothing has changed')
    }
  })
}

function compareFriends(currentFriends, lastFriends) {
  const resultingFriends = []
  const currentFriendMap = toMap(currentFriends, 'hashed_id')
  const lastFriendMap = toMap(lastFriends, 'hashed_id')

  currentFriends.forEach(function (cf) {
    const lf = lastFriendMap[cf.hashed_id]
    if (!lf || lf.mode != cf.mode) {
      resultingFriends.push([cf, lf])
    }
  })

  lastFriends.forEach(function (lf) {
    const cf = currentFriendMap[lf.hashed_id]
    if (!cf) {
      resultingFriends.push([cf, lf])
    }
  })

  return resultingFriends
}

function toMap(xs, key) {
  const map = {}

  xs.forEach(function (x) {
    map[x[key]] = x
  })

  return map
}

function updateLastFriends(friends) {
  fs.writeFile(lastFriendsPath, JSON.stringify(friends))
}

function formatFriendStats(friendStats) {
  const areThereHotFriends = friendStats.some(function (s) {
    const f = s[0] || s[1]
    return config.hotFriends.indexOf(f.hashed_id) !== -1
  })

  return (areThereHotFriends ? "<!channel>\n" : "") + friendStats.map(function (s) {
    const cf = s[0]
    const lf = s[1]
    const f = cf || lf
    const modeTrans = (lf ? lf.mode : 'offline') + '->' + (cf ? cf.mode : 'offline')
    const phrase = phraseTable[modeTrans]
    return f.mii_name + 'が' + (phrase || modeTrans)
  }).join('\n')
}

const phraseTable = {
  'regular->regular': false,
  'regular->gachi': 'ガチマッチを始めました',
  'regular->tag': 'タッグマッチを始めました',
  'regular->private': 'プライベートマッチを始めました',
  'regular->playing': '広場に戻りました',
  'regular->online': 'Splatoonを終了しました',
  'regular->offline': 'オフラインになりました',
  'gachi->regular': 'レギュラーマッチを始めました',
  'gachi->gachi': false,
  'gachi->tag': 'タッグマッチを始めました',
  'gachi->private': 'プライベートマッチを始めました',
  'gachi->playing': '広場に戻りました',
  'gachi->online': 'Splatoonを終了しました',
  'gachi->offline': 'オフラインになりました',
  'tag->regular': 'レギュラーマッチを始めました',
  'tag->gachi': 'ガチマッチを始めました',
  'tag->tag': false,
  'tag->private': 'プライベートマッチを始めました',
  'tag->playing': '広場に戻りました',
  'tag->online': 'Splatoonを終了しました',
  'tag->offline': 'オフラインになりました',
  'private->regular': 'レギュラーマッチを始めました',
  'private->gachi': 'ガチマッチを始めました',
  'private->tag': 'タッグマッチを始めました',
  'private->private': false,
  'private->playing': '広場に戻りました',
  'private->online': 'Splatoonを終了しました',
  'private->offline': 'オフラインになりました',
  'playing->regular': 'レギュラーマッチを始めました',
  'playing->gachi': 'ガチマッチを始めました',
  'playing->tag': 'タッグマッチを始めました',
  'playing->private': 'プライベートマッチを始めました',
  'playing->playing': false,
  'playing->online': 'Splatoonを終了しました',
  'playing->offline': 'オフラインになりました',
  'online->regular': 'レギュラーマッチを始めました',
  'online->gachi': 'ガチマッチを始めました',
  'online->tag': 'タッグマッチを始めました',
  'online->private': 'プライベートマッチを始めました',
  'online->playing': 'Splatoonを起動しました',
  'online->online': false,
  'online->offline': 'オフラインになりました',
  'offline->regular': 'レギュラーマッチを始めました',
  'offline->gachi': 'ガチマッチを始めました',
  'offline->tag': 'タッグマッチを始めました',
  'offline->private': 'プライベートマッチを始めました',
  'offline->playing': 'Splatoonを起動しました',
  'offline->online': 'オンラインになりました',
  'offline->offline': false
}

crawlOnlineFriendList()
.catch(function (error) {
  if (error instanceof SyntaxError ||
      error instanceof TypeError ||
      error instanceof ReferenceError) {
    // Theses errors do not mean network/content issues.
    return Promise.reject(error)
  } else {
    return signIn().then(function () {
      crawlOnlineFriendList()
    })
  }
})
