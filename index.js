'use strict'

const FileCookieStore = require('tough-cookie-filestore')
const _request = require('request-promise')
const cheerio = require('cheerio')
const config = require('./config.json')
const dateformat = require('dateformat')
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
    if (form.length === 0) {
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
    const currentFriends = JSON.parse(body)
    const freshFriendStats = compareFriends(currentFriends, lastFriends)

    logCurrentFriends(currentFriends)
    updateLastFriends(currentFriends)
    if (freshFriendStats.length >= 1) {
      console.log('INFO', 'Posting')
      return postFriendStatsToSlack(freshFriendStats)
    } else {
      console.log('INFO', 'Nothing has changed')
    }
  })
  .then(function () {
    console.log('INFO', 'Done')
  })
}

function compareFriends(currentFriends, lastFriends) {
  const resultingFriends = []
  const currentFriendMap = toMap(currentFriends, 'hashed_id')
  const lastFriendMap = toMap(lastFriends, 'hashed_id')

  currentFriends.forEach(function (cf) {
    const lf = lastFriendMap[cf.hashed_id]
    if (!lf || lf.mode !== cf.mode) {
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

function logCurrentFriends(friends) {
  const now = new Date()
  const yyyymmdd = dateformat(now, 'yyyymmdd')
  const stripped = friends.map(function (f) {
    return {
      id: f.hashed_id,
      name: f.mii_name,
      mode: f.mode
    }
  })
  fs.appendFile(
    'friend-stats-' + yyyymmdd + '.log',
    JSON.stringify([dateformat(now, 'yyyy-mm-dd HH:MM:ss'), stripped]) + "\n"
  )
}

function updateLastFriends(friends) {
  fs.writeFile(lastFriendsPath, JSON.stringify(friends))
}

function textizeHotFriends(friendStats) {
  const hotFriends = friendStats.filter(isHotFriendStat).map(function (s) {
    return s[0]
  })

  if (hotFriends.length) {
    return hotFriends.map(function (cf) {
      return cf.mii_name
    }).join('や') + 'と合流チャンス!! <!channel>'
  } else {
    return ''
  }
}

function isHotFriendStat(s) {
  const cf = s[0]
  const lf = s[1]
  const cmode = cf ? cf.mode : 'offline'
  const lmode = lf ? lf.mode : 'offline'

  if (cmode === 'offline' || config.hotFriends.indexOf(cf.hashed_id) === -1) {
    return false
  }

  return lmode === 'offline' ||
    lmode === 'online' ||
    cmode === 'regular' ||
    cmode === 'private'
}

function formatFriendStats(friendStats) {
  return friendStats.map(function (s) {
    const cf = s[0]
    const lf = s[1]
    const f = cf || lf
    const currentMode = (cf ? cf.mode : 'offline')
    const lastMode = (lf ? lf.mode : 'offline')
    const modeTrans = lastMode + '->' + currentMode
    const phrase = phraseTable[modeTrans] || modeTrans
    const color = colorTable[currentMode] || '#ff0000'
    return {
      color: color,
      title: f.mii_name,
      title_link: 'https://splatoon.nintendo.net/profile/' + f.hashed_id,
      thumb_url: f.mii_url,
      fallback: phrase,
      text: phrase
    }
  })
}

const colorTable = {
  'regular': '#78f205',
  'gachi': '#fc4106',
  'tag': '#ff66aa',
  'private': '#3366ff',
  'playing': '#666666',
  'online': '#999999',
  'offline': '#eeeeee'
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

function postFriendStatsToSlack(friendStats) {
  const maxAttachments = 20
  const friendStatGroups = []
  const n = Math.ceil(friendStats.length / maxAttachments)
  for (let i = 0; i < n; i++) {
    friendStatGroups.push(
      friendStats.slice(
        i * maxAttachments,
        (i + 1) * maxAttachments
      )
    )
  }

  let p = undefined
  friendStatGroups.forEach(function (fsg) {
    if (p) {
      p = p.then(function () {
        _postFriendStatsToSlack(fsg)
      })
    } else {
      p = _postFriendStatsToSlack(fsg)
    }
  })

  return p.catch(function (error) {
    console.log('ERROR', 'Failed to post to Slack', error)
  })
}

function _postFriendStatsToSlack(friendStats) {
  return new Promise(function (onFullfillment, onRejection) {
    slack.chat.postMessage({
      token: config.token,
      channel: config.channel,
      username: config.username,
      icon_emoji: config.icon_emoji,
      text: textizeHotFriends(friendStats),
      attachments: formatFriendStats(friendStats)
    }, function (err, data) {
      if (err) {
        onRejection(err)
      } else {
        onFullfillment(data)
      }
    })
  })
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
