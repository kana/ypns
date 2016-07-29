const FileCookieStore = require('tough-cookie-filestore')
const _request = require('request')
const cheerio = require('cheerio')
const config = require('./config.json')
const fs = require('fs')
const slack = require('slack')

const cookiePath = 'cookie.json'

// File given to FileCookieStore must exist.
fs.appendFileSync(cookiePath, '', {mode: 0o600})
const jar = _request.jar(new FileCookieStore(cookiePath))
const request = _request.defaults({jar: jar, followAllRedirects: true})

function visitTopPage() {
  console.log('INFO', 'Opening the top page')
  request('https://splatoon.nintendo.net/', function (error, response, body) {
    if (error) {
      console.log(error)
      return
    }

    const $ = cheerio.load(body)
    const loginButton = $('.nnid-login-btn')
    if (loginButton.length) {
      visitLoginPage()
    } else {
      console.log(body)
      crawlOnlineFriendList($)
    }
  })
}

function visitLoginPage() {
  console.log('INFO', 'Opening the log-in page')
  request('https://splatoon.nintendo.net/users/auth/nintendo', function (error, response, body) {
    if (error) {
      console.log(error)
      return
    }

    const $ = cheerio.load(body)
    const form = $('input[value="https://splatoon.nintendo.net/users/auth/nintendo/callback"]').closest('form')
    if (form.length) {
      tryLogin(form)
    } else {
      console.log('Error: Something wrong on log-in page')
    }
  })
}

function tryLogin(form) {
  console.log('INFO', 'Logging in')
  const map = {}
  form.serializeArray().forEach(function (pair) {
    map[pair.name] = pair.value
  })
  map.username = config.nnidUsername
  map.password = config.nnidPassword

  request.post({
    url: form.attr('action'),
    form: map
  }, function (error, response, body) {
    if (error) {
      console.log(error)
      return
    }

    crawlOnlineFriendList(cheerio.load(body))
  })
}

function crawlOnlineFriendList($) {
  console.log('INFO', 'Crawling')
  console.log('TODO')
}

visitTopPage()
