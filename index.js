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
    var data = JSON.parse(body)
    console.log('TODO', data)
  })
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
